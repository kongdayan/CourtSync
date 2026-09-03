CREATE TABLE notification_rule (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  source TEXT NOT NULL CHECK (source IN ('usthing', 'jiushi')),
  weekday_mask INTEGER NOT NULL DEFAULT 0 CHECK (weekday_mask BETWEEN 0 AND 127),
  timeslot_mask INTEGER NOT NULL DEFAULT 0 CHECK (timeslot_mask BETWEEN 0 AND 32767),
  facility_ids_json TEXT NOT NULL DEFAULT '[]',
  min_consecutive INTEGER NOT NULL CHECK (min_consecutive BETWEEN 1 AND 12),
  push_limit INTEGER NOT NULL CHECK (push_limit = -1 OR push_limit BETWEEN 0 AND 100),
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
) STRICT;

CREATE INDEX idx_notification_rule_user_updated
  ON notification_rule(user_id, updated_at DESC);

CREATE INDEX idx_notification_rule_source_enabled_user
  ON notification_rule(source, enabled, user_id);
