// 安裝程式：把網站宣告的套件或 GitHub 儲存庫安裝成本機的應用（http://<id>.localhost），管理它們的權限、
// 更新、回復與移除；也管理主畫面的「我的最愛」。實際的安裝由 rucloud 的 [install] 管理 API 完成
//（RUCLOUD_ADMIN_URL、RUCLOUD_INSTALL_TOKEN）。設計見 ruwebos 的 doc/install.md。
//   GET  /                       已安裝的應用、從網址安裝
//   GET  /install?src=           下載、檢查套件，顯示要求的權限      POST /install   同意後安裝
//   GET  /bundled/<id>           重新安裝移除過的預裝應用
//   GET  /apps/<id>              應用的資訊與權限    POST /apps/<id>/perms  /update  /rollback
//   GET  /apps/<id>/remove       移除（保留或刪除資料）              POST /apps/<id>/remove
//   GET  /grant?app=&perm=&return=  應用在需要時要求某個權限          POST /grant
//   GET  /favorites  /favorites/new?url=&title=   POST /favorites  /favorites/<id>/delete
//   GET  /icon/<id>              應用的圖示
//   GET  /api/home               主畫面用的 JSON（安裝的應用與我的最愛）；第一次會先裝好預裝的應用
//   GET  /api/apps               安裝的應用（設定用）
import { app, page, html, redirect, readForm, json, newId, UserError } from '../../_shared/lib.js';
import { PERMS, grantsFor, combos } from './perms.js';
import { download, readPackage, packFiles, compareVersions, resolveSource, MAX_DOWNLOAD } from './package.js';

const APP = { name: '安裝程式', color: '#2b8a3e' };
const now = () => new Date().toISOString();
const list = (v) => [].concat(v ?? []).filter(Boolean).map(String);
const parse = (s, fallback) => {
  try { return JSON.parse(s); } catch { return fallback; }
};

// ---------- rucloud 的管理 API ----------

async function admin(env, path, { method = 'GET', body, json: data } = {}) {
  if (!env.RUCLOUD_ADMIN_URL || !env.RUCLOUD_INSTALL_TOKEN) {
    throw new UserError('rucloud 沒有給安裝程式管理權（rucloud.toml 要有 [install] grant = ["installer"]）。');
  }
  const headers = { authorization: `Bearer ${env.RUCLOUD_INSTALL_TOKEN}` };
  if (data !== undefined) headers['content-type'] = 'application/json';
  const r = await fetch(env.RUCLOUD_ADMIN_URL + path, { method, headers, body: data !== undefined ? JSON.stringify(data) : body });
  const text = await r.text();
  const out = parse(text, text);
  if (!r.ok) {
    const msg = typeof out === 'object' && out?.error ? out.error : String(text).trim();
    if (r.status === 403) throw new UserError(`這個名稱已經被系統的應用使用，不能安裝：${path.split('/')[2]}`);
    throw new UserError(msg || `rucloud 回傳 ${r.status}`);
  }
  return out;
}

// ---------- 資料 ----------

const getApp = (env, id) => env.DB.prepare('SELECT * FROM apps WHERE id = ?').bind(id).first();

async function mustApp(env, id) {
  const a = await getApp(env, id);
  if (!a) throw new UserError('沒有安裝這個應用。');
  return a;
}

function appUrl(request, id) {
  const u = new URL(request.url);
  return `${u.protocol}//${id}.localhost${u.port ? ':' + u.port : ''}/`;
}

// ---------- 安裝 ----------

/** 安裝程式自己的網址（/packages/ 底下的範例套件）直接從 ASSETS 讀；其他網址照常下載。 */
function fetcherFor(env, request) {
  const self = new URL(request.url);
  return (u, init) => {
    const t = new URL(u);
    if (env.ASSETS && t.hostname === self.hostname && t.port === self.port && t.pathname.startsWith('/packages/')) return env.ASSETS.fetch(t, init);
    return fetch(u, init);
  };
}

