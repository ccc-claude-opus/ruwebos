// 設定：系統資訊、已安裝的應用、授權清單。
//   GET /           系統（版本、資料碟、時區）
//   GET /network    網路：介面、位址、閘道、DNS（由 /sbin/init 寫入），以及現在能不能連到網際網路
//   GET /apps       應用清單（rucloud 管理埠的 /apps 與 /stats）
//   GET /licenses   映像裡每個套件的授權（建置時產生的 public/licenses.md）
//   GET /api/v1/system  給安裝的應用（權限 system:info）：時區、語言、系統版本
// 系統資訊與管理埠的網址、token 由 /sbin/init 寫進 env_file（SYS_*、ADMIN_URL、ADMIN_TOKEN）；
// 直接在主機上跑（開發）時沒有這些值，頁面會註明。
import { app, page, html, raw, homeUrl, tzOf, fmt, json } from '../../_shared/lib.js';
import { check } from '../../_shared/grant.js';
import { markdown } from '../../_shared/markdown.js';

const APP = { name: '設定', color: '#868e96' };

const tabs = (url) =>
  html`<p class="row">${[
    ['/', '系統'],
    ['/network', '網路'],
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
  <tr><th>時區</th><td>${tz}${env.SYS_TZ ? `（系統時區 ${env.SYS_TZ}，開機時取自主機）` : ''}</td></tr>
  <tr><th>現在時間</th><td>${fmt(new Date(), tz, { dateStyle: 'full', timeStyle: 'medium' })}</td></tr>
  <tr><th>深色模式</th><td>跟隨瀏覽器與作業系統（prefers-color-scheme）</td></tr>
</table>
<h2>關於</h2>
<p>ruwebos：以瀏覽器為介面的系統。<a href="https://github.com/ccc-claude-opus/ruwebos">原始碼</a> ·
<a href="${homeUrl(request)}">主畫面</a></p>`,
  });
}

// 對外連線：連一個中立的網站（Debian 的套件鏡像），5 秒逾時
async function reach(target) {
  const t0 = Date.now();
  try {
    const r = await fetch(target, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(5000) });
    return { ok: true, ms: Date.now() - t0, status: r.status };
  } catch (e) {
    return { ok: false, error: e.name === 'TimeoutError' ? '逾時（5 秒）' : e.cause?.code || e.message };
  }
}

async function network(request, env, url) {
  const target = 'https://deb.debian.org/';
  const r = await reach(target);
  const dev = !env.SYS_NET_IP;
  const rows = [
    ['介面', env.SYS_NET_IF && `${env.SYS_NET_IF}（${env.SYS_NET_DRIVER || 'virtio'}，虛擬的有線網卡）`],
    ['MAC 位址', env.SYS_NET_MAC],
    ['IP 位址', env.SYS_NET_IP],
    ['預設閘道', env.SYS_NET_GW && `${env.SYS_NET_GW}（ruvm 的使用者模式網路，轉送到主機）`],
    ['DNS', env.SYS_NET_DNS && `${env.SYS_NET_DNS}（ruvm 代為查詢，用主機的 DNS 設定）`],
  ];
  return page(request, {
    app: APP,
    title: '網路',
    body: html`${tabs(url)}
<h2>連線狀態</h2>
<div class="card row" style="gap:14px"><span style="font-size:32px">${r.ok ? '🟢' : '🔴'}</span>
<div><strong>${r.ok ? '已連上網際網路' : '無法連上網際網路'}</strong>
<span class="muted small" style="display:block">${r.ok ? `連到 ${new URL(target).host} 花了 ${r.ms} ms（HTTP ${r.status}）` : `連到 ${new URL(target).host}：${r.error}`}</span></div>
<a class="btn small" href="/network" style="margin-left:auto">重新檢查</a></div>
<h2>這部裝置的網路</h2>
${dev ? html`<p class="muted">（直接在主機上執行，沒有 VM 的網路資訊；在 ruwebos 裡由 /sbin/init 提供。）</p>` : html`<table>${rows.filter(([, v]) => v).map(([k, v]) => html`<tr><th>${k}</th><td>${v}</td></tr>`)}</table>`}
<h2>Wi-Fi</h2>
<p>ruwebos 在虛擬機（ruvm）裡執行，看到的是一張虛擬的有線網卡；實際的連線由<strong>主機</strong>提供，主機用 Wi-Fi 或有線網路都可以。
要切換 Wi-Fi 或連到別的基地台，請在主機的系統設定操作，這裡會跟著主機的連線。</p>
<p class="muted small">在實體裝置上直接執行 ruwebos 時，才需要無線網卡的驅動與 Wi-Fi 設定（見 ruwebos 的 doc/apps.md）。</p>`,
  });
}

