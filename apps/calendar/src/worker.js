// 行事曆（D1）。時間在檢視者的時區顯示；生日來自通訊錄、有期限的待辦來自待辦（service binding，沒有也能用）。
//   GET  /?m=YYYY-MM          月曆
//   GET  /day/YYYY-MM-DD      一天的行程
//   GET  /new?date=  POST /new          新增
//   GET  /e/:id               行程       GET /e/:id/edit  POST /e/:id   編輯
//   POST /e/:id/delete        刪除整個系列
//   GET  /export.ics          匯出（RFC 5545）   GET /import  POST /import   匯入
import { app, page, html, redirect, readForm, tzOf, today, zoned, newId, UserError } from '../../_shared/lib.js';
import { occurrences, describe, parseRule, formatRule, addDays, dow, isDate, local, FREQS } from './recur.js';
import { toIcs, parseIcs } from './ics.js';

const APP = { name: '行事曆', color: '#e8590c' };
const OWNER = 'me';
const WEEK = ['日', '一', '二', '三', '四', '五', '六'];

async function get(db, id) {
  const e = await db.prepare('SELECT * FROM events WHERE id = ? AND owner = ?').bind(id, OWNER).first();
  if (!e) throw new UserError('找不到這個行程。');
  return e;
}

// 其他應用的資料：失敗或沒有綁定就略過
async function fromApp(binding, path, key) {
  if (!binding) return [];
  try {
    const r = await binding.fetch(`http://app${path}`);
    return r.ok ? (await r.json())[key] || [] : [];
  } catch {
    return [];
  }
}

/** Everything on the local dates [from, to]: { 'YYYY-MM-DD': [items sorted] } */
async function agenda(env, from, to, tz) {
  // 只讀可能落在區間裡的：有重複規則的，或時間和區間重疊的（前後各多一天，涵蓋時區差）
  const rows = (
    await env.DB.prepare("SELECT * FROM events WHERE owner = ? AND (COALESCE(rrule, '') != '' OR (substr(start, 1, 10) <= ? AND substr(end, 1, 10) >= ?))")
      .bind(OWNER, addDays(to, 1), addDays(from, -1)).all()
  ).results;
  const days = {};
  const add = (date, item) => (days[date] ||= []).push(item);
  for (const ev of rows) {
    for (const o of occurrences(ev, from, to, tz)) {
      // 跨好幾天的行程每一天都列
      for (let d = o.date < from ? from : o.date; d <= o.endDate && d <= to; d = addDays(d, 1)) {
        add(d, { kind: 'event', sort: ev.all_day ? '00:00' : d === o.date ? o.time : '00:00', o, first: d === o.date });
      }
    }
  }
  const q = `?from=${from}&to=${to}`;
  for (const b of await fromApp(env.CONTACTS, `/api/birthdays${q}`, 'birthdays')) add(b.date, { kind: 'birthday', sort: '', b });
  for (const t of await fromApp(env.TODO, `/api/due${q}`, 'tasks')) if (!t.done) add(t.due, { kind: 'todo', sort: '', t });
  for (const list of Object.values(days)) list.sort((a, b) => (a.sort || '').localeCompare(b.sort || ''));
  return days;
}

const otherApp = (request, name) => {
  const u = new URL(request.url);
  return `${u.protocol}//${name}.localhost${u.port ? ':' + u.port : ''}`;
};

function itemHtml(request, it, short) {
  if (it.kind === 'birthday') {
    return html`<a href="${otherApp(request, 'contacts')}/c/${it.b.id}">🎂 ${it.b.name}${!short && it.b.age !== null ? `（${it.b.age} 歲）` : ''}</a>`;
  }
  if (it.kind === 'todo') return html`<a href="${otherApp(request, 'todo')}/t/${it.t.id}">☐ ${it.t.title}</a>`;
  const { o } = it;
  const time = o.event.all_day ? (short ? '' : '整天') : it.first ? o.time : '（續）';
  return html`<a href="/e/${o.event.id}">${time ? html`<span class="muted">${time}</span> ` : ''}${o.event.title}</a>`;
}

