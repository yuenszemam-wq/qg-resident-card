// Resident roster: sync Google Sheets rows (B, C) into stable resident ids.
// Rules: IG is the primary match key; anything ambiguous goes to the review
// queue and never moves a photo between residents automatically.
import { fetchRoster } from './sheets.js';
import { cleanName, displayIg, normIg, nowIso, ulid } from './util.js';

export const CACHE_SECONDS = 300;      // 5-minute roster cache
const RETRY_SECONDS = 30;              // after a failed attempt, wait before retrying

const queueKey = (reason, name, ig) => `${reason}|${name}|${ig}`;

/**
 * Pure planning step (unit-tested). rows: [{name, ig}] from the sheet.
 * residents: existing rows from D1. knownQueue: Set of queueKey for any queue
 * item already recorded (open, resolved or ignored) so decisions persist.
 */
export function planSync(rows, residents, knownQueue = new Set()) {
  const clean = rows
    .map(r => ({ name: cleanName(r.name), ig: displayIg(r.ig), ig_norm: normIg(r.ig) }))
    .filter(r => r.name || r.ig_norm);

  const igCount = new Map();
  const igNames = new Map();
  for (const r of clean) if (r.ig_norm) {
    igCount.set(r.ig_norm, (igCount.get(r.ig_norm) || 0) + 1);
    igNames.set(r.ig_norm, [...(igNames.get(r.ig_norm) || []), r.name]);
  }
  const liveIg = new Set(igCount.keys());

  const byIg = new Map(), byName = new Map();
  for (const res of residents) {
    if (res.ig_norm) (byIg.get(res.ig_norm) || byIg.set(res.ig_norm, []).get(res.ig_norm)).push(res);
    if (res.sheet_name) (byName.get(res.sheet_name) || byName.set(res.sheet_name, []).get(res.sheet_name)).push(res);
  }

  const seen = new Set(), held = new Set();
  const updates = [], creates = [], queue = [], liveKeys = new Set();
  const enqueue = (reason, r, candidates) => {
    const key = queueKey(reason, r.name, r.ig_norm);
    liveKeys.add(key);
    candidates.forEach(c => held.add(c.resident_id));
    if (!knownQueue.has(key) && !queue.some(q => q.key === key)) {
      queue.push({ key, reason, sheet_name: r.name, ig: r.ig, ig_norm: r.ig_norm, candidate_ids: candidates.map(c => c.resident_id) });
    }
  };

  for (const r of clean) {
    if (!r.ig_norm) {
      const same = (byName.get(r.name) || []);
      if (same.length === 1) { seen.add(same[0].resident_id); continue; }
      enqueue('missing_data', r, same);
      continue;
    }
    const matches = byIg.get(r.ig_norm) || [];
    if (igCount.get(r.ig_norm) > 1) {
      // Duplicate IG rows: keep any existing owner visible but never rename it.
      matches.forEach(m => seen.add(m.resident_id));
      enqueue('duplicate_ig', { ...r, name: igNames.get(r.ig_norm).join('／').slice(0, 120) }, matches);
      continue;
    }
    if (matches.length === 1) {
      const m = matches[0];
      seen.add(m.resident_id);
      if (m.sheet_name !== r.name || m.ig !== r.ig || m.sync_status === 'missing') {
        updates.push({ resident_id: m.resident_id, sheet_name: r.name, ig: r.ig, ig_norm: r.ig_norm });
      }
      continue;
    }
    if (matches.length > 1) { enqueue('duplicate_ig', r, matches); continue; }
    // New IG. Same name whose old IG vanished from the sheet → possible IG change.
    const renamedFrom = (byName.get(r.name) || []).filter(x => !x.ig_norm || !liveIg.has(x.ig_norm));
    if (renamedFrom.length) { enqueue('ig_changed', r, renamedFrom); continue; }
    creates.push({ sheet_name: r.name, ig: r.ig, ig_norm: r.ig_norm });
  }

  const missing = residents
    .filter(x => x.sync_status === 'active' && !seen.has(x.resident_id) && !held.has(x.resident_id))
    .map(x => x.resident_id);
  return { updates, creates, queue, missing, liveKeys, rowCount: clean.length };
}

export async function syncState(db) {
  return (await db.prepare("SELECT * FROM sync_state WHERE key = 'sheets_roster'").first()) || null;
}