// 安裝的應用（安裝程式記的：名稱、版本、授權、權限）；沒有安裝程式時是空的
async function installedApps(env) {
  try {
    const r = env.INSTALLER ? await env.INSTALLER.fetch('http://installer/api/apps') : null;
    return r && r.ok ? (await r.json()).apps : [];
  } catch {
    return [];
  }
}

const installerUrl = (request, path = '') => {
  const u = new URL(request.url);
  return `${u.protocol}//installer.localhost${u.port ? ':' + u.port : ''}/${path}`;
};

async function apps(request, env, url) {
  let list, stats, error;
  try {
    [list, stats] = await Promise.all([admin(env, '/apps'), admin(env, '/stats')]);
  } catch (e) {
    error = e.message;
  }
  const installed = new Map((await installedApps(env)).map((a) => [a.id, a]));
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
<p><a class="btn" href="${installerUrl(request)}">安裝程式：安裝、更新、移除應用與權限</a></p>
${list
  ? html`<ul class="list">${list
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((a) => {
        const s = byName.get(a.name) || {};
        const req = typeof s.count === 'number' ? s.count : null;
        const inst = installed.get(a.name);
        const what = inst ? `安裝的應用 ${inst.version}（${inst.license}）· ${inst.granted.length ? `權限 ${inst.granted.join('、')}` : '沒有權限'} · ` : a.kind === 'dynamic' ? '動態新增 · ' : a.version ? `版本 ${a.version} · ` : '';
        return html`<li><a class="main" href="${inst ? installerUrl(request, `apps/${a.name}`) : link(a)}"><img class="icon" src="${link(a)}icon.svg" alt="" width="36" height="36"><span class="grow"><strong>${inst ? inst.name : a.name}</strong><span class="sub">${what}${a.instances ? `${a.instances} 個 Worker` : '只有靜態檔案'}${req !== null ? ` · ${req} 個請求` : ''}</span></span></a></li>`;
      })}</ul>`
  : ''}`,
  });
}

async function licenses(request, env, url) {
  const r = env.ASSETS ? await env.ASSETS.fetch(new URL('/licenses.md', request.url)) : null;
  const text = r && r.ok ? await r.text() : '';
  const installed = await installedApps(env);
  return page(request, {
    app: APP,
    title: '授權',
    body: html`${tabs(url)}
${installed.length ? html`<h2>安裝的應用</h2><table><tr><th>應用</th><th>版本</th><th>授權</th></tr>${installed.map((a) => html`<tr><td><a href="${installerUrl(request, `apps/${a.id}`)}">${a.name}</a></td><td>${a.version}</td><td>${a.license}</td></tr>`)}</table><h2>系統碟</h2>` : ''}
${text ? html`<div class="prose">${raw(markdown(text))}</div>` : html`<p class="muted">（授權清單在建置系統碟時產生；直接在主機上執行時沒有。）</p>`}`,
  });
}

export default app(APP, async (request, env, url, ctx) => {
  const no = check(ctx, url, 'system:info');
  if (no) return no;
  if (url.pathname === '/api/v1/system' && request.method === 'GET') {
    return json({
      timeZone: env.SYS_TZ || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      language: 'zh-TW',
      os: env.SYS_OS || null,
      rucloud: env.SYS_RUCLOUD || null,
    });
  }
  if (request.method !== 'GET') return null;
  if (url.pathname === '/') return system(request, env, url);
  if (url.pathname === '/network') return network(request, env, url);
  if (url.pathname === '/apps') return apps(request, env, url);
  if (url.pathname === '/licenses') return licenses(request, env, url);
  return null;
});
