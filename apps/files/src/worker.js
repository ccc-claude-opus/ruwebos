// 檔案（R2）。鍵是不帶開頭斜線的路徑（docs/a.txt）；資料夾是有東西在裡面，或有一個 `資料夾/` 的空標記。
// 刪除是搬到 .trash/<時間>/<原路徑>（自訂中繼資料 from 記原路徑），一般清單看不到 .trash/。
//   GET  /  /d/<資料夾>/       清單（?sort=name|date|size）
//   GET  /f/<路徑>             檔案資訊與預覽       GET /raw/<路徑>   內容（Range、?download=1）
//   POST /upload  /mkdir  /rename  /move  /delete
//   GET  /trash   POST /trash/restore  /trash/purge  /trash/empty
//   GET  /api/list?dir=        給其他應用的 JSON
import { app, page, html, raw, redirect, readForm, json, tzOf, fmt, UserError } from '../../_shared/lib.js';
import { markdown } from '../../_shared/markdown.js';
import { serveObject, filesOf, size } from '../../_shared/r2.js';

const APP = { name: '檔案', color: '#5c7cfa' };
const TRASH = '.trash/';
const MAX_UPLOAD = 100 * 1024 * 1024;
const MAX_PREVIEW = 512 * 1024;

const TYPES = {
  txt: 'text/plain', md: 'text/markdown', csv: 'text/csv', json: 'application/json', js: 'text/javascript',
  css: 'text/css', html: 'text/html', htm: 'text/html', xml: 'application/xml', log: 'text/plain', svg: 'image/svg+xml',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp',
  mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav', ogg: 'audio/ogg', flac: 'audio/flac', opus: 'audio/opus',
  mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mkv: 'video/x-matroska',
  pdf: 'application/pdf', zip: 'application/zip', vcf: 'text/vcard', ics: 'text/calendar',
};
const TEXT_EXT = new Set(['txt', 'md', 'csv', 'json', 'js', 'css', 'html', 'htm', 'xml', 'log', 'svg', 'vcf', 'ics']);
const ext = (name) => (/\.([^./]+)$/.exec(name)?.[1] || '').toLowerCase();
const guess = (name) => TYPES[ext(name)] || 'application/octet-stream';
const kind = (name, type = guess(name)) =>
  TEXT_EXT.has(ext(name)) || type.startsWith('text/') ? 'text' : type.startsWith('image/') ? 'image' : type.startsWith('audio/') ? 'audio' : type.startsWith('video/') ? 'video' : 'other';
const ICON = { folder: '📁', text: '📄', image: '🖼', audio: '🎵', video: '🎬', other: '📦' };

const baseName = (path) => path.replace(/\/$/, '').split('/').pop();
const parentOf = (path) => path.replace(/\/$/, '').split('/').slice(0, -1).map((s) => s + '/').join('');
const enc = (path) => path.split('/').map(encodeURIComponent).join('/');
const folderUrl = (dir) => (dir ? `/d/${enc(dir)}` : '/');

function checkName(name) {
  name = String(name ?? '').trim();
  if (!name || name.length > 200 || /[\/\\\u0000-\u001f\u007f]/.test(name) || name === '.' || name === '..' || name.startsWith('.trash')) {
    throw new UserError(`名稱不能是空的、不能超過 200 字，也不能有 / \\ 或控制字元，不能是 . 或 ..：${name}`);
  }
  return name;
}

// 'a/b/' 這類資料夾路徑；每一段都要是合法名稱
function checkDir(dir) {
  dir = String(dir ?? '');
  if (!dir) return '';
  if (!dir.endsWith('/')) dir += '/';
  dir.slice(0, -1).split('/').forEach(checkName);
  return dir;
}

function checkPath(path) {
  path = String(path ?? '');
  const isDir = path.endsWith('/');
  const segs = (isDir ? path.slice(0, -1) : path).split('/');
  segs.forEach(checkName);
  return path;
}

