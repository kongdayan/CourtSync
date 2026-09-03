CREATE TABLE source_sync_run (
  id TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('usthing', 'jiushi')),
  status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'closed')),
  slot_count INTEGER NOT NULL,
  warning_summary TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  PRIMARY KEY (id, source)
) STRICT;

CREATE TABLE source_health (
  source TEXT PRIMARY KEY CHECK (source IN ('usthing', 'jiushi')),
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  last_success_at TEXT,
  last_failure_at TEXT,
  failure_alerted_at TEXT,
  last_failure_summary TEXT,
  updated_at TEXT NOT NULL
) STRICT;