/** 下載並檢查套件，暫存起來等使用者同意。回傳 token。 */
async function prepare(env, source, { bytes, origin = 'user', page: from = null, request } = {}) {
  await env.DB.prepare('DELETE FROM pending WHERE created_at < ?').bind(new Date(Date.now() - 86400000).toISOString()).run();
  let gz = bytes;
  let url = source;
  if (!gz) {
    try {
      const got = await download(source, request ? fetcherFor(env, request) : fetch);
      gz = got.bytes;
      url = got.url;
      from = got.page;
    } catch (e) {
      throw new UserError(e.message);
    }
  }
  let pkg;
  try {
    pkg = await readPackage(gz, { fetcher: request ? fetcherFor(env, request) : fetch });
  } catch (e) {
    throw new UserError(`套件有問題：${e.message}`);
  }
  const token = newId();
  await env.PKG.put(`pending/${token}`, await packFiles(pkg.files));
  if (pkg.icon) await env.PKG.put(`pending/${token}.icon`, pkg.icon.data, { httpMetadata: { contentType: pkg.icon.type } });
  await env.DB.prepare('INSERT INTO pending (token, manifest, source, origin, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(token, JSON.stringify({ ...pkg.manifest, has_icon: !!pkg.icon, page: from, download: url, license_text: pkg.licenseText ? pkg.licenseText.slice(0, 4000) : '', deps: pkg.deps }), source, origin, now())
    .run();
  return token;
}

const randomSecret = () => [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, '0')).join('');

/** 把暫存的套件交給 rucloud，設密鑰與權限，記下來。 */
async function commit(env, token, granted, license = '') {
  const p = await env.DB.prepare('SELECT * FROM pending WHERE token = ?').bind(token).first();
  if (!p) throw new UserError('這個安裝要求已經過期，請重新開始。');
  const m = JSON.parse(p.manifest);
  if (!m.license) {
    // 授權檔認不出來：使用者看過授權檔後填的 SPDX 名稱
    license = String(license).trim();
    if (!/^[A-Za-z0-9.+\-() ]{2,100}$/.test(license) || /^(unlicensed|none|proprietary)$/i.test(license)) {
      throw new UserError('請填這個專案的授權（SPDX 名稱，例如 MIT、Apache-2.0）；沒有可用授權的專案不能安裝。');
    }
    m.license = license;
  }
  const obj = await env.PKG.get(`pending/${token}`);
  if (!obj) throw new UserError('暫存的套件不見了，請重新開始。');
  const before = await getApp(env, m.id);
  granted = granted.filter((x) => m.permissions.includes(x));
  await admin(env, `/apps/${m.id}?message=${encodeURIComponent(`${m.name} ${m.version}`)}`, { method: 'PUT', body: await obj.arrayBuffer() });
  const done = new Set(parse(before?.secrets, []));
  for (const name of m.secrets) {
    if (done.has(name)) continue;
    await admin(env, `/apps/${m.id}/secrets/${name}`, { method: 'PUT', body: randomSecret() });
    done.add(name);
  }
  await admin(env, `/apps/${m.id}/grants`, { method: 'PUT', json: grantsFor(m.id, granted) });
  const icon = await env.PKG.get(`pending/${token}.icon`);
  if (icon) await env.PKG.put(`icons/${m.id}`, await icon.arrayBuffer(), { httpMetadata: icon.httpMetadata });
  else await env.PKG.delete(`icons/${m.id}`);
  await env.DB.prepare(`INSERT INTO apps (id, name, version, description, license, source, homepage, author, color, glyph, has_icon,
      requested, granted, secrets, origin, installed_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, version = excluded.version, description = excluded.description,
      license = excluded.license, source = excluded.source, homepage = excluded.homepage, author = excluded.author,
      color = excluded.color, glyph = excluded.glyph, has_icon = excluded.has_icon, requested = excluded.requested,
      granted = excluded.granted, secrets = excluded.secrets, updated_at = excluded.updated_at`)
    .bind(m.id, m.name, m.version, m.description, m.license, p.source, m.homepage || m.page || '', m.author, m.color, m.glyph, m.has_icon ? 1 : 0,
      JSON.stringify(m.permissions), JSON.stringify(granted), JSON.stringify([...done]), before?.origin || p.origin, before?.installed_at || now(), now())
    .run();
  await env.DB.prepare('INSERT INTO app_reasons (id, reasons) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET reasons = excluded.reasons')
    .bind(m.id, JSON.stringify(m.permission_reasons || {}))
    .run();
  await env.DB.prepare('DELETE FROM removed WHERE id = ?').bind(m.id).run();
  await env.DB.prepare('DELETE FROM pending WHERE token = ?').bind(token).run();
  await env.PKG.delete(`pending/${token}`);
  await env.PKG.delete(`pending/${token}.icon`);
  return m;
}