// ---- 月曆

async function month(request, env, url) {
  const tz = tzOf(request);
  const now = today(tz);
  const m = /^(\d{4})-(\d{2})$/.exec(url.searchParams.get('m') || '') || /^(\d{4})-(\d{2})/.exec(now);
  const first = `${m[1]}-${m[2]}-01`;
  const gridStart = addDays(first, -dow(first));
  const next = new Date(Date.UTC(+m[1], +m[2], 1)).toISOString().slice(0, 10); // 下個月 1 號
  const prev = addDays(first, -1).slice(0, 7);
  const weeks = Math.ceil((dow(first) + Math.round((new Date(next) - new Date(first)) / 86400000)) / 7);
  const gridEnd = addDays(gridStart, weeks * 7 - 1);
  const days = await agenda(env, gridStart, gridEnd, tz);
  const imported = url.searchParams.get('imported');
  const cells = [];
  for (let i = 0; i < weeks * 7; i++) {
    const d = addDays(gridStart, i);
    const items = days[d] || [];
    cells.push(html`<div class="day${d.slice(0, 7) !== first.slice(0, 7) ? ' other' : ''}${d === now ? ' today' : ''}">
<a class="num" href="/day/${d}">${+d.slice(8)}</a>
${items.slice(0, 3).map((it) => html`<div class="it">${itemHtml(request, it, true)}</div>`)}
${items.length > 3 ? html`<a class="more" href="/day/${d}">+${items.length - 3}</a>` : ''}</div>`);
  }
  return page(request, {
    app: APP,
    title: `${+m[1]} 年 ${+m[2]} 月`,
    actions: html`<a class="btn" href="/import">匯入</a><a class="btn primary" href="/new?date=${now.slice(0, 7) === first.slice(0, 7) ? now : first}">＋ 新增</a>`,
    body: html`
<style>
  .cal { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); margin-top: 12px; background: var(--card); border: 1px solid var(--line); border-radius: var(--radius); overflow: hidden; }
  .cal .head { text-align: center; padding: 6px 0; color: var(--muted); font-size: 14px; font-weight: 600; border-bottom: 1px solid var(--line); }
  .cal .day { min-height: 96px; padding: 4px; border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); font-size: 13px; overflow: hidden; }
  .cal .day.other { background: var(--hover); color: var(--muted); }
  .cal .day.today .num { background: var(--app); color: #fff; border-radius: 999px; padding: 0 7px; }
  .cal .num { color: inherit; text-decoration: none; font-weight: 600; }
  .cal .it { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .cal .it a, .cal .more { color: inherit; text-decoration: none; }
  .cal .more { color: var(--muted); }
  @media (max-width: 600px) { .cal .day { min-height: 64px; font-size: 11px; padding: 2px; } }
</style>
${imported !== null ? html`<p class="ok">已匯入 ${imported} 個行程。</p>` : ''}
<div class="spread"><h2 style="margin:0">${+m[1]} 年 ${+m[2]} 月</h2>
<span class="row"><a class="btn small" href="/?m=${prev}">‹ 上個月</a><a class="btn small" href="/">今天</a><a class="btn small" href="/?m=${next.slice(0, 7)}">下個月 ›</a></span></div>
<div class="cal">${WEEK.map((w) => html`<div class="head">${w}</div>`)}${cells}</div>
<p class="small muted">時區：${tz} · <a href="/export.ics" download>匯出 .ics</a></p>`,
  });
}

// ---- 一天

