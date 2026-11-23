CREATE TABLE workflow (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  definition_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
-- statement-break
CREATE TABLE item (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  role TEXT,
  channel TEXT,
  workflow_id TEXT NOT NULL,
  start_date TEXT NOT NULL CHECK (date(start_date) IS start_date),
  outcome TEXT,
  notes TEXT,
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
-- statement-break
CREATE TABLE contact (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES item(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  profile_url TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'not_accepted')),
  created_at TEXT NOT NULL
);
-- statement-break
CREATE TABLE step_record (
  item_id TEXT NOT NULL REFERENCES item(id) ON DELETE CASCADE,
  step_key TEXT NOT NULL,
  completed_on TEXT CHECK (completed_on IS NULL OR date(completed_on) IS completed_on),
  skipped INTEGER NOT NULL DEFAULT 0 CHECK (skipped IN (0, 1)),
  PRIMARY KEY (item_id, step_key)
);
-- statement-break
CREATE TABLE app_setting (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
-- statement-break
CREATE TABLE reminder_log (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL CHECK (date(date) IS date),
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed')),
  attempt INTEGER NOT NULL CHECK (attempt >= 1),
  error TEXT,
  created_at TEXT NOT NULL
);
-- statement-break
CREATE UNIQUE INDEX idx_reminder_log_sent_date
  ON reminder_log(date)
  WHERE status = 'sent';
-- statement-break
CREATE INDEX idx_item_archived_at ON item(archived_at);
-- statement-break
CREATE INDEX idx_contact_item_id ON contact(item_id);
-- statement-break
CREATE INDEX idx_reminder_log_date ON reminder_log(date);