/** Apply a plan to D1. Never deletes residents or photos. */
export async function applyPlan(db, plan) {
  const now = nowIso();
  const stmts = [];
  for (const u of plan.updates) {
    stmts.push(db.prepare(`UPDATE residents SET sheet_name = ?, ig = ?, ig_norm = ?, sync_status = 'active',
      last_seen_at = ?, updated_at = ?, version = version + 1 WHERE resident_id = ?`)
      .bind(u.sheet_name, u.ig, u.ig_norm, now, now, u.resident_id));
  }
  for (const c of plan.creates) {
    stmts.push(db.prepare(`INSERT INTO residents (resident_id, sheet_name, ig, ig_norm, default_category, sync_status,
      last_seen_at, created_at, updated_at) VALUES (?, ?, ?, ?, 'regular', 'active', ?, ?, ?)`)
      .bind(ulid(), c.sheet_name, c.ig, c.ig_norm, now, now, now));
  }
  for (const q of plan.queue) {
    stmts.push(db.prepare(`INSERT INTO resident_match_queue (queue_id, sheet_name, ig, ig_norm, reason, candidate_ids, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(ulid(), q.sheet_name, q.ig, q.ig_norm, q.reason, JSON.stringify(q.candidate_ids), now));
  }
  for (const id of plan.missing) {
    stmts.push(db.prepare(`UPDATE residents SET sync_status = 'missing', updated_at = ? WHERE resident_id = ? AND sync_status = 'active'`)
      .bind(now, id));
  }
  stmts.push(db.prepare(`INSERT INTO sync_state (key, last_success_at, last_attempt_at, last_error, row_count)
    VALUES ('sheets_roster', ?, ?, NULL, ?) ON CONFLICT(key) DO UPDATE SET last_success_at = excluded.last_success_at,
    last_attempt_at = excluded.last_attempt_at, last_error = NULL, row_count = excluded.row_count`).bind(now, now, plan.rowCount));
  await db.batch(stmts);
  // Rows that left the sheet: close their open queue items automatically.
  const open = await db.prepare(`SELECT queue_id, reason, sheet_name, ig_norm FROM resident_match_queue WHERE status = 'open'`).all();
  const stale = (open.results || []).filter(q => !plan.liveKeys.has(queueKey(q.reason, q.sheet_name, q.ig_norm)));
  if (stale.length) {
    await db.batch(stale.map(q => db.prepare(`UPDATE resident_match_queue SET status = 'ignored', resolved_at = ?, resolved_by = 'sync'
      WHERE queue_id = ?`).bind(now, q.queue_id)));
  }
}

/**
 * Sync when the cache is older than 5 minutes (or when forced). Failures keep
 * the last good roster; only the error code is recorded.
 */
export async function maybeSync(env, { force = false, admin = false, fetchImpl } = {}) {
  const db = env.DB;
  const st = await syncState(db);
  const now = Date.now();
  const age = s => (s ? (now - Date.parse(s)) / 1000 : Infinity);
  if (!force && age(st && st.last_success_at) < CACHE_SECONDS) return { synced: false, state: st };
  // Simple lock: only one request per RETRY window attempts a sync.
  if (!admin && age(st && st.last_attempt_at) < (force ? 5 : RETRY_SECONDS)) return { synced: false, state: st };
  const attempt = nowIso();
  await db.prepare(`INSERT INTO sync_state (key, last_attempt_at) VALUES ('sheets_roster', ?)
    ON CONFLICT(key) DO UPDATE SET last_attempt_at = excluded.last_attempt_at`).bind(attempt).run();
  try {
    const rows = await fetchRoster(env, fetchImpl);
    const residents = (await db.prepare('SELECT resident_id, sheet_name, ig, ig_norm, sync_status FROM residents').all()).results || [];
    const known = new Set(((await db.prepare('SELECT reason, sheet_name, ig_norm FROM resident_match_queue').all()).results || [])
      .map(q => queueKey(q.reason, q.sheet_name, q.ig_norm)));
    await applyPlan(db, planSync(rows, residents, known));
    return { synced: true, state: await syncState(db) };
  } catch (err) {
    const code = String((err && err.message) || 'error').replace(/[^a-z0-9_]/gi, '').slice(0, 40) || 'error';
    await db.prepare(`UPDATE sync_state SET last_error = ? WHERE key = 'sheets_roster'`).bind(code).run();
    console.warn('roster_sync_failed', code);
    return { synced: false, error: code, state: await syncState(db) };
  }
}

export function publicResident(r) {
  return {
    id: r.resident_id,
    name: r.sheet_name,
    ig: r.ig,
    category: r.default_category,
    photo: r.photo_asset_id ? `/media/${r.photo_asset_id}` : null,
    updatedAt: r.updated_at,
  };
}