async function dayPage(request, env, date) {
  if (!isDate(date)) throw new UserError('日期格式不對。');
  const tz = tzOf(request);
  const items = (await agenda(env, date, date, tz))[date] || [];
  const title = `${date.replace(/-/g, '/')}（${WEEK[dow(date)]}）`;
  return page(request, {
    app: APP,
    title,
    back: `/?m=${date.slice(0, 7)}`,
    actions: html`<a class="btn primary" href="/new?date=${date}">＋ 新增</a>`,
    body: html`
<div class="spread"><h2 style="margin:0">${title}</h2>
<span class="row"><a class="btn small" href="/day/${addDays(date, -1)}">‹ 前一天</a><a class="btn small" href="/day/${today(tz)}">今天</a><a class="btn small" href="/day/${addDays(date, 1)}">後一天 ›</a></span></div>
${items.length
  ? html`<ul class="list" style="margin-top:12px">${items.map((it) => html`<li><span class="grow">${itemHtml(request, it, false)}${it.kind === 'event' && it.o.event.location ? html`<span class="sub">${it.o.event.location}</span>` : ''}</span>${it.kind === 'event' && !it.o.event.all_day ? html`<span class="muted small">${it.o.time}–${it.o.endTime}</span>` : ''}</li>`)}</ul>`
  : html`<p class="empty">這一天沒有行程。</p>`}`,
  });
}

// ---- 表單

function editor(request, e, tz) {
  const rule = parseRule(e.rrule) || { freq: '', interval: 1, byday: [], until: '' };
  let sd, st, ed, et;
  if (e.all_day) {
    [sd, st, ed, et] = [e.start, '09:00', e.end, '10:00'];
  } else {
    ({ date: sd, time: st } = local(e.start, tz));
    ({ date: ed, time: et } = local(e.end, tz));
  }
  const until = /^(\d{4})(\d{2})(\d{2})/.exec(rule.until);
  return html`<form class="stack" method="post" action="${e.id ? `/e/${e.id}` : '/new'}">
  <label>標題<input name="title" value="${e.title}" required maxlength="200" autofocus></label>
  <label class="check"><input type="checkbox" name="all_day" value="1"${e.all_day ? html` checked` : ''}> 整天</label>
  <div class="grid"><label>開始日期<input type="date" name="start_date" value="${sd}" required></label><label>開始時間<input type="time" name="start_time" value="${st}"></label>
  <label>結束日期<input type="date" name="end_date" value="${ed}"></label><label>結束時間<input type="time" name="end_time" value="${et}"></label></div>
  <label>地點<input name="location" value="${e.location}" maxlength="200"></label>
  <label>備註<textarea name="note" rows="4" maxlength="5000">${e.note}</textarea></label>
  <fieldset class="card" style="margin:0"><legend>重複</legend>
    <div class="row"><select name="freq" style="width:auto">${[['', '不重複'], ['DAILY', '每天'], ['WEEKLY', '每週'], ['MONTHLY', '每月'], ['YEARLY', '每年']].map(([v, l]) => html`<option value="${v}"${v === rule.freq ? html` selected` : ''}>${l}</option>`)}</select>
    <label class="check">每 <input type="number" name="interval" min="1" max="999" value="${rule.interval}" style="width:5em"> 次為一個週期</label></div>
    <p class="row small">每週的哪幾天：${WEEK.map((w, i) => html`<label class="check"><input type="checkbox" name="byday" value="${i}"${rule.byday.includes(i) ? html` checked` : ''}> ${w}</label>`)}</p>
    <label>結束日期（可留空）<input type="date" name="until" value="${until ? `${until[1]}-${until[2]}-${until[3]}` : ''}"></label>
  </fieldset>
  <div class="row"><button class="primary" type="submit">儲存</button><a class="btn" href="${e.id ? `/e/${e.id}` : `/day/${sd}`}">取消</a></div>
</form>`;
}

