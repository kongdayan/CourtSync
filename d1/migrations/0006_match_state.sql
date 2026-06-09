CREATE TABLE rule_match_state (
  fingerprint TEXT PRIMARY KEY NOT NULL,
  rule_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('usthing', 'jiushi')),
  slot_date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  availability_json TEXT NOT NULL,
  is_active INTEGER NOT NULL CHECK (is_active IN (0, 1)),
  notification_count INTEGER NOT NULL DEFAULT 0 CHECK (notification_count >= 0),
  last_notified_at TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  last_sync_run_id TEXT NOT NULL,
  FOREIGN KEY (rule_id) REFERENCES notification_rule(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
) STRICT;

CREATE INDEX idx_match_rule_date_active ON rule_match_state(rule_id, slot_date, is_active);
CREATE INDEX idx_match_user_active_seen ON rule_match_state(user_id, is_active, last_seen_at DESC);
CREATE INDEX idx_match_source_active_seen ON rule_match_state(source, is_active, last_seen_at DESC);
