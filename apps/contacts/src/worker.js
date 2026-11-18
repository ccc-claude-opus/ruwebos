// 通訊錄（D1）。頁面由伺服器產生，表單送出；/_ui/enhance.js 讓它不用整頁重載。
//   GET  /?q=&group=          清單（我的最愛在前）
//   GET  /new  POST /new      新增
//   GET  /c/:id               聯絡人     GET /c/:id/edit  POST /c/:id   編輯
//   POST /c/:id/favorite      我的最愛   POST /c/:id/delete             刪除
//   GET  /c/:id.vcf  /export.vcf        vCard 下載（RFC 6350）
//   GET  /import  POST /import          貼上或上傳 vCard
//   GET  /api/birthdays?from=&to=       區間內的生日（行事曆用）
import { app, page, html, redirect, readForm, newId, today, tzOf, UserError } from '../../_shared/lib.js';
import { toVcard, parseVcards } from './vcard.js';

const APP = { name: '通訊錄', color: '#1098ad' };
const OWNER = 'me';
const LABELS = ['手機', '住家', '公司', '其他'];

const row = (c) => ({ ...c, phones: JSON.parse(c.phones || '[]'), emails: JSON.parse(c.emails || '[]') });
const groupsOf = (c) => c.groups.split(',').map((g) => g.trim()).filter(Boolean);

async function get(db, id) {
  const c = await db.prepare('SELECT * FROM contacts WHERE id = ? AND owner = ?').bind(id, OWNER).first();
  if (!c) throw new UserError('找不到這位聯絡人。');
  return row(c);
}

function download(text, name) {
  return new Response(text, {
    headers: {
      'content-type': 'text/vcard; charset=utf-8',
      'content-disposition': `attachment; filename="contacts.vcf"; filename*=UTF-8''${encodeURIComponent(name)}.vcf`,
    },
  });
}

function birthdayText(b) {
  if (!b) return '';
  const m = /^(?:(\d{4})|-)-(\d{2})-(\d{2})$/.exec(b);
  return m ? `${m[1] ? `${m[1]} 年 ` : ''}${+m[2]} 月 ${+m[3]} 日` : b;
}

// ---- 編輯表單與輸入檢查

function editor(c) {
  const rows = (kind, list) =>
    [0, 1, 2, 3].map((i) => {
      const v = list[i] || { label: kind === 'phone' ? '手機' : '住家', value: '' };
      return html`<div class="row"><select name="${kind}_label" style="width:auto">${LABELS.map((l) => html`<option${l === v.label ? html` selected` : ''}>${l}</option>`)}</select>
<input name="${kind}" value="${v.value}" type="${kind === 'phone' ? 'tel' : 'email'}" style="flex:1"></div>`;
    });
  const noYear = c.birthday.startsWith('--');
  return html`<form class="stack" method="post" action="${c.id ? `/c/${c.id}` : '/new'}">
  <label>姓名<input name="name" value="${c.name}" required maxlength="100" autofocus></label>
  <label>讀音（注音或拼音，用來排序）<input name="phonetic" value="${c.phonetic}" maxlength="100"></label>
  <div class="grid"><label>公司<input name="org" value="${c.org}" maxlength="100"></label><label>職稱<input name="title" value="${c.title}" maxlength="100"></label></div>
  <label>電話</label>${rows('phone', c.phones)}
  <label>電子郵件</label>${rows('email', c.emails)}
  <label>地址<input name="address" value="${c.address}" maxlength="300"></label>
  <div class="row"><label>生日<input name="birthday" type="date" value="${noYear ? `2000${c.birthday.slice(1)}` : c.birthday}"></label>
  <label class="check"><input type="checkbox" name="no_year" value="1"${noYear ? html` checked` : ''}> 不含年份</label></div>
  <label>網站<input name="url" value="${c.url}" type="url" maxlength="300"></label>
  <label>群組（逗號分隔）<input name="groups" value="${c.groups}" maxlength="200"></label>
  <label>備註<textarea name="note" rows="4" maxlength="5000">${c.note}</textarea></label>
  <div class="row"><button class="primary" type="submit">儲存</button><a class="btn" href="${c.id ? `/c/${c.id}` : '/'}">取消</a></div>
</form>`;
}

const s = (v, max) => String(v ?? '').trim().slice(0, max);
const arr = (v) => [].concat(v ?? []);

