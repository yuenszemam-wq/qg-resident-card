// Queen's Garden Worker: static makers are served from assets; this script only
// handles /api/* and /media/* (see run_worker_first in wrangler.jsonc).
import { HttpError, json, errorResponse, readJson, readBytes } from './lib/http.js';
import { login, logout, requireAdmin, audit, sessionCookie, hit } from './lib/auth.js';
import { maybeSync, syncState, publicResident } from './lib/roster.js';
import { inspectImage, inspectFont, LIMITS, EXT } from './lib/media.js';
import { defaultConfig, validateConfig, SCHEMA_VERSION, ASSET_SLOTS, PAGES, COPY_FIELDS, upgradeConfig } from './lib/config.js';
import { ulid, nowIso, sha256Hex, safeEqual, CATEGORIES } from './lib/util.js';
import { clientIp } from './lib/http.js';
import { driveConfig, listPhotos, photoThumb, photoContent, isDriveId } from './lib/drive.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      // Candidate deployments contain production data. Keep ALL paths private
      // until backup, integration checks and the final write handoff are complete.
      if (env.MIGRATION_LOCKED === 'true') {
        const key = request.headers.get('x-qg-migration-key') || '';
        if (!key || !env.MIGRATION_ACCESS_KEY || !safeEqual(await sha256Hex(key), await sha256Hex(env.MIGRATION_ACCESS_KEY))) {
          return new Response('Migration verification in progress', { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '300' } });
        }
      }
      if (url.pathname.startsWith('/media/')) return await serveMedia(request, env, url);
      if (url.pathname.startsWith('/api/public/')) return await publicApi(request, env, url, ctx);
      if (url.pathname.startsWith('/api/admin/')) return await adminApi(request, env, url);
      if (url.pathname.startsWith('/api/')) throw new HttpError(404, 'not_found', '找不到');
      return env.ASSETS.fetch(request);
    } catch (err) {
      return errorResponse(err);
    }
  },
};

// ---------------------------------------------------------------- media
async function serveMedia(request, env, url) {
  const m = url.pathname.match(/^\/media\/([0-9A-Z]{26})$/);
  if (!m || (request.method !== 'GET' && request.method !== 'HEAD')) throw new HttpError(404, 'not_found', '找不到');
  const obj = await env.MEDIA.get(`a/${m[1]}`);
  if (!obj) throw new HttpError(404, 'not_found', '找不到');
  const headers = new Headers({
    'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream',
    'Cache-Control': 'public, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'",
    ETag: obj.httpEtag,
  });
  return new Response(request.method === 'HEAD' ? null : obj.body, { headers });
}

