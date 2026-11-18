-- 待辦（每次啟動都會執行，所以只用 IF NOT EXISTS）
CREATE TABLE IF NOT EXISTS lists (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL DEFAULT 'me',
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL DEFAULT 'me',
  list_id TEXT,
  title TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  due TEXT NOT NULL DEFAULT '',
  done INTEGER NOT NULL DEFAULT 0,
  done_at TEXT,
  repeat TEXT NOT NULL DEFAULT '' CHECK (repeat IN ('', 'daily', 'weekly', 'monthly', 'yearly')),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS tasks_view ON tasks (owner, done, due, created_at);
CREATE INDEX IF NOT EXISTS tasks_list ON tasks (owner, list_id);
CREATE INDEX IF NOT EXISTS lists_name ON lists (owner, name);
