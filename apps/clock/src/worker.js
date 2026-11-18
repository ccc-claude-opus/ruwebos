// 時鐘：世界時鐘、頁面鬧鐘、碼錶與計時器（KV）。
//   GET  /                         世界時鐘
//   POST /cities                   新增城市
//   POST /cities/:index/delete     移除城市
//   GET  /alarms                   鬧鐘
//   POST /alarms                   新增鬧鐘
//   POST /alarms/:id/toggle        切換鬧鐘
//   POST /alarms/:id/delete        刪除鬧鐘
//   GET  /stopwatch                碼錶
//   GET  /timer                    計時器
//   GET  /api/time?tz=Area/City    查詢指定時區時間
import { app, page, html, redirect, readForm, tzOf, json, newId, UserError } from '../../_shared/lib.js';

const APP = { name: '時鐘', color: '#1971c2' };
const OWNER = 'me';
const TIME_ZONES = Intl.supportedValuesOf('timeZone');
const CLIENT_SCRIPT = html`<script src="/clock.js" defer></script>`;

function validTimeZone(tz) {
  if (!tz || typeof tz !== 'string' || tz.length > 100) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz }).format();
    return true;
  } catch {
    return false;
  }
}

function wallParts(date, tz) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, hh: +p.hour, mm: +p.minute, ss: +p.second };
}

function offsetMinutes(date, tz) {
  const p = wallParts(date, tz);
  const wall = Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss);
  const instant = Math.floor(date.getTime() / 1000) * 1000;
  return (wall - instant) / 60000;
}

function offsetText(difference) {
  if (!difference) return '相同';
  const sign = difference > 0 ? '+' : '-';
  const minutes = Math.abs(difference);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours && rest) return `${sign}${hours} 小時 ${rest} 分鐘`;
  if (hours) return `${sign}${hours} 小時`;
  return `${sign}${rest} 分鐘`;
}

function timeText(date, tz) {
  const p = wallParts(date, tz);
  return `${String(p.hh).padStart(2, '0')}:${String(p.mm).padStart(2, '0')}`;
}

function dateText(date, tz) {
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: tz,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(date);
}

function defaultCities(request) {
  return [
    { tz: tzOf(request), label: '本地' },
    { tz: 'Asia/Taipei', label: '台北' },
    { tz: 'Asia/Tokyo', label: '東京' },
    { tz: 'Europe/London', label: '倫敦' },
    { tz: 'America/New_York', label: '紐約' },
  ];
}

async function readCities(env) {
  const value = await env.KV.get('cities', 'json');
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value)) return [];
  return value
    .filter((c) => c && typeof c.tz === 'string' && validTimeZone(c.tz))
    .map((c) => ({ tz: c.tz, label: typeof c.label === 'string' ? c.label : '' }));
}

async function readAlarms(env) {
  const value = await env.KV.get('alarms', 'json');
  if (!Array.isArray(value)) return [];
  return value
    .filter((a) => a && typeof a.id === 'string' && typeof a.time === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(a.time))
    .map((a) => ({
      id: a.id,
      time: a.time,
      label: typeof a.label === 'string' ? a.label : '',
      days: Array.isArray(a.days) ? a.days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6) : [],
      on: a.on === true,
    }));
}

function tabs(active) {
  const tab = (label, href, name) => html`<a class="chip${active === name ? ' on' : ''}" href="${href}">${label}</a>`;
  return html`<nav class="row" aria-label="時鐘功能">
  ${tab('世界時鐘', '/', 'world')}
  ${tab('鬧鐘', '/alarms', 'alarms')}
  ${tab('碼錶', '/stopwatch', 'stopwatch')}
  ${tab('計時器', '/timer', 'timer')}
</nav>`;
}

