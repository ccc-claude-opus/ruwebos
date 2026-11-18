// 主畫面：系統應用（public/apps.json）、安裝的應用與我的最愛（安裝程式的 /api/home，第一次開機時它會先裝好預裝的應用）。
// 應用都在同一個 edge 埠上：http://<名稱>.localhost:<這頁的埠>/
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

function card(href, a, iconSrc) {
  const icon = iconSrc
    ? `<img class="icon" src="${esc(iconSrc)}" alt="" width="48" height="48">`
    : `<b class="icon" style="background:${esc(a.color || '#868e96')}">${esc(a.glyph || (a.name || '?').slice(0, 1))}</b>`;
  return `<a class="app" href="${esc(href)}">${icon}<span><strong>${esc(a.name)}</strong><small>${esc(a.description || '')}</small></span></a>`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/' || request.method !== 'GET') return env.ASSETS ? env.ASSETS.fetch(request) : new Response('找不到', { status: 404 });
    const port = url.port ? `:${url.port}` : '';
    const at = (id) => `${url.protocol}//${id}.localhost${port}/`;
    const system = await (await env.ASSETS.fetch(new URL('/apps.json', url))).json().catch(() => ({ apps: [] }));
    let installed = { apps: [], favorites: [] };
    let error = '';
    try {
      const r = await env.INSTALLER.fetch('http://installer/api/home');
      if (r.ok) installed = await r.json();
      else error = `安裝程式回傳 ${r.status}`;
    } catch (e) {
      error = `連不到安裝程式：${e.message}`;
    }
    const installer = at('installer');
    const html = `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ruwebos</title>
<link rel="stylesheet" href="/home.css">
</head>
<body>
<main>
  <header>
    <h1>ru<span>webos</span></h1>
    <p>以瀏覽器為介面的系統：每個應用是一個 rucloud Worker，資料存在資料碟，重開機後還在。</p>
  </header>
  <section class="grid">
${system.apps.map((a) => card(at(a.id), a, a.icon ? `${at(a.id).slice(0, -1)}${a.icon}` : '')).join('\n')}
  </section>
  <div class="section-head"><h2>安裝的應用</h2><a href="${esc(installer)}">管理</a></div>
  ${error ? `<p class="empty">${esc(error)}</p>` : ''}
  <section class="grid">
${installed.apps.map((a) => card(at(a.id), a, a.icon ? `${installer.slice(0, -1)}${a.icon}` : '')).join('\n')}
    <a class="app add" href="${esc(installer)}"><b class="icon">＋</b><span><strong>安裝應用</strong><small>從網址或 GitHub 安裝</small></span></a>
  </section>
  <div class="section-head"><h2>我的最愛</h2><a href="${esc(installer)}favorites">管理</a></div>
  <section class="grid">
${(installed.favorites || []).map((f) => card(f.url, { name: f.title, description: new URL(f.url).host, color: '#495057' }, '')).join('\n')}
    <a class="app add" href="${esc(installer)}favorites"><b class="icon">＋</b><span><strong>加入我的最愛</strong><small>任何網站的網址</small></span></a>
  </section>
  <footer>ruvm · Debian 13 · rucloud · rubrowser</footer>
</main>
</body>
</html>
`;
    return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
  },
};
