-- Phase 5 initial schema. Additive only: no DROP, DELETE or ALTER.
-- Target: new D1 database qg-resident-card-db (pending approval).

CREATE TABLE IF NOT EXISTS residents (
  resident_id      TEXT PRIMARY KEY,            -- ULID, never reused, not a sheet row number
  sheet_name       TEXT NOT NULL DEFAULT '',     -- column B 更表名稱
  ig               TEXT NOT NULL DEFAULT '',     -- column C IG帳號, as shown
  ig_norm          TEXT NOT NULL DEFAULT '',     -- lowercased, no @ / URL prefix
  default_category TEXT NOT NULL DEFAULT 'regular'
                   CHECK (default_category IN ('regular','limited','shadow','trial','none')),
  photo_asset_id   TEXT,                         -- current published photo (assets.asset_id)
  sync_status      TEXT NOT NULL DEFAULT 'active'
                   CHECK (sync_status IN ('active','missing','manual')),
  last_seen_at     TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  version          INTEGER NOT NULL DEFAULT 1    -- optimistic concurrency
);
CREATE INDEX IF NOT EXISTS residents_ig_norm ON residents(ig_norm);
CREATE INDEX IF NOT EXISTS residents_name ON residents(sheet_name);

CREATE TABLE IF NOT EXISTS resident_match_queue (
  queue_id        TEXT PRIMARY KEY,
  sheet_name      TEXT NOT NULL DEFAULT '',
  ig              TEXT NOT NULL DEFAULT '',
  ig_norm         TEXT NOT NULL DEFAULT '',
  reason          TEXT NOT NULL CHECK (reason IN ('duplicate_ig','ig_changed','missing_data','name_conflict')),
  candidate_ids   TEXT NOT NULL DEFAULT '[]',    -- JSON array of resident_id
  status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','ignored')),
  resolved_to     TEXT,
  created_at      TEXT NOT NULL,
  resolved_at     TEXT,
  resolved_by     TEXT
);
CREATE INDEX IF NOT EXISTS match_queue_status ON resident_match_queue(status);

CREATE TABLE IF NOT EXISTS assets (
  asset_id      TEXT PRIMARY KEY,
  kind          TEXT NOT NULL CHECK (kind IN ('photo','font','image')),
  owner_id      TEXT,                            -- resident_id for photos
  purpose       TEXT NOT NULL DEFAULT '',        -- e.g. promo.frame, daily.bow
  r2_key        TEXT NOT NULL UNIQUE,
  mime          TEXT NOT NULL,
  bytes         INTEGER NOT NULL,
  width         INTEGER,
  height        INTEGER,
  has_alpha     INTEGER,
  sha256        TEXT NOT NULL,
  meta          TEXT NOT NULL DEFAULT '{}',      -- crop/scale for photos; licence for fonts
  previous_id   TEXT,                            -- version chain for restore
  created_at    TEXT NOT NULL,
  created_by    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS assets_owner ON assets(kind, owner_id);
CREATE INDEX IF NOT EXISTS assets_purpose ON assets(kind, purpose);

CREATE TABLE IF NOT EXISTS config_versions (
  version_id     INTEGER PRIMARY KEY AUTOINCREMENT,
  status         TEXT NOT NULL CHECK (status IN ('draft','published','archived')),
  schema_version INTEGER NOT NULL,
  body           TEXT NOT NULL,                  -- JSON: page presets, fonts, layouts, assets, copy templates
  summary        TEXT NOT NULL DEFAULT '',
  based_on       INTEGER,
  created_at     TEXT NOT NULL,
  created_by     TEXT NOT NULL,
  published_at   TEXT,
  published_by   TEXT
);
CREATE INDEX IF NOT EXISTS config_status ON config_versions(status, version_id);

CREATE TABLE IF NOT EXISTS sync_state (
  key            TEXT PRIMARY KEY,               -- 'sheets_roster'
  last_success_at TEXT,
  last_attempt_at TEXT,
  last_error     TEXT,                           -- status code only, never response bodies
  row_count      INTEGER
);

CREATE TABLE IF NOT EXISTS audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  at         TEXT NOT NULL,
  actor      TEXT NOT NULL,
  action     TEXT NOT NULL,
  target     TEXT,
  detail     TEXT NOT NULL DEFAULT '{}'          -- ids and counts only
);
CREATE INDEX IF NOT EXISTS audit_at ON audit_log(at);

CREATE TABLE IF NOT EXISTS rate_limit (
  bucket     TEXT PRIMARY KEY,                   -- actor:minute
  count      INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
