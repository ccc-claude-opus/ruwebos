// 相簿（R2 放原檔與縮圖，D1 放索引與相簿）。頁面由伺服器產生；public/photos.js 在瀏覽器裡用 canvas 補縮圖。
//   GET  /?view=all|fav       依月份分組的格狀檢視
//   GET  /p/:id               單張（上一張／下一張、EXIF、最愛、相簿、下載、刪除）
//   GET  /o/:id  /t/:id       原檔、縮圖（Range）
//   POST /upload              上傳（multipart，可多檔）
//   POST /p/:id/favorite  /p/:id/albums  /p/:id/albums/remove  /p/:id/delete  /p/:id/thumb
//   GET  /albums  POST /albums           相簿清單、新增
//   GET  /a/:id   POST /a/:id  POST /a/:id/delete   相簿（改名、刪除；照片留著）
//   GET  /import?dir=  POST /import      從「檔案」應用加入照片（service binding FILESAPP）
//   GET  /api/photos?limit=              最新的照片（JSON）
import { app, page, html, redirect, readForm, json, tzOf, fmt, newId, UserError } from '../../_shared/lib.js';
import { serveObject, filesOf, size } from '../../_shared/r2.js';
import { imageInfo } from './meta.js';

const APP = { name: '相簿', color: '#d6336c' };
const OWNER = 'me';
const MAX = 50 * 1024 * 1024;
const MONTH = (s) => `${+s.slice(0, 4)} 年 ${+s.slice(5, 7)} 月`;

async function get(db, id) {
  const p = await db.prepare('SELECT * FROM photos WHERE id = ? AND owner = ?').bind(id, OWNER).first();
  if (!p) throw new UserError('找不到這張照片。');
  return p;
}