// ---------- 預裝的應用（public/packages/，建置系統碟時放進來） ----------

async function bundledIndex(env, request) {
  const r = env.ASSETS ? await env.ASSETS.fetch(new URL('/packages/index.json', request.url)) : null;
  return r && r.ok ? (await r.json()).packages || [] : [];
}

async function bundledBytes(env, request, file) {
  const r = await env.ASSETS.fetch(new URL(`/packages/${file}`, request.url));
  if (!r.ok) throw new UserError(`找不到預裝的套件 ${file}`);
  return new Uint8Array(await r.arrayBuffer());
}

/** 裝好還沒裝的預裝應用，並更新比較舊的。權限和使用者裝的一樣不會自動給（更新時保留原本給的），應用用到時再要求。 */
async function bootstrap(env, request) {
  const index = await bundledIndex(env, request);
  const stamp = JSON.stringify(index.map((p) => [p.id, p.version]));
  const meta = (k) => env.DB.prepare('SELECT v FROM meta WHERE k = ?').bind(k).first('v');
  const setMeta = (k, v) => env.DB.prepare('INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind(k, v).run();
  if ((await meta('bundled')) === stamp) return;
  const lock = Number(await meta('bundled_lock')) || 0;
  if (Date.now() - lock < 120000) return;
  await setMeta('bundled_lock', String(Date.now()));
  try {
    const removed = new Set((await env.DB.prepare('SELECT id FROM removed').all()).results.map((r) => r.id));
    for (const p of index) {
      const cur = await getApp(env, p.id);
      if (removed.has(p.id) || (cur && (cur.origin !== 'bundled' || compareVersions(p.version, cur.version) <= 0))) continue;
      try {
        const token = await prepare(env, `bundled:${p.file}`, { bytes: await bundledBytes(env, request, p.file), origin: 'bundled' });
        const pend = JSON.parse((await env.DB.prepare('SELECT manifest FROM pending WHERE token = ?').bind(token).first('manifest')));
        await commit(env, token, cur ? parse(cur.granted, []).filter((x) => pend.permissions.includes(x)) : []);
      } catch (e) {
        console.error(`預裝的 ${p.id} 裝不起來：${e.message}`);
      }
    }
    await setMeta('bundled', stamp);
  } finally {
    await setMeta('bundled_lock', '0');
  }
}

// ---------- 頁面 ----------

function icon(a, size = 48) {
  return a.has_icon
    ? html`<img class="icon" src="/icon/${a.id}?v=${a.version}" alt="" width="${size}" height="${size}" style="border-radius:22%">`
    : html`<span class="icon" style="width:${size}px;height:${size}px;border-radius:22%;background:${a.color};color:#fff;display:inline-flex;align-items:center;justify-content:center;font-weight:700">${a.glyph || a.name.slice(0, 1)}</span>`;
}

/** 應用說明的用途；沒說明時也要讓使用者知道。 */
const reasonOf = (reasons, p) =>
  reasons[p] ? html`<span class="small" style="display:block">應用的說明：「${reasons[p]}」</span>` : html`<span class="muted small" style="display:block">應用沒有說明為什麼需要</span>`;

/** 危險組合的提醒：perms 是要求的權限，granted 是已經給的。 */
function comboWarnings(perms, granted = []) {
  return combos(perms).map((c) => {
    const both = c.perms.every((p) => granted.includes(p));
    const names = c.perms.map((p) => `「${PERMS[p].label}」`).join('和');
    return html`<p class="${both ? 'error' : 'muted small'}">⚠️ ${both ? `這個應用目前同時有${names}的權限：它${c.warn}。` : `如果同時給${names}，這個應用就${c.warn}。`}</p>`;
  });
}

function permList(perms, { checked = [], name = 'perm', fresh = [], reasons = {} } = {}) {
  if (!perms.length) return html`<p class="muted">這個應用不需要任何權限。</p>`;
  return html`<div class="stack">${perms.map((p) => html`<label class="check"><input type="checkbox" name="${name}" value="${p}"${checked.includes(p) ? ' checked' : ''}>
  <span>${PERMS[p].icon} <strong>${PERMS[p].label}</strong>${fresh.includes(p) ? html` <span class="chip">新的</span>` : ''}<span class="muted small" style="display:block">${PERMS[p].detail}</span>${reasonOf(reasons, p)}</span></label>`)}</div>`;
}

const reasonsOf = async (env, id) => parse(await env.DB.prepare('SELECT reasons FROM app_reasons WHERE id = ?').bind(id).first('reasons'), {});

async function home(request, env) {
  const apps = (await env.DB.prepare('SELECT * FROM apps ORDER BY name').all()).results;
  const removed = new Set((await env.DB.prepare('SELECT id FROM removed').all()).results.map((r) => r.id));
  const bundled = (await bundledIndex(env, request)).filter((p) => removed.has(p.id) && !apps.some((a) => a.id === p.id));
  return page(request, {
    app: APP,
    actions: html`<a class="btn" href="/favorites">我的最愛</a>`,
    body: html`
<form class="row card" method="get" action="/install">
  <input name="src" type="url" required placeholder="套件、宣告了套件的網頁，或 GitHub 儲存庫的網址" style="flex:1" aria-label="網址">
  <button class="primary" type="submit">安裝</button>
</form>
<form class="row card" method="post" action="/install/upload" enctype="multipart/form-data">
  <label style="flex:1">或上傳套件檔（.tar.gz）<input type="file" name="file" accept=".gz,.tgz,application/gzip" required></label>
  <button type="submit">上傳並安裝</button>
</form>
<p class="muted small">網站要能安裝，需要在網頁裡宣告套件：<code>&lt;link rel="ruwebos-app" href="app.tar.gz"&gt;</code>。只有網址的網站請加到<a href="/favorites">我的最愛</a>。</p>
<p class="section">已安裝的應用（${apps.length}）</p>
${apps.length
  ? html`<ul class="list">${apps.map((a) => html`<li><a class="main" href="/apps/${a.id}">${icon(a, 40)}<span class="grow"><strong>${a.name}</strong><span class="sub">${a.version} · ${a.license}${a.origin === 'bundled' ? ' · 預裝' : ''}</span></span></a></li>`)}</ul>`
  : html`<p class="empty">還沒有安裝任何應用。</p>`}
${bundled.length ? html`<p class="section">移除過的預裝應用</p><ul class="list">${bundled.map((p) => html`<li><a class="main" href="/bundled/${p.id}"><span class="grow"><strong>${p.name || p.id}</strong><span class="sub">${p.version} · 重新安裝</span></span></a></li>`)}</ul>` : ''}`,
  });
}

async function consent(request, env, token) {
  const p = await env.DB.prepare('SELECT * FROM pending WHERE token = ?').bind(token).first();
  if (!p) throw new UserError('這個安裝要求已經過期，請重新開始。');
  const m = JSON.parse(p.manifest);
  const cur = await getApp(env, m.id);
  const was = cur ? parse(cur.granted, []) : [];
  const fresh = cur ? m.permissions.filter((x) => !parse(cur.requested, []).includes(x)) : [];
  const update = !!cur;
  const cmp = cur ? compareVersions(m.version, cur.version) : 1;
  const mail = m.permissions.includes('email:send') ? await admin(env, '/email').catch(() => null) : null;
  return page(request, {
    app: APP,
    title: update ? '更新' : '安裝',
    back: '/',
    body: html`
<div class="card row" style="gap:14px">${m.has_icon ? html`<img class="icon" src="/install/icon?token=${token}" alt="" width="56" height="56" style="border-radius:22%">` : icon({ ...m, has_icon: false }, 56)}
<div class="grow"><h2 style="margin:0">${m.name}</h2>
<span class="muted small">${m.id}.localhost · 版本 ${m.version}${cur ? `（目前 ${cur.version}）` : ''} · 授權 ${m.license || '待確認'}${m.author ? ` · ${m.author}` : ''}</span></div></div>
${m.description ? html`<p>${m.description}</p>` : ''}
${m.generated ? html`<p class="muted small">這個專案沒有 ruwebos 的描述檔（ruwebos-app.json），名稱、版本與授權是從它的 wrangler 設定、package.json 與授權檔自動產生的。</p>` : ''}
<table>
  <tr><th>來源</th><td>${p.source.startsWith('bundled:') ? '系統碟裡的預裝套件' : p.source.startsWith('upload:') ? `上傳的套件檔 ${p.source.slice(7)}` : p.source}</td></tr>
  ${m.source ? html`<tr><th>原始碼</th><td><a href="${m.source}">${m.source}</a></td></tr>` : ''}
  ${m.homepage ? html`<tr><th>網站</th><td><a href="${m.homepage}">${m.homepage}</a></td></tr>` : ''}
  ${m.deps ? html`<tr><th>npm 套件</th><td>${m.deps.count} 個，從 npm 下載並比對過 package-lock.json（授權：${Object.entries(m.deps.licenses).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join('、')}）${m.deps.scripts.length ? `；${m.deps.scripts.join('、')} 有安裝腳本，沒有執行` : ''}</td></tr>` : ''}
</table>
${cur && cmp < 0 ? html`<p class="error">這個套件的版本比已安裝的舊。</p>` : ''}
${cur && cmp === 0 ? html`<p class="muted">版本和已安裝的相同，會重新安裝。</p>` : ''}
<form class="stack" method="post" action="/install">
  <input type="hidden" name="token" value="${token}">
  ${m.license ? '' : html`<h3>授權</h3>
  <p>認不出這個專案的授權檔是哪一種授權。請看過下面的內容，填上它的 SPDX 名稱（例如 MIT、Apache-2.0、GPL-3.0-or-later）：</p>
  <pre style="max-height:220px;overflow:auto;white-space:pre-wrap;font-size:13px" class="card">${m.license_text}</pre>
  <label>授權<input name="license" required maxlength="100" placeholder="MIT"></label>`}
  <h3>${update ? '更新後的權限' : '這個應用要求的權限'}</h3>
  ${m.permissions.length ? html`<p class="small"><strong>不勾也能安裝。</strong>${update ? '原本給的權限會保留；新要求的預設不勾。' : '權限預設都不給，'}應用用到這些功能時會再問你，到時候再決定也可以；之後也能在這裡的應用頁面給或收回。</p>` : ''}
  ${m.generated ? html`<p class="muted small">這個專案沒有 ruwebos 的描述檔，不知道它真正需要什麼權限。</p>` : ''}
  ${permList(m.permissions, { checked: update ? was.filter((x) => m.permissions.includes(x)) : [], fresh, reasons: m.permission_reasons || {} })}
  ${comboWarnings(m.permissions)}
  ${mail && !mail.configured ? html`<p class="muted small">還沒設定寄信的帳號：要讓應用寄信，請到「設定」的「寄信」填寫。</p>` : ''}
  <p class="muted small">安裝的應用在自己的沙箱裡執行，有自己的資料；不能讀寫系統的檔案，也不能直接連到這台裝置上的其他應用。</p>
  <div class="row"><button class="primary" type="submit">${update ? '更新' : '安裝'}</button><a class="btn" href="/">取消</a></div>
</form>`,
  });
}

async function detail(request, env, id) {
  const a = await mustApp(env, id);
  let versions = [];
  try {
    versions = (await admin(env, `/apps/${id}/versions`)).versions || [];
  } catch { /* 顯示時略過 */ }
  const requested = parse(a.requested, []);
  const granted = parse(a.granted, []);
  return page(request, {
    app: APP,
    title: a.name,
    back: '/',
    body: html`
<div class="card row" style="gap:14px">${icon(a, 56)}
<div class="grow"><h2 style="margin:0">${a.name}</h2><span class="muted small">版本 ${a.version} · 授權 ${a.license}${a.origin === 'bundled' ? ' · 預裝' : ''}</span></div>
<a class="btn primary" href="${appUrl(request, a.id)}">開啟</a></div>
${a.description ? html`<p>${a.description}</p>` : ''}
<table>
  <tr><th>網址</th><td><a href="${appUrl(request, a.id)}">${appUrl(request, a.id)}</a></td></tr>
  <tr><th>來源</th><td>${a.source.startsWith('bundled:') ? '系統碟裡的預裝套件' : a.source.startsWith('upload:') ? `上傳的套件檔 ${a.source.slice(7)}` : a.source}</td></tr>
  ${a.homepage ? html`<tr><th>網站</th><td><a href="${a.homepage}">${a.homepage}</a></td></tr>` : ''}
  ${a.author ? html`<tr><th>作者</th><td>${a.author}</td></tr>` : ''}
  <tr><th>安裝於</th><td>${a.installed_at.slice(0, 10)}${a.updated_at !== a.installed_at ? `，更新於 ${a.updated_at.slice(0, 10)}` : ''}</td></tr>
</table>
<h3>權限</h3>
<form class="stack" method="post" action="/apps/${a.id}/perms">
  ${permList(requested, { checked: granted, reasons: await reasonsOf(env, a.id) })}
  ${comboWarnings(requested, granted)}
  ${requested.length ? html`<div><button type="submit">儲存權限</button></div>` : ''}
</form>
<h3>版本</h3>
<div class="row">
  ${/^(bundled|upload):/.test(a.source) ? '' : html`<form class="inline" method="post" action="/apps/${a.id}/update"><button type="submit">檢查更新</button></form>`}
  ${versions.length > 1 ? html`<form class="inline" method="post" action="/apps/${a.id}/rollback" data-confirm="回到上一個版本？資料不會改變。"><button type="submit">回到上一版</button></form>` : ''}
  <a class="btn danger" href="/apps/${a.id}/remove">移除</a>
</div>`,
  });
}

function removePage(request, a) {
  return page(request, {
    app: APP,
    title: `移除 ${a.name}`,
    back: `/apps/${a.id}`,
    body: html`
<form class="stack card" method="post" action="/apps/${a.id}/remove">
  <p>要移除「${a.name}」嗎？</p>
  <label class="check"><input type="radio" name="data" value="keep" checked> 保留資料（重新安裝後還在）</label>
  <label class="check"><input type="radio" name="data" value="purge"> 連資料一起刪除（<strong>無法復原</strong>）</label>
  <div class="row"><button class="danger" type="submit">移除</button><a class="btn" href="/apps/${a.id}">取消</a></div>
</form>`,
  });
}

async function grantPage(request, env, url) {
  const a = await mustApp(env, url.searchParams.get('app') || '');
  const perm = url.searchParams.get('perm') || '';
  const back = url.searchParams.get('return') || appUrl(request, a.id);
  if (!parse(a.requested, []).includes(perm)) throw new UserError(`「${a.name}」的套件沒有宣告會用到這個權限（${perm}），不能要求。`);
  if (!sameApp(back, a.id)) throw new UserError('return 必須是這個應用自己的網址。');
  if (parse(a.granted, []).includes(perm)) return redirect(back);
  return page(request, {
    app: APP,
    title: '要求權限',
    body: html`
<form class="stack card" method="post" action="/grant">
  <div class="row" style="gap:14px">${icon(a, 48)}<p style="margin:0">「<strong>${a.name}</strong>」要求：</p></div>
  <p style="font-size:18px">${PERMS[perm].icon} <strong>${PERMS[perm].label}</strong><span class="muted small" style="display:block">${PERMS[perm].detail}</span>${reasonOf(await reasonsOf(env, a.id), perm)}</p>
  ${combos([...parse(a.granted, []), perm]).filter((c) => c.perms.includes(perm)).map((c) => html`<p class="error">⚠️ 允許之後，這個應用就${c.warn}（它已經有${c.perms.filter((p) => p !== perm).map((p) => `「${PERMS[p].label}」`).join('、')}的權限）。</p>`)}
  <input type="hidden" name="app" value="${a.id}"><input type="hidden" name="perm" value="${perm}"><input type="hidden" name="return" value="${back}">
  <div class="row"><button class="primary" type="submit" name="answer" value="yes">允許</button><button type="submit" name="answer" value="no">不允許</button></div>
</form>`,
  });
}

function sameApp(target, id) {
  try {
    return new URL(target).hostname === `${id}.localhost`;
  } catch {
    return false;
  }
}

async function setGranted(env, a, granted) {
  granted = granted.filter((x) => parse(a.requested, []).includes(x));
  await admin(env, `/apps/${a.id}/grants`, { method: 'PUT', json: grantsFor(a.id, granted) });
  await env.DB.prepare('UPDATE apps SET granted = ? WHERE id = ?').bind(JSON.stringify(granted), a.id).run();
}

// ---------- 我的最愛 ----------

async function favoritesPage(request, env, url) {
  const favs = (await env.DB.prepare('SELECT * FROM favorites ORDER BY added_at').all()).results;
  const pre = { url: url.searchParams.get('url') || '', title: url.searchParams.get('title') || '' };
  return page(request, {
    app: APP,
    title: '我的最愛',
    back: '/',
    body: html`
<p class="muted">我的最愛會出現在主畫面。它們仍是原來的網站，資料在對方那裡，也沒有任何系統權限。</p>
<form class="stack card" method="post" action="/favorites">
  <label>網址<input name="url" type="url" required value="${pre.url}" placeholder="https://"></label>
  <label>名稱<input name="title" maxlength="40" value="${pre.title}" placeholder="不填就用網站名稱"></label>
  <div><button class="primary" type="submit">加到主畫面</button></div>
</form>
${favs.length
  ? html`<ul class="list">${favs.map((f) => html`<li><a class="main" href="${f.url}"><span class="grow"><strong>${f.title}</strong><span class="sub">${f.url}</span></span></a>
<form class="inline" method="post" action="/favorites/${f.id}/delete"><button class="danger small" type="submit">移除</button></form></li>`)}</ul>`
  : html`<p class="empty">還沒有我的最愛。</p>`}`,
  });
}

async function addFavorite(env, form) {
  let u;
  try {
    u = new URL(String(form.url || '').trim());
  } catch {
    throw new UserError('網址不對。');
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new UserError('只能加 http:// 或 https:// 的網址。');
  const title = String(form.title || '').trim().slice(0, 40) || u.hostname.replace(/^www\./, '');
  await env.DB.prepare('INSERT INTO favorites (id, url, title, added_at) VALUES (?, ?, ?, ?)').bind(newId(), u.href, title, now()).run();
}

// ---------- 路由 ----------

export default app(APP, async (request, env, url, ctx) => {
  const p = url.pathname;
  let m;
  if (request.method === 'GET' || request.method === 'HEAD') {
    if (p === '/') return home(request, env);
    if (p === '/install') {
      const src = url.searchParams.get('src');
      if (url.searchParams.get('token')) return consent(request, env, url.searchParams.get('token'));
      if (!src) return redirect('/');
      try {
        resolveSource(src);
      } catch (e) {
        throw new UserError(e.message);
      }
      return redirect(`/install?token=${await prepare(env, src, { request })}`);
    }
    if (p === '/install/icon') {
      const o = await env.PKG.get(`pending/${url.searchParams.get('token')}.icon`);
      if (!o) return new Response('沒有圖示', { status: 404 });
      return new Response(o.body, { headers: { 'content-type': o.httpMetadata?.contentType || 'image/svg+xml' } });
    }
    if ((m = /^\/bundled\/([a-z0-9-]+)$/.exec(p))) {
      const b = (await bundledIndex(env, request)).find((x) => x.id === m[1]);
      if (!b) throw new UserError('沒有這個預裝應用。');
      return redirect(`/install?token=${await prepare(env, `bundled:${b.file}`, { bytes: await bundledBytes(env, request, b.file), origin: 'bundled' })}`);
    }
    if ((m = /^\/apps\/([a-z0-9-]+)$/.exec(p))) return detail(request, env, m[1]);
    if ((m = /^\/apps\/([a-z0-9-]+)\/remove$/.exec(p))) return removePage(request, await mustApp(env, m[1]));
    if (p === '/grant') return grantPage(request, env, url);
    if (p === '/favorites' || p === '/favorites/new') return favoritesPage(request, env, url);
    if ((m = /^\/icon\/([a-z0-9-]+)$/.exec(p))) {
      const o = await env.PKG.get(`icons/${m[1]}`);
      if (!o) return new Response('沒有圖示', { status: 404 });
      return new Response(o.body, { headers: { 'content-type': o.httpMetadata?.contentType || 'image/svg+xml', 'cache-control': 'public, max-age=86400' } });
    }
    if (p === '/api/home' || p === '/api/apps') {
      const run = bootstrap(env, request).catch((e) => console.error('預裝應用：', e));
      // 主畫面不等預裝應用裝好（第一次開機要一點時間）；/api/apps 等
      if (p === '/api/apps') await run;
      else ctx.waitUntil(run);
      const apps = (await env.DB.prepare('SELECT * FROM apps ORDER BY name').all()).results.map((a) => ({
        id: a.id, name: a.name, description: a.description, version: a.version, license: a.license, color: a.color, glyph: a.glyph,
        icon: a.has_icon ? `/icon/${a.id}?v=${a.version}` : null, origin: a.origin, requested: parse(a.requested, []), granted: parse(a.granted, []),
      }));
      const favorites = p === '/api/home' ? (await env.DB.prepare('SELECT id, url, title FROM favorites ORDER BY added_at').all()).results : undefined;
      return json({ apps, favorites });
    }
    return null;
  }
  if (request.method !== 'POST') return null;
  const form = await readForm(request);
  if (p === '/install/upload') {
    const file = [].concat(form.file || []).find((f) => typeof f === 'object' && f.size > 0);
    if (!file) throw new UserError('沒有選擇套件檔。');
    if (file.size > MAX_DOWNLOAD) throw new UserError(`套件太大（上限 ${MAX_DOWNLOAD / 1048576} MB）`);
    const name = String(file.name || 'package.tar.gz').split(/[\\/]/).pop().slice(0, 200);
    return redirect(`/install?token=${await prepare(env, `upload:${name}`, { bytes: new Uint8Array(await file.arrayBuffer()) })}`);
  }
  if (p === '/install') {
    const m2 = await commit(env, String(form.token || ''), list(form.perm), form.license || '');
    return redirect(`/apps/${m2.id}`);
  }
  if ((m = /^\/apps\/([a-z0-9-]+)\/(perms|update|rollback|remove)$/.exec(p))) {
    const a = await mustApp(env, m[1]);
    if (m[2] === 'perms') {
      await setGranted(env, a, list(form.perm));
      return redirect(`/apps/${a.id}`);
    }
    if (m[2] === 'update') {
      const token = await prepare(env, a.source, { request });
      const pend = JSON.parse(await env.DB.prepare('SELECT manifest FROM pending WHERE token = ?').bind(token).first('manifest'));
      if (pend.id !== a.id) throw new UserError(`來源的套件現在是「${pend.id}」，不是「${a.id}」。`);
      if (compareVersions(pend.version, a.version) <= 0) {
        await env.DB.prepare('DELETE FROM pending WHERE token = ?').bind(token).run();
        return page(request, { app: APP, title: a.name, back: `/apps/${a.id}`, body: html`<p class="ok">已經是最新版（${a.version}）。</p><p><a class="btn" href="/apps/${a.id}">回到「${a.name}」</a></p>` });
      }
      return redirect(`/install?token=${token}`);
    }
    if (m[2] === 'rollback') {
      await admin(env, `/apps/${a.id}/rollback`, { method: 'POST' });
      return redirect(`/apps/${a.id}`);
    }
    const purge = form.data === 'purge';
    await admin(env, `/apps/${a.id}${purge ? '?purge=true' : ''}`, { method: 'DELETE' });
    await env.DB.prepare('DELETE FROM apps WHERE id = ?').bind(a.id).run();
    await env.DB.prepare('DELETE FROM app_reasons WHERE id = ?').bind(a.id).run();
    await env.PKG.delete(`icons/${a.id}`);
    if (a.origin === 'bundled') await env.DB.prepare('INSERT OR REPLACE INTO removed (id, removed_at) VALUES (?, ?)').bind(a.id, now()).run();
    return redirect('/');
  }
  if (p === '/grant') {
    const a = await mustApp(env, String(form.app || ''));
    const back = String(form.return || '');
    if (!sameApp(back, a.id)) throw new UserError('return 必須是這個應用自己的網址。');
    if (form.answer === 'yes') await setGranted(env, a, [...parse(a.granted, []), String(form.perm || '')]);
    return redirect(back);
  }
  if (p === '/favorites') {
    await addFavorite(env, form);
    return redirect('/favorites');
  }
  if ((m = /^\/favorites\/(\w+)\/delete$/.exec(p))) {
    await env.DB.prepare('DELETE FROM favorites WHERE id = ?').bind(m[1]).run();
    return redirect('/favorites');
  }
  return null;
});
