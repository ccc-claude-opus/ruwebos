-- 行事曆（每次啟動都會執行，所以只用 IF NOT EXISTS）
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL DEFAULT 'me',
  title TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  all_day INTEGER NOT NULL DEFAULT 0,
  start TEXT NOT NULL,
  end TEXT NOT NULL,
  rrule TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS events_owner_start ON events (owner, start);
