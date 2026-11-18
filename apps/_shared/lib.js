// Shared server-side helpers for the ruwebos apps (imported as ../../_shared/lib.js; rucloud.toml
// gives every app allow_read on this folder). Pages are rendered on the server; /_ui/enhance.js turns
// form posts and links into fetch + page swaps when the browser can (progressive enhancement).
import { assets } from './assets.js';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

class Safe {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}

/** Already-escaped HTML (use only for markup you built yourself). */
export const raw = (s) => new Safe(String(s));

export const escape = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

function piece(v) {
  if (v instanceof Safe) return v.s;
  if (Array.isArray(v)) return v.map(piece).join('');
  if (v === null || v === undefined || v === false) return '';
  return escape(v);
}

/** Tagged template: interpolated values are escaped unless they come from html``/raw(); arrays are joined. */
export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += piece(values[i]) + strings[i + 1];
  return new Safe(out);
}

/** The home screen: the same edge port, host localhost. */
export function homeUrl(request) {
  const u = new URL(request.url);
  return `${u.protocol}//localhost${u.port ? ':' + u.port : ''}/`;
}

/**
 * A full HTML page.
 *   app     { name, color }           shown in the top bar; color is the app's accent
 *   title   page title (after the app name)
 *   body    html`` content of <main>
 *   actions html`` buttons/links on the right of the bar
 *   back    URL of the parent page (shows ‹ in the bar)
 */
export function page(request, { app, title = '', body, actions = '', back = '', status = 200, headers = {} }) {
  const doc = html`<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title ? `${title} · ${app.name}` : app.name}</title>
<meta name="theme-color" content="${app.color}">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/_ui/ui.css">
<script src="/_ui/enhance.js" defer></script>
</head>
<body style="--app: ${app.color}">
<header class="bar">
  <a class="home" href="${homeUrl(request)}" title="主畫面" aria-label="主畫面">⌂</a>
  ${back ? html`<a class="back" href="${back}" aria-label="返回">‹</a>` : ''}
  <a class="app-name" href="/">${app.name}</a>
  ${title ? html`<span class="title">${title}</span>` : ''}
  <nav class="actions">${actions}</nav>
</header>
<main id="main">
${body}
</main>
</body>
</html>`;
  return new Response(doc.s, { status, headers: { 'content-type': 'text/html; charset=utf-8', ...headers } });
}

/** After a POST: 303 to a GET page (post/redirect/get). */
export const redirect = (location, status = 303) => new Response(null, { status, headers: { location } });

export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

/** Form fields as an object of strings (files stay File objects; repeated names become arrays). */
export async function readForm(request) {
  // 沒有表單內容（例如只有按鈕的 POST 由腳本送出、沒有 Content-Type）
  if (!/form-data|x-www-form-urlencoded/i.test(request.headers.get('content-type') || '')) return {};
  const fd = await request.formData();
  const out = {};
  for (const [k, v] of fd.entries()) {
    if (k in out) out[k] = [].concat(out[k], v);
    else out[k] = v;
  }
  return out;
}

/** GET /_ui/ui.css and /_ui/enhance.js (served by the Worker, so every app has them on its own origin). */
export function shared(url) {
  const a = assets[url.pathname];
  if (!a) return null;
  return new Response(a.body, { headers: { 'content-type': a.type, 'cache-control': 'public, max-age=300' } });
}

/** The viewer's time zone: the `tz` cookie set by enhance.js, else the system's (TZ, set by /sbin/init), else UTC. */
export function tzOf(request) {
  const m = /(?:^|;\s*)tz=([^;]+)/.exec(request.headers.get('cookie') || '');
  const tz = m ? decodeURIComponent(m[1]) : Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return tz;
  } catch {
    return 'UTC';
  }
}

/** Formats a Date / ISO string in a time zone, zh-TW style. */
export function fmt(date, tz, opts = { dateStyle: 'medium', timeStyle: 'short' }) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('zh-TW', { timeZone: tz, ...opts }).format(d);
}

/** The local wall-clock parts of an instant in a time zone: { y, m, d, hh, mm, dow } (m is 1-12, dow 0=Sun). */
export function parts(date, tz) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric',
    weekday: 'short', hourCycle: 'h23',
  });
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday);
  return { y: +p.year, m: +p.month, d: +p.day, hh: +p.hour, mm: +p.minute, dow };
}

/** The UTC instant of a local wall-clock time in a time zone ("2026-11-18", "09:30"). */
export function zoned(dateStr, timeStr, tz) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = (timeStr || '00:00').split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  // shift by the zone's offset at that instant (twice, for DST edges)
  let t = guess;
  for (let i = 0; i < 2; i++) {
    const p = parts(new Date(t), tz);
    t += guess - Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm);
  }
  return new Date(t);
}

/** Today's date in a time zone as YYYY-MM-DD. */
export function today(tz) {
  const p = parts(new Date(), tz);
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

export function notFound(request, app) {
  return page(request, { app, title: '找不到', status: 404, body: html`<p class="empty">找不到這一頁。</p><p><a class="btn" href="/">回到${app.name}</a></p>` });
}

/**
 * The usual Worker entry: shared assets, then the app's handler; errors become a page.
 *   export default app({ name, color }, async (request, env, url) => Response | null)
 */
export function app(info, handler) {
  return {
    async fetch(request, env, ctx) {
      const url = new URL(request.url);
      const s = request.method === 'GET' ? shared(url) : null;
      if (s) return s;
      try {
        return (await handler(request, env, url, ctx)) || notFound(request, info);
      } catch (e) {
        if (e instanceof UserError) {
          return page(request, { app: info, title: '無法完成', status: 400, body: html`<p class="error">${e.message}</p><p><a class="btn" href="/">回到${info.name}</a></p>` });
        }
        console.error(e);
        return page(request, { app: info, title: '錯誤', status: 500, body: html`<p class="error">發生錯誤：${e.message}</p>` });
      }
    },
  };
}

/** An error to show to the user as-is (bad input), with status 400. */
export class UserError extends Error {}

/** A new random id (URL-safe). */
export const newId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 16);
