// 天氣：資料來自 Open-Meteo（免金鑰，資料以 CC BY 4.0 授權，每一頁都標示來源）。
// KV：cities（城市清單）、fc:<緯度>,<經度>（預報快取 30 分鐘）。
//   GET  /                 每個城市的現在天氣
//   GET  /c/:id            一個城市：現在、24 小時、7 天        POST /c/:id/delete
//   GET  /search?q=        找城市（Open-Meteo 地理編碼）         POST /cities   加入
//   GET  /api/forecast?lat=&lon=   預報 JSON（快取）
import { app, page, html, redirect, readForm, json, newId, UserError } from '../../_shared/lib.js';

const APP = { name: '天氣', color: '#1c7ed6' };
const UA = { 'user-agent': 'ruwebos-weather/1.0' };
const DEFAULTS = [
  { id: 'taipei', name: '台北', admin: '', country: '台灣', lat: 25.033, lon: 121.5654, tz: 'Asia/Taipei' },
  { id: 'kinmen', name: '金門', admin: '', country: '台灣', lat: 24.4321, lon: 118.3171, tz: 'Asia/Taipei' },
];
const MAX_CITIES = 20;
const WEEK = ['日', '一', '二', '三', '四', '五', '六'];

// WMO 天氣代碼（Open-Meteo 文件的表）
function wmo(code, day = 1) {
  const t = {
    0: ['晴', day ? '☀️' : '🌙'], 1: ['大致晴朗', day ? '🌤' : '🌙'], 2: ['局部多雲', '⛅'], 3: ['陰', '☁️'],
    45: ['霧', '🌫'], 48: ['霧凇', '🌫'], 51: ['小毛毛雨', '🌦'], 53: ['毛毛雨', '🌦'], 55: ['大毛毛雨', '🌦'],
    56: ['凍毛毛雨', '🌧'], 57: ['凍毛毛雨', '🌧'], 61: ['小雨', '🌧'], 63: ['中雨', '🌧'], 65: ['大雨', '🌧'],
    66: ['凍雨', '🌧'], 67: ['凍雨', '🌧'], 71: ['小雪', '🌨'], 73: ['中雪', '🌨'], 75: ['大雪', '🌨'], 77: ['雪粒', '🌨'],
    80: ['陣雨', '🌦'], 81: ['陣雨', '🌦'], 82: ['強陣雨', '⛈'], 85: ['陣雪', '🌨'], 86: ['強陣雪', '🌨'],
    95: ['雷雨', '⛈'], 96: ['雷雨夾冰雹', '⛈'], 99: ['雷雨夾冰雹', '⛈'],
  }[code];
  return t ? { text: t[0], icon: t[1] } : { text: `天氣代碼 ${code}`, icon: '🌡' };
}

const credit = html`<p class="muted small" style="margin-top:24px">天氣資料：<a href="https://open-meteo.com/">Open-Meteo.com</a>（CC BY 4.0）</p>`;
const round = (n) => (typeof n === 'number' ? Math.round(n) : '–');

async function cities(env) {
  return (await env.KV.get('cities', 'json')) || DEFAULTS;
}

