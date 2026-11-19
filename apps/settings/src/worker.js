// 設定：系統資訊、已安裝的應用、授權清單。
//   GET /           系統（版本、資料碟、時區）
//   GET /network    網路：介面、位址、閘道、DNS（由 /sbin/init 寫入），以及現在能不能連到網際網路
//   GET /apps       應用清單（rucloud 管理埠的 /apps 與 /stats）
//   GET /licenses   映像裡每個套件的授權（建置時產生的 public/licenses.md）
//   GET/POST /ai    AI：Workers AI 的後端（rucloud 管理埠的 /ai）、每個應用的用量與每天的上限
//   GET/POST /email 寄信：SMTP 帳號與收件地址（rucloud 管理埠的 /email），安裝的應用有「寄電子郵件」權限才能用
//   GET /api/v1/system  給安裝的應用（權限 system:info）：時區、語言、系統版本
// 系統資訊與管理埠的網址、token 由 /sbin/init 寫進 env_file（SYS_*、ADMIN_URL、ADMIN_TOKEN）；
// 直接在主機上跑（開發）時沒有這些值，頁面會註明。
import { app, page, html, raw, homeUrl, tzOf, fmt, json, readForm } from '../../_shared/lib.js';
import { check } from '../../_shared/grant.js';
import { markdown } from '../../_shared/markdown.js';

const APP = { name: '設定', color: '#868e96' };

const tabs = (url) =>
  html`<p class="row">${[
    ['/', '系統'],
    ['/network', '網路'],
    ['/apps', '應用'],
    ['/email', '寄信'],
    ['/ai', 'AI'],
    ['/licenses', '授權'],
  ].map(([href, label]) => html`<a class="chip${url.pathname === href ? ' on' : ''}" href="${href}">${label}</a>`)}</p>`;

async function admin(env, path, { method = 'GET', json: data } = {}) {
  if (!env.ADMIN_URL) return null;
  const headers = env.ADMIN_TOKEN ? { authorization: `Bearer ${env.ADMIN_TOKEN}` } : {};
  if (data !== undefined) headers['content-type'] = 'application/json';
  const r = await fetch(env.ADMIN_URL + path, { method, headers, body: data !== undefined ? JSON.stringify(data) : undefined });
  if (!r.ok) {
    const text = await r.text();
    let msg = text;
    try { msg = JSON.parse(text).error || text; } catch { /* 不是 JSON */ }
    throw new Error(r.status === 400 ? msg : `管理埠 ${path}：${r.status} ${msg}`);
  }
  return r.json();
}