function fromForm(f) {
  const name = s(f.name, 100);
  if (!name) throw new UserError('姓名是必填的。');
  const pairs = (vals, labels, check) =>
    arr(vals)
      .map((v, i) => ({ label: LABELS.includes(arr(labels)[i]) ? arr(labels)[i] : '其他', value: s(v, 100) }))
      .filter((p) => p.value)
      .map((p) => (check(p.value), p));
  const phones = pairs(f.phone, f.phone_label, (v) => {
    if (!/^[0-9+()#*\s-]+$/.test(v)) throw new UserError(`電話號碼只能有數字與 + ( ) # * -：${v}`);
  });
  const emails = pairs(f.email, f.email_label, (v) => {
    if (!/^[^\s@]+@[^\s@]+$/.test(v)) throw new UserError(`電子郵件格式不對：${v}`);
  });
  let birthday = s(f.birthday, 10);
  if (birthday && !/^\d{4}-\d{2}-\d{2}$/.test(birthday)) throw new UserError('生日格式不對。');
  if (birthday && f.no_year) birthday = '-' + birthday.slice(4); // --MM-DD
  const url = s(f.url, 300);
  if (url && !/^https?:\/\//i.test(url)) throw new UserError('網站要以 http:// 或 https:// 開頭。');
  return {
    name, phonetic: s(f.phonetic, 100), org: s(f.org, 100), title: s(f.title, 100), phones, emails,
    address: s(f.address, 300), birthday, url,
    groups: s(f.groups, 200).split(/[,，]/).map((g) => g.trim()).filter(Boolean).join(','),
    note: String(f.note ?? '').slice(0, 5000),
  };
}

async function insert(db, c) {
  const id = newId();
  const now = new Date().toISOString();
  await db
    .prepare('INSERT INTO contacts (id, owner, name, phonetic, org, title, phones, emails, address, birthday, url, note, groups, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, OWNER, c.name, c.phonetic, c.org, c.title, JSON.stringify(c.phones), JSON.stringify(c.emails), c.address, c.birthday, c.url, c.note, c.groups, now, now)
    .run();
  return id;
}

// ---- 頁面

async function list(request, env, url) {
  const q = s(url.searchParams.get('q'), 100);
  const group = url.searchParams.get('group');
  let sql = 'SELECT * FROM contacts WHERE owner = ?';
  const args = [OWNER];
  if (q) {
    sql += ' AND (name LIKE ?1x OR phonetic LIKE ?1x OR org LIKE ?1x OR phones LIKE ?1x OR emails LIKE ?1x OR note LIKE ?1x)'.replace(/\?1x/g, '?');
    args.push(...Array(6).fill(`%${q}%`));
  }
  if (group) {
    sql += " AND (',' || groups || ',') LIKE ?";
    args.push(`%,${group},%`);
  }
  const all = (await env.DB.prepare(sql + " ORDER BY CASE WHEN phonetic = '' THEN name ELSE phonetic END LIMIT 2000").bind(...args).all()).results.map(row);
  const groups = [...new Set((await env.DB.prepare('SELECT groups FROM contacts WHERE owner = ?').bind(OWNER).all()).results.flatMap(groupsOf))].sort();
  const item = (c) => html`<li><a class="main" href="/c/${c.id}"><span class="avatar">${[...c.name][0]}</span><span class="grow"><strong>${c.name}</strong><span class="sub">${[c.org, c.phones[0]?.value, c.emails[0]?.value].filter(Boolean).join(' · ')}</span></span></a></li>`;
  const fav = all.filter((c) => c.favorite);
  const imported = url.searchParams.get('imported');
  return page(request, {
    app: APP,
    actions: html`<a class="btn" href="/import">匯入</a><a class="btn primary" href="/new">＋ 新增</a>`,
    body: html`
${imported !== null ? html`<p class="ok">已匯入 ${imported} 筆。</p>` : ''}
<form class="search" method="get" action="/">
  <input type="search" name="q" value="${q}" placeholder="搜尋姓名、電話、電子郵件、公司">
  ${group ? html`<input type="hidden" name="group" value="${group}">` : ''}
  <button type="submit">搜尋</button>
</form>
${groups.length ? html`<p class="row"><a class="chip${group ? '' : ' on'}" href="/">全部</a>${groups.map((g) => html`<a class="chip${g === group ? ' on' : ''}" href="/?group=${encodeURIComponent(g)}">${g}</a>`)}</p>` : ''}
${fav.length && !q ? html`<p class="section">我的最愛</p><ul class="list">${fav.map(item)}</ul>` : ''}
${all.length
  ? html`<p class="section">${q || group ? '符合' : '所有聯絡人'}（${all.length}）</p><ul class="list">${all.map(item)}</ul>
<p class="small"><a href="/export.vcf" download>下載全部（vCard）</a></p>`
  : html`<p class="empty">${q || group ? '沒有符合的聯絡人。' : '還沒有聯絡人，按「新增」或「匯入」。'}</p>`}`,
  });
}

function detail(request, c) {
  const line = (k, v) => (v ? html`<tr><th>${k}</th><td>${v}</td></tr>` : '');
  return page(request, {
    app: APP,
    title: c.name,
    back: '/',
    actions: html`<a class="btn" href="/c/${c.id}/edit">編輯</a>`,
    body: html`
<div class="row" style="margin:8px 0 16px"><span class="avatar" style="width:64px;height:64px;font-size:28px">${[...c.name][0]}</span>
<div><h2 style="margin:0">${c.name}${c.favorite ? ' ★' : ''}</h2><span class="muted">${[c.title, c.org].filter(Boolean).join(' · ')}</span></div></div>
<table>
${c.phones.map((p) => html`<tr><th>${p.label}</th><td><a href="tel:${p.value.replace(/[^\d+#*]/g, '')}">${p.value}</a></td></tr>`)}
${c.emails.map((e) => html`<tr><th>${e.label}</th><td><a href="mailto:${e.value}">${e.value}</a></td></tr>`)}
${line('地址', c.address)}
${line('生日', birthdayText(c.birthday))}
${c.url ? html`<tr><th>網站</th><td><a href="${c.url}">${c.url}</a></td></tr>` : ''}
${c.groups ? html`<tr><th>群組</th><td>${groupsOf(c).map((g) => html`<a class="chip" href="/?group=${encodeURIComponent(g)}">${g}</a> `)}</td></tr>` : ''}
${line('讀音', c.phonetic)}
${c.note ? html`<tr><th>備註</th><td style="white-space:pre-wrap">${c.note}</td></tr>` : ''}
</table>
<div class="row" style="margin-top:16px">
  <form class="inline" method="post" action="/c/${c.id}/favorite"><button type="submit">${c.favorite ? '取消最愛' : '★ 加入最愛'}</button></form>
  <a class="btn" href="/c/${c.id}.vcf" download>下載 vCard</a>
  <form class="inline" method="post" action="/c/${c.id}/delete" data-confirm="刪除這位聯絡人？"><button class="danger" type="submit">刪除</button></form>
</div>`,
  });
}

function importPage(request) {
  return page(request, {
    app: APP,
    title: '匯入',
    back: '/',
    body: html`
<p class="muted">支援 vCard 3.0 與 4.0（.vcf），一次可以有很多筆。</p>
<form class="stack card" method="post" action="/import">
  <label>貼上 vCard<textarea name="text" rows="10" placeholder="BEGIN:VCARD&#10;VERSION:4.0&#10;FN:王小明&#10;TEL;TYPE=cell:0912-345-678&#10;END:VCARD"></textarea></label>
  <div><button class="primary" type="submit">匯入</button></div>
</form>
<form class="stack card" method="post" action="/import" enctype="multipart/form-data">
  <label>或選擇 .vcf 檔<input type="file" name="file" accept=".vcf,text/vcard"></label>
  <div><button class="primary" type="submit">上傳並匯入</button></div>
</form>`,
  });
}

async function doImport(request, env) {
  const f = await readForm(request);
  let text = typeof f.text === 'string' ? f.text : '';
  if (f.file && typeof f.file === 'object') {
    if (f.file.size > 10 * 1024 * 1024) throw new UserError('檔案太大（上限 10 MB）。');
    text += '\n' + (await f.file.text());
  }
  const cards = parseVcards(text);
  if (!cards.length) throw new UserError('沒有讀到任何 vCard（要有 BEGIN:VCARD … END:VCARD）。');
  let n = 0;
  for (const card of cards.slice(0, 5000)) {
    const c = {
      ...card,
      name: card.name.slice(0, 100),
      phones: card.phones.filter((p) => /^[0-9+()#*\s-]+$/.test(p.value)),
      emails: card.emails.filter((e) => /^[^\s@]+@[^\s@]+$/.test(e.value)),
      url: /^https?:\/\//i.test(card.url) ? card.url : '',
    };
    await insert(env.DB, c);
    n++;
  }
  return redirect(`/?imported=${n}`);
}

// 區間 [from, to] 內的生日（含跨年）
async function birthdays(env, url, tz) {
  const from = url.searchParams.get('from') || today(tz);
  const to = url.searchParams.get('to') || from;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || to < from) {
    return new Response(JSON.stringify({ error: 'from、to 要是 YYYY-MM-DD，且 to 不早於 from' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }
  const rows = (await env.DB.prepare("SELECT id, name, birthday FROM contacts WHERE owner = ? AND birthday != ''").bind(OWNER).all()).results;
  const out = [];
  for (let y = +from.slice(0, 4); y <= +to.slice(0, 4); y++) {
    for (const r of rows) {
      const md = r.birthday.slice(-5);
      const date = `${y}-${md}`;
      if (md === '02-29' && !(y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0))) continue;
      if (date < from || date > to) continue;
      const born = /^\d{4}/.test(r.birthday) ? +r.birthday.slice(0, 4) : null;
      out.push({ id: r.id, name: r.name, date, age: born && y >= born ? y - born : null });
    }
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  return new Response(JSON.stringify({ birthdays: out }), { headers: { 'content-type': 'application/json; charset=utf-8' } });
}

export default app(APP, async (request, env, url) => {
  const p = url.pathname;
  const isGet = request.method === 'GET';
  if (p === '/' && isGet) return list(request, env, url);
  if (p === '/api/birthdays' && isGet) return birthdays(env, url, tzOf(request));
  if (p === '/export.vcf' && isGet) {
    const all = (await env.DB.prepare('SELECT * FROM contacts WHERE owner = ? ORDER BY name').bind(OWNER).all()).results.map(row);
    return download(all.map(toVcard).join(''), '通訊錄');
  }
  if (p === '/import') return isGet ? importPage(request) : doImport(request, env);
  if (p === '/new') {
    if (isGet) return page(request, { app: APP, title: '新增', back: '/', body: editor({ name: '', phonetic: '', org: '', title: '', phones: [], emails: [], address: '', birthday: '', url: '', groups: url.searchParams.get('group') || '', note: '' }) });
    const id = await insert(env.DB, fromForm(await readForm(request)));
    return redirect(`/c/${id}`);
  }
  let m = /^\/c\/(\w+)\.vcf$/.exec(p);
  if (m && isGet) {
    const c = await get(env.DB, m[1]);
    return download(toVcard(c), c.name);
  }
  m = /^\/c\/(\w+)(\/edit|\/favorite|\/delete)?$/.exec(p);
  if (!m) return null;
  const [, id, sub] = m;
  if (isGet) {
    if (!sub) return detail(request, await get(env.DB, id));
    if (sub === '/edit') {
      const c = await get(env.DB, id);
      return page(request, { app: APP, title: `編輯 ${c.name}`, back: `/c/${id}`, body: editor(c) });
    }
    return null;
  }
  await get(env.DB, id);
  if (!sub) {
    const c = fromForm(await readForm(request));
    await env.DB
      .prepare('UPDATE contacts SET name = ?, phonetic = ?, org = ?, title = ?, phones = ?, emails = ?, address = ?, birthday = ?, url = ?, note = ?, groups = ?, updated_at = ? WHERE id = ? AND owner = ?')
      .bind(c.name, c.phonetic, c.org, c.title, JSON.stringify(c.phones), JSON.stringify(c.emails), c.address, c.birthday, c.url, c.note, c.groups, new Date().toISOString(), id, OWNER)
      .run();
    return redirect(`/c/${id}`);
  }
  if (sub === '/favorite') {
    await env.DB.prepare('UPDATE contacts SET favorite = 1 - favorite WHERE id = ? AND owner = ?').bind(id, OWNER).run();
    return redirect(`/c/${id}`);
  }
  if (sub === '/delete') {
    await env.DB.prepare('DELETE FROM contacts WHERE id = ? AND owner = ?').bind(id, OWNER).run();
    return redirect('/');
  }
  return null;
});
