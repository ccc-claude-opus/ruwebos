-- 影片的資料表（rucloud 開機時依檔名順序套用尚未套用的 migrations）
CREATE TABLE IF NOT EXISTS videos (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL DEFAULT 'me',
  title TEXT NOT NULL,
  name TEXT NOT NULL,                  -- 上傳時的檔名
  type TEXT NOT NULL,
  size INTEGER NOT NULL,
  duration REAL NOT NULL DEFAULT 0,    -- 秒，0 = 還不知道（播放時由瀏覽器回報）
  position REAL NOT NULL DEFAULT 0,    -- 看到第幾秒
  watched_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS videos_owner ON videos (owner, created_at);