async function putAsset(env, { kind, ownerId = null, purpose = '', bytes, mime, width = null, height = null, alpha = null, meta = {}, previousId = null, actor }) {
  const id = ulid();
  await env.MEDIA.put(`a/${id}`, bytes, { httpMetadata: { contentType: mime } });
  await env.DB.prepare(`INSERT INTO assets (asset_id, kind, owner_id, purpose, r2_key, mime, bytes, width, height, has_alpha, sha256, meta,
    previous_id, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, kind, ownerId, purpose, `a/${id}`, mime, bytes.length, width, height, alpha == null ? null : alpha ? 1 : 0,
      await sha256Hex(bytes), JSON.stringify(meta), previousId, nowIso(), actor).run();
  return id;
}

// ---------------------------------------------------------------- schema (additive, idempotent)
// 與 migrations/0002_resident_archive.sql 相同；未套用 migration 時亦可運作。
const ARCHIVE_DDL = `CREATE TABLE IF NOT EXISTS resident_archive (
  resident_id TEXT PRIMARY KEY, archived INTEGER NOT NULL DEFAULT 1 CHECK (archived IN (0, 1)),
  updated_at TEXT NOT NULL, updated_by TEXT NOT NULL DEFAULT '')`;
const archiveReady = new WeakMap();
function ensureArchive(db) {
  if (!archiveReady.has(db)) archiveReady.set(db, db.prepare(ARCHIVE_DDL).run().catch(e => { archiveReady.delete(db); throw e; }));
  return archiveReady.get(db);
}

// 與 migrations/0003_drive_photos.sql 相同
const DRIVE_DDL = `CREATE TABLE IF NOT EXISTS drive_photos (
  file_id TEXT PRIMARY KEY, archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  archive_reason TEXT NOT NULL DEFAULT '' CHECK (archive_reason IN ('', 'manual', 'auto')),
  archived_at TEXT, archived_by TEXT NOT NULL DEFAULT '', use_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TEXT, updated_at TEXT NOT NULL)`;
const driveReady = new WeakMap();
function ensureDrive(db) {
  if (!driveReady.has(db)) driveReady.set(db, db.prepare(DRIVE_DDL).run().catch(e => { driveReady.delete(db); throw e; }));
  return driveReady.get(db);
}

// ---------------------------------------------------------------- config storage
async function publishedRow(db) {
  return db.prepare(`SELECT * FROM config_versions WHERE status = 'published' ORDER BY version_id DESC LIMIT 1`).first();
}
async function draftRow(db) {
  return db.prepare(`SELECT * FROM config_versions WHERE status = 'draft' ORDER BY version_id DESC LIMIT 1`).first();
}
/** First admin visit: record the built-in settings (incl. migrated copy) as version 1. */
async function ensurePublished(env, actor) {
  let row = await publishedRow(env.DB);
  if (row) return row;
  await env.DB.prepare(`INSERT INTO config_versions (status, schema_version, body, summary, created_at, created_by, published_at, published_by)
    VALUES ('published', ?, ?, ?, ?, ?, ?, ?)`)
    .bind(SCHEMA_VERSION, JSON.stringify(defaultConfig()), '初始版本：由程式內建設定及現有文案遷移', nowIso(), actor, nowIso(), actor).run();
  return publishedRow(env.DB);
}
async function assetKinds(db) {
  const rows = (await db.prepare(`SELECT asset_id, kind FROM assets WHERE kind IN ('font','image')`).all()).results || [];
  return new Map(rows.map(r => [r.asset_id, r.kind]));
}
const versionMeta = r => r && ({
  version_id: r.version_id, status: r.status, summary: r.summary, based_on: r.based_on,
  created_at: r.created_at, created_by: r.created_by, published_at: r.published_at, published_by: r.published_by,
});

// ---------------------------------------------------------------- public API
async function publicApi(request, env, url, ctx) {
  if (request.method !== 'GET') throw new HttpError(405, 'method_not_allowed', '不支援');
  const path = url.pathname.slice('/api/public/'.length);
  if (path === 'residents') {
    let force = false;
    if (url.searchParams.get('refresh') === '1') {
      // Manual refresh button: at most 6 per minute per visitor.
      force = (await hit(env.DB, `refresh:${clientIp(request)}`, 60)) <= 6;
    }
    const result = await maybeSync(env, { force });
    await ensureArchive(env.DB);
    // 已封存的居民不在公開選單出現（資料及照片保留）
    const rows = (await env.DB.prepare(`SELECT resident_id, sheet_name, ig, default_category, photo_asset_id, updated_at
      FROM residents WHERE sync_status IN ('active','manual')
        AND resident_id NOT IN (SELECT resident_id FROM resident_archive WHERE archived = 1)
      ORDER BY sheet_name COLLATE NOCASE`).all()).results || [];
    const st = result.state || {};
    return json({
      residents: rows.map(publicResident),
      syncedAt: st.last_success_at || null,
      stale: !!st.last_error,
      configured: result.error !== 'not_configured',
    }, 200, { 'Cache-Control': 'no-cache' });
  }
  if (path === 'config') {
    const row = await publishedRow(env.DB);
    const body = row ? upgradeConfig(JSON.parse(row.body)) : defaultConfig();
    return json({ version: row ? row.version_id : 0, publishedAt: row ? row.published_at : null, config: body },
      200, { 'Cache-Control': 'no-cache' });
  }
  throw new HttpError(404, 'not_found', '找不到');
}

// ---------------------------------------------------------------- admin API
async function adminApi(request, env, url) {
  const path = url.pathname.slice('/api/admin/'.length);
  const method = request.method.toUpperCase();

  if (path === 'login' && method === 'POST') {
    const origin = request.headers.get('origin');
    if (origin && origin !== url.origin) throw new HttpError(403, 'bad_origin', '來源不符');
    const s = await login(request, env, await readJson(request, 4096));
    await audit(env, s.actor, 'login', null, {});
    return json({ ok: true, actor: s.actor, expires: s.expires }, 200, { 'Set-Cookie': sessionCookie(s.token, s.maxAge, url) });
  }
  if (path === 'logout' && method === 'POST') {
    await logout(request, env);
    return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie('', 0, url) });
  }

  const { actor } = await requireAdmin(request, env);
  let m;

  if (path === 'me' && method === 'GET') return json({ actor });

  // ---- residents
  if (path === 'residents' && method === 'GET') {
    await ensureArchive(env.DB);
    const residents = (await env.DB.prepare(`SELECT r.*, a.meta AS photo_meta, a.created_at AS photo_at,
        COALESCE(x.archived, 0) AS archived, x.updated_at AS archived_at, x.updated_by AS archived_by FROM residents r
      LEFT JOIN assets a ON a.asset_id = r.photo_asset_id
      LEFT JOIN resident_archive x ON x.resident_id = r.resident_id ORDER BY r.sheet_name COLLATE NOCASE`).all()).results || [];
    const queue = (await env.DB.prepare(`SELECT * FROM resident_match_queue WHERE status = 'open' ORDER BY created_at`).all()).results || [];
    return json({
      residents: residents.map(r => ({ ...publicResident(r), status: r.sync_status, version: r.version, lastSeenAt: r.last_seen_at, photoAt: r.photo_at,
        archived: !!r.archived, archivedAt: r.archived ? r.archived_at : null, archivedBy: r.archived ? r.archived_by : null })),
      queue: queue.map(q => ({ ...q, candidate_ids: JSON.parse(q.candidate_ids || '[]') })),
      sync: await syncState(env.DB),
    });
  }
  if (path === 'sync' && method === 'POST') {
    const r = await maybeSync(env, { force: true, admin: true });
    await audit(env, actor, 'sync', null, { synced: r.synced, error: r.error || null });
    return json({ synced: r.synced, error: r.error || null, sync: r.state });
  }
  if ((m = path.match(/^residents\/([0-9A-Z]{26})$/)) && method === 'PATCH') {
    const body = await readJson(request, 4096);
    if (!CATEGORIES.includes(body.category)) throw new HttpError(422, 'bad_category', '分類無效');
    const res = await env.DB.prepare(`UPDATE residents SET default_category = ?, updated_at = ?, version = version + 1
      WHERE resident_id = ? AND version = ?`).bind(body.category, nowIso(), m[1], Number(body.version)).run();
    if (!res.meta.changes) throw new HttpError(409, 'conflict', '資料已被更新，請重新整理後再試');
    await audit(env, actor, 'resident.category', m[1], { category: body.category });
    return json({ ok: true });
  }
  // 封存／取消封存：只影響公開選單，不改試算表、不刪除居民或照片
  if ((m = path.match(/^residents\/([0-9A-Z]{26})\/archive$/)) && method === 'POST') {
    const body = await readJson(request, 4096);
    if (typeof body.archived !== 'boolean') throw new HttpError(422, 'bad_request', 'archived 必須是 true 或 false');
    const resident = await env.DB.prepare('SELECT resident_id FROM residents WHERE resident_id = ?').bind(m[1]).first();
    if (!resident) throw new HttpError(404, 'not_found', '找不到居民');
    await ensureArchive(env.DB);
    const now = nowIso();
    await env.DB.prepare(`INSERT INTO resident_archive (resident_id, archived, updated_at, updated_by) VALUES (?, ?, ?, ?)
      ON CONFLICT(resident_id) DO UPDATE SET archived = excluded.archived, updated_at = excluded.updated_at, updated_by = excluded.updated_by`)
      .bind(m[1], body.archived ? 1 : 0, now, actor).run();
    await audit(env, actor, body.archived ? 'resident.archive' : 'resident.unarchive', m[1], {});
    return json({ ok: true, archived: body.archived, archivedAt: body.archived ? now : null });
  }
  if ((m = path.match(/^residents\/([0-9A-Z]{26})\/photo$/)) && method === 'POST') {
    const resident = await env.DB.prepare('SELECT resident_id, photo_asset_id, version FROM residents WHERE resident_id = ?').bind(m[1]).first();
    if (!resident) throw new HttpError(404, 'not_found', '找不到居民');
    const expected = Number(url.searchParams.get('version'));
    if (expected !== resident.version) throw new HttpError(409, 'conflict', '資料已被更新，請重新整理後再試');
    if (await hit(env.DB, `upload:${actor}`, 60) > 30) throw new HttpError(429, 'rate_limited', '上載太頻密，請稍後再試');
    const info = inspectImage(await readBytes(request, LIMITS.photo), 'photo');
    let meta = {};
    try { meta = JSON.parse(request.headers.get('x-qg-meta') || '{}'); } catch {}
    const crop = meta && typeof meta.crop === 'object' ? meta.crop : null;
    const id = await putAsset(env, { kind: 'photo', ownerId: m[1], purpose: 'resident.photo', ...info,
      meta: crop ? { crop: { zoom: +crop.zoom || 1, x: +crop.x || 0, y: +crop.y || 0 } } : {}, previousId: resident.photo_asset_id, actor });
    const upd = await env.DB.prepare(`UPDATE residents SET photo_asset_id = ?, updated_at = ?, version = version + 1
      WHERE resident_id = ? AND version = ?`).bind(id, nowIso(), m[1], resident.version).run();
    if (!upd.meta.changes) throw new HttpError(409, 'conflict', '資料已被更新，請重新整理後再試');
    await audit(env, actor, 'resident.photo', m[1], { asset: id, previous: resident.photo_asset_id });
    return json({ ok: true, photo: `/media/${id}`, assetId: id });
  }
  if ((m = path.match(/^residents\/([0-9A-Z]{26})\/photos$/)) && method === 'GET') {
    const rows = (await env.DB.prepare(`SELECT asset_id, created_at, created_by, width, height, bytes FROM assets
      WHERE kind = 'photo' AND owner_id = ? ORDER BY created_at DESC LIMIT 20`).bind(m[1]).all()).results || [];
    return json({ photos: rows.map(r => ({ ...r, url: `/media/${r.asset_id}` })) });
  }
  if ((m = path.match(/^residents\/([0-9A-Z]{26})\/photo\/restore$/)) && method === 'POST') {
    const body = await readJson(request, 4096);
    const asset = await env.DB.prepare(`SELECT asset_id FROM assets WHERE asset_id = ? AND kind = 'photo' AND owner_id = ?`)
      .bind(String(body.assetId || ''), m[1]).first();
    if (!asset) throw new HttpError(404, 'not_found', '找不到這個照片版本');
    const upd = await env.DB.prepare(`UPDATE residents SET photo_asset_id = ?, updated_at = ?, version = version + 1
      WHERE resident_id = ? AND version = ?`).bind(asset.asset_id, nowIso(), m[1], Number(body.version)).run();
    if (!upd.meta.changes) throw new HttpError(409, 'conflict', '資料已被更新，請重新整理後再試');
    await audit(env, actor, 'resident.photo.restore', m[1], { asset: asset.asset_id });
    return json({ ok: true });
  }
  if ((m = path.match(/^queue\/([0-9A-Z]{26})$/)) && method === 'POST') {
    const body = await readJson(request, 4096);
    const q = await env.DB.prepare(`SELECT * FROM resident_match_queue WHERE queue_id = ? AND status = 'open'`).bind(m[1]).first();
    if (!q) throw new HttpError(404, 'not_found', '這項已處理');
    const now = nowIso();
    let resolvedTo = null;
    if (body.action === 'merge') {
      const target = await env.DB.prepare('SELECT resident_id FROM residents WHERE resident_id = ?').bind(String(body.residentId || '')).first();
      if (!target) throw new HttpError(404, 'not_found', '找不到要合併的居民');
      if (q.ig_norm) {
        const clash = await env.DB.prepare(`SELECT resident_id FROM residents WHERE ig_norm = ? AND resident_id != ? AND sync_status != 'missing'`)
          .bind(q.ig_norm, target.resident_id).first();
        if (clash) throw new HttpError(409, 'ig_in_use', '這個 IG 已屬於另一位居民，請先處理該居民');
      }
      await env.DB.prepare(`UPDATE residents SET sheet_name = ?, ig = CASE WHEN ? = '' THEN ig ELSE ? END,
        ig_norm = CASE WHEN ? = '' THEN ig_norm ELSE ? END, sync_status = 'active', last_seen_at = ?, updated_at = ?, version = version + 1
        WHERE resident_id = ?`).bind(q.sheet_name, q.ig, q.ig, q.ig_norm, q.ig_norm, now, now, target.resident_id).run();
      resolvedTo = target.resident_id;
    } else if (body.action === 'create') {
      resolvedTo = ulid();
      await env.DB.prepare(`INSERT INTO residents (resident_id, sheet_name, ig, ig_norm, default_category, sync_status, last_seen_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'regular', 'manual', ?, ?, ?)`).bind(resolvedTo, q.sheet_name, q.ig, q.ig_norm, now, now, now).run();
    } else if (body.action !== 'ignore') throw new HttpError(422, 'bad_action', '操作無效');
    await env.DB.prepare(`UPDATE resident_match_queue SET status = ?, resolved_to = ?, resolved_at = ?, resolved_by = ? WHERE queue_id = ?`)
      .bind(body.action === 'ignore' ? 'ignored' : 'resolved', resolvedTo, now, actor, m[1]).run();
    await audit(env, actor, `queue.${body.action}`, m[1], { resident: resolvedTo });
    return json({ ok: true, residentId: resolvedTo });
  }

  // ---- assets (fonts and images)
  if (path === 'assets' && method === 'GET') {
    const kind = url.searchParams.get('kind');
    if (!['font', 'image'].includes(kind)) throw new HttpError(422, 'bad_kind', '類型無效');
    const rows = (await env.DB.prepare(`SELECT asset_id, kind, purpose, mime, bytes, width, height, has_alpha, meta, previous_id, created_at, created_by
      FROM assets WHERE kind = ? ORDER BY created_at DESC LIMIT 200`).bind(kind).all()).results || [];
    return json({ assets: rows.map(r => ({ ...r, meta: JSON.parse(r.meta || '{}'), url: `/media/${r.asset_id}` })), slots: ASSET_SLOTS });
  }
  if (path === 'assets' && method === 'POST') {
    const kind = url.searchParams.get('kind');
    if (await hit(env.DB, `upload:${actor}`, 60) > 30) throw new HttpError(429, 'rate_limited', '上載太頻密，請稍後再試');
    if (kind === 'image') {
      const slot = url.searchParams.get('slot') || '';
      if (slot && !ASSET_SLOTS[slot]) throw new HttpError(422, 'bad_slot', '素材位置無效');
      const info = inspectImage(await readBytes(request, LIMITS.image), 'image');
      const id = await putAsset(env, { kind: 'image', purpose: slot, ...info, meta: { label: String(url.searchParams.get('label') || '').slice(0, 60) }, actor });
      await audit(env, actor, 'asset.upload', id, { kind, slot });
      return json({ ok: true, assetId: id, url: `/media/${id}`, width: info.width, height: info.height, alpha: info.alpha });
    }
    if (kind === 'font') {
      const info = inspectFont(await readBytes(request, LIMITS.font));
      const license = String(url.searchParams.get('license') || '').trim();
      if (!license || url.searchParams.get('confirmed') !== '1') {
        throw new HttpError(422, 'license_required', '請填寫字體授權並確認可網頁嵌入及圖片輸出');
      }
      const id = await putAsset(env, { kind: 'font', purpose: 'font', bytes: info.bytes, mime: info.mime,
        meta: { license: license.slice(0, 80), source: String(url.searchParams.get('source') || '').slice(0, 200),
          filename: String(url.searchParams.get('filename') || '').slice(0, 80) }, actor });
      await audit(env, actor, 'asset.upload', id, { kind });
      return json({ ok: true, assetId: id, url: `/media/${id}`, ext: EXT[info.mime] });
    }
    throw new HttpError(422, 'bad_kind', '類型無效');
  }

  // ---- settings versions
  if (path === 'config' && method === 'GET') {
    const published = await ensurePublished(env, actor);
    const draft = await draftRow(env.DB);
    const versions = (await env.DB.prepare(`SELECT * FROM config_versions WHERE status != 'draft' ORDER BY version_id DESC LIMIT 30`).all()).results || [];
    return json({
      published: { ...versionMeta(published), body: upgradeConfig(JSON.parse(published.body)) },
      draft: draft ? { ...versionMeta(draft), rev: draft.created_at, body: upgradeConfig(JSON.parse(draft.body)) } : null,
      versions: versions.map(versionMeta),
      meta: { pages: PAGES, slots: ASSET_SLOTS, fields: COPY_FIELDS },
    });
  }
  if ((m = path.match(/^config\/versions\/(\d+)$/)) && method === 'GET') {
    const row = await env.DB.prepare('SELECT * FROM config_versions WHERE version_id = ?').bind(Number(m[1])).first();
    if (!row) throw new HttpError(404, 'not_found', '找不到版本');
    return json({ ...versionMeta(row), body: JSON.parse(row.body) });
  }
  if (path === 'config/draft' && method === 'GET') {
    const draft = await draftRow(env.DB);
    return json({ draft: draft ? { ...versionMeta(draft), body: upgradeConfig(JSON.parse(draft.body)) } : null });
  }
  if (path === 'config/draft' && method === 'PUT') {
    const body = await readJson(request);
    const cfg = validateConfig(body.body, { assetKinds: await assetKinds(env.DB) });
    const published = await ensurePublished(env, actor);
    const draft = await draftRow(env.DB);
    const summary = String(body.summary || '').slice(0, 200);
    const now = nowIso();
    if (draft) {
      if (body.rev !== draft.created_at) throw new HttpError(409, 'conflict', '草稿已在其他地方更新，請重新載入');
      await env.DB.prepare(`UPDATE config_versions SET body = ?, summary = ?, based_on = ?, created_at = ?, created_by = ? WHERE version_id = ? AND status = 'draft'`)
        .bind(JSON.stringify(cfg), summary, published.version_id, now, actor, draft.version_id).run();
    } else {
      if (body.rev) throw new HttpError(409, 'conflict', '草稿已被發佈或捨棄，請重新載入');
      await env.DB.prepare(`INSERT INTO config_versions (status, schema_version, body, summary, based_on, created_at, created_by)
        VALUES ('draft', ?, ?, ?, ?, ?, ?)`).bind(SCHEMA_VERSION, JSON.stringify(cfg), summary, published.version_id, now, actor).run();
    }
    await audit(env, actor, 'config.draft', null, {});
    const saved = await draftRow(env.DB);
    return json({ ok: true, draft: { ...versionMeta(saved), rev: saved.created_at, body: cfg } });
  }
  if (path === 'config/discard' && method === 'POST') {
    const body = await readJson(request, 4096);
    const draft = await draftRow(env.DB);
    if (!draft) return json({ ok: true });
    if (body.rev !== draft.created_at) throw new HttpError(409, 'conflict', '草稿已在其他地方更新，請重新載入');
    // Keep the row for history; it simply stops being the draft.
    await env.DB.prepare(`UPDATE config_versions SET status = 'archived', summary = '（捨棄的草稿）' || summary WHERE version_id = ?`).bind(draft.version_id).run();
    await audit(env, actor, 'config.discard', String(draft.version_id), {});
    return json({ ok: true });
  }
  if (path === 'config/publish' && method === 'POST') {
    const body = await readJson(request, 4096);
    const draft = await draftRow(env.DB);
    if (!draft) throw new HttpError(409, 'no_draft', '沒有草稿可以發佈');
    if (body.rev !== draft.created_at) throw new HttpError(409, 'conflict', '草稿已在其他地方更新，請重新載入');
    const published = await ensurePublished(env, actor);
    if (draft.based_on && draft.based_on !== published.version_id) {
      throw new HttpError(409, 'stale_draft', '正式版本已在草稿建立後更新，請先檢查差異再重新儲存草稿');
    }
    const cfg = validateConfig(JSON.parse(draft.body), { assetKinds: await assetKinds(env.DB) });
    const now = nowIso();
    const summary = String(body.summary || draft.summary || '').slice(0, 200);
    await env.DB.batch([
      env.DB.prepare(`UPDATE config_versions SET status = 'archived' WHERE status = 'published'`),
      env.DB.prepare(`UPDATE config_versions SET status = 'published', body = ?, summary = ?, published_at = ?, published_by = ? WHERE version_id = ?`)
        .bind(JSON.stringify(cfg), summary, now, actor, draft.version_id),
    ]);
    await audit(env, actor, 'config.publish', String(draft.version_id), {});
    return json({ ok: true, version_id: draft.version_id });
  }
  if (path === 'config/restore' && method === 'POST') {
    const body = await readJson(request, 4096);
    const row = await env.DB.prepare(`SELECT * FROM config_versions WHERE version_id = ? AND status != 'draft'`).bind(Number(body.versionId)).first();
    if (!row) throw new HttpError(404, 'not_found', '找不到版本');
    const published = await ensurePublished(env, actor);
    if (Number(body.currentId) !== published.version_id) throw new HttpError(409, 'conflict', '正式版本已更新，請重新載入');
    const cfg = validateConfig(JSON.parse(row.body), { assetKinds: await assetKinds(env.DB) });
    const now = nowIso();
    await env.DB.batch([
      env.DB.prepare(`UPDATE config_versions SET status = 'archived' WHERE status = 'published'`),
      env.DB.prepare(`INSERT INTO config_versions (status, schema_version, body, summary, based_on, created_at, created_by, published_at, published_by)
        VALUES ('published', ?, ?, ?, ?, ?, ?, ?, ?)`).bind(SCHEMA_VERSION, JSON.stringify(cfg), `還原至版本 ${row.version_id}`, row.version_id, now, actor, now, actor),
    ]);
    await audit(env, actor, 'config.restore', String(row.version_id), {});
    return json({ ok: true });
  }

  // ---- Google Drive photos (weekly schedule picker); archive state lives in D1 only
  if (path === 'drive/photos' && method === 'GET') {
    const cfg = driveConfig(env);
    if (!cfg.sa || !cfg.folder) return json({ configured: false, serviceAccount: cfg.email, photos: [] });
    const { photos } = await listPhotos(env);
    await ensureDrive(env.DB);
    const rows = (await env.DB.prepare('SELECT * FROM drive_photos').all()).results || [];
    const st = new Map(rows.map(r => [r.file_id, r]));
    return json({
      configured: true, serviceAccount: cfg.email,
      photos: photos.map(p => {
        const r = st.get(p.id) || {};
        return { ...p, archived: !!r.archived, archiveReason: r.archived ? r.archive_reason : '', archivedAt: r.archived ? r.archived_at : null,
          archivedBy: r.archived ? r.archived_by : null, useCount: r.use_count || 0, lastUsedAt: r.last_used_at || null };
      }),
    });
  }
  if ((m = path.match(/^drive\/photos\/([A-Za-z0-9_-]{10,200})\/(thumb|content)$/)) && method === 'GET') {
    return m[2] === 'thumb' ? photoThumb(env, m[1]) : photoContent(env, m[1]);
  }
  if ((m = path.match(/^drive\/photos\/([A-Za-z0-9_-]{10,200})\/(archive|used)$/)) && method === 'POST') {
    if (!isDriveId(m[1])) throw new HttpError(404, 'not_found', '找不到相片');
    const body = await readJson(request, 4096);
    await ensureDrive(env.DB);
    const now = nowIso();
    if (m[2] === 'archive') {
      if (typeof body.archived !== 'boolean') throw new HttpError(422, 'bad_request', 'archived 必須是 true 或 false');
      await env.DB.prepare(`INSERT INTO drive_photos (file_id, archived, archive_reason, archived_at, archived_by, updated_at)
        VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(file_id) DO UPDATE SET archived = excluded.archived, archive_reason = excluded.archive_reason,
        archived_at = excluded.archived_at, archived_by = excluded.archived_by, updated_at = excluded.updated_at`)
        .bind(m[1], body.archived ? 1 : 0, body.archived ? 'manual' : '', body.archived ? now : null, body.archived ? actor : '', now).run();
      await audit(env, actor, body.archived ? 'drive.archive' : 'drive.unarchive', m[1], {});
      return json({ ok: true, archived: body.archived });
    }
    // 'used': 用這張相下載了更表；autoArchive 時同時封存（已手動封存的保持原狀）
    const auto = body.autoArchive === true;
    await env.DB.prepare(`INSERT INTO drive_photos (file_id, archived, archive_reason, archived_at, archived_by, use_count, last_used_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?) ON CONFLICT(file_id) DO UPDATE SET use_count = use_count + 1, last_used_at = excluded.last_used_at,
      updated_at = excluded.updated_at,
      archive_reason = CASE WHEN drive_photos.archived = 1 THEN drive_photos.archive_reason ELSE excluded.archive_reason END,
      archived_at = CASE WHEN drive_photos.archived = 1 THEN drive_photos.archived_at ELSE excluded.archived_at END,
      archived_by = CASE WHEN drive_photos.archived = 1 THEN drive_photos.archived_by ELSE excluded.archived_by END,
      archived = MAX(drive_photos.archived, excluded.archived)`)
      .bind(m[1], auto ? 1 : 0, auto ? 'auto' : '', auto ? now : null, auto ? actor : '', now, now).run();
    await audit(env, actor, auto ? 'drive.used.archive' : 'drive.used', m[1], {});
    const row = await env.DB.prepare('SELECT archived, use_count FROM drive_photos WHERE file_id = ?').bind(m[1]).first();
    return json({ ok: true, archived: !!row.archived, useCount: row.use_count });
  }

  if (path === 'audit' && method === 'GET') {
    const rows = (await env.DB.prepare('SELECT at, actor, action, target FROM audit_log ORDER BY id DESC LIMIT 100').all()).results || [];
    return json({ log: rows });
  }
  throw new HttpError(404, 'not_found', '找不到');
}
