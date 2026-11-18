// 應用套件：取得（網址、網頁宣告的套件、GitHub 儲存庫）、檢查 ruwebos-app.json、整理成交給 rucloud 的 tar.gz。
//
// 套件是一個 wrangler 應用資料夾（wrangler.jsonc／wrangler.json／wrangler.toml、src/、public/…）的 .tar.gz，
// 最上層（或唯一的資料夾裡，例如 GitHub 的封存檔）要有 ruwebos-app.json。
import { gunzip, gzip, isGzip, untar, tar } from './tar.js';
import { checkPerms } from './perms.js';

export const MAX_DOWNLOAD = 50 * 1024 * 1024;
export const MAX_UNPACKED = 200 * 1024 * 1024;

const dec = new TextDecoder();

/** 使用者給的來源 → 要下載的網址。GitHub 儲存庫（可加 /tree/<分支>）下載它的封存檔。 */
export function resolveSource(src) {
  let u;
  try {
    u = new URL(String(src || '').trim());
  } catch {
    throw new Error('請輸入完整的網址（http:// 或 https:// 開頭）');
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('只接受 http:// 或 https:// 的網址');
  const gh = /^\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/tree\/(.+?))?\/?$/.exec(u.pathname);
  if (u.hostname === 'github.com' && gh) {
    return { url: `https://github.com/${gh[1]}/${gh[2]}/archive/${gh[3] || 'HEAD'}.tar.gz`, kind: 'git' };
  }
  return { url: u.href, kind: 'url' };
}

async function get(url, fetcher) {
  const r = await fetcher(url, { redirect: 'follow', signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error(`下載 ${url} 失敗：HTTP ${r.status}`);
  const len = Number(r.headers.get('content-length') || 0);
  if (len > MAX_DOWNLOAD) throw new Error(`套件太大（${Math.round(len / 1048576)} MB，上限 ${MAX_DOWNLOAD / 1048576} MB）`);
  const bytes = new Uint8Array(await r.arrayBuffer());
  if (bytes.length > MAX_DOWNLOAD) throw new Error(`套件太大（上限 ${MAX_DOWNLOAD / 1048576} MB）`);
  return { bytes, type: r.headers.get('content-type') || '', url: r.url || url };
}

/** 網頁裡宣告的套件：<link rel="ruwebos-app" href="…">。 */
export function declaredPackage(html, base) {
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    const rel = /\brel\s*=\s*["']?([^"'\s>]+)/i.exec(tag)?.[1];
    const href = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag);
    if (rel && rel.toLowerCase().split(/\s+/).includes('ruwebos-app') && href) {
      return new URL((href[1] ?? href[2] ?? href[3]).replace(/&amp;/g, '&'), base).href;
    }
  }
  return null;
}

/** 下載套件：網址直接是 .tar.gz，或是宣告了套件的網頁。回傳 { bytes, url, page }。 */
export async function download(src, fetcher = fetch) {
  const { url } = resolveSource(src);
  let res = await get(url, fetcher);
  let page = null;
  if (!isGzip(res.bytes)) {
    if (!/html/i.test(res.type) && !/^\s*</.test(dec.decode(res.bytes.subarray(0, 64)))) {
      throw new Error('這個網址不是 .tar.gz 套件，也不是網頁');
    }
    const pkg = declaredPackage(dec.decode(res.bytes), res.url);
    if (!pkg) throw new Error('這個網頁沒有宣告可安裝的套件（<link rel="ruwebos-app" href="…">），只能加到「我的最愛」');
    page = res.url;
    res = await get(pkg, fetcher);
    if (!isGzip(res.bytes)) throw new Error(`宣告的套件 ${pkg} 不是 .tar.gz`);
  }
  return { bytes: res.bytes, url: res.url, page };
}

/** JSON with comments（wrangler.jsonc）：去掉註解與結尾多的逗號。 */
export function parseJsonc(text) {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      const start = i;
      for (i++; i < text.length && text[i] !== '"'; i++) if (text[i] === '\\') i++;
      out += text.slice(start, i + 1);
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      out += '\n';
    } else if (c === '/' && text[i + 1] === '*') {
      i = text.indexOf('*/', i + 2);
      if (i < 0) break;
      i++;
    } else out += c;
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'));
}