async function worldPage(request, env) {
  const stored = await readCities(env);
  const cities = stored === null ? defaultCities(request) : stored;
  const viewer = tzOf(request);
  const now = new Date();
  const viewerOffset = offsetMinutes(now, viewer);
  const options = TIME_ZONES.map((zone) => html`<option value="${zone}"${zone === viewer ? ' selected' : ''}>${zone}</option>`);

  return page(request, {
    app: APP,
    title: '世界時鐘',
    body: html`
${tabs('world')}
<style>
.clock-time { display: block; margin: 6px 0; font-size: clamp(2.5rem, 9vw, 4.5rem); line-height: 1.1; font-weight: 750; font-variant-numeric: tabular-nums; }
.world-card { text-align: center; }
.world-card form { margin-top: 12px; }
</style>
<section id="world-clock" data-viewer-tz="${viewer}" data-tz="${viewer}" data-offset="${String(viewerOffset)}" class="grid" aria-label="世界時鐘">
  ${cities.map((city, index) => html`
  <article class="card world-card" data-city-index="${index}">
    <div class="spread"><strong>${city.label || city.tz}</strong><span class="muted small">${city.tz}</span></div>
    <time class="clock-time" data-tz="${city.tz}" data-offset="${String(offsetMinutes(now, city.tz))}" datetime="${now.toISOString()}">${timeText(now, city.tz)}</time>
    <div class="muted small" data-clock-date>${dateText(now, city.tz)}</div>
    <div class="muted small" data-clock-offset>${offsetText(offsetMinutes(now, city.tz) - viewerOffset)}</div>
    <form class="inline" method="post" action="/cities/${index}/delete" data-confirm="移除這個城市？"><button class="danger small" type="submit">移除</button></form>
  </article>`)}
</section>
<section class="section">新增城市</section>
<form class="card stack" method="post" action="/cities">
  <label>時區<select name="tz" required>${options}</select></label>
  <label>標籤（選填）<input name="label" maxlength="50" placeholder="例如：辦公室"></label>
  <div><button class="primary" type="submit">新增城市</button></div>
</form>
${CLIENT_SCRIPT}`,
  });
}

function weekdayText(days) {
  if (!days.length) return '每天';
  const names = ['日', '一', '二', '三', '四', '五', '六'];
  return `每週${days.map((d) => names[d]).join('、')}`;
}

async function alarmsPage(request, env) {
  const alarms = await readAlarms(env);
  return page(request, {
    app: APP,
    title: '鬧鐘',
    body: html`
${tabs('alarms')}
<style>
.alarm-banner { width: 100%; border-color: var(--app); }
.alarm-banner[hidden] { display: none; }
.alarm-item { align-items: flex-start; }
.alarm-item .row { justify-content: flex-end; }
fieldset { border: 1px solid var(--line); border-radius: var(--radius); margin: 0; padding: 12px; }
legend { color: var(--muted); padding: 0 6px; }
</style>
<section id="alarm-banner" class="card alarm-banner" role="alert" hidden>
  <div class="spread"><span id="alarm-message"></span><button id="alarm-close" type="button">關閉</button></div>
</section>
${alarms.length
  ? html`<ul class="list">${alarms.map((alarm) => html`
  <li class="alarm-item" data-alarm-id="${alarm.id}" data-alarm-time="${alarm.time}" data-alarm-days="${alarm.days.join(',')}" data-alarm-enabled="${String(alarm.on)}" data-alarm-label="${alarm.label}">
    <span class="grow"><strong>${alarm.label || '鬧鐘'}</strong><span class="sub">${alarm.time} · ${weekdayText(alarm.days)}</span></span>
    <span class="row">
      <form class="inline" method="post" action="/alarms/${alarm.id}/toggle"><button class="small" type="submit">${alarm.on ? '關閉' : '開啟'}</button></form>
      <form class="inline" method="post" action="/alarms/${alarm.id}/delete" data-confirm="刪除這則鬧鐘？"><button class="danger small" type="submit">刪除</button></form>
    </span>
  </li>`)}</ul>`
  : html`<p class="empty">還沒有鬧鐘，新增一則開始計時。</p>`}
<p class="muted">鬧鐘在這一頁開著時響；背景提醒等瀏覽器支援通知後加入</p>
<section class="section">新增鬧鐘</section>
<form class="card stack" method="post" action="/alarms">
  <label>時間<input type="time" name="time" required step="60"></label>
  <label>名稱（選填）<input name="label" maxlength="80" placeholder="例如：起床"></label>
  <fieldset>
    <legend>重複（不選為每天）</legend>
    <div class="row">
      <label class="check"><input type="checkbox" name="days" value="0">週日</label>
      <label class="check"><input type="checkbox" name="days" value="1">週一</label>
      <label class="check"><input type="checkbox" name="days" value="2">週二</label>
      <label class="check"><input type="checkbox" name="days" value="3">週三</label>
      <label class="check"><input type="checkbox" name="days" value="4">週四</label>
      <label class="check"><input type="checkbox" name="days" value="5">週五</label>
      <label class="check"><input type="checkbox" name="days" value="6">週六</label>
    </div>
  </fieldset>
  <div><button class="primary" type="submit">新增鬧鐘</button></div>
</form>
${CLIENT_SCRIPT}`,
  });
}