function system(request, env, url) {
  const tz = tzOf(request);
  // native/install.sh: no VM, so "start" rather than "boot", and the data is a folder, not a disk
  const native = env.SYS_PLATFORM === 'native';
  const rows = [
    ['執行方式', native ? '直接在這台機器上（沒有虛擬機）' : env.SYS_OS && '虛擬機'],
    ['作業系統', env.SYS_OS],
    ['核心', env.SYS_KERNEL],
    ['CPU', env.SYS_CPUS && `${env.SYS_CPUS} 個`],
    ['Node.js', env.SYS_NODE],
    ['rucloud', env.SYS_RUCLOUD],
    [native ? '啟動次數' : '開機次數', env.SYS_BOOT],
    [native ? '這次啟動' : '這次開機', env.SYS_BOOTED_AT && fmt(env.SYS_BOOTED_AT, tz)],
    [native ? '資料（/var/lib/ruwebos，啟動時）' : '資料碟（開機時）', env.SYS_DATA],
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
  <tr><th>時區</th><td>${tz}${env.SYS_TZ ? `（系統時區 ${env.SYS_TZ}，${native ? '這台機器的設定' : '開機時取自主機'}）` : ''}</td></tr>
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
  // native/install.sh: ruwebos runs straight on this machine (no VM), so this is its real network
  const native = env.SYS_PLATFORM === 'native';
  const rows = native
    ? [
        ['介面', env.SYS_NET_IF && `${env.SYS_NET_IF}${env.SYS_NET_DRIVER ? `（${env.SYS_NET_DRIVER}）` : ''}`],
        ['MAC 位址', env.SYS_NET_MAC],
        ['IP 位址', env.SYS_NET_IP],
        ['預設閘道', env.SYS_NET_GW],
        ['DNS', env.SYS_NET_DNS],
      ]
    : [
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
${native ? html`<p>ruwebos 直接在這台機器上執行，用的是它的網路；Wi-Fi 請在這台機器的作業系統設定（例如 Raspberry Pi OS 的網路設定或 <code>nmcli</code>）。</p>` : html`<p>ruwebos 在虛擬機（ruvm）裡執行，看到的是一張虛擬的有線網卡；實際的連線由<strong>主機</strong>提供，主機用 Wi-Fi 或有線網路都可以。
要切換 Wi-Fi 或連到別的基地台，請在主機的系統設定操作，這裡會跟著主機的連線。</p>
<p class="muted small">在實體裝置上直接執行 ruwebos 時，才需要無線網卡的驅動與 Wi-Fi 設定（見 ruwebos 的 doc/apps.md）。</p>`}`,
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

// 寄信：rucloud 的 send_email 綁定透過這個 SMTP 帳號寄出，只能寄到這裡列的收件地址
async function email(request, env, url) {
  let msg = '', error = '';
  if (request.method === 'POST') {
    const f = await readForm(request);
    try {
      if (f.action === 'clear') {
        await admin(env, '/email', { method: 'DELETE' });
        msg = '已清除寄信的設定。';
      } else if (f.action === 'test') {
        await admin(env, '/email/test', { method: 'POST', json: { to: String(f.to || '') } });
        msg = `測試信已寄到 ${f.to}。`;
      } else {
        const from = String(f.from || '').trim();
        const recipients = String(f.recipients || '').split(/[\s,;]+/).filter(Boolean);
        const cfg = {
          host: String(f.host || '').trim(),
          port: Number(f.port) || (f.security === 'tls' ? 465 : 587),
          security: f.security === 'tls' ? 'tls' : 'starttls',
          username: String(f.username || '').trim() || null,
          from,
          recipients: recipients.length ? recipients : from ? [from] : [],
        };
        if (f.password) cfg.password = String(f.password);
        await admin(env, '/email', { method: 'PUT', json: cfg });
        msg = '已儲存。';
      }
    } catch (e) {
      error = e.message;
    }
  }
  let cfg = null;
  try {
    cfg = await admin(env, '/email');
  } catch (e) {
    error ||= e.message;
  }
  const c = cfg?.configured ? cfg : {};
  return page(request, {
    app: APP,
    title: '寄信',
    status: error && request.method === 'POST' ? 400 : 200,
    body: html`${tabs(url)}
<h2>寄信的帳號</h2>
<p>有「寄電子郵件」權限的應用（例如提醒、通知）透過這個帳號寄信，而且<strong>只能寄到下面列的收件地址</strong>（通常就是你自己的信箱），不能寄給別人。</p>
${msg ? html`<p class="card">${msg}</p>` : ''}
${error ? html`<p class="error">${error}</p>` : ''}
${!cfg && !error ? html`<p class="muted">（沒有管理埠的設定：直接在主機上執行時不能設定寄信。）</p>` : ''}
${cfg ? html`<form class="stack" method="post" action="/email">
  <label>SMTP 伺服器<input name="host" required value="${c.host || ''}" placeholder="smtp.gmail.com"></label>
  <div class="row" style="gap:12px">
    <label class="grow">加密<select name="security">
      <option value="tls"${c.security === 'tls' ? ' selected' : ''}>TLS（通常是 465 埠）</option>
      <option value="starttls"${c.security !== 'tls' ? ' selected' : ''}>STARTTLS（通常是 587 埠）</option>
    </select></label>
    <label>埠<input name="port" type="number" min="1" max="65535" value="${c.port || ''}" placeholder="465" style="width:7em"></label>
  </div>
  <label>帳號<input name="username" value="${c.username || ''}" autocomplete="off" placeholder="me@gmail.com"></label>
  <label>密碼<input name="password" type="password" autocomplete="new-password" placeholder="${c.has_password ? '已設定（留空表示不變）' : ''}"></label>
  <label>寄件地址<input name="from" type="email" required value="${c.from || ''}" placeholder="me@gmail.com"></label>
  <label>收件地址（一行一個，不填就是寄件地址）<textarea name="recipients" rows="3">${(c.recipients || []).join('\n')}</textarea></label>
  <p class="muted small">Gmail：伺服器 smtp.gmail.com、TLS、465 埠，密碼要用 Google 帳戶的「應用程式密碼」，不是登入密碼。密碼存在 rucloud 的資料夾裡，只有 rucloud 讀得到，這個頁面也不會再顯示。</p>
  <p class="row"><button class="btn primary" name="action" value="save">儲存</button>${cfg.configured ? html` <button class="btn" name="action" value="clear" data-confirm="清除寄信的設定？應用將不能寄信。">清除</button>` : ''}</p>
</form>
${cfg.configured ? html`<h2>寄測試信</h2>
<form class="row" method="post" action="/email" style="gap:8px">
  <input type="hidden" name="action" value="test">
  <select name="to" class="grow">${(c.recipients || []).map((r) => html`<option>${r}</option>`)}</select>
  <button class="btn">寄出</button>
</form>` : ''}` : ''}`,
  });
}

// AI：安裝的應用（有「使用 AI」權限的）與系統的 env.AI 都用這個後端
async function ai(request, env, url) {
  let msg = '', error = '';
  if (request.method === 'POST') {
    const f = await readForm(request);
    try {
      if (f.action === 'clear') {
        await admin(env, '/ai', { method: 'DELETE' });
        msg = '已清除 AI 的設定。';
      } else if (f.action === 'test') {
        const r = await admin(env, '/ai/test', { method: 'POST' });
        msg = `AI 回答：「${r.response}」`;
      } else {
        const opt = (k) => String(f[k] || '').trim() || null;
        const cfg = {
          base_url: String(f.base_url || '').trim(),
          model: opt('model'),
          embedding_model: opt('embedding_model'),
          daily_requests: Math.max(0, Math.floor(Number(f.daily_requests) || 0)),
          daily_tokens: Math.max(0, Math.floor(Number(f.daily_tokens) || 0)),
        };
        if (f.api_key) cfg.api_key = String(f.api_key);
        await admin(env, '/ai', { method: 'PUT', json: cfg });
        msg = '已儲存。';
      }
    } catch (e) {
      error = e.message;
    }
  }
  let cfg = null, usage = [];
  try {
    cfg = await admin(env, '/ai');
    usage = cfg ? (await admin(env, '/ai/usage?days=30')).usage : [];
  } catch (e) {
    error ||= e.message;
  }
  const c = cfg?.configured ? cfg : {};
  // 主機上的 Ollama：VM 裡經 ruvm 的閘道連到主機；直接裝在這台機器上就是 localhost
  const hostAddr = env.SYS_PLATFORM === 'native' || !env.SYS_NET_GW ? 'localhost' : env.SYS_NET_GW;
  const today = new Date().toISOString().slice(0, 10);
  const byApp = new Map();
  for (const u of usage) {
    const a = byApp.get(u.app) || { today: 0, todayTokens: 0, requests: 0, tokens: 0 };
    if (u.day === today) {
      a.today += u.requests;
      a.todayTokens += u.tokens;
    }
    a.requests += u.requests;
    a.tokens += u.tokens;
    byApp.set(u.app, a);
  }
  return page(request, {
    app: APP,
    title: 'AI',
    status: error && request.method === 'POST' ? 400 : 200,
    body: html`${tabs(url)}
<h2>AI 的後端</h2>
<p>有「使用 AI」權限的應用透過這裡設定的服務使用 AI（Cloudflare Workers AI 相容的 <code>env.AI</code>）。可以用<strong>本機的模型</strong>（例如主機上的 Ollama，資料不離開你的電腦），或<strong>你自己的 API 金鑰</strong>（OpenAI 相容的服務；應用送出的內容會傳到那個服務，也可能要付費）。</p>
${msg ? html`<p class="card">${msg}</p>` : ''}
${error ? html`<p class="error">${error}</p>` : ''}
${!cfg && !error ? html`<p class="muted">（沒有管理埠的設定：直接在主機上執行時不能設定 AI。）</p>` : ''}
${cfg ? html`<form class="stack" method="post" action="/ai">
  <label>服務的網址（OpenAI 相容）<input name="base_url" required value="${c.base_url || ''}" placeholder="http://${hostAddr}:11434/v1"></label>
  <p class="muted small">主機上的 Ollama：<code>http://${hostAddr}:11434/v1</code>${hostAddr !== 'localhost' ? '（虛擬機的閘道就是主機的 127.0.0.1，主機上的 Ollama 照常啟動就好）' : ''}；OpenAI：<code>https://api.openai.com/v1</code>。</p>
  <label>API 金鑰<input name="api_key" type="password" autocomplete="new-password" placeholder="${c.has_api_key ? '已設定（留空表示不變）' : '本機的模型通常不用'}"></label>
  <div class="row" style="gap:12px">
    <label class="grow">模型<input name="model" value="${c.model || ''}" placeholder="llama3.2"></label>
    <label class="grow">Embedding 模型<input name="embedding_model" value="${c.embedding_model || ''}" placeholder="nomic-embed-text"></label>
  </div>
  <p class="muted small">應用的程式碼寫的是 Cloudflare 的模型名稱（例如 <code>@cf/meta/llama-3.1-8b-instruct</code>）；這裡填了就一律改用這個模型。</p>
  <div class="row" style="gap:12px">
    <label class="grow">每個應用每天最多幾次<input name="daily_requests" type="number" min="0" value="${c.daily_requests ?? 200}"></label>
    <label class="grow">每個應用每天最多幾個 token<input name="daily_tokens" type="number" min="0" value="${c.daily_tokens ?? 100000}"></label>
  </div>
  <p class="muted small">0 表示不限。用付費的服務時，上限可以避免某個應用用掉太多錢。</p>
  <p class="row"><button class="btn primary" name="action" value="save">儲存</button>${cfg.configured ? html` <button class="btn" name="action" value="test">試問一句</button> <button class="btn" name="action" value="clear" data-confirm="清除 AI 的設定？應用將不能使用 AI。">清除</button>` : ''}</p>
</form>
<h2>用量（最近 30 天）</h2>
${byApp.size ? html`<table><tr><th>應用</th><th>今天</th><th>30 天</th></tr>${[...byApp].map(([app, a]) => html`<tr><td>${app === '(test)' ? '（測試）' : app}</td><td>${a.today} 次 · ${a.todayTokens} tokens</td><td>${a.requests} 次 · ${a.tokens} tokens</td></tr>`)}</table>` : html`<p class="muted">還沒有應用用過 AI。</p>`}` : ''}`,
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
  if (url.pathname === '/email') return email(request, env, url);
  if (url.pathname === '/ai') return ai(request, env, url);
  if (request.method !== 'GET') return null;
  if (url.pathname === '/') return system(request, env, url);
  if (url.pathname === '/network') return network(request, env, url);
  if (url.pathname === '/apps') return apps(request, env, url);
  if (url.pathname === '/licenses') return licenses(request, env, url);
  return null;
});
