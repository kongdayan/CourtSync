CREATE TABLE user_access (
  user_id TEXT PRIMARY KEY NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'admin')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'active', 'disabled')),
  rule_limit INTEGER NOT NULL DEFAULT 2 CHECK (rule_limit >= 0 AND rule_limit <= 1000),
  first_login_at TEXT NOT NULL,
  last_login_at TEXT NOT NULL,
  status_changed_at TEXT NOT NULL,
  status_changed_by TEXT,
  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
) STRICT;

CREATE INDEX idx_user_access_status_last_login
  ON user_access(status, last_login_at DESC);

CREATE INDEX idx_user_access_role_status
  ON user_access(role, status);
