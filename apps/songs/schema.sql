-- 音樂（每次啟動都會執行，所以只用 IF NOT EXISTS）
CREATE TABLE IF NOT EXISTS tracks (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL DEFAULT 'me',
  title TEXT NOT NULL,
  artist TEXT NOT NULL DEFAULT '',
  album TEXT NOT NULL DEFAULT '',
  track TEXT NOT NULL DEFAULT '',
  year TEXT NOT NULL DEFAULT '',
  genre TEXT NOT NULL DEFAULT '',
  duration REAL NOT NULL DEFAULT 0,   -- 秒，0 = 不知道
  type TEXT NOT NULL,
  size INTEGER NOT NULL,
  name TEXT NOT NULL,                 -- 上傳時的檔名
  has_cover INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS tracks_sort ON tracks (owner, artist, album);
CREATE TABLE IF NOT EXISTS playlists (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL DEFAULT 'me',
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS playlist_tracks (
  playlist_id TEXT NOT NULL,
  track_id TEXT NOT NULL,
  pos INTEGER NOT NULL,
  PRIMARY KEY (playlist_id, pos)
);
