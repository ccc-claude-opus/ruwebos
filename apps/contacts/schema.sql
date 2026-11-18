-- 通訊錄（每次啟動都會執行，所以只用 IF NOT EXISTS）
CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL DEFAULT 'me',
  name TEXT NOT NULL,
  phonetic TEXT NOT NULL DEFAULT '',
  org TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  phones TEXT NOT NULL DEFAULT '[]',   -- [{label, value}]
  emails TEXT NOT NULL DEFAULT '[]',   -- [{label, value}]
  address TEXT NOT NULL DEFAULT '',
  birthday TEXT NOT NULL DEFAULT '',   -- YYYY-MM-DD，或不含年份的 --MM-DD
  url TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  groups TEXT NOT NULL DEFAULT '',     -- 逗號分隔
  favorite INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS contacts_name ON contacts (owner, favorite DESC, phonetic, name);
