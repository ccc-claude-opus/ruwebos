// 音樂（R2 放音檔與封面，D1 放曲目與播放清單）。標籤從檔案讀（MP3、FLAC、M4A、WAV）；
// /play 的播放器由 public/player.js 依序播放，沒有 JavaScript 時每首歌各自有 <audio>。
//   GET  /?view=songs|albums|artists|playlists
//   GET  /album?name=&artist=   /artist?name=   /pl/:id      專輯、演出者、播放清單
//   GET  /play?album=&artist=|playlist=|all=1&start=        播放器
//   GET  /s/:id   POST /s/:id   POST /s/:id/delete         曲目（編輯標籤、刪除）
//   GET  /a/:id   /c/:id                                   音檔（Range）、封面
//   POST /upload  POST /pl  POST /pl/:id  POST /pl/:id/delete  POST /pl/:id/add  POST /pl/:id/remove
import { app, page, html, redirect, readForm, json, newId, UserError } from '../../_shared/lib.js';
import { serveObject, filesOf, size } from '../../_shared/r2.js';
import { audioTags } from './tags.js';

const APP = { name: '音樂', color: '#f76707' };
const OWNER = 'me';
const MAX = 500 * 1024 * 1024;
const EXT = { 'audio/mpeg': 'mp3', 'audio/flac': 'flac', 'audio/mp4': 'm4a', 'audio/ogg': 'ogg', 'audio/wav': 'wav' };
const SORT = "ORDER BY artist COLLATE NOCASE, album COLLATE NOCASE, CAST(track AS INTEGER), title COLLATE NOCASE";

const time = (s) => (s > 0 ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '');
const q = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== '')).toString();

async function get(db, id) {
  const s = await db.prepare('SELECT * FROM tracks WHERE id = ? AND owner = ?').bind(id, OWNER).first();
  if (!s) throw new UserError('找不到這首歌。');
  return s;
}

