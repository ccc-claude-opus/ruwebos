-- 相簿（每次啟動都會執行，所以只用 IF NOT EXISTS）
CREATE TABLE IF NOT EXISTS photos (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL DEFAULT 'me',
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  size INTEGER NOT NULL,
  width INTEGER NOT NULL DEFAULT 0,
  height INTEGER NOT NULL DEFAULT 0,
  taken_at TEXT NOT NULL DEFAULT '',   -- EXIF 的拍攝時間（相機的當地時間）YYYY-MM-DDTHH:MM:SS
  camera TEXT NOT NULL DEFAULT '',
  orientation INTEGER NOT NULL DEFAULT 1,
  lat REAL,
  lon REAL,
  favorite INTEGER NOT NULL DEFAULT 0,
  has_thumb INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS photos_date ON photos (owner, taken_at, created_at);
CREATE TABLE IF NOT EXISTS albums (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL DEFAULT 'me',
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS album_photos (
  album_id TEXT NOT NULL,
  photo_id TEXT NOT NULL,
  added_at TEXT NOT NULL,
  PRIMARY KEY (album_id, photo_id)
);
