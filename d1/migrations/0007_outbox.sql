CREATE TABLE notification_outbox (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  sync_run_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  match_fingerprints_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  sending_started_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  sent_at TEXT,
  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE,
  FOREIGN KEY (channel_id) REFERENCES notification_channel(id) ON DELETE CASCADE,
  UNIQUE (user_id, channel_id, sync_run_id)
) STRICT;

CREATE INDEX idx_outbox_status_created ON notification_outbox(status, created_at);
CREATE INDEX idx_outbox_user_created ON notification_outbox(user_id, created_at DESC);
