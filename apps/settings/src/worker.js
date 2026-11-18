// 設定：系統資訊、已安裝的應用、授權清單。
//   GET /           系統（版本、資料碟、時區）
//   GET /apps       應用清單（rucloud 管理埠的 /apps 與 /stats）
//   GET /licenses   映像裡每個套件的授權（建置時產生的 public/licenses.md）
// 系統資訊與管理埠的網址、token 由 /sbin/init 寫進 env_file（SYS_*、ADMIN_URL、ADMIN_TOKEN）；
// 直接在主機上跑（開發）時沒有這些值，頁面會註明。
import { app, page, html, raw, homeUrl, tzOf, fmt } from '../../_shared/lib.js';
import { markdown } from '../../_shared/markdown.js';

const APP = { name: '設定', color: '#868e96' };

const tabs = (url) =>
  html`<p class="row">${[
    ['/', '系統'],
    ['/apps', '應用'],
    ['/licenses', '授權'],
  ].map(([href, label]) => html`<a class="chip${url.pathname === href ? ' on' : ''}" href="${href}">${label}</a>`)}</p>`;

async function admin(env, path) {
  if (!env.ADMIN_URL) return null;
  const r = await fetch(env.ADMIN_URL + path, { headers: env.ADMIN_TOKEN ? { authorization: `Bearer ${env.ADMIN_TOKEN}` } : {} });
  if (!r.ok) throw new Error(`管理埠 ${path}：${r.status}`);
  return r.json();
}

function system(request, env, url) {
  const tz = tzOf(request);
  const rows = [
    ['作業系統', env.SYS_OS],
    ['核心', env.SYS_KERNEL],
    ['CPU', env.SYS_CPUS && `${env.SYS_CPUS} 個`],
    ['Node.js', env.SYS_NODE],
    ['rucloud', env.SYS_RUCLOUD],
    ['開機次數', env.SYS_BOOT],
    ['這次開機', env.SYS_BOOTED_AT && fmt(env.SYS_BOOTED_AT, tz)],
    ['資料碟（開機時）', env.SYS_DATA],
  ];
  const dev = !env.SYS_OS;
  return page(request, {
    app: APP,
    body: html`${tabs(url)}
<h2>系統</h2>
${dev ? html`<p class="muted">（直接在主機上執行，沒有系統資訊；在 ruwebos 裡由 /sbin/init 提供。）</p>` : ''}
<table>${rows.filter(([, v]) => v).map(([k, v]) => html`<tr><th>${k}</th><td>${v}</td></tr>`)}</table>
<h2>外觀與地區</h2>
<table>
  <tr><th>時區</th><td>${tz}（取自瀏覽器）</td></tr>
  <tr><th>現在時間</th><td>${fmt(new Date(), tz, { dateStyle: 'full', timeStyle: 'medium' })}</td></tr>
  <tr><th>深色模式</th><td>跟隨瀏覽器與作業系統（prefers-color-scheme）</td></tr>
</table>
<h2>關於</h2>
<p>ruwebos：以瀏覽器為介面的系統。<a href="https://github.com/ccc-claude-opus/ruwebos">原始碼</a> ·
<a href="${homeUrl(request)}">主畫面</a></p>`,
  });
}

async function apps(request, env, url) {
  let list, stats, error;
  try {
    [list, stats] = await Promise.all([admin(env, '/apps'), admin(env, '/stats')]);
  } catch (e) {
    error = e.message;
  }
  const byName = new Map((stats?.apps || []).map((a) => [a.name, a]));
  const edge = new URL(request.url);
  const link = (a) => (a.hosts?.[0] ? `${edge.protocol}//${a.hosts[0]}${edge.port ? ':' + edge.port : ''}/` : `${edge.protocol}//${a.name}.localhost${edge.port ? ':' + edge.port : ''}/`);
  return page(request, {
    app: APP,
    title: '應用',
    body: html`${tabs(url)}
<h2>已安裝的應用</h2>
${error ? html`<p class="error">${error}</p>` : ''}
${!list && !error ? html`<p class="muted">（沒有管理埠的設定：直接在主機上執行時看不到應用清單。）</p>` : ''}
${list
  ? html`<ul class="list">${list
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((a) => {
        const s = byName.get(a.name) || {};
        const req = typeof s.count === 'number' ? s.count : null;
        return html`<li><a class="main" href="${link(a)}"><img class="icon" src="${link(a)}icon.svg" alt="" width="36" height="36"><span class="grow"><strong>${a.name}</strong><span class="sub">${a.kind === 'dynamic' ? '動態新增 · ' : ''}${a.version ? `版本 ${a.version} · ` : ''}${a.instances ? `${a.instances} 個 Worker` : '只有靜態檔案'}${req !== null ? ` · ${req} 個請求` : ''}</span></span></a></li>`;
      })}</ul>`
  : ''}`,
  });
}

async function licenses(request, env, url) {
  const r = env.ASSETS ? await env.ASSETS.fetch(new URL('/licenses.md', request.url)) : null;
  const text = r && r.ok ? await r.text() : '';
  return page(request, {
    app: APP,
    title: '授權',
    body: html`${tabs(url)}
${text ? html`<div class="prose">${raw(markdown(text))}</div>` : html`<p class="muted">（授權清單在建置系統碟時產生；直接在主機上執行時沒有。）</p>`}`,
  });
}

export default app(APP, async (request, env, url) => {
  if (request.method !== 'GET') return null;
  if (url.pathname === '/') return system(request, env, url);
  if (url.pathname === '/apps') return apps(request, env, url);
  if (url.pathname === '/licenses') return licenses(request, env, url);
  return null;
});
