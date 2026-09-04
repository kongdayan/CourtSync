-- Remove health-tracking tables (added in 0008/0009) that were written on
-- every scheduled sync but never read by any UI/API/alert consumer.
--   - source_sync_run:  1 row per source per 5-min cron (576/day) of pure logs
--   - source_health:    per-source status row, unused (alert wiring absent)
--   - kv_meta:          retention throttle key, only used by the removed
--                       retention cleanup that existed to prune the above
-- Real business tables (notification_outbox, rule_match_state) only grow on
-- actual match events (tiny volume), so no cleanup job is required.
DROP TABLE IF EXISTS source_sync_run;
DROP TABLE IF EXISTS source_health;
DROP TABLE IF EXISTS kv_meta;