/** Every object under a prefix (follows the cursor). */
async function listAll(bucket, prefix, delimiter) {
  const objects = [];
  const prefixes = [];
  let cursor;
  do {
    const r = await bucket.list({ prefix, delimiter, cursor, include: ['httpMetadata', 'customMetadata'] });
    objects.push(...r.objects);
    prefixes.push(...(r.delimitedPrefixes || []));
    cursor = r.truncated ? r.cursor : undefined;
  } while (cursor);
  return { objects, prefixes };
}

async function exists(bucket, path) {
  if (!path.endsWith('/')) return !!(await bucket.head(path));
  const r = await bucket.list({ prefix: path, limit: 1 });
  return r.objects.length > 0;
}

// 名稱已經有了就加 (2)、(3)…（加在副檔名前面）
async function freeName(bucket, dir, name, isDir = false) {
  const m = isDir ? [name, name, ''] : /^(.*?)(\.[^.]*)?$/.exec(name);
  const [stem, dot = ''] = [m[1], m[2] || ''];
  for (let i = 1; i < 1000; i++) {
    const candidate = i === 1 ? name : `${stem} (${i})${dot}`;
    if (!(await exists(bucket, dir + candidate + (isDir ? '/' : '')))) return candidate;
  }
  throw new UserError('同名的檔案太多了。');
}

/** Copies one object to a new key (R2 has no rename), keeping its metadata. */
async function copy(bucket, from, to, customMetadata) {
  const o = await bucket.get(from);
  if (!o) throw new UserError(`找不到：${from}`);
  await bucket.put(to, await o.arrayBuffer(), { httpMetadata: o.httpMetadata, customMetadata: customMetadata ?? o.customMetadata });
}

/** Moves a file or a whole folder (path ends with '/') to `to`. */
async function moveTree(bucket, from, to, meta) {
  if (!from.endsWith('/')) {
    await copy(bucket, from, to, meta?.(from));
    await bucket.delete(from);
    return;
  }
  const { objects } = await listAll(bucket, from);
  for (const o of objects) {
    await copy(bucket, o.key, to + o.key.slice(from.length), meta?.(o.key));
    await bucket.delete(o.key);
  }
}

// ---- 頁面

function crumbs(dir) {
  const parts = dir ? dir.slice(0, -1).split('/') : [];
  return html`<p class="row small"><a href="/">檔案</a>${parts.map((p, i) => html` / <a href="${folderUrl(parts.slice(0, i + 1).join('/') + '/')}">${p}</a>`)}</p>`;
}

async function folderPage(request, env, url, dir) {
  const tz = tzOf(request);
  const { objects, prefixes } = await listAll(env.FILES, dir, '/');
  if (dir && !objects.length && !prefixes.length) throw new UserError('找不到這個資料夾。');
  const sort = ['name', 'date', 'size'].includes(url.searchParams.get('sort')) ? url.searchParams.get('sort') : 'name';
  const files = objects.filter((o) => o.key !== dir && !o.key.endsWith('/'));
  const by = {
    name: (a, b) => a.key.localeCompare(b.key, 'zh-Hant'),
    date: (a, b) => new Date(b.uploaded) - new Date(a.uploaded),
    size: (a, b) => b.size - a.size,
  }[sort];
  files.sort(by);
  const folders = prefixes.filter((p) => p !== TRASH).sort((a, b) => a.localeCompare(b, 'zh-Hant'));
  const chip = (s, label) => html`<a class="chip${s === sort ? ' on' : ''}" href="?sort=${s}">${label}</a>`;
  return page(request, {
    app: APP,
    title: dir ? baseName(dir) : '',
    back: dir ? folderUrl(parentOf(dir)) : '',
    actions: html`<a class="btn" href="/trash">垃圾桶</a>`,
    body: html`
${crumbs(dir)}
<div class="spread"><span class="row">${chip('name', '名稱')}${chip('date', '日期')}${chip('size', '大小')}</span>
<span class="muted small">${folders.length} 個資料夾 · ${files.length} 個檔案</span></div>
${folders.length || files.length
  ? html`<ul class="list" style="margin-top:12px">
${folders.map((p) => html`<li><a class="main" href="${folderUrl(p)}"><span class="icon">${ICON.folder}</span><span class="grow"><strong>${baseName(p)}</strong></span></a></li>`)}
${files.map((o) => html`<li><a class="main" href="/f/${enc(o.key)}"><span class="icon">${ICON[kind(o.key, o.httpMetadata?.contentType)]}</span><span class="grow"><strong>${baseName(o.key)}</strong><span class="sub">${size(o.size)} · ${fmt(o.uploaded, tz)}</span></span></a></li>`)}
</ul>`
  : html`<p class="empty">這個資料夾是空的。</p>`}
<div class="grid" style="margin-top:16px">
  <form class="stack card" method="post" action="/upload" enctype="multipart/form-data">
    <input type="hidden" name="dir" value="${dir}">
    <label>上傳檔案<input type="file" name="file" multiple></label>
    <div><button class="primary" type="submit">上傳</button></div>
  </form>
  <form class="stack card" method="post" action="/mkdir">
    <input type="hidden" name="dir" value="${dir}">
    <label>新增資料夾<input name="name" required maxlength="200" placeholder="資料夾名稱"></label>
    <div><button type="submit">建立</button></div>
  </form>
</div>`,
  });
}

