-- 封存居民：只在公開製作器的選單隱藏，不刪除居民、照片或試算表資料。
-- Additive only: no DROP, DELETE or ALTER. 取消封存只把 archived 設回 0。
-- worker/index.js 亦會在首次使用時執行同一句 CREATE TABLE IF NOT EXISTS，未套用 migration 時都不會出錯。
CREATE TABLE IF NOT EXISTS resident_archive (
  resident_id  TEXT PRIMARY KEY,               -- residents.resident_id
  archived     INTEGER NOT NULL DEFAULT 1 CHECK (archived IN (0, 1)),
  updated_at   TEXT NOT NULL,
  updated_by   TEXT NOT NULL DEFAULT ''
);