function fromForm(f, tz) {
  const title = String(f.title || '').trim().slice(0, 200);
  if (!title) throw new UserError('標題是必填的。');
  const sd = String(f.start_date || '');
  const ed = String(f.end_date || '') || sd;
  if (!isDate(sd) || !isDate(ed)) throw new UserError('日期格式不對。');
  const allDay = !!f.all_day;
  let start, end;
  if (allDay) {
    if (ed < sd) throw new UserError('結束日期不能早於開始日期。');
    [start, end] = [sd, ed];
  } else {
    const st = String(f.start_time || '09:00');
    if (!/^\d{2}:\d{2}$/.test(st) || (f.end_time && !/^\d{2}:\d{2}$/.test(f.end_time))) throw new UserError('時間格式不對。');
    const s = zoned(sd, st, tz);
    const e = f.end_time ? zoned(ed, f.end_time, tz) : new Date(s.getTime() + 3600000);
    if (e < s) throw new UserError('結束時間不能早於開始時間。');
    [start, end] = [s.toISOString(), e.toISOString()];
  }
  let rrule = '';
  if (f.freq) {
    if (!FREQS.includes(f.freq)) throw new UserError('重複方式不對。');
    const until = String(f.until || '');
    if (until && (!isDate(until) || until < sd)) throw new UserError('重複的結束日期不對。');
    rrule = formatRule({
      freq: f.freq,
      interval: Math.max(1, Math.min(999, parseInt(f.interval, 10) || 1)),
      count: 0,
      until: until.replace(/-/g, ''),
      byday: [].concat(f.byday || []).map(Number).filter((i) => i >= 0 && i <= 6),
    });
  }
  return { title, all_day: allDay ? 1 : 0, start, end, location: String(f.location || '').trim().slice(0, 200), note: String(f.note || '').slice(0, 5000), rrule };
}