async function allFolders(bucket) {
  const { objects } = await listAll(bucket, '');
  const set = new Set(['']);
  for (const o of objects) {
    if (o.key.startsWith(TRASH)) continue;
    const segs = o.key.split('/');
    for (let i = 1; i < segs.length; i++) set.add(segs.slice(0, i).join('/') + '/');
    if (set.size > 500) break;
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
}

async function filePage(request, env, path) {
  const tz = tzOf(request);
  const isDir = path.endsWith('/');
  const head = isDir ? null : await env.FILES.head(path);
  if (!isDir && !head) throw new UserError('找不到這個檔案。');
  const name = baseName(path);
  const type = head?.httpMetadata?.contentType || guess(name);
  const k = kind(name, type);
  const rawUrl = `/raw/${enc(path)}`;
  let preview;
  if (k === 'text') {
    if (head.size > MAX_PREVIEW) preview = html`<p class="muted">檔案太大，不預覽（上限 512 KB）。</p>`;
    else {
      const text = await (await env.FILES.get(path)).text();
      preview = ext(name) === 'md' ? html`<div class="card prose">${raw(markdown(text))}</div>` : html`<pre class="card" style="overflow:auto;white-space:pre-wrap">${text}</pre>`;
    }
  } else if (k === 'image') preview = html`<p><img src="${rawUrl}" alt="${name}" style="max-width:100%"></p>`;
  else if (k === 'audio') preview = html`<p><audio controls src="${rawUrl}" style="width:100%;height:48px"></audio></p>`;
  else if (k === 'video') preview = html`<p><video controls src="${rawUrl}" style="max-width:100%"></video></p>`;
  else preview = html`<p class="muted">無法預覽這種檔案。</p>`;
  const folders = await allFolders(env.FILES);
  return page(request, {
    app: APP,
    title: name,
    back: folderUrl(parentOf(path)),
    actions: html`<a class="btn primary" href="${rawUrl}?download=1" download>下載</a>`,
    body: html`
${crumbs(parentOf(path))}
<h2>${name}</h2>
<p class="muted small">${size(head.size)} · ${type} · ${fmt(head.uploaded, tz)}</p>
${preview}
<div class="grid" style="margin-top:16px">
  <form class="stack card" method="post" action="/rename"><input type="hidden" name="path" value="${path}">
    <label>改名<input name="name" value="${name}" required maxlength="200"></label><div><button type="submit">改名</button></div></form>
  <form class="stack card" method="post" action="/move"><input type="hidden" name="path" value="${path}">
    <label>搬到<select name="to">${folders.map((f) => html`<option value="${f}"${f === parentOf(path) ? html` selected` : ''}>${f ? '/' + f : '/（最上層）'}</option>`)}</select></label><div><button type="submit">搬移</button></div></form>
  <form class="stack card" method="post" action="/delete" data-confirm="把「${name}」移到垃圾桶？"><input type="hidden" name="path" value="${path}">
    <p class="muted small" style="margin:0">刪除的檔案會先放在垃圾桶。</p><div><button class="danger" type="submit">刪除</button></div></form>
</div>`,
  });
}

// GET /raw/<路徑>：內容。使用者的 HTML、SVG、JavaScript 一律當純文字送，並加 CSP sandbox，不讓檔案在這個網域執行程式
async function rawFile(request, env, url, path) {
  const head = await env.FILES.head(path);
  if (!head) return new Response('找不到這個檔案', { status: 404 });
  let type = head.httpMetadata?.contentType || guess(path);
  if (/^(text\/html|image\/svg\+xml|application\/xhtml\+xml|text\/xml|application\/xml|text\/javascript|application\/javascript)/i.test(type) || /\.(html?|svg|xht(ml)?|xml|js|mjs)$/i.test(path)) type = 'text/plain; charset=utf-8';
  else if (type.startsWith('text/') && !/charset/i.test(type)) type += '; charset=utf-8';
  return serveObject(request, env.FILES, path, {
    type,
    download: url.searchParams.get('download') ? baseName(path) : undefined,
    headers: { 'x-content-type-options': 'nosniff', 'content-security-policy': 'sandbox' },
  });
}

async function trashPage(request, env) {
  const tz = tzOf(request);
  const { objects } = await listAll(env.FILES, TRASH);
  // 一次刪除（一個檔案或整個資料夾）是 .trash/<時間>/ 底下的一組
  const groups = new Map();
  for (const o of objects) {
    const stamp = o.key.slice(TRASH.length).split('/')[0];
    const g = groups.get(stamp) || { stamp, from: '', count: 0, size: 0 };
    g.count++;
    g.size += o.size;
    if (!g.from) {
      const rest = o.key.slice(TRASH.length + stamp.length + 1);
      const from = o.customMetadata?.from || rest;
      g.from = o.customMetadata?.root || from;
    }
    groups.set(stamp, g);
  }
  const list = [...groups.values()].sort((a, b) => b.stamp.localeCompare(a.stamp));
  return page(request, {
    app: APP,
    title: '垃圾桶',
    back: '/',
    actions: list.length ? html`<form class="inline" method="post" action="/trash/empty" data-confirm="永久刪除垃圾桶裡的全部東西？這無法復原。"><button class="danger" type="submit">清空垃圾桶</button></form>` : '',
    body: list.length
      ? html`<ul class="list">${list.map((g) => html`<li><span class="icon">${g.from.endsWith('/') ? ICON.folder : ICON[kind(g.from)]}</span>
<span class="grow"><strong>${g.from}</strong><span class="sub">${fmt(new Date(+g.stamp), tz)} 刪除 · ${g.count} 個檔案 · ${size(g.size)}</span></span>
<form class="inline" method="post" action="/trash/restore"><input type="hidden" name="key" value="${g.stamp}"><button class="small" type="submit">還原</button></form>
<form class="inline" method="post" action="/trash/purge" data-confirm="永久刪除？這無法復原。"><input type="hidden" name="key" value="${g.stamp}"><button class="small danger" type="submit">永久刪除</button></form></li>`)}</ul>`
      : html`<p class="empty">垃圾桶是空的。</p>`,
  });
}

// ---- 動作

async function act(request, env, url) {
  const p = url.pathname;
  const f = await readForm(request);
  const b = env.FILES;
  if (p === '/upload') {
    const dir = checkDir(f.dir);
    const files = filesOf(f.file);
    if (!files.length) throw new UserError('沒有選擇檔案。');
    for (const file of files) {
      if (file.size > MAX_UPLOAD) throw new UserError(`「${file.name}」太大了（上限 100 MB）。`);
      const name = await freeName(b, dir, checkName(file.name.split(/[\\/]/).pop()));
      await b.put(dir + name, await file.arrayBuffer(), { httpMetadata: { contentType: file.type || guess(name) } });
    }
    return redirect(folderUrl(dir));
  }
  if (p === '/mkdir') {
    const dir = checkDir(f.dir);
    const name = checkName(f.name);
    if (await exists(b, dir + name + '/')) throw new UserError('已經有這個資料夾了。');
    await b.put(`${dir}${name}/`, new Uint8Array(0));
    return redirect(folderUrl(`${dir}${name}/`));
  }
  if (p === '/rename' || p === '/move') {
    const path = checkPath(f.path);
    const isDir = path.endsWith('/');
    if (!(await exists(b, path))) throw new UserError('找不到要搬的東西。');
    const to = p === '/rename' ? parentOf(path) + checkName(f.name) + (isDir ? '/' : '') : checkDir(f.to) + baseName(path) + (isDir ? '/' : '');
    if (to === path) return redirect(isDir ? folderUrl(to) : `/f/${enc(to)}`);
    if (isDir && to.startsWith(path)) throw new UserError('不能把資料夾搬進它自己裡面。');
    if (await exists(b, to)) throw new UserError(`「${to}」已經存在。`);
    await moveTree(b, path, to);
    return redirect(isDir ? folderUrl(to) : `/f/${enc(to)}`);
  }
  if (p === '/delete') {
    const path = checkPath(f.path);
    if (!(await exists(b, path))) throw new UserError('找不到要刪除的東西。');
    const base = `${TRASH}${Date.now()}/`;
    await moveTree(b, path, base + path, (key) => ({ from: key, root: path }));
    return redirect(folderUrl(parentOf(path)));
  }
  if (p === '/trash/restore' || p === '/trash/purge') {
    const stamp = String(f.key || '');
    if (!/^\d+$/.test(stamp)) throw new UserError('垃圾桶的項目不對。');
    const prefix = `${TRASH}${stamp}/`;
    const { objects } = await listAll(b, prefix);
    if (!objects.length) throw new UserError('垃圾桶裡沒有這個項目。');
    if (p === '/trash/purge') {
      for (const o of objects) await b.delete(o.key);
      return redirect('/trash');
    }
    // 還原到原來的位置；那裡已經有同名的就加 (2)
    const root = objects[0].customMetadata?.root || objects[0].key.slice(prefix.length);
    const isDir = root.endsWith('/');
    const parent = parentOf(root);
    const name = await freeName(b, parent, baseName(root), isDir);
    const target = parent + name + (isDir ? '/' : '');
    for (const o of objects) {
      const rel = o.key.slice(prefix.length + root.length);
      await copy(b, o.key, target + rel, {});
      await b.delete(o.key);
    }
    return redirect(isDir ? folderUrl(target) : `/f/${enc(target)}`);
  }
  if (p === '/trash/empty') {
    const { objects } = await listAll(b, TRASH);
    for (const o of objects) await b.delete(o.key);
    return redirect('/trash');
  }
  return null;
}

export default app(APP, async (request, env, url) => {
  const p = url.pathname;
  if (request.method === 'POST') return act(request, env, url);
  if (request.method !== 'GET' && request.method !== 'HEAD') return null;
  const decode = (s) => s.split('/').map(decodeURIComponent).join('/');
  if (p === '/') return folderPage(request, env, url, '');
  if (p === '/trash') return trashPage(request, env);
  if (p === '/api/list') {
    const dir = checkDir(url.searchParams.get('dir') || '');
    const { objects, prefixes } = await listAll(env.FILES, dir, '/');
    return json({
      folders: prefixes.filter((x) => x !== TRASH),
      files: objects.filter((o) => !o.key.endsWith('/')).map((o) => ({ path: o.key, size: o.size, type: o.httpMetadata?.contentType || guess(o.key), uploaded: o.uploaded })),
    });
  }
  let m = /^\/d\/(.+\/)$/.exec(p);
  if (m) return folderPage(request, env, url, checkDir(decode(m[1])));
  m = /^\/f\/(.+)$/.exec(p);
  if (m) return filePage(request, env, checkPath(decode(m[1])));
  m = /^\/raw\/(.+)$/.exec(p);
  if (m) return rawFile(request, env, url, checkPath(decode(m[1])));
  return null;
});
