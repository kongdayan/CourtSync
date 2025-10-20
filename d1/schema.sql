CREATE TABLE IF NOT EXISTS slot_snapshot (
  facility_id   TEXT    NOT NULL,
  slot_date     TEXT    NOT NULL,
  start_time    TEXT    NOT NULL,
  end_time      TEXT    NOT NULL,
  status        TEXT    NOT NULL,
  activity_name TEXT,
  updated_at    TEXT    NOT NULL,
  PRIMARY KEY (facility_id, slot_date, start_time)
);

CREATE INDEX IF NOT EXISTS idx_slot_snapshot_date
  ON slot_snapshot (slot_date);
