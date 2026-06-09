CREATE TABLE notification_channel (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (length(provider) BETWEEN 1 AND 32),
  encrypted_config TEXT NOT NULL,
  destination_mask TEXT NOT NULL,
  config_fingerprint TEXT NOT NULL,
  verified_at TEXT NOT NULL,
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE,
  UNIQUE (user_id, provider)
) STRICT;

CREATE INDEX idx_notification_channel_user_enabled
  ON notification_channel(user_id, enabled, provider);
