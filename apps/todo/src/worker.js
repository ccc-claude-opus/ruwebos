// 待辦：任務、清單、重複事項與日曆 API（D1）。頁面由伺服器產生，表單送出；/_ui/enhance.js 讓它不用整頁重載。
//   GET  /?view=&list=        首頁（今天、已排程、全部、已完成、清單）
//   POST /add                 快速新增
//   GET  /t/:id               編輯       POST /t/:id                儲存
//   POST /t/:id/toggle        完成切換   POST /t/:id/delete         刪除
//   GET  /lists               清單       POST /lists                新增
//   POST /lists/:id           重新命名   POST /lists/:id/delete     刪除
//   GET  /api/due?from=&to=   日曆待辦
import { app, page, html, redirect, readForm, tzOf, today, newId, UserError, json } from '../../_shared/lib.js';

const APP = { name: '待辦', color: '#2f9e44' };
const OWNER = 'me';
const REPEATS = ['', 'daily', 'weekly', 'monthly', 'yearly'];

function textField(form, key, label) {
  const value = form[key];
  if (value === undefined || value === null) return '';
  if (Array.isArray(value) || typeof value !== 'string') throw new UserError(`${label}格式不正確。`);
  return value;
}

function isDate(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const y = +m[1];
  const month = +m[2];
  const day = +m[3];
  if (y < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= days[month - 1];
}

function titleOf(form) {
  const title = textField(form, 'title', '標題').trim();
  if (!title) throw new UserError('標題不能是空的。');
  if (title.length > 200) throw new UserError('標題不能超過 200 個字元。');
  return title;
}

function noteOf(form) {
  const note = textField(form, 'note', '備註');
  if (note.length > 10000) throw new UserError('備註不能超過 10000 個字元。');
  return note;
}

function dueOf(form) {
  const due = textField(form, 'due', '到期日').trim();
  if (due && !isDate(due)) throw new UserError('到期日格式不正確。');
  return due;
}

function repeatOf(form) {
  const repeat = textField(form, 'repeat', '重複方式').trim();
  if (!REPEATS.includes(repeat)) throw new UserError('重複方式不正確。');
  return repeat;
}

function listIdOf(form) {
  let id = textField(form, 'list_id', '清單').trim();
  if (!id) id = textField(form, 'list', '清單').trim();
  if (id.length > 64 || (id && !/^[\w-]+$/.test(id))) throw new UserError('清單格式不正確。');
  return id;
}

function listNameOf(form) {
  const name = textField(form, 'name', '清單名稱').trim();
  if (!name) throw new UserError('清單名稱不能是空的。');
  if (name.length > 60) throw new UserError('清單名稱不能超過 60 個字元。');
  return name;
}

function daysInMonth(year, month) {
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return days[month - 1];
}

function addDays(date, count) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + count);
  const year = d.getUTCFullYear();
  if (year < 1 || year > 9999) throw new UserError('下一次到期日超出可表示範圍。');
  return `${String(year).padStart(4, '0')}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function addMonths(date, count) {
  const [year, month, day] = date.split('-').map(Number);
  const total = year * 12 + month - 1 + count;
  const nextYear = Math.floor(total / 12);
  const nextMonth = total % 12 + 1;
  if (nextYear < 1 || nextYear > 9999) throw new UserError('下一次到期日超出可表示範圍。');
  const nextDay = Math.min(day, daysInMonth(nextYear, nextMonth));
  return `${String(nextYear).padStart(4, '0')}-${String(nextMonth).padStart(2, '0')}-${String(nextDay).padStart(2, '0')}`;
}

function nextOccurrence(task, currentDate) {
  if (!task.due) return currentDate;
  if (!isDate(task.due)) throw new UserError('到期日格式不正確。');
  if (task.repeat === 'daily') return addDays(task.due, 1);
  if (task.repeat === 'weekly') return addDays(task.due, 7);
  if (task.repeat === 'monthly') return addMonths(task.due, 1);
  if (task.repeat === 'yearly') return addMonths(task.due, 12);
  throw new UserError('重複方式不正確。');
}

async function getTask(db, id) {
  const task = await db.prepare('SELECT * FROM tasks WHERE id = ? AND owner = ?').bind(id, OWNER).first();
  if (!task) throw new UserError('找不到這個待辦。');
  return task;
}

async function getList(db, id) {
  const list = await db.prepare('SELECT * FROM lists WHERE id = ? AND owner = ?').bind(id, OWNER).first();
  if (!list) throw new UserError('找不到這個清單。');
  return list;
}

async function listsOf(db) {
  return (await db.prepare('SELECT id, name FROM lists WHERE owner = ? ORDER BY name, id').bind(OWNER).all()).results;
}

async function countsOf(db) {
  const rows = (await db.prepare('SELECT list_id, COUNT(*) AS n FROM tasks WHERE owner = ? AND list_id IS NOT NULL GROUP BY list_id').bind(OWNER).all()).results;
  return new Map(rows.map((row) => [row.list_id, row.n]));
}

function listOptions(lists, selected = '') {
  const options = [
    selected ? html`<option value="">無清單</option>` : html`<option value="" selected>無清單</option>`,
  ];
  for (const list of lists) {
    options.push(list.id === selected
      ? html`<option value="${list.id}" selected>${list.name}</option>`
      : html`<option value="${list.id}">${list.name}</option>`);
  }
  return options;
}

function repeatOptions(selected = '') {
  const options = [['', '不重複'], ['daily', '每天'], ['weekly', '每週'], ['monthly', '每月'], ['yearly', '每年']];
  return options.map(([value, label]) => value === selected
    ? html`<option value="${value}" selected>${label}</option>`
    : html`<option value="${value}">${label}</option>`);
}

function chip(label, href, on) {
  return html`<a class="chip${on ? ' on' : ''}" href="${href}">${label}</a>`;
}

function taskItem(task, currentDate) {
  const overdue = Boolean(task.due && !task.done && task.due < currentDate);
  const due = !task.due
    ? '無到期日'
    : overdue
      ? html`到期：<span class="error">${task.due}（逾期）</span>`
      : html`到期：${task.due}`;
  return html`<li>
  <form class="inline" method="post" action="/t/${task.id}/toggle">
    <button class="task-check" type="submit" aria-label="${task.done ? '標記為未完成' : '標記為完成'}" aria-pressed="${task.done ? 'true' : 'false'}">${task.done ? '☑' : '☐'}</button>
  </form>
  <a class="main" href="/t/${task.id}"><span class="grow"><strong>${task.title}</strong><span class="sub">${due}${task.list_name ? ` · 清單：${task.list_name}` : ''}</span></span></a>
