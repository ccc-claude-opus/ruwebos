-- 安裝程式的資料（每次啟動都執行，所以都用 IF NOT EXISTS）
-- 安裝的應用；requested、granted、secrets 是 JSON 陣列；origin：user（使用者裝的）或 bundled（預裝）
CREATE TABLE IF NOT EXISTS apps (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  license TEXT NOT NULL,
  source TEXT NOT NULL,
  homepage TEXT NOT NULL DEFAULT '',
  author TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '#5c7cfa',
  glyph TEXT NOT NULL DEFAULT '',
  has_icon INTEGER NOT NULL DEFAULT 0,
  requested TEXT NOT NULL DEFAULT '[]',
  granted TEXT NOT NULL DEFAULT '[]',
  secrets TEXT NOT NULL DEFAULT '[]',
  origin TEXT NOT NULL DEFAULT 'user',
  installed_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
-- 下載、檢查好，等使用者同意的套件（套件本身在 R2 的 pending/<token>）
CREATE TABLE IF NOT EXISTS pending (
  token TEXT PRIMARY KEY,
  manifest TEXT NOT NULL,
  source TEXT NOT NULL,
  origin TEXT NOT NULL DEFAULT 'user',
  created_at TEXT NOT NULL
);
-- 使用者移除的預裝應用：不再自動裝回來
CREATE TABLE IF NOT EXISTS removed (id TEXT PRIMARY KEY, removed_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS favorites (id TEXT PRIMARY KEY, url TEXT NOT NULL, title TEXT NOT NULL, added_at TEXT NOT NULL);
-- 套件說明的每個權限的用途（ruwebos-app.json 的 permission_reasons，JSON 物件）
CREATE TABLE IF NOT EXISTS app_reasons (id TEXT PRIMARY KEY, reasons TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);
