-- LOCAL wrangler dev database only (never run with --remote). Resets e2e fixtures.
DELETE FROM residents; DELETE FROM resident_match_queue; DELETE FROM config_versions; DELETE FROM rate_limit; DELETE FROM sync_state; DELETE FROM admin_sessions; DELETE FROM sqlite_sequence WHERE name = 'config_versions';
INSERT INTO residents (resident_id, sheet_name, ig, ig_norm, default_category, sync_status, created_at, updated_at) VALUES
 ('01JTESTRESIDENT000000000YY','幽月','@yuzuki_qg','yuzuki_qg','regular','active','2026-11-19T00:00:00Z','2026-11-19T00:00:00Z'),
 ('01JTESTRESIDENT000000000XD','小豆','@rinnkaunn','rinnkaunn','limited','active','2026-11-19T00:00:00Z','2026-11-19T00:00:00Z');
-- Pretend a sync just happened far in the future so no Google call is attempted locally.
INSERT INTO sync_state (key, last_success_at, last_attempt_at, row_count) VALUES ('sheets_roster','2099-01-01T00:00:00Z','2099-01-01T00:00:00Z',2);