</li>`;
}

function taskEditor(task, lists) {
  const selectedList = task.list_id || '';
  return html`<form class="stack" method="post" action="/t/${task.id}">
  <label>標題<input name="title" value="${task.title}" required maxlength="200" autofocus></label>
  <label>備註<textarea name="note" rows="8" maxlength="10000">${task.note}</textarea></label>
  <div class="grid">
    <label>到期日<input type="date" name="due" value="${task.due}"></label>
    <label>重複<select name="repeat">${repeatOptions(task.repeat)}</select></label>
    <label>清單<select name="list_id">${listOptions(lists, selectedList)}</select></label>
  </div>
  <div class="row"><button class="primary" type="submit">儲存</button><a class="btn" href="/">取消</a></div>
</form>`;
}

async function home(request, env, url) {
  const tz = tzOf(request);
  const currentDate = today(tz);
  const view = url.searchParams.get('view') || 'all';
  if (!['today', 'scheduled', 'all', 'done'].includes(view)) throw new UserError('檢視方式不正確。');
  const selectedList = (url.searchParams.get('list') || '').trim();
  if (selectedList && (selectedList.length > 64 || !/^[\w-]+$/.test(selectedList))) throw new UserError('清單格式不正確。');

  const lists = await listsOf(env.DB);
  const listMap = new Map(lists.map((list) => [list.id, list.name]));
  if (selectedList && !listMap.has(selectedList)) throw new UserError('找不到這個清單。');

  let sql = 'SELECT id, list_id, title, note, due, done, done_at, repeat, created_at FROM tasks WHERE owner = ?';
  const args = [OWNER];
  if (view === 'today') {
    sql += " AND done = 0 AND due != '' AND due <= ?";
    args.push(currentDate);
  } else if (view === 'scheduled') {
    sql += " AND done = 0 AND due != ''";
  } else if (view === 'done') {
    sql += ' AND done = 1';
  } else {
    sql += ' AND done = 0';
  }
  if (selectedList) {
    sql += ' AND list_id = ?';
    args.push(selectedList);
  }
  if (view === 'done') {
    sql += ' ORDER BY done_at DESC, created_at DESC LIMIT 200';
  } else if (view === 'all') {
    sql += " ORDER BY CASE WHEN due = '' THEN 1 ELSE 0 END, due, created_at DESC, id";
  } else {
    sql += ' ORDER BY due, created_at DESC, id';
  }

  const tasks = (await env.DB.prepare(sql).bind(...args).all()).results.map((task) => ({
    ...task,
    list_name: listMap.get(task.list_id) || '',
  }));
  const listSuffix = selectedList ? `&list=${encodeURIComponent(selectedList)}` : '';
  const viewChips = [
    chip('今天', `/?view=today${listSuffix}`, view === 'today'),
    chip('已排程', `/?view=scheduled${listSuffix}`, view === 'scheduled'),
    chip('全部', `/?view=all${listSuffix}`, view === 'all'),
    chip('已完成', `/?view=done${listSuffix}`, view === 'done'),
  ];
  const listChips = lists.map((list) => chip(list.name, `/?list=${encodeURIComponent(list.id)}`, selectedList === list.id));

  let content;
  if (view === 'scheduled') {
    const groups = new Map();
    for (const task of tasks) {
      if (!groups.has(task.due)) groups.set(task.due, []);
      groups.get(task.due).push(task);
    }
    content = groups.size
      ? [...groups.entries()].map(([date, items]) => html`<h2 class="section">${date}</h2><ul class="list">${items.map((task) => taskItem(task, currentDate))}</ul>`)
      : html`<p class="empty">沒有已排程的待辦。</p>`;
  } else {
    const heading = view === 'today' ? '今天' : view === 'done' ? '已完成' : '全部待辦';
    content = html`<h2 class="section">${heading}</h2>${tasks.length
      ? html`<ul class="list">${tasks.map((task) => taskItem(task, currentDate))}</ul>`
      : html`<p class="empty">${view === 'done' ? '還沒有已完成的待辦。' : '目前沒有待辦。'}</p>`}`;
  }

  return page(request, {
    app: APP,
    actions: html`<a class="btn" href="/lists">清單</a>`,
    body: html`