function stopwatchPage(request) {
  return page(request, {
    app: APP,
    title: '碼錶',
    body: html`
${tabs('stopwatch')}
<style>
.stopwatch-display, .timer-display { text-align: center; margin: 18px 0; font-size: clamp(3rem, 15vw, 6rem); line-height: 1.1; font-weight: 750; font-variant-numeric: tabular-nums; }
.stopwatch-controls, .timer-controls { justify-content: center; }
</style>
<section class="card">
  <div id="stopwatch-display" class="stopwatch-display" role="timer" aria-live="off">00:00.00</div>
  <div class="row stopwatch-controls">
    <button id="stopwatch-start" class="primary" type="button">開始</button>
    <button id="stopwatch-pause" type="button" disabled>暫停</button>
    <button id="stopwatch-reset" type="button">重設</button>
    <button id="stopwatch-lap" type="button">分圈</button>
  </div>
  <ul id="stopwatch-laps" class="list"></ul>
  <p id="stopwatch-note" class="muted">需要 JavaScript</p>
</section>
${CLIENT_SCRIPT}`,
  });
}

function timerPage(request) {
  return page(request, {
    app: APP,
    title: '計時器',
    body: html`
${tabs('timer')}
<style>
.stopwatch-display, .timer-display { text-align: center; margin: 18px 0; font-size: clamp(3rem, 15vw, 6rem); line-height: 1.1; font-weight: 750; font-variant-numeric: tabular-nums; }
.timer-controls { justify-content: center; }
.timer-presets { justify-content: center; margin-bottom: 14px; }
</style>
<section id="timer-banner" class="card alarm-banner" role="alert" hidden>
  <div class="spread"><span id="timer-message">計時器結束</span><button id="timer-close" type="button">關閉</button></div>
</section>
<section class="card">
  <div id="timer-display" class="timer-display" role="timer" aria-live="off">00:00.00</div>
  <div class="row timer-presets" aria-label="預設時間">
    <button class="chip timer-preset" type="button" data-timer-minutes="1">1 分鐘</button>
    <button class="chip timer-preset" type="button" data-timer-minutes="3">3 分鐘</button>
    <button class="chip timer-preset" type="button" data-timer-minutes="5">5 分鐘</button>
    <button class="chip timer-preset" type="button" data-timer-minutes="10">10 分鐘</button>
  </div>
  <div class="row">
    <label>分鐘<input id="timer-minutes" type="number" min="0" max="999" step="1" value="0"></label>
    <label>秒數<input id="timer-seconds" type="number" min="0" max="59" step="1" value="0"></label>
  </div>
  <div class="row timer-controls">
    <button id="timer-start" class="primary" type="button">開始</button>
    <button id="timer-pause" type="button" disabled>暫停</button>
    <button id="timer-reset" type="button">重設</button>
    <button id="timer-lap" type="button">分圈</button>
  </div>
  <p id="timer-error" class="error" hidden></p>
  <ul id="timer-laps" class="list"></ul>
  <p id="timer-note" class="muted">需要 JavaScript</p>
</section>
${CLIENT_SCRIPT}`,
  });
}

function fieldText(form, name) {
  const value = form[name];
  return typeof value === 'string' ? value.trim() : '';
}

