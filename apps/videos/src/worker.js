// 影片（R2 放檔案，D1 放清單與進度）。播放頁用媒體片段 #t= 從上次的位置開始（public/videos.js 回報進度）。
//   GET  /                     繼續觀看、所有影片、上傳
//   GET  /v/:id                播放      POST /v/:id 改名      POST /v/:id/delete
//   POST /v/:id/position       進度（表單 → 轉址；Accept: application/json → JSON）
//   GET  /raw/:id              影片檔（Range；?download=1 下載）
//   GET  /p/:id  POST /v/:id/poster   封面（播放頁的 public/videos.js 用 canvas 擷取畫面送來）
//   POST /upload               上傳（multipart，可多檔；長度與解析度從容器讀，src/probe.js）
import { app, page, html, redirect, readForm, json, tzOf, fmt, newId, UserError } from '../../_shared/lib.js';
import { serveObject, filesOf, size } from '../../_shared/r2.js';
import { probe } from './probe.js';

const APP = { name: '影片', color: '#7048e8' };
const OWNER = 'me';
const MAX = 2 * 1024 * 1024 * 1024;
const TYPES = { mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mkv: 'video/x-matroska', ogv: 'video/ogg' };
const EXT = { 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov', 'video/x-matroska': 'mkv', 'video/ogg': 'ogv' };

const hms = (s) => {
  s = Math.floor(s);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const two = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${two(m)}:${two(s % 60)}` : `${m}:${two(s % 60)}`;
};

async function get(db, id) {
  const v = await db.prepare('SELECT * FROM videos WHERE id = ? AND owner = ?').bind(id, OWNER).first();
  if (!v) throw new UserError('找不到這部影片。');
  return v;
}

// 檔案開頭的格式標記：MP4/QuickTime 的 ftyp、Matroska/WebM 的 EBML、Ogg
function sniff(b) {
  const s = (o, n) => String.fromCharCode(...b.subarray(o, o + n));
  if (s(4, 4) === 'ftyp') return s(8, 2) === 'qt' ? 'video/quicktime' : 'video/mp4';
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return 'matroska';
  if (s(0, 4) === 'OggS') return 'video/ogg';
  return '';
}

async function store(env, file) {
  if (file.size > MAX) throw new UserError(`「${file.name}」太大了（上限 2 GB）。`);
  const ext = (/\.([^.]+)$/.exec(file.name)?.[1] || '').toLowerCase();
  const kind = sniff(new Uint8Array(await file.slice(0, 64).arrayBuffer()));
  let type = file.type && file.type.startsWith('video/') ? file.type : TYPES[ext] || '';
  if (kind === 'matroska') type = ext === 'webm' || type === 'video/webm' ? 'video/webm' : 'video/x-matroska';
  else if (kind) type = type || kind;
  if (!kind || !type.startsWith('video/')) throw new UserError(`「${file.name}」不是支援的影片（MP4、WebM、MOV、MKV、Ogg）。`);
  const id = newId();
  const bytes = await file.arrayBuffer();
  const info = probe(bytes);
  await env.MEDIA.put(`v/${id}`, bytes, { httpMetadata: { contentType: type } });
  await env.DB.prepare('INSERT INTO videos (id, owner, title, name, type, size, duration, width, height, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, OWNER, file.name.replace(/\.[^.]+$/, '').slice(0, 200) || '影片', file.name.slice(0, 200), type, file.size, info.duration, info.width, info.height, new Date().toISOString())
    .run();
  return id;
}

function item(v) {
  const sub = [v.duration ? hms(v.duration) : '', v.height ? `${v.height}p` : '', size(v.size), v.position > 0 ? `看到 ${hms(v.position)}` : ''].filter(Boolean).join(' · ');
  const pct = v.duration > 0 ? Math.min(100, (v.position / v.duration) * 100) : 0;
  return html`<li><a class="main" href="/v/${v.id}">${v.has_poster ? html`<img src="/p/${v.id}" alt="" style="flex:none;width:96px;height:54px;object-fit:cover;border-radius:6px;background:#000">` : html`<span class="icon" style="width:96px">🎬</span>`}<span class="grow"><strong>${v.title}</strong><span class="sub">${sub}</span>
${pct > 0 ? html`<span style="display:block;height:4px;background:var(--hover);border-radius:2px;margin-top:4px"><span style="display:block;height:4px;width:${pct.toFixed(1)}%;background:var(--app);border-radius:2px"></span></span>` : ''}</span></a></li>`;
}

async function home(request, env) {
  const all = (await env.DB.prepare('SELECT * FROM videos WHERE owner = ? ORDER BY created_at DESC').bind(OWNER).all()).results;
  const resume = all
    .filter((v) => v.position > 5 && (!v.duration || v.position < v.duration - 10))
    .sort((a, b) => b.watched_at.localeCompare(a.watched_at))
    .slice(0, 6);
  return page(request, {
    app: APP,
    body: html`
${resume.length ? html`<p class="section">繼續觀看</p><ul class="list">${resume.map(item)}</ul>` : ''}
<p class="section">所有影片（${all.length}）</p>
${all.length ? html`<ul class="list">${all.map(item)}</ul>` : html`<p class="empty">還沒有影片，從下面上傳。</p>`}
<form class="stack card" method="post" action="/upload" enctype="multipart/form-data">
  <label>加入影片（MP4、WebM、MOV、MKV）<input type="file" name="file" multiple accept="video/*"></label>
  <div><button class="primary" type="submit">上傳</button></div>
</form>`,
  });
}

function player(request, v) {
  const tz = tzOf(request);
  const start = v.position > 0 && (!v.duration || v.position < v.duration - 1) ? Math.floor(v.position) : 0;
  return page(request, {
    app: APP,
    title: v.title,
    back: '/',
    body: html`
<video id="player" controls preload="metadata" src="/raw/${v.id}${start ? `#t=${start}` : ''}"${v.has_poster ? html` poster="/p/${v.id}"` : html` data-needs-poster`}${v.width ? html` width="${v.width}" height="${v.height}"` : ''} data-id="${v.id}" data-start="${String(start)}" style="width:100%;max-height:70vh;background:#000;border-radius:var(--radius)"></video>
<h2>${v.title}</h2>
<p class="muted small">${[size(v.size), v.type, v.duration ? hms(v.duration) : '', v.width ? `${v.width}×${v.height}` : '', `上傳於 ${fmt(v.created_at, tz)}`, v.position > 0 ? `看到 ${hms(v.position)}` : ''].filter(Boolean).join(' · ')}</p>
<div class="row">
  <a class="btn" href="/raw/${v.id}?download=1" download>下載</a>
  ${v.position > 0 ? html`<form class="inline" method="post" action="/v/${v.id}/position"><input type="hidden" name="position" value="0"><button type="submit">從頭看</button></form>` : ''}
  <form class="inline" method="post" action="/v/${v.id}/delete" data-confirm="刪除「${v.title}」？"><button class="danger" type="submit">刪除</button></form>
</div>
<form class="row card" method="post" action="/v/${v.id}"><input name="title" value="${v.title}" required maxlength="200" style="flex:1" aria-label="名稱"><button type="submit">改名</button></form>
<script src="/videos.js" defer></script>`,
  });
}

export default app(APP, async (request, env, url) => {
  const p = url.pathname;
  const isGet = request.method === 'GET' || request.method === 'HEAD';
  if (isGet) {
    if (p === '/') return home(request, env);
    let m = /^\/v\/(\w+)$/.exec(p);
    if (m) return player(request, await get(env.DB, m[1]));
    m = /^\/p\/(\w+)$/.exec(p);
    if (m) return serveObject(request, env.MEDIA, `p/${m[1]}`);
    m = /^\/raw\/(\w+)$/.exec(p);
    if (m) {
      const v = await env.DB.prepare('SELECT title, type FROM videos WHERE id = ? AND owner = ?').bind(m[1], OWNER).first();
      if (!v) return new Response('找不到這部影片', { status: 404 });
      return serveObject(request, env.MEDIA, `v/${m[1]}`, { download: url.searchParams.get('download') ? `${v.title}.${EXT[v.type] || 'video'}` : undefined });
    }
    return null;
  }
  if (request.method !== 'POST') return null;
  if (p === '/upload') {
    const files = filesOf((await readForm(request)).file);
    if (!files.length) throw new UserError('沒有選擇影片。');
    let last = '';
    for (const f of files) last = await store(env, f);
    return redirect(files.length === 1 ? `/v/${last}` : '/');
  }
  const m = /^\/v\/(\w+)(\/delete|\/position|\/poster)?$/.exec(p);
  if (!m) return null;
  const v = await get(env.DB, m[1]);
  if (m[2] === '/poster') {
    // 瀏覽器用 canvas 擷取的一格（JPEG 或 PNG，最大 512 KB）
    const bytes = new Uint8Array(await request.arrayBuffer());
    const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
    const png = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
    if (bytes.length > 512 * 1024 || !(jpeg || png)) return json({ error: '封面要是 512 KB 以內的 JPEG 或 PNG' }, 400);
    await env.MEDIA.put(`p/${v.id}`, bytes, { httpMetadata: { contentType: jpeg ? 'image/jpeg' : 'image/png' } });
    await env.DB.prepare('UPDATE videos SET has_poster = 1 WHERE id = ? AND owner = ?').bind(v.id, OWNER).run();
    return json({ ok: true });
  }
  if (m[2] === '/delete') {
    await env.MEDIA.delete(`p/${v.id}`);
    await env.MEDIA.delete(`v/${v.id}`);
    await env.DB.prepare('DELETE FROM videos WHERE id = ? AND owner = ?').bind(v.id, OWNER).run();
    return redirect('/');
  }
  const f = await readForm(request);
  if (m[2] === '/position') {
    const position = Number(f.position);
    const duration = f.duration === undefined || f.duration === '' ? v.duration : Number(f.duration);
    if (!Number.isFinite(position) || position < 0 || !Number.isFinite(duration) || duration < 0) throw new UserError('進度的數字不對。');
    await env.DB.prepare('UPDATE videos SET position = ?, duration = ?, watched_at = ? WHERE id = ? AND owner = ?')
      .bind(duration > 0 ? Math.min(position, duration) : position, duration, new Date().toISOString(), v.id, OWNER).run();
    return (request.headers.get('accept') || '').includes('application/json') ? json({ ok: true }) : redirect(`/v/${v.id}`);
  }
  const title = String(f.title || '').trim().slice(0, 200);
  if (!title) throw new UserError('名稱不能是空的。');
  await env.DB.prepare('UPDATE videos SET title = ? WHERE id = ? AND owner = ?').bind(title, v.id, OWNER).run();
  return redirect(`/v/${v.id}`);
});