<style>
.task-check { width: 2.35rem; min-width: 2.35rem; padding: 0; font-size: 1.35rem; line-height: 1; }
</style>
<p class="row">${viewChips}${listChips}</p>
<form class="card stack" method="post" action="/add">
  <h2>快速新增</h2>
  <div class="grid">
    <label>標題<input name="title" required maxlength="200" placeholder="要做什麼？"></label>
    <label>到期日<input type="date" name="due"></label>
    <label>清單<select name="list_id">${listOptions(lists)}</select></label>
  </div>
  <button class="primary" type="submit">新增待辦</button>
</form>
${content}`,
  });
}

async function addTask(request, env) {
  const form = await readForm(request);
  const title = titleOf(form);
  const due = dueOf(form);
  const listId = listIdOf(form);
  if (listId) await getList(env.DB, listId);
  const id = newId();
  const now = new Date().toISOString();
  await env.DB.prepare("INSERT INTO tasks (id, owner, list_id, title, note, due, done, done_at, repeat, created_at) VALUES (?, ?, ?, ?, '', ?, 0, NULL, '', ?)").bind(id, OWNER, listId || null, title, due, now).run();
  return redirect(`/t/${id}`);
}

async function taskPage(request, env, id) {
  const task = await getTask(env.DB, id);
  const lists = await listsOf(env.DB);
  return page(request, {
    app: APP,
    title: '編輯待辦',
    back: '/',
    body: html`
<style>
.task-check { width: 2.35rem; min-width: 2.35rem; padding: 0; font-size: 1.35rem; line-height: 1; }
</style>
<h1>${task.title}</h1>
${taskEditor(task, lists)}
<div class="row"><form class="inline" method="post" action="/t/${task.id}/delete" data-confirm="刪除這個待辦？"><button class="danger" type="submit">刪除待辦</button></form></div>`,
  });
}

async function saveTask(request, env, id) {
  const task = await getTask(env.DB, id);
  const form = await readForm(request);
  const title = titleOf(form);
  const note = noteOf(form);
  const due = dueOf(form);
  const repeat = repeatOf(form);
  const listId = listIdOf(form);
  if (listId) await getList(env.DB, listId);
  await env.DB.prepare('UPDATE tasks SET title = ?, note = ?, due = ?, repeat = ?, list_id = ? WHERE id = ? AND owner = ?').bind(title, note, due, repeat, listId || null, task.id, OWNER).run();
  return redirect(`/t/${task.id}`);
}

async function toggleTask(request, env, id) {
  const task = await getTask(env.DB, id);
  const now = new Date().toISOString();
  if (task.done) {
    await env.DB.prepare('UPDATE tasks SET done = 0, done_at = NULL WHERE id = ? AND owner = ?').bind(task.id, OWNER).run();
    return redirect('/');
  }

  if (task.repeat) {
    const due = nextOccurrence(task, today(tzOf(request)));
    const nextId = newId();
    await env.DB.batch([
      env.DB.prepare('UPDATE tasks SET done = 1, done_at = ? WHERE id = ? AND owner = ?').bind(now, task.id, OWNER),
      env.DB.prepare("INSERT INTO tasks (id, owner, list_id, title, note, due, done, done_at, repeat, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, NULL, ?, ?)").bind(nextId, OWNER, task.list_id || null, task.title, task.note, due, task.repeat, now),
    ]);
  } else {
    await env.DB.prepare('UPDATE tasks SET done = 1, done_at = ? WHERE id = ? AND owner = ?').bind(now, task.id, OWNER).run();
  }
  return redirect('/');
}

async function deleteTask(request, env, id) {
  const task = await getTask(env.DB, id);
  await env.DB.prepare('DELETE FROM tasks WHERE id = ? AND owner = ?').bind(task.id, OWNER).run();
  return redirect('/');
}

async function listsPage(request, env) {
  const lists = await listsOf(env.DB);
  const counts = await countsOf(env.DB);
  return page(request, {
    app: APP,
    title: '清單',
    back: '/',
    body: html`