function parseDays(value) {
  if (value === undefined) return [];
  const values = Array.isArray(value) ? value : [value];
  const days = [];
  for (const item of values) {
    if (!/^[0-6]$/.test(String(item))) throw new UserError('星期只能選擇 0 到 6。');
    const day = Number(item);
    if (!days.includes(day)) days.push(day);
  }
  return days.sort((a, b) => a - b);
}

async function addCity(request, env) {
  const form = await readForm(request);
  const tz = fieldText(form, 'tz');
  const label = fieldText(form, 'label');
  if (!validTimeZone(tz)) throw new UserError('請選擇有效的時區。');
  if (label.length > 50) throw new UserError('城市標籤不能超過 50 個字元。');
  const stored = await readCities(env);
  const cities = stored === null ? defaultCities(request) : stored;
  cities.push({ tz, label });
  await env.KV.put('cities', JSON.stringify(cities));
  return redirect('/');
}

async function deleteCity(request, env, index) {
  const stored = await readCities(env);
  const cities = stored === null ? defaultCities(request) : stored;
  if (!Number.isSafeInteger(index) || index < 0 || index >= cities.length) throw new UserError('找不到這個城市。');
  cities.splice(index, 1);
  await env.KV.put('cities', JSON.stringify(cities));
  return redirect('/');
}

async function addAlarm(request, env) {
  const form = await readForm(request);
  const time = fieldText(form, 'time');
  const label = fieldText(form, 'label');
  const days = parseDays(form.days);
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new UserError('請輸入有效的時間（HH:MM）。');
  if (label.length > 80) throw new UserError('鬧鐘名稱不能超過 80 個字元。');
  const alarms = await readAlarms(env);
  alarms.push({ id: newId(), time, label, days, on: true });
  await env.KV.put('alarms', JSON.stringify(alarms));
  return redirect('/alarms');
}

async function toggleAlarm(request, env, id) {
  const alarms = await readAlarms(env);
  const alarm = alarms.find((a) => a.id === id);
  if (!alarm) throw new UserError('找不到這則鬧鐘。');
  alarm.on = !alarm.on;
  await env.KV.put('alarms', JSON.stringify(alarms));
  return redirect('/alarms');
}

async function deleteAlarm(request, env, id) {
  const alarms = await readAlarms(env);
  const index = alarms.findIndex((a) => a.id === id);
  if (index < 0) throw new UserError('找不到這則鬧鐘。');
  alarms.splice(index, 1);
  await env.KV.put('alarms', JSON.stringify(alarms));
  return redirect('/alarms');
}

function apiTime(url) {
  const tz = url.searchParams.get('tz');
  if (!validTimeZone(tz)) return json({ error: '無效的時區。' }, 400);
  const now = new Date();
  const p = wallParts(now, tz);
  const local = `${String(p.y).padStart(4, '0')}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')} ${String(p.hh).padStart(2, '0')}:${String(p.mm).padStart(2, '0')}:${String(p.ss).padStart(2, '0')}`;
  return json({ tz, iso: now.toISOString(), local });
}

export default app(APP, async (request, env, url) => {
  const path = url.pathname;
  if (request.method === 'GET' && path === '/') return worldPage(request, env);
  if (request.method === 'GET' && path === '/alarms') return alarmsPage(request, env);
  if (request.method === 'GET' && path === '/stopwatch') return stopwatchPage(request);
  if (request.method === 'GET' && path === '/timer') return timerPage(request);
  if (request.method === 'GET' && path === '/api/time') return apiTime(url);
  if (request.method === 'POST' && path === '/cities') return addCity(request, env);
  if (request.method === 'POST' && path === '/alarms') return addAlarm(request, env);

  let match = /^\/cities\/(\d+)\/delete$/.exec(path);
  if (request.method === 'POST' && match) return deleteCity(request, env, Number(match[1]));
  match = /^\/alarms\/([A-Za-z0-9_-]+)\/toggle$/.exec(path);
  if (request.method === 'POST' && match) return toggleAlarm(request, env, match[1]);
  match = /^\/alarms\/([A-Za-z0-9_-]+)\/delete$/.exec(path);
  if (request.method === 'POST' && match) return deleteAlarm(request, env, match[1]);
  return null;
});