async function fetchJson(u) {
  const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

/** The forecast of a place (cached 30 minutes in KV): { data } or { error }. */
async function forecast(env, lat, lon) {
  const key = `fc:${lat.toFixed(3)},${lon.toFixed(3)}`;
  const cached = await env.KV.get(key, 'json');
  if (cached) return { data: cached };
  // 剛剛才失敗過：一分鐘內不再試，頁面不必每次都等到逾時
  const failed = await env.KV.get(`err:${key}`);
  if (failed) return { error: failed };
  const u = new URL('https://api.open-meteo.com/v1/forecast');
  u.search = new URLSearchParams({
    latitude: lat, longitude: lon,
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,is_day',
    hourly: 'temperature_2m,weather_code,precipitation_probability,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset',
    timezone: 'auto', forecast_days: '7', wind_speed_unit: 'kmh',
  }).toString();
  try {
    const data = await fetchJson(u);
    if (!data.current || !data.daily) throw new Error('回應的格式不對');
    await env.KV.put(key, JSON.stringify(data), { expirationTtl: 1800 });
    return { data };
  } catch (e) {
    const error = e.name === 'TimeoutError' ? '連線逾時' : e.message;
    await env.KV.put(`err:${key}`, error, { expirationTtl: 60 });
    return { error };
  }
}

const place = (c) => [c.admin, c.country].filter((x) => x && x !== c.name).join('，');

function currentBlock(c, d) {
  const now = wmo(d.current.weather_code, d.current.is_day);
  return html`<div class="row" style="gap:16px"><span style="font-size:56px;line-height:1">${now.icon}</span>
<div><div style="font-size:44px;font-weight:700;line-height:1.1">${round(d.current.temperature_2m)}°C</div>
<div>${now.text} · 最高 ${round(d.daily.temperature_2m_max[0])}° 最低 ${round(d.daily.temperature_2m_min[0])}°</div>
<div class="muted small">體感 ${round(d.current.apparent_temperature)}° · 濕度 ${round(d.current.relative_humidity_2m)}% · 風速 ${round(d.current.wind_speed_10m)} km/h</div></div></div>`;
}

async function home(request, env) {
  const list = await cities(env);
  const cards = await Promise.all(
    list.map(async (c) => {
      const f = await forecast(env, c.lat, c.lon);
      return html`<a class="card" href="/c/${c.id}" style="display:block;margin:0;color:inherit;text-decoration:none">
<strong>${c.name}</strong> <span class="muted small">${place(c)}</span>
${f.data ? currentBlock(c, f.data) : html`<p class="error">無法取得天氣資料：${f.error}</p>`}</a>`;
    }),
  );
  return page(request, {
    app: APP,
    actions: html`<a class="btn" href="/search">＋ 城市</a>`,
    body: html`<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(280px,1fr))">${cards}</div>${credit}`,
  });
}

async function cityPage(request, env, id) {
  const c = (await cities(env)).find((x) => x.id === id);
  if (!c) throw new UserError('找不到這個城市。');
  const f = await forecast(env, c.lat, c.lon);
  let body;
  if (!f.data) body = html`<p class="error">無法取得天氣資料：${f.error}</p>`;
  else {
    const d = f.data;
    // 接下來 24 小時：hourly.time 已經是當地時間（timezone=auto）
    const nowLocal = d.current.time.slice(0, 13);
    const from = Math.max(0, d.hourly.time.findIndex((t) => t.slice(0, 13) >= nowLocal));
    const hours = d.hourly.time.slice(from, from + 24).map((t, i) => {
      const j = from + i;
      const w = wmo(d.hourly.weather_code[j], d.hourly.is_day?.[j] ?? 1);
      return html`<div style="flex:none;width:64px;text-align:center"><div class="muted small">${t.slice(11, 13)}:00</div><div style="font-size:24px">${w.icon}</div><div><strong>${round(d.hourly.temperature_2m[j])}°</strong></div><div class="muted small">${d.hourly.precipitation_probability?.[j] ? `💧${d.hourly.precipitation_probability[j]}%` : ''}</div></div>`;
    });
    const days = d.daily.time.map((t, i) => {
      const w = wmo(d.daily.weather_code[i]);
      const dow = new Date(`${t}T00:00:00Z`).getUTCDay();
      return html`<tr><th>${i === 0 ? '今天' : `星期${WEEK[dow]}`}<span class="muted small" style="display:block">${+t.slice(5, 7)}/${+t.slice(8)}</span></th>
<td>${w.icon} ${w.text}</td><td>${round(d.daily.temperature_2m_min[i])}° – <strong>${round(d.daily.temperature_2m_max[i])}°</strong></td>
<td class="muted">💧${d.daily.precipitation_probability_max?.[i] ?? '–'}%</td><td class="muted small">🌅 ${d.daily.sunrise[i].slice(11, 16)}　🌇 ${d.daily.sunset[i].slice(11, 16)}</td></tr>`;
    });
    body = html`<div class="card">${currentBlock(c, d)}</div>
<p class="section">24 小時</p>
<div class="card" style="display:flex;overflow-x:auto;gap:4px">${hours}</div>
<p class="section">7 天</p>
<table>${days}</table>
<p class="muted small">更新時間：${d.current.time.replace('T', ' ')}（${d.timezone}）</p>`;
  }
  return page(request, {
    app: APP,
    title: c.name,
    back: '/',
    body: html`<h2>${c.name} <span class="muted small">${place(c)}</span></h2>${body}
<form method="post" action="/c/${c.id}/delete" data-confirm="移除「${c.name}」？" style="margin-top:16px"><button class="danger" type="submit">移除這個城市</button></form>${credit}`,
  });
}

async function searchPage(request, url) {
  const q = (url.searchParams.get('q') || '').trim().slice(0, 100);
  let results = null;
  let error = '';
  if (q) {
    try {
      const u = new URL('https://geocoding-api.open-meteo.com/v1/search');
      u.search = new URLSearchParams({ name: q, count: '10', language: 'zh', format: 'json' }).toString();
      results = (await fetchJson(u)).results || [];
    } catch (e) {
      error = e.name === 'TimeoutError' ? '連線逾時' : e.message;
    }
  }
  return page(request, {
    app: APP,
    title: '加入城市',
    back: '/',
    body: html`<form class="search" method="get" action="/search"><input type="search" name="q" value="${q}" placeholder="城市名稱（中文或英文，例如 台北、Kinmen）" autofocus><button type="submit">搜尋</button></form>
${error ? html`<p class="error">無法搜尋：${error}</p>` : ''}
${results && !results.length ? html`<p class="empty">找不到「${q}」，試試英文名稱。</p>` : ''}
${results && results.length
  ? html`<ul class="list">${results.map((r) => html`<li><span class="grow"><strong>${r.name}</strong><span class="sub">${[r.admin1, r.country].filter(Boolean).join('，')} · ${r.latitude.toFixed(2)}, ${r.longitude.toFixed(2)}</span></span>
<form class="inline" method="post" action="/cities">${['name', 'admin', 'country', 'lat', 'lon', 'tz'].map((k, i) => html`<input type="hidden" name="${k}" value="${[r.name, r.admin1 || '', r.country || '', r.latitude, r.longitude, r.timezone || 'UTC'][i]}">`)}<button class="small primary" type="submit">加入</button></form></li>`)}</ul>`
  : ''}${credit}`,
  });
}

async function addCity(request, env) {
  const f = await readForm(request);
  const name = String(f.name || '').trim().slice(0, 100);
  const lat = Number(f.lat);
  const lon = Number(f.lon);
  if (!name) throw new UserError('城市名稱不能是空的。');
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180 || f.lat === '' || f.lon === '') throw new UserError('經緯度不對。');
  let tz = String(f.tz || 'UTC');
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
  } catch {
    tz = 'UTC';
  }
  const list = await cities(env);
  if (list.length >= MAX_CITIES) throw new UserError(`最多 ${MAX_CITIES} 個城市。`);
  const same = (c) => c.lat.toFixed(2) === lat.toFixed(2) && c.lon.toFixed(2) === lon.toFixed(2);
  if (list.some(same)) throw new UserError(`已經有「${list.find(same).name}」了。`);
  list.push({ id: newId(), name, admin: String(f.admin || '').slice(0, 100), country: String(f.country || '').slice(0, 100), lat, lon, tz });
  await env.KV.put('cities', JSON.stringify(list));
  return redirect('/');
}

export default app(APP, async (request, env, url) => {
  const p = url.pathname;
  if (request.method === 'GET') {
    if (p === '/') return home(request, env);
    if (p === '/search') return searchPage(request, url);
    if (p === '/api/forecast') {
      const lat = Number(url.searchParams.get('lat'));
      const lon = Number(url.searchParams.get('lon'));
      if (!Number.isFinite(lat) || Math.abs(lat) > 90 || !Number.isFinite(lon) || Math.abs(lon) > 180) return json({ error: 'lat、lon 不對' }, 400);
      const f = await forecast(env, lat, lon);
      return f.data ? json(f.data) : json({ error: f.error }, 502);
    }
    const m = /^\/c\/(\w+)$/.exec(p);
    if (m) return cityPage(request, env, m[1]);
    return null;
  }
  if (request.method !== 'POST') return null;
  if (p === '/cities') return addCity(request, env);
  const m = /^\/c\/(\w+)\/delete$/.exec(p);
  if (!m) return null;
  const list = await cities(env);
  if (!list.some((c) => c.id === m[1])) throw new UserError('找不到這個城市。');
  await env.KV.put('cities', JSON.stringify(list.filter((c) => c.id !== m[1])));
  return redirect('/');
});