const ID = /^[a-z0-9][a-z0-9-]{0,62}$/;
const VERSION = /^\d+(\.\d+){0,2}([-+][0-9A-Za-z.-]+)?$/;
const SECRET = /^[A-Z_][A-Z0-9_]{0,63}$/;
const SKIP = (p) => p.split('/').some((s) => s.startsWith('._') || s === '.DS_Store' || s === '.git' || s === 'node_modules' || s === '.wrangler' || s === '.rucloud')
  || /(^|\/)(\.dev\.vars[^/]*|\.env(\.[^/]*)?)$/.test(p);

/** ruwebos-app.json 的檢查；回傳整理過的內容。 */
export function checkManifest(m) {
  if (!m || typeof m !== 'object') throw new Error('ruwebos-app.json 不是 JSON 物件');
  const str = (k, max, required) => {
    const v = m[k];
    if (v === undefined || v === null || v === '') {
      if (required) throw new Error(`ruwebos-app.json 少了 ${k}`);
      return '';
    }
    if (typeof v !== 'string' || v.length > max) throw new Error(`ruwebos-app.json 的 ${k} 要是 ${max} 字以內的文字`);
    return v.trim();
  };
  const id = str('id', 63, true);
  if (!ID.test(id)) throw new Error(`id「${id}」只能用小寫英文、數字與 -（會成為網址 http://${id}.localhost）`);
  const version = str('version', 40, true);
  if (!VERSION.test(version)) throw new Error(`version「${version}」要像 1.2.0`);
  const license = str('license', 100, true);
  if (/^(unlicensed|none|proprietary|see license in .*)$/i.test(license) || !/^[A-Za-z0-9.+\-() ]+$/.test(license)) {
    throw new Error(`license「${license}」要是 SPDX 授權名稱（例如 MIT、Apache-2.0、GPL-3.0-or-later）；沒有可用授權的套件不能安裝`);
  }
  const color = str('color', 20);
  if (color && !/^#[0-9a-fA-F]{3,8}$/.test(color)) throw new Error('color 要是 #rrggbb');
  const secrets = m.secrets === undefined ? [] : m.secrets;
  if (!Array.isArray(secrets) || !secrets.every((s) => typeof s === 'string' && SECRET.test(s))) {
    throw new Error('secrets 要是密鑰名稱的陣列（大寫英文、數字與 _）');
  }
  const d1Init = m.d1_init === undefined ? {} : m.d1_init;
  if (typeof d1Init !== 'object' || Array.isArray(d1Init) || !Object.values(d1Init).every((f) => typeof f === 'string')) {
    throw new Error('d1_init 要像 { "DB": "schema.sql" }');
  }
  const url = (k) => {
    const v = str(k, 500);
    if (v && !/^https?:\/\//.test(v)) throw new Error(`${k} 要是 http(s) 網址`);
    return v;
  };
  return {
    id,
    name: str('name', 40, true),
    version,
    description: str('description', 200),
    license,
    source: url('source'),
    homepage: url('homepage'),
    author: str('author', 100),
    icon: str('icon', 200),
    color: color || '#5c7cfa',
    glyph: str('glyph', 4),
    permissions: checkPerms(m.permissions),
    secrets: [...new Set(secrets)],
    d1_init: d1Init,
  };
}

/**
 * 解開並檢查套件。回傳 { manifest, files, icon }：files 是交給 rucloud 的檔案（路徑相對於應用資料夾），
 * icon 是 { type, data } 或 null。
 */
export async function readPackage(gz) {
  const all = untar(await gunzip(gz), { maxBytes: MAX_UNPACKED });
  const marker = all
    .map((f) => f.path)
    .filter((p) => p === 'ruwebos-app.json' || /^[^/]+\/ruwebos-app\.json$/.test(p))
    .sort((a, b) => a.length - b.length)[0];
  if (!marker) throw new Error('套件裡找不到 ruwebos-app.json（要在最上層，或唯一的資料夾裡）');
  const root = marker.slice(0, -'ruwebos-app.json'.length);
  const files = all
    .filter((f) => f.path.startsWith(root) && f.path !== marker)
    .map((f) => ({ path: f.path.slice(root.length), data: f.data }))
    .filter((f) => f.path && !SKIP(f.path));
  let raw;
  try {
    raw = JSON.parse(dec.decode(all.find((f) => f.path === marker).data));
  } catch (e) {
    throw new Error(`ruwebos-app.json 讀不懂：${e.message}`);
  }
  const manifest = checkManifest(raw);
  const has = (p) => files.some((f) => f.path === p);
  const wranglerFile = ['wrangler.jsonc', 'wrangler.json', 'wrangler.toml'].find(has);
  if (!wranglerFile) throw new Error('套件裡沒有 wrangler.jsonc、wrangler.json 或 wrangler.toml');

  // d1_init 的 SQL 變成第一個 migration（rucloud 安裝的應用會自動套用 migrations）
  const init = Object.entries(manifest.d1_init);
  if (init.length) {
    if (wranglerFile === 'wrangler.toml') throw new Error('d1_init 只支援 wrangler.jsonc／wrangler.json；wrangler.toml 的應用請改用 migrations/');
    const cfg = parseJsonc(dec.decode(files.find((f) => f.path === wranglerFile).data));
    for (const [binding, file] of init) {
      const db = (cfg.d1_databases || []).find((d) => d.binding === binding);
      if (!db) throw new Error(`d1_init 的 ${binding} 不是 wrangler 設定裡的 D1 綁定`);
      const sql = files.find((f) => f.path === file.replace(/^\.\//, ''));
      if (!sql) throw new Error(`d1_init 的 ${file} 不在套件裡`);
      const dir = (db.migrations_dir || 'migrations').replace(/^\.\//, '').replace(/\/$/, '');
      files.push({ path: `${dir}/0000_${binding.toLowerCase()}_init.sql`, data: sql.data });
    }
  }

  let icon = null;
  if (manifest.icon) {
    const f = files.find((x) => x.path === manifest.icon.replace(/^\.?\//, ''));
    if (!f) throw new Error(`icon 指定的 ${manifest.icon} 不在套件裡`);
    const ext = (/\.([a-z0-9]+)$/i.exec(f.path)?.[1] || '').toLowerCase();
    const type = { svg: 'image/svg+xml', png: 'image/png', webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg' }[ext];
    if (!type) throw new Error('icon 要是 SVG、PNG、WebP 或 JPEG');
    if (f.data.length > 256 * 1024) throw new Error('icon 太大（上限 256 KB）');
    icon = { type, data: f.data };
  }
  return { manifest, files, icon };
}

/** 交給 rucloud 的 tar.gz。 */
export const packFiles = (files) => gzip(tar(files));

/** 版本比較：1.10.0 > 1.9.2；有 -beta 之類的預先發行標記比正式版小。 */
export function compareVersions(a, b) {
  const parse = (v) => {
    const [main, pre] = String(v).split(/-(.*)/s);
    return { nums: main.split('+')[0].split('.').map((n) => Number(n) || 0), pre: pre || '' };
  };
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < 3; i++) {
    const d = (x.nums[i] || 0) - (y.nums[i] || 0);
    if (d) return Math.sign(d);
  }
  if (x.pre === y.pre) return 0;
  if (!x.pre) return 1;
  if (!y.pre) return -1;
  return x.pre < y.pre ? -1 : 1;
}