async function insert(db, e) {
  const id = newId();
  const now = new Date().toISOString();
  await db.prepare('INSERT INTO events (id, owner, title, location, note, all_day, start, end, rrule, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, OWNER, e.title, e.location, e.note, e.all_day, e.start, e.end, e.rrule, now, now).run();
  return id;
}

function detail(request, e, tz) {
  const ymd = (d) => `${d.replace(/-/g, '/')}（${WEEK[dow(d)]}）`;
  let when;
  if (e.all_day) when = `${ymd(e.start)}${e.end !== e.start ? ` – ${ymd(e.end)}` : ''} 整天`;
  else {
    const s = local(e.start, tz);
    const t = local(e.end, tz);
    when = `${ymd(s.date)} ${s.time} – ${t.date !== s.date ? `${ymd(t.date)} ` : ''}${t.time}`;
  }
  const date = e.all_day ? e.start : local(e.start, tz).date;
  return page(request, {
    app: APP,
    title: e.title,
    back: `/day/${date}`,
    actions: html`<a class="btn" href="/e/${e.id}/edit">編輯</a>`,
    body: html`
<h2>${e.title}</h2>
<table>
  <tr><th>時間</th><td>${when}</td></tr>
  ${e.rrule ? html`<tr><th>重複</th><td>${describe(e.rrule, tz)}</td></tr>` : ''}
  ${e.location ? html`<tr><th>地點</th><td>${e.location}</td></tr>` : ''}
  ${e.note ? html`<tr><th>備註</th><td style="white-space:pre-wrap">${e.note}</td></tr>` : ''}
</table>
<div class="row" style="margin-top:16px">
  <form class="inline" method="post" action="/e/${e.id}/delete" data-confirm="${e.rrule ? '刪除這個重複行程的所有日子？' : '刪除這個行程？'}"><button class="danger" type="submit">刪除${e.rrule ? '（整個系列）' : ''}</button></form>
</div>`,
  });
}

function importPage(request) {
  return page(request, {
    app: APP,
    title: '匯入',
    back: '/',
    body: html`
<p class="muted">支援 iCalendar（.ics）的 VEVENT；重複規則支援每天、每週（可指定星期）、每月、每年。</p>
<form class="stack card" method="post" action="/import">
  <label>貼上 iCalendar<textarea name="text" rows="10" placeholder="BEGIN:VCALENDAR&#10;BEGIN:VEVENT&#10;SUMMARY:開會&#10;DTSTART:20261120T010000Z&#10;DTEND:20261120T020000Z&#10;END:VEVENT&#10;END:VCALENDAR"></textarea></label>
  <div><button class="primary" type="submit">匯入</button></div>
</form>
<form class="stack card" method="post" action="/import" enctype="multipart/form-data">
  <label>或選擇 .ics 檔<input type="file" name="file" accept=".ics,text/calendar"></label>
  <div><button class="primary" type="submit">上傳並匯入</button></div>
</form>`,
  });
}

export default app(APP, async (request, env, url) => {
  const p = url.pathname;
  const isGet = request.method === 'GET';
  const tz = tzOf(request);
  if (p === '/' && isGet) return month(request, env, url);
  let m = /^\/day\/(\d{4}-\d{2}-\d{2})$/.exec(p);
  if (m && isGet) return dayPage(request, env, m[1]);
  if (p === '/export.ics' && isGet) {
    const all = (await env.DB.prepare('SELECT * FROM events WHERE owner = ? ORDER BY start').bind(OWNER).all()).results;
    return new Response(toIcs(all), { headers: { 'content-type': 'text/calendar; charset=utf-8', 'content-disposition': `attachment; filename="calendar.ics"` } });
  }
  if (p === '/import') {
    if (isGet) return importPage(request);
    const f = await readForm(request);
    let text = typeof f.text === 'string' ? f.text : '';
    if (f.file && typeof f.file === 'object') {
      if (f.file.size > 10 * 1024 * 1024) throw new UserError('檔案太大（上限 10 MB）。');
      text += '\n' + (await f.file.text());
    }
    const events = parseIcs(text, tz);
    if (!events.length) throw new UserError('沒有讀到任何行程（要有 BEGIN:VEVENT … END:VEVENT）。');
    for (const e of events.slice(0, 5000)) await insert(env.DB, e);
    return redirect(`/?imported=${Math.min(events.length, 5000)}`);
  }
  if (p === '/new') {
    if (isGet) {
      const date = isDate(url.searchParams.get('date') || '') ? url.searchParams.get('date') : today(tz);
      const s = zoned(date, '09:00', tz);
      return page(request, { app: APP, title: '新增行程', back: `/day/${date}`, body: editor(request, { title: '', location: '', note: '', all_day: 0, start: s.toISOString(), end: new Date(s.getTime() + 3600000).toISOString(), rrule: '' }, tz) });
    }
    const id = await insert(env.DB, fromForm(await readForm(request), tz));
    return redirect(`/e/${id}`);
  }
  m = /^\/e\/(\w+)(\/edit|\/delete)?$/.exec(p);
  if (!m) return null;
  const [, id, sub] = m;
  const e = await get(env.DB, id);
  if (isGet) {
    if (!sub) return detail(request, e, tz);
    if (sub === '/edit') return page(request, { app: APP, title: '編輯', back: `/e/${id}`, body: editor(request, e, tz) });
    return null;
  }
  if (!sub) {
    const n = fromForm(await readForm(request), tz);
    await env.DB.prepare('UPDATE events SET title = ?, location = ?, note = ?, all_day = ?, start = ?, end = ?, rrule = ?, updated_at = ? WHERE id = ? AND owner = ?')
      .bind(n.title, n.location, n.note, n.all_day, n.start, n.end, n.rrule, new Date().toISOString(), id, OWNER).run();
    return redirect(`/e/${id}`);
  }
  if (sub === '/delete') {
    await env.DB.prepare('DELETE FROM events WHERE id = ? AND owner = ?').bind(id, OWNER).run();
    return redirect(`/?m=${(e.all_day ? e.start : local(e.start, tz).date).slice(0, 7)}`);
  }
  return null;
});
