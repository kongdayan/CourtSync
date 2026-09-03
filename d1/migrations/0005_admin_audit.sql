CREATE TABLE admin_audit_log (
  id TEXT PRIMARY KEY NOT NULL,
  actor_user_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (length(action) BETWEEN 1 AND 64),
  target_user_id TEXT NOT NULL,
  before_json TEXT NOT NULL,
  after_json TEXT NOT NULL,
  request_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (actor_user_id) REFERENCES user(id),
  FOREIGN KEY (target_user_id) REFERENCES user(id)
) STRICT;

CREATE INDEX idx_admin_audit_target_created
  ON admin_audit_log(target_user_id, created_at DESC);