async function store(env, file) {
  if (file.size > MAX) throw new UserError(`「${file.name}」太大了（上限 500 MB）。`);
  const headBytes = await file.slice(0, 4 * 1024 * 1024).arrayBuffer();
  const tail = await file.slice(Math.max(0, file.size - 128)).arrayBuffer();
  const t = audioTags(headBytes, tail, file.size);
  if (!t.type) throw new UserError(`「${file.name}」不是支援的音檔（MP3、FLAC、M4A、Ogg、WAV）。`);
  const id = newId();
  await env.MEDIA.put(`a/${id}`, await file.arrayBuffer(), { httpMetadata: { contentType: t.type } });
  if (t.cover && t.cover.bytes.length < 5 * 1024 * 1024) await env.MEDIA.put(`c/${id}`, t.cover.bytes, { httpMetadata: { contentType: t.cover.type } });
  const title = (t.title || file.name.replace(/\.[^.]+$/, '')).slice(0, 200);
  await env.DB.prepare('INSERT INTO tracks (id, owner, title, artist, album, track, year, genre, duration, type, size, name, has_cover, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, OWNER, title, t.artist.slice(0, 200), t.album.slice(0, 200), t.track, t.year, t.genre.slice(0, 100), t.duration, t.type, file.size, file.name.slice(0, 200), t.cover ? 1 : 0, new Date().toISOString())
    .run();
  return id;
}

const STYLE = html`<style>
  .cover { flex: none; width: 48px; height: 48px; border-radius: 6px; background: var(--hover); object-fit: cover; display: inline-flex; align-items: center; justify-content: center; font-size: 22px; }
  .albums { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 14px; }
  .albums a { color: inherit; text-decoration: none; }
  .albums .art { aspect-ratio: 1; width: 100%; border-radius: 8px; background: var(--hover); object-fit: cover; display: flex; align-items: center; justify-content: center; font-size: 48px; }
  .now { background: var(--hover); }
  .now strong { color: var(--app); }
</style>`;

const cover = (s, cls = 'cover') => (s && s.has_cover ? html`<img class="${cls}" src="/c/${s.id}" alt="">` : html`<span class="${cls}">🎵</span>`);

function rows(list, playQuery) {
  return html`<ul class="list">${list.map((s, i) => html`<li data-track="${s.id}"><a class="main" href="/s/${s.id}">${cover(s)}<span class="grow"><strong>${s.title}</strong><span class="sub">${[s.artist, s.album].filter(Boolean).join(' · ')}</span></span></a>
<span class="muted small">${time(s.duration)}</span>${playQuery !== undefined ? html`<a class="btn small" href="/play?${q({ ...playQuery, start: i })}" aria-label="播放">▶</a>` : ''}</li>`)}</ul>`;
}

const tabs = (view) => html`<p class="row">${[['songs', '歌曲'], ['albums', '專輯'], ['artists', '演出者'], ['playlists', '播放清單']].map(([v, l]) => html`<a class="chip${v === view ? ' on' : ''}" href="/?view=${v}">${l}</a>`)}</p>`;

function uploadForm() {
  return html`<form class="stack card" method="post" action="/upload" enctype="multipart/form-data">
  <label>加入音樂（MP3、FLAC、M4A、Ogg、WAV）<input type="file" name="file" multiple accept="audio/*"></label>
  <div><button class="primary" type="submit">上傳</button></div>
</form>`;
}

async function home(request, env, url) {
  const view = ['songs', 'albums', 'artists', 'playlists'].includes(url.searchParams.get('view')) ? url.searchParams.get('view') : 'songs';
  let body;
  if (view === 'songs') {
    const list = (await env.DB.prepare(`SELECT * FROM tracks WHERE owner = ? ${SORT}`).bind(OWNER).all()).results;
    body = list.length
      ? html`<div class="spread"><span class="muted small">${list.length} 首</span><a class="btn primary" href="/play?all=1">▶ 全部播放</a></div>${rows(list, { all: 1 })}`
      : html`<p class="empty">還沒有音樂，從下面上傳。</p>`;
  } else if (view === 'albums') {
    const list = (await env.DB.prepare("SELECT album, artist, COUNT(*) AS n, MAX(year) AS year, (SELECT id FROM tracks t2 WHERE t2.owner = tracks.owner AND t2.album = tracks.album AND t2.has_cover = 1 LIMIT 1) AS cover FROM tracks WHERE owner = ? AND album != '' GROUP BY album, artist ORDER BY album COLLATE NOCASE").bind(OWNER).all()).results;
    body = list.length
      ? html`<div class="albums">${list.map((a) => html`<a href="/album?${q({ name: a.album, artist: a.artist })}">${a.cover ? html`<img class="art" src="/c/${a.cover}" alt="">` : html`<span class="art">💿</span>`}<strong>${a.album}</strong><span class="sub muted small" style="display:block">${a.artist}${a.year ? ` · ${a.year}` : ''} · ${a.n} 首</span></a>`)}</div>`
      : html`<p class="empty">還沒有專輯資訊。</p>`;
  } else if (view === 'artists') {
    const list = (await env.DB.prepare("SELECT artist, COUNT(*) AS n, COUNT(DISTINCT album) AS albums FROM tracks WHERE owner = ? AND artist != '' GROUP BY artist ORDER BY artist COLLATE NOCASE").bind(OWNER).all()).results;
    body = list.length
      ? html`<ul class="list">${list.map((a) => html`<li><a class="main" href="/artist?${q({ name: a.artist })}"><span class="avatar">${[...a.artist][0]}</span><span class="grow"><strong>${a.artist}</strong><span class="sub">${a.albums} 張專輯 · ${a.n} 首</span></span></a></li>`)}</ul>`
      : html`<p class="empty">還沒有演出者資訊。</p>`;
  } else {
    const list = (await env.DB.prepare('SELECT p.id, p.name, COUNT(x.track_id) AS n FROM playlists p LEFT JOIN playlist_tracks x ON x.playlist_id = p.id WHERE p.owner = ? GROUP BY p.id ORDER BY p.name').bind(OWNER).all()).results;
    body = html`${list.length
      ? html`<ul class="list">${list.map((p) => html`<li><a class="main" href="/pl/${p.id}"><span class="cover">📃</span><span class="grow"><strong>${p.name}</strong><span class="sub">${p.n} 首</span></span></a></li>`)}</ul>`
      : html`<p class="empty">還沒有播放清單。</p>`}
<form class="row card" method="post" action="/pl"><input name="name" required maxlength="100" placeholder="新播放清單名稱" style="flex:1"><button class="primary" type="submit">建立</button></form>`;
  }
  return page(request, { app: APP, body: html`${STYLE}${tabs(view)}${body}${view === 'songs' || view === 'albums' ? uploadForm() : ''}` });
}

async function listPage(request, env, url, kind) {
  let list, title, playQuery, extra = '';
  if (kind === 'album') {
    const name = url.searchParams.get('name') || '';
    const artist = url.searchParams.get('artist');
    list = (await env.DB.prepare(`SELECT * FROM tracks WHERE owner = ? AND album = ?${artist !== null ? ' AND artist = ?' : ''} ${SORT}`).bind(...[OWNER, name, artist].filter((x) => x !== null)).all()).results;
    title = name;
    playQuery = { album: name, artist: artist ?? undefined };
    if (list.length) extra = html`<div class="row" style="margin:8px 0 16px">${cover(list.find((s) => s.has_cover), 'cover')}<div><h2 style="margin:0">${name}</h2><span class="muted">${list[0].artist}${list[0].year ? ` · ${list[0].year}` : ''} · ${list.length} 首</span></div></div>`;
  } else {
    const name = url.searchParams.get('name') || '';
    list = (await env.DB.prepare(`SELECT * FROM tracks WHERE owner = ? AND artist = ? ${SORT}`).bind(OWNER, name).all()).results;
    title = name;
    playQuery = { artist: name };
    extra = html`<h2>${name}<span class="muted small">　${list.length} 首</span></h2>`;
  }
  if (!list.length) throw new UserError('找不到這些歌。');
  return page(request, {
    app: APP,
    title,
    back: `/?view=${kind}s`,
    actions: html`<a class="btn primary" href="/play?${q(playQuery)}">▶ 播放</a>`,
    body: html`${STYLE}${extra}${rows(list, playQuery)}`,
  });
}

async function playlist(db, id) {
  const p = await db.prepare('SELECT * FROM playlists WHERE id = ? AND owner = ?').bind(id, OWNER).first();
  if (!p) throw new UserError('找不到這個播放清單。');
  const tracks = (await db.prepare('SELECT t.*, x.pos FROM playlist_tracks x JOIN tracks t ON t.id = x.track_id WHERE x.playlist_id = ? ORDER BY x.pos').bind(id).all()).results;
  return { p, tracks };
}

async function playlistPage(request, env, id) {
  const { p, tracks } = await playlist(env.DB, id);
  return page(request, {
    app: APP,
    title: p.name,
    back: '/?view=playlists',
    actions: tracks.length ? html`<a class="btn primary" href="/play?playlist=${id}">▶ 播放</a>` : '',
    body: html`${STYLE}<h2>${p.name}<span class="muted small">　${tracks.length} 首</span></h2>
${tracks.length
  ? html`<ul class="list">${tracks.map((s, i) => html`<li><a class="main" href="/s/${s.id}">${cover(s)}<span class="grow"><strong>${s.title}</strong><span class="sub">${s.artist}</span></span></a>
<a class="btn small" href="/play?playlist=${id}&amp;start=${i}" aria-label="播放">▶</a>
<form class="inline" method="post" action="/pl/${id}/remove"><input type="hidden" name="pos" value="${s.pos}"><button class="small" type="submit" aria-label="移除">✕</button></form></li>`)}</ul>`
  : html`<p class="empty">這個清單還沒有歌，從歌曲頁面加入。</p>`}
<div class="grid" style="margin-top:16px">
  <form class="stack card" method="post" action="/pl/${id}"><label>清單名稱<input name="name" value="${p.name}" required maxlength="100"></label><div><button type="submit">改名</button></div></form>
  <form class="stack card" method="post" action="/pl/${id}/delete" data-confirm="刪除播放清單「${p.name}」？歌曲不會被刪除。"><p class="muted small" style="margin:0">刪除清單不會刪除歌曲。</p><div><button class="danger" type="submit">刪除清單</button></div></form>
</div>`,
  });
}

async function playPage(request, env, url) {
  const sp = url.searchParams;
  let list, title, back;
  if (sp.get('playlist')) {
    const { p, tracks } = await playlist(env.DB, sp.get('playlist'));
    [list, title, back] = [tracks, p.name, `/pl/${p.id}`];
  } else if (sp.get('album') !== null) {
    const artist = sp.get('artist');
    list = (await env.DB.prepare(`SELECT * FROM tracks WHERE owner = ? AND album = ?${artist !== null ? ' AND artist = ?' : ''} ${SORT}`).bind(...[OWNER, sp.get('album'), artist].filter((x) => x !== null)).all()).results;
    [title, back] = [sp.get('album'), `/album?${q({ name: sp.get('album'), artist: artist ?? undefined })}`];
  } else if (sp.get('artist') !== null) {
    list = (await env.DB.prepare(`SELECT * FROM tracks WHERE owner = ? AND artist = ? ${SORT}`).bind(OWNER, sp.get('artist')).all()).results;
    [title, back] = [sp.get('artist'), `/artist?${q({ name: sp.get('artist') })}`];
  } else {
    list = (await env.DB.prepare(`SELECT * FROM tracks WHERE owner = ? ${SORT}`).bind(OWNER).all()).results;
    [title, back] = ['全部歌曲', '/'];
  }
  if (!list.length) throw new UserError('沒有可以播放的歌。');
  const start = Math.max(0, Math.min(list.length - 1, parseInt(sp.get('start'), 10) || 0));
  const cur = list[start];
  return page(request, {
    app: APP,
    title: `播放：${title}`,
    back,
    body: html`${STYLE}
<div class="card row" id="np">${cover(cur, 'cover')}<div class="grow"><strong id="np-title">${cur.title}</strong><span class="sub muted" id="np-sub" style="display:block">${[cur.artist, cur.album].filter(Boolean).join(' · ')}</span></div></div>
<audio id="player" controls autoplay preload="auto" src="/a/${cur.id}" style="width:100%;height:48px"></audio>
<div class="row" style="margin:8px 0"><button type="button" id="prev" class="small">‹ 上一首</button><button type="button" id="next" class="small">下一首 ›</button><label class="check small"><input type="checkbox" id="shuffle"> 隨機</label><label class="check small"><input type="checkbox" id="repeat"> 重複</label></div>
<ol class="list" id="queue" style="padding-left:0">${list.map((s, i) => html`<li data-id="${s.id}" data-title="${s.title}" data-sub="${[s.artist, s.album].filter(Boolean).join(' · ')}" data-cover="${s.has_cover ? `/c/${s.id}` : ''}"${i === start ? html` class="now"` : ''}>
<span class="muted small" style="width:2em">${i + 1}</span><a class="main grow" href="/play?${q({ ...Object.fromEntries(sp), start: i })}"><span class="grow"><strong>${s.title}</strong><span class="sub">${s.artist}</span></span></a><span class="muted small">${time(s.duration)}</span>
<noscript><audio controls preload="none" src="/a/${s.id}"></audio></noscript></li>`)}</ol>
<script src="/player.js" defer></script>`,
  });
}

async function songPage(request, env, id) {
  const s = await get(env.DB, id);
  const pls = (await env.DB.prepare('SELECT id, name FROM playlists WHERE owner = ? ORDER BY name').bind(OWNER).all()).results;
  const field = (name, label, value, max = 200) => html`<label>${label}<input name="${name}" value="${value}" maxlength="${max}"></label>`;
  return page(request, {
    app: APP,
    title: s.title,
    back: '/',
    body: html`${STYLE}
<div class="row" style="margin:8px 0 12px">${s.has_cover ? html`<img src="/c/${s.id}" alt="" style="width:120px;height:120px;border-radius:10px;object-fit:cover">` : html`<span class="cover" style="width:120px;height:120px;font-size:48px">🎵</span>`}
<div><h2 style="margin:0">${s.title}</h2><p class="muted" style="margin:4px 0">${s.artist ? html`<a href="/artist?${q({ name: s.artist })}">${s.artist}</a>` : ''}${s.album ? html` · <a href="/album?${q({ name: s.album, artist: s.artist })}">${s.album}</a>` : ''}</p>
<p class="muted small" style="margin:0">${[s.track && `第 ${s.track} 首`, s.year, s.genre, time(s.duration), size(s.size), s.type].filter(Boolean).join(' · ')}</p></div></div>
<audio controls preload="metadata" src="/a/${s.id}" style="width:100%;height:48px"></audio>
<div class="row" style="margin:12px 0">
  ${pls.length ? html`<form class="inline row" method="post" action="/pl/${pls[0].id}/add" data-playlist-form><input type="hidden" name="track" value="${s.id}"><select name="playlist" style="width:auto">${pls.map((p) => html`<option value="${p.id}">${p.name}</option>`)}</select><button type="submit">加入播放清單</button></form>` : html`<a class="btn" href="/?view=playlists">建立播放清單</a>`}
  <a class="btn" href="/a/${s.id}?download=1" download>下載</a>
  <form class="inline" method="post" action="/s/${s.id}/delete" data-confirm="刪除「${s.title}」？"><button class="danger" type="submit">刪除</button></form>
</div>
<form class="stack card" method="post" action="/s/${s.id}"><h3 style="margin:0">編輯資訊</h3>
  <div class="grid">${field('title', '歌名', s.title)}${field('artist', '演出者', s.artist)}${field('album', '專輯', s.album)}${field('track', '曲序', s.track, 4)}${field('year', '年份', s.year, 4)}${field('genre', '類型', s.genre, 100)}</div>
  <div><button type="submit">儲存</button></div>
</form>`,
  });
}

export default app(APP, async (request, env, url) => {
  const p = url.pathname;
  const isGet = request.method === 'GET' || request.method === 'HEAD';
  if (isGet) {
    if (p === '/') return home(request, env, url);
    if (p === '/album') return listPage(request, env, url, 'album');
    if (p === '/artist') return listPage(request, env, url, 'artist');
    if (p === '/play') return playPage(request, env, url);
    if (p === '/api/tracks') {
      const rows = (await env.DB.prepare(`SELECT id, title, artist, album, duration, type FROM tracks WHERE owner = ? ${SORT}`).bind(OWNER).all()).results;
      return json({ tracks: rows.map((r) => ({ ...r, url: `/a/${r.id}` })) });
    }
    let m = /^\/([ac])\/(\w+)$/.exec(p);
    if (m) {
      const s = await env.DB.prepare('SELECT title, type FROM tracks WHERE id = ? AND owner = ?').bind(m[2], OWNER).first();
      if (!s) return new Response('找不到這首歌', { status: 404 });
      return serveObject(request, env.MEDIA, `${m[1]}/${m[2]}`, { download: m[1] === 'a' && url.searchParams.get('download') ? `${s.title}.${EXT[s.type] || 'audio'}` : undefined });
    }
    m = /^\/s\/(\w+)$/.exec(p);
    if (m) return songPage(request, env, m[1]);
    m = /^\/pl\/(\w+)$/.exec(p);
    if (m) return playlistPage(request, env, m[1]);
    return null;
  }
  if (request.method !== 'POST') return null;
  if (p === '/upload') {
    const files = filesOf((await readForm(request)).file);
    if (!files.length) throw new UserError('沒有選擇檔案。');
    let last = '';
    for (const f of files) last = await store(env, f);
    return redirect(files.length === 1 ? `/s/${last}` : '/');
  }
  if (p === '/pl') {
    const name = String((await readForm(request)).name || '').trim().slice(0, 100);
    if (!name) throw new UserError('播放清單名稱不能是空的。');
    const id = newId();
    await env.DB.prepare('INSERT INTO playlists (id, owner, name, created_at) VALUES (?, ?, ?, ?)').bind(id, OWNER, name, new Date().toISOString()).run();
    return redirect(`/pl/${id}`);
  }
  let m = /^\/pl\/(\w+)(\/delete|\/add|\/remove)?$/.exec(p);
  if (m) {
    const [, id, act] = m;
    const f = await readForm(request);
    // 歌曲頁的選單選的是哪一個清單，就加到那一個（表單的 action 只是第一個）
    const target = act === '/add' && f.playlist ? String(f.playlist) : id;
    await playlist(env.DB, target);
    if (act === '/delete') {
      await env.DB.batch([env.DB.prepare('DELETE FROM playlist_tracks WHERE playlist_id = ?').bind(id), env.DB.prepare('DELETE FROM playlists WHERE id = ? AND owner = ?').bind(id, OWNER)]);
      return redirect('/?view=playlists');
    }
    if (act === '/add') {
      const track = await get(env.DB, String(f.track || ''));
      const last = await env.DB.prepare('SELECT COALESCE(MAX(pos), -1) AS pos FROM playlist_tracks WHERE playlist_id = ?').bind(target).first();
      await env.DB.prepare('INSERT INTO playlist_tracks (playlist_id, track_id, pos) VALUES (?, ?, ?)').bind(target, track.id, last.pos + 1).run();
      return redirect(`/pl/${target}`);
    }
    if (act === '/remove') {
      await env.DB.prepare('DELETE FROM playlist_tracks WHERE playlist_id = ? AND pos = ?').bind(id, parseInt(f.pos, 10)).run();
      return redirect(`/pl/${id}`);
    }
    const name = String(f.name || '').trim().slice(0, 100);
    if (!name) throw new UserError('播放清單名稱不能是空的。');
    await env.DB.prepare('UPDATE playlists SET name = ? WHERE id = ? AND owner = ?').bind(name, id, OWNER).run();
    return redirect(`/pl/${id}`);
  }
  m = /^\/s\/(\w+)(\/delete)?$/.exec(p);
  if (!m) return null;
  const s = await get(env.DB, m[1]);
  if (m[2]) {
    await env.MEDIA.delete(`a/${s.id}`);
    await env.MEDIA.delete(`c/${s.id}`);
    await env.DB.batch([env.DB.prepare('DELETE FROM playlist_tracks WHERE track_id = ?').bind(s.id), env.DB.prepare('DELETE FROM tracks WHERE id = ? AND owner = ?').bind(s.id, OWNER)]);
    return redirect('/');
  }
  const f = await readForm(request);
  const str = (k, max) => String(f[k] ?? '').trim().slice(0, max);
  const title = str('title', 200);
  if (!title) throw new UserError('歌名不能是空的。');
  const track = str('track', 4);
  const year = str('year', 4);
  if (track && !/^\d+$/.test(track)) throw new UserError('曲序要是數字。');
  if (year && !/^\d{4}$/.test(year)) throw new UserError('年份要是四位數字。');
  await env.DB.prepare('UPDATE tracks SET title = ?, artist = ?, album = ?, track = ?, year = ?, genre = ? WHERE id = ? AND owner = ?')
    .bind(title, str('artist', 200), str('album', 200), track, year, str('genre', 100), s.id, OWNER).run();
  return redirect(`/s/${s.id}`);
});