/** Stores one image (bytes) and its index row; returns the id. */
async function store(env, name, bytes, albumId) {
  if (bytes.byteLength > MAX) throw new UserError(`「${name}」太大了（上限 50 MB）。`);
  const info = imageInfo(bytes.slice(0, 128 * 1024));
  if (!info.type) throw new UserError(`「${name}」不是支援的影像（JPEG、PNG、GIF、WebP）。`);
  const id = newId();
  await env.PHOTOS.put(`o/${id}`, bytes, { httpMetadata: { contentType: info.type } });
  const now = new Date().toISOString();
  await env.DB.prepare('INSERT INTO photos (id, owner, name, type, size, width, height, taken_at, camera, orientation, lat, lon, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, OWNER, name.slice(0, 200), info.type, bytes.byteLength, info.width, info.height, info.taken, info.camera.slice(0, 100), info.orientation, info.lat, info.lon, now)
    .run();
  if (albumId) await addToAlbum(env.DB, id, albumId);
  return id;
}

async function addToAlbum(db, photoId, albumId) {
  const a = await db.prepare('SELECT id FROM albums WHERE id = ? AND owner = ?').bind(albumId, OWNER).first();
  if (!a) throw new UserError('找不到這個相簿。');
  await db.prepare('INSERT OR IGNORE INTO album_photos (album_id, photo_id, added_at) VALUES (?, ?, ?)').bind(albumId, photoId, new Date().toISOString()).run();
}

// 照片的日期：拍攝時間（相機的當地時間），沒有就用上傳時間在檢視者時區的日期
const dateOf = (p, tz) => p.taken_at || fmtLocal(p.created_at, tz);
function fmtLocal(iso, tz) {
  const d = new Intl.DateTimeFormat('sv-SE', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
  return d.replace(' ', 'T');
}

const ORDER = "ORDER BY COALESCE(NULLIF(taken_at, ''), created_at) DESC, created_at DESC";

function grid(photos) {
  return html`<div class="ph-grid">${photos.map((p) => html`<a href="/p/${p.id}" title="${p.name}"><img src="/${p.has_thumb ? 't' : 'o'}/${p.id}" alt="${p.name}" loading="lazy"${p.has_thumb ? '' : html` data-thumb-for="${p.id}"`}${p.favorite ? html` class="fav"` : ''}></a>`)}</div>`;
}

const STYLE = html`<style>
  .ph-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 4px; }
  .ph-grid a { display: block; aspect-ratio: 1; background: var(--hover); overflow: hidden; border-radius: 4px; }
  .ph-grid img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .ph-grid img.fav { outline: 3px solid var(--app); outline-offset: -3px; }
  .ph-big { text-align: center; background: #111; border-radius: var(--radius); padding: 8px; }
  .ph-big img { max-width: 100%; max-height: 72vh; }
  @media (max-width: 600px) { .ph-grid { grid-template-columns: repeat(3, 1fr); gap: 2px; } }
</style>`;

const tabs = (url, view) => html`<p class="row">${[['/', '全部', 'all'], ['/?view=fav', '最愛', 'fav'], ['/albums', '相簿', 'albums']].map(([href, label, v]) => html`<a class="chip${view === v ? ' on' : ''}" href="${href}">${label}</a>`)}</p>`;

function uploadForm(albumId = '') {
  return html`<form class="stack card" method="post" action="/upload" enctype="multipart/form-data">
  ${albumId ? html`<input type="hidden" name="album" value="${albumId}">` : ''}
  <label>加入照片<input type="file" name="file" multiple accept="image/jpeg,image/png,image/gif,image/webp"></label>
  <div class="row"><button class="primary" type="submit">上傳</button><a class="btn" href="/import${albumId ? `?album=${albumId}` : ''}">從「檔案」加入</a></div>
</form>`;
}

async function home(request, env, url) {
  const tz = tzOf(request);
  const fav = url.searchParams.get('view') === 'fav';
  const photos = (await env.DB.prepare(`SELECT * FROM photos WHERE owner = ?${fav ? ' AND favorite = 1' : ''} ${ORDER} LIMIT 2000`).bind(OWNER).all()).results;
  const groups = [];
  for (const p of photos) {
    const m = dateOf(p, tz).slice(0, 7);
    if (!groups.length || groups[groups.length - 1].m !== m) groups.push({ m, list: [] });
    groups[groups.length - 1].list.push(p);
  }
  return page(request, {
    app: APP,
    title: fav ? '最愛' : '',
    body: html`${STYLE}${tabs(url, fav ? 'fav' : 'all')}
${groups.length
  ? groups.map((g) => html`<p class="section">${MONTH(g.m)}（${g.list.length}）</p>${grid(g.list)}`)
  : html`<p class="empty">${fav ? '還沒有最愛的照片。' : '還沒有照片，從下面上傳或從「檔案」加入。'}</p>`}
${fav ? '' : uploadForm()}
<script src="/photos.js" defer></script>`,
  });
}

async function photoPage(request, env, id) {
  const tz = tzOf(request);
  const p = await get(env.DB, id);
  // 上一張／下一張：和清單同樣的排序
  const all = (await env.DB.prepare(`SELECT id FROM photos WHERE owner = ? ${ORDER}`).bind(OWNER).all()).results.map((r) => r.id);
  const i = all.indexOf(id);
  const prev = all[i - 1];
  const next = all[i + 1];
  const albums = (await env.DB.prepare('SELECT id, name FROM albums WHERE owner = ? ORDER BY name').bind(OWNER).all()).results;
  const inAlbums = new Set((await env.DB.prepare('SELECT album_id FROM album_photos WHERE photo_id = ?').bind(id).all()).results.map((r) => r.album_id));
  const taken = p.taken_at ? `${p.taken_at.slice(0, 10).replace(/-/g, '/')} ${p.taken_at.slice(11, 16)}` : '';
  const row = (k, v) => (v ? html`<tr><th>${k}</th><td>${v}</td></tr>` : '');
  return page(request, {
    app: APP,
    title: p.name,
    back: '/',
    actions: html`${prev ? html`<a class="btn" href="/p/${prev}" aria-label="上一張">‹</a>` : ''}${next ? html`<a class="btn" href="/p/${next}" aria-label="下一張">›</a>` : ''}`,
    body: html`${STYLE}
<div class="ph-big"><img src="/o/${p.id}" alt="${p.name}"${p.width ? html` width="${p.width}" height="${p.height}" style="height:auto"` : ''}></div>
<table style="margin-top:12px">
  ${row('名稱', p.name)}
  ${row('拍攝時間', taken)}
  ${row('上傳時間', fmt(p.created_at, tz))}
  ${row('相機', p.camera)}
  ${row('尺寸', p.width ? `${p.width} × ${p.height}・${size(p.size)}` : size(p.size))}
  ${p.lat !== null && p.lat !== undefined ? html`<tr><th>位置</th><td><a href="https://www.openstreetmap.org/?mlat=${p.lat.toFixed(6)}&amp;mlon=${p.lon.toFixed(6)}#map=15/${p.lat.toFixed(6)}/${p.lon.toFixed(6)}">${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}</a></td></tr>` : ''}
  ${inAlbums.size ? html`<tr><th>相簿</th><td>${albums.filter((a) => inAlbums.has(a.id)).map((a) => html`<a class="chip" href="/a/${a.id}">${a.name}</a> `)}</td></tr>` : ''}
</table>
<div class="row" style="margin-top:12px">
  <form class="inline" method="post" action="/p/${p.id}/favorite"><button type="submit">${p.favorite ? '♥ 取消最愛' : '♡ 加入最愛'}</button></form>
  <a class="btn" href="/o/${p.id}?download=1" download>下載</a>
  ${albums.length ? html`<form class="inline row" method="post" action="/p/${p.id}/albums"><select name="album" style="width:auto">${albums.map((a) => html`<option value="${a.id}">${a.name}</option>`)}</select><button type="submit">加入相簿</button></form>` : ''}
  ${[...inAlbums].length ? html`<form class="inline row" method="post" action="/p/${p.id}/albums/remove"><select name="album" style="width:auto">${albums.filter((a) => inAlbums.has(a.id)).map((a) => html`<option value="${a.id}">${a.name}</option>`)}</select><button type="submit">移出相簿</button></form>` : ''}
  <form class="inline" method="post" action="/p/${p.id}/delete" data-confirm="永久刪除這張照片？"><button class="danger" type="submit">刪除</button></form>
</div>`,
  });
}

async function albumsPage(request, env, url) {
  const albums = (await env.DB.prepare(
    `SELECT a.id, a.name, COUNT(ap.photo_id) AS n,
       (SELECT p.id FROM album_photos x JOIN photos p ON p.id = x.photo_id WHERE x.album_id = a.id ORDER BY x.added_at DESC LIMIT 1) AS cover,
       (SELECT p.has_thumb FROM album_photos x JOIN photos p ON p.id = x.photo_id WHERE x.album_id = a.id ORDER BY x.added_at DESC LIMIT 1) AS cover_thumb
     FROM albums a LEFT JOIN album_photos ap ON ap.album_id = a.id WHERE a.owner = ? GROUP BY a.id ORDER BY a.name`,
  ).bind(OWNER).all()).results;
  return page(request, {
    app: APP,
    title: '相簿',
    body: html`${STYLE}${tabs(url, 'albums')}
${albums.length
  ? html`<div class="grid">${albums.map((a) => html`<a class="card" href="/a/${a.id}" style="margin:0;text-decoration:none;color:inherit">
<div style="aspect-ratio:4/3;background:var(--hover);border-radius:8px;overflow:hidden">${a.cover ? html`<img src="/${a.cover_thumb ? 't' : 'o'}/${a.cover}" alt="" style="width:100%;height:100%;object-fit:cover">` : ''}</div>
<strong>${a.name}</strong><span class="muted small">　${a.n} 張</span></a>`)}</div>`
  : html`<p class="empty">還沒有相簿。</p>`}
<form class="row card" method="post" action="/albums"><input name="name" required maxlength="100" placeholder="新相簿名稱" style="flex:1"><button class="primary" type="submit">建立相簿</button></form>`,
  });
}

async function albumPage(request, env, id) {
  const a = await env.DB.prepare('SELECT * FROM albums WHERE id = ? AND owner = ?').bind(id, OWNER).first();
  if (!a) throw new UserError('找不到這個相簿。');
  const photos = (await env.DB.prepare(`SELECT p.* FROM album_photos x JOIN photos p ON p.id = x.photo_id WHERE x.album_id = ? ${ORDER.replace(/(taken_at|created_at)/g, 'p.$1')}`).bind(id).all()).results;
  return page(request, {
    app: APP,
    title: a.name,
    back: '/albums',
    body: html`${STYLE}<h2>${a.name}<span class="muted small">　${photos.length} 張</span></h2>
${photos.length ? grid(photos) : html`<p class="empty">這個相簿還沒有照片。</p>`}
${uploadForm(a.id)}
<div class="grid">
  <form class="stack card" method="post" action="/a/${a.id}"><label>相簿名稱<input name="name" value="${a.name}" required maxlength="100"></label><div><button type="submit">改名</button></div></form>
  <form class="stack card" method="post" action="/a/${a.id}/delete" data-confirm="刪除相簿「${a.name}」？照片會留在相簿裡的「全部」。"><p class="muted small" style="margin:0">刪除相簿不會刪除照片。</p><div><button class="danger" type="submit">刪除相簿</button></div></form>
</div>
<script src="/photos.js" defer></script>`,
  });
}

// ---- 從「檔案」應用加入

const encPath = (p) => p.split('/').map(encodeURIComponent).join('/');

async function importPage(request, env, url) {
  const dir = url.searchParams.get('dir') || '';
  const album = url.searchParams.get('album') || '';
  let listing = null;
  let error = '';
  if (!env.FILESAPP) error = '沒有連到「檔案」應用。';
  else {
    try {
      const r = await env.FILESAPP.fetch(`http://files/api/list?dir=${encodeURIComponent(dir)}`);
      if (!r.ok) throw new Error(String(r.status));
      listing = await r.json();
    } catch (e) {
      error = `無法讀取「檔案」：${e.message}`;
    }
  }
  const images = listing ? listing.files.filter((f) => /^image\/(jpeg|png|gif|webp)/.test(f.type)) : [];
  const q = (d) => `/import?dir=${encodeURIComponent(d)}${album ? `&album=${album}` : ''}`;
  const parent = dir.replace(/[^/]+\/$/, '');
  return page(request, {
    app: APP,
    title: '從「檔案」加入',
    back: album ? `/a/${album}` : '/',
    body: html`
${error ? html`<p class="error">${error}</p>` : ''}
<p class="small">位置：<a href="${q('')}">檔案</a>${dir ? ` / ${dir.slice(0, -1).replace(/\//g, ' / ')}` : ''}</p>
${listing ? html`<ul class="list">
${dir ? html`<li><a class="main" href="${q(parent)}"><span class="icon">↩</span><span class="grow">上一層</span></a></li>` : ''}
${listing.folders.map((f) => html`<li><a class="main" href="${q(f)}"><span class="icon">📁</span><span class="grow">${f.slice(dir.length, -1)}</span></a></li>`)}
</ul>
${images.length
  ? html`<form class="stack" method="post" action="/import" style="margin-top:12px">
  ${album ? html`<input type="hidden" name="album" value="${album}">` : ''}
  <ul class="list">${images.map((f) => html`<li><label class="check grow"><input type="checkbox" name="path" value="${f.path}" checked> 🖼 ${f.path.slice(dir.length)} <span class="muted small">${size(f.size)}</span></label></li>`)}</ul>
  <div><button class="primary" type="submit">加入勾選的照片</button></div>
</form>`
  : html`<p class="empty">這個資料夾沒有照片。</p>`}` : ''}`,
  });
}

async function doImport(request, env) {
  const f = await readForm(request);
  const paths = [].concat(f.path || []).map(String).filter(Boolean);
  if (!paths.length) throw new UserError('沒有勾選照片。');
  if (!env.FILESAPP) throw new UserError('沒有連到「檔案」應用。');
  let last = '';
  for (const p of paths.slice(0, 500)) {
    const r = await env.FILESAPP.fetch(`http://files/raw/${encPath(p)}`);
    if (!r.ok) throw new UserError(`讀不到「${p}」（${r.status}）。`);
    last = await store(env, p.split('/').pop(), await r.arrayBuffer(), f.album || '');
  }
  return redirect(f.album ? `/a/${f.album}` : paths.length === 1 ? `/p/${last}` : '/');
}

export default app(APP, async (request, env, url) => {
  const p = url.pathname;
  const isGet = request.method === 'GET' || request.method === 'HEAD';
  if (isGet) {
    if (p === '/') return home(request, env, url);
    if (p === '/albums') return albumsPage(request, env, url);
    if (p === '/import') return importPage(request, env, url);
    if (p === '/api/photos') {
      const limit = Math.max(1, Math.min(200, parseInt(url.searchParams.get('limit'), 10) || 50));
      const rows = (await env.DB.prepare(`SELECT id, name, type, width, height, taken_at, created_at FROM photos WHERE owner = ? ${ORDER} LIMIT ?`).bind(OWNER, limit).all()).results;
      return json({ photos: rows.map((r) => ({ ...r, url: `/o/${r.id}` })) });
    }
    let m = /^\/([ot])\/(\w+)$/.exec(p);
    if (m) {
      const ph = await env.DB.prepare('SELECT name, has_thumb FROM photos WHERE id = ? AND owner = ?').bind(m[2], OWNER).first();
      if (!ph) return new Response('找不到這張照片', { status: 404 });
      if (m[1] === 't' && !ph.has_thumb) return redirect(`/o/${m[2]}`, 302);
      return serveObject(request, env.PHOTOS, `${m[1]}/${m[2]}`, { download: m[1] === 'o' && url.searchParams.get('download') ? ph.name : undefined });
    }
    m = /^\/p\/(\w+)$/.exec(p);
    if (m) return photoPage(request, env, m[1]);
    m = /^\/a\/(\w+)$/.exec(p);
    if (m) return albumPage(request, env, m[1]);
    return null;
  }
  if (request.method !== 'POST') return null;
  if (p === '/upload') {
    const f = await readForm(request);
    const files = filesOf(f.file);
    if (!files.length) throw new UserError('沒有選擇照片。');
    let last = '';
    for (const file of files) last = await store(env, file.name, await file.arrayBuffer(), f.album || '');
    return redirect(f.album ? `/a/${f.album}` : files.length === 1 ? `/p/${last}` : '/');
  }
  if (p === '/import') return doImport(request, env);
  if (p === '/albums') {
    const name = String((await readForm(request)).name || '').trim().slice(0, 100);
    if (!name) throw new UserError('相簿名稱不能是空的。');
    const id = newId();
    await env.DB.prepare('INSERT INTO albums (id, owner, name, created_at) VALUES (?, ?, ?, ?)').bind(id, OWNER, name, new Date().toISOString()).run();
    return redirect(`/a/${id}`);
  }
  let m = /^\/a\/(\w+)(\/delete)?$/.exec(p);
  if (m) {
    const a = await env.DB.prepare('SELECT id FROM albums WHERE id = ? AND owner = ?').bind(m[1], OWNER).first();
    if (!a) throw new UserError('找不到這個相簿。');
    if (m[2]) {
      await env.DB.batch([
        env.DB.prepare('DELETE FROM album_photos WHERE album_id = ?').bind(m[1]),
        env.DB.prepare('DELETE FROM albums WHERE id = ? AND owner = ?').bind(m[1], OWNER),
      ]);
      return redirect('/albums');
    }
    const name = String((await readForm(request)).name || '').trim().slice(0, 100);
    if (!name) throw new UserError('相簿名稱不能是空的。');
    await env.DB.prepare('UPDATE albums SET name = ? WHERE id = ? AND owner = ?').bind(name, m[1], OWNER).run();
    return redirect(`/a/${m[1]}`);
  }
  m = /^\/p\/(\w+)\/(favorite|albums|albums\/remove|delete|thumb)$/.exec(p);
  if (!m) return null;
  const [, id, act] = m;
  await get(env.DB, id);
  if (act === 'favorite') {
    await env.DB.prepare('UPDATE photos SET favorite = 1 - favorite WHERE id = ? AND owner = ?').bind(id, OWNER).run();
    return redirect(`/p/${id}`);
  }
  if (act === 'albums') {
    await addToAlbum(env.DB, id, String((await readForm(request)).album || ''));
    return redirect(`/p/${id}`);
  }
  if (act === 'albums/remove') {
    await env.DB.prepare('DELETE FROM album_photos WHERE album_id = ? AND photo_id = ?').bind(String((await readForm(request)).album || ''), id).run();
    return redirect(`/p/${id}`);
  }
  if (act === 'delete') {
    await env.PHOTOS.delete(`o/${id}`);
    await env.PHOTOS.delete(`t/${id}`);
    await env.DB.batch([
      env.DB.prepare('DELETE FROM album_photos WHERE photo_id = ?').bind(id),
      env.DB.prepare('DELETE FROM photos WHERE id = ? AND owner = ?').bind(id, OWNER),
    ]);
    return redirect('/');
  }
  // 縮圖：瀏覽器用 canvas 做好送來（JPEG 或 PNG，最大 512 KB）
  const bytes = await request.arrayBuffer();
  const info = imageInfo(bytes.slice(0, 64 * 1024));
  if (bytes.byteLength > 512 * 1024 || !/^image\/(jpeg|png)$/.test(info.type)) return json({ error: '縮圖要是 512 KB 以內的 JPEG 或 PNG' }, 400);
  await env.PHOTOS.put(`t/${id}`, bytes, { httpMetadata: { contentType: info.type } });
  await env.DB.prepare('UPDATE photos SET has_thumb = 1 WHERE id = ? AND owner = ?').bind(id, OWNER).run();
  return json({ ok: true });
});
