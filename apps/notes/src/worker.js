// 備忘錄：Markdown 筆記（D1）。頁面由伺服器產生，表單送出；/_ui/enhance.js 讓它不用整頁重載。
//   GET  /?q=&folder=        清單（釘選的在前）
//   GET  /new  POST /new     新增
//   GET  /n/:id              閱讀       GET /n/:id/edit  POST /n/:id   編輯
//   POST /n/:id/pin          釘選切換   POST /n/:id/delete              刪除
//   GET  /n/:id.md           下載 Markdown
import { app, page, html, raw, redirect, readForm, tzOf, fmt, newId, UserError } from '../../_shared/lib.js';
import { markdown } from '../../_shared/markdown.js';

const APP = { name: '備忘錄', color: '#e0a800' };
const OWNER = 'me';

const titleOf = (n) => n.title || (n.body.split('\n').find((l) => l.trim()) || '').replace(/^#+\s*/, '').slice(0, 60) || '（無標題）';

async function folders(db) {
  const r = await db.prepare("SELECT folder, COUNT(*) AS n FROM notes WHERE owner = ? AND folder != '' GROUP BY folder ORDER BY folder").bind(OWNER).all();
  return r.results;
}

async function get(db, id) {
  const n = await db.prepare('SELECT * FROM notes WHERE id = ? AND owner = ?').bind(id, OWNER).first();
  if (!n) throw new UserError('找不到這則備忘錄。');
  return n;
}

function editor(n, all) {
  return html`<form class="stack" method="post" action="${n.id ? `/n/${n.id}` : '/new'}">
  <label>標題<input name="title" value="${n.title}" placeholder="（可留空，用第一行）" autofocus></label>
  <label>資料夾<input name="folder" value="${n.folder}" list="folders" placeholder="（不分類）"></label>
  <datalist id="folders">${all.map((f) => html`<option value="${f.folder}">`)}</datalist>
  <label>內容（Markdown）<textarea name="body" rows="16">${n.body}</textarea></label>
  <div class="row"><button class="primary" type="submit">儲存</button><a class="btn" href="${n.id ? `/n/${n.id}` : '/'}">取消</a></div>
</form>`;
}

async function list(request, env, url) {
  const q = (url.searchParams.get('q') || '').trim();
  const folder = url.searchParams.get('folder');
  let sql = 'SELECT id, title, body, folder, pinned, updated_at FROM notes WHERE owner = ?';
  const args = [OWNER];
  if (q) {
    sql += ' AND (title LIKE ? OR body LIKE ?)';
    args.push(`%${q}%`, `%${q}%`);
  }
  if (folder !== null) {
    sql += ' AND folder = ?';
    args.push(folder);
  }
  sql += ' ORDER BY pinned DESC, updated_at DESC LIMIT 500';
  const notes = (await env.DB.prepare(sql).bind(...args).all()).results;
  const fs = await folders(env.DB);
  const tz = tzOf(request);
  const chip = (label, href, on) => html`<a class="chip${on ? ' on' : ''}" href="${href}">${label}</a>`;
  return page(request, {
    app: APP,
    actions: html`<a class="btn primary" href="/new">＋ 新增</a>`,
    body: html`
<form class="search" method="get" action="/">
  <input type="search" name="q" value="${q}" placeholder="搜尋標題與內容">
  ${folder !== null ? html`<input type="hidden" name="folder" value="${folder}">` : ''}
  <button type="submit">搜尋</button>
</form>
${fs.length ? html`<p class="row">${chip('全部', '/', folder === null)}${chip('未分類', '/?folder=', folder === '')}${fs.map((f) => chip(`${f.folder}（${f.n}）`, `/?folder=${encodeURIComponent(f.folder)}`, folder === f.folder))}</p>` : ''}
${notes.length
  ? html`<ul class="list">${notes.map((n) => html`<li><a class="main" href="/n/${n.id}"><span class="grow"><strong>${n.pinned ? '📌 ' : ''}${titleOf(n)}</strong><span class="sub">${fmt(n.updated_at, tz)}${n.folder ? ` · ${n.folder}` : ''} · ${n.body.replace(/\s+/g, ' ').slice(0, 80)}</span></span></a></li>`)}</ul>`
  : html`<p class="empty">${q ? '沒有符合的備忘錄。' : '還沒有備忘錄，按「新增」寫第一則。'}</p>`}`,
  });
}

async function save(request, env, id) {
  const f = await readForm(request);
  const title = String(f.title || '').trim().slice(0, 200);
  const body = String(f.body || '').slice(0, 200000);
  const folder = String(f.folder || '').trim().slice(0, 60);
  if (!title && !body.trim()) throw new UserError('標題和內容不能都是空的。');
  const now = new Date().toISOString();
  if (id) {
    await get(env.DB, id);
    await env.DB.prepare('UPDATE notes SET title = ?, body = ?, folder = ?, updated_at = ? WHERE id = ? AND owner = ?').bind(title, body, folder, now, id, OWNER).run();
  } else {
    id = newId();
    await env.DB.prepare('INSERT INTO notes (id, owner, title, body, folder, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(id, OWNER, title, body, folder, now, now).run();
  }
  return redirect(`/n/${id}`);
}

export default app(APP, async (request, env, url) => {
  const p = url.pathname;
  const get_ = request.method === 'GET';
  if (p === '/' && get_) return list(request, env, url);
  if (p === '/new') {
    if (get_) return page(request, { app: APP, title: '新增', back: '/', body: editor({ title: '', body: '', folder: url.searchParams.get('folder') || '' }, await folders(env.DB)) });
    return save(request, env, null);
  }
  let m = /^\/n\/([\w]+)\.md$/.exec(p);
  if (m && get_) {
    const n = await get(env.DB, m[1]);
    const name = titleOf(n).replace(/[\\/:*?"<>|]/g, '_');
    const text = (n.title ? `# ${n.title}\n\n` : '') + n.body;
    return new Response(text, {
      headers: {
        'content-type': 'text/markdown; charset=utf-8',
        'content-disposition': `attachment; filename="note.md"; filename*=UTF-8''${encodeURIComponent(name)}.md`,
      },
    });
  }
  m = /^\/n\/(\w+)(\/edit|\/pin|\/delete)?$/.exec(p);
  if (!m) return null;
  const [, id, sub] = m;
  if (!sub && get_) {
    const n = await get(env.DB, id);
    const tz = tzOf(request);
    return page(request, {
      app: APP,
      title: titleOf(n),
      back: '/',
      actions: html`<a class="btn" href="/n/${id}/edit">編輯</a>`,
      body: html`
<article class="card prose">${n.title ? html`<h1>${n.title}</h1>` : ''}${raw(markdown(n.body))}</article>
<p class="muted small">${n.folder ? html`資料夾：<a href="/?folder=${encodeURIComponent(n.folder)}">${n.folder}</a> · ` : ''}建立 ${fmt(n.created_at, tz)} · 修改 ${fmt(n.updated_at, tz)}</p>
<div class="row">
  <form class="inline" method="post" action="/n/${id}/pin"><button type="submit">${n.pinned ? '取消釘選' : '📌 釘選'}</button></form>
  <a class="btn" href="/n/${id}.md" download>下載 .md</a>
  <form class="inline" method="post" action="/n/${id}/delete" data-confirm="刪除這則備忘錄？"><button class="danger" type="submit">刪除</button></form>
</div>`,
    });
  }
  if (sub === '/edit' && get_) {
    const n = await get(env.DB, id);
    return page(request, { app: APP, title: '編輯', back: `/n/${id}`, body: editor(n, await folders(env.DB)) });
  }
  if (get_) return null;
  if (!sub) return save(request, env, id);
  if (sub === '/pin') {
    await env.DB.prepare('UPDATE notes SET pinned = 1 - pinned WHERE id = ? AND owner = ?').bind(id, OWNER).run();
    return redirect(`/n/${id}`);
  }
  if (sub === '/delete') {
    await env.DB.prepare('DELETE FROM notes WHERE id = ? AND owner = ?').bind(id, OWNER).run();
    return redirect('/');
  }
  return null;
});
