-- 每週更表：Google Drive 相片的封存狀態（只記錄在 D1，不會移動或刪除 Drive 上的檔案）。
-- Additive only: no DROP, DELETE or ALTER. 取消封存只把 archived 設回 0。
-- worker/index.js 亦會在首次使用時執行同一句 CREATE TABLE IF NOT EXISTS，未套用 migration 時都不會出錯。
CREATE TABLE IF NOT EXISTS drive_photos (
  file_id        TEXT PRIMARY KEY,               -- Google Drive file id
  archived       INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  archive_reason TEXT NOT NULL DEFAULT '' CHECK (archive_reason IN ('', 'manual', 'auto')),
  archived_at    TEXT,
  archived_by    TEXT NOT NULL DEFAULT '',
  use_count      INTEGER NOT NULL DEFAULT 0,      -- 用這張相下載更表的次數
  last_used_at   TEXT,
  updated_at     TEXT NOT NULL
);