<div class="card">
  <h2>新增清單</h2>
  <form class="stack" method="post" action="/lists">
    <label>名稱<input name="name" required maxlength="60" placeholder="例如：工作"></label>
    <button class="primary" type="submit">建立清單</button>
  </form>
</div>
${lists.length ? lists.map((list) => html`
<section class="card">
  <div class="spread"><h2>${list.name}</h2><span class="chip">${counts.get(list.id) || 0} 項待辦</span></div>
  <form class="stack" method="post" action="/lists/${list.id}">
    <label>名稱<input name="name" value="${list.name}" required maxlength="60"></label>
    <button type="submit">重新命名</button>
  </form>
  <form class="inline" method="post" action="/lists/${list.id}/delete" data-confirm="刪除這個清單？其中的待辦會移到「無清單」。"><button class="danger" type="submit">刪除清單</button></form>
</section>`) : html`<p class="empty">還沒有清單。</p>`}`,
  });
}

async function createList(request, env) {
  const form = await readForm(request);
  const name = listNameOf(form);
  const id = newId();
  const now = new Date().toISOString();
  await env.DB.prepare('INSERT INTO lists (id, owner, name, created_at) VALUES (?, ?, ?, ?)').bind(id, OWNER, name, now).run();
  return redirect('/lists');
}

async function renameList(request, env, id) {
  await getList(env.DB, id);
  const form = await readForm(request);
  const name = listNameOf(form);
  await env.DB.prepare('UPDATE lists SET name = ? WHERE id = ? AND owner = ?').bind(name, id, OWNER).run();
  return redirect('/lists');
}

async function deleteList(request, env, id) {
  await getList(env.DB, id);
  await env.DB.batch([
    env.DB.prepare('UPDATE tasks SET list_id = NULL WHERE owner = ? AND list_id = ?').bind(OWNER, id),
    env.DB.prepare('DELETE FROM lists WHERE id = ? AND owner = ?').bind(id, OWNER),
  ]);
  return redirect('/lists');
}

async function dueApi(request, env, url) {
  const from = (url.searchParams.get('from') || '').trim();
  const to = (url.searchParams.get('to') || '').trim();
  if (!isDate(from) || !isDate(to)) throw new UserError('請提供有效的起始與結束日期。');
  if (from > to) throw new UserError('起始日期不能晚於結束日期。');
  const tasks = (await env.DB.prepare("SELECT id, title, due, done FROM tasks WHERE owner = ? AND due != '' AND due >= ? AND due <= ? ORDER BY due, created_at, id").bind(OWNER, from, to).all()).results;
  return json({
    tasks: tasks.map((task) => ({
      id: task.id,
      title: task.title,
      due: task.due,
      done: Number(task.done),
    })),
  });
}

export default app(APP, async (request, env, url) => {
  const p = url.pathname;
  const get = request.method === 'GET';

  if (p === '/' && get) return home(request, env, url);
  if (p === '/add' && request.method === 'POST') return addTask(request, env);
  if (p === '/lists' && get) return listsPage(request, env);
  if (p === '/lists' && request.method === 'POST') return createList(request, env);
  if (p === '/api/due' && get) return dueApi(request, env, url);

  let m = /^\/lists\/([\w-]+)$/.exec(p);
  if (m && request.method === 'POST') return renameList(request, env, m[1]);
  m = /^\/lists\/([\w-]+)\/delete$/.exec(p);
  if (m && request.method === 'POST') return deleteList(request, env, m[1]);

  m = /^\/t\/([\w-]+)$/.exec(p);
  if (m && get) return taskPage(request, env, m[1]);
  if (m && request.method === 'POST') return saveTask(request, env, m[1]);

  m = /^\/t\/([\w-]+)\/toggle$/.exec(p);
  if (m && request.method === 'POST') return toggleTask(request, env, m[1]);
  m = /^\/t\/([\w-]+)\/delete$/.exec(p);
  if (m && request.method === 'POST') return deleteTask(request, env, m[1]);

  return null;
});
