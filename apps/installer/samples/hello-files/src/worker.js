// Hello Files：安裝的應用怎麼用系統的權限（給應用開發者參考）。
//   env.FILES   「檔案」的 API（權限 files:read／files:write）：GET /api/v1/list?dir=、GET|PUT|DELETE /api/v1/file?path=
//   env.SYSTEM  系統資訊（權限 system:info）：GET /api/v1/system
//   fetch()     連到網際網路（權限 network）
// 使用者沒給的權限，env 裡就沒有那個綁定，或系統應用回 403 { error: 'permission', perm }；
// 這時把使用者帶到安裝程式的 /grant 頁面要求，同意後會回到 return 的網址。
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function grantLink(request, perm) {
  const u = new URL(request.url);
  const installer = `${u.protocol}//installer.localhost${u.port ? ':' + u.port : ''}`;
  const back = `${u.origin}/`;
  return `<a href="${installer}/grant?app=hello-files&amp;perm=${perm}&amp;return=${encodeURIComponent(back)}">要求「${perm}」權限</a>`;
}

async function call(binding, path, init) {
  if (!binding) return { ok: false, status: 403, body: { error: 'permission' } };
  const r = await binding.fetch(`http://system${path}`, init);
  const body = (r.headers.get('content-type') || '').includes('json') ? await r.json() : await r.text();
  return { ok: r.ok, status: r.status, body };
}

async function home(request, env) {
  const sys = await call(env.SYSTEM, '/api/v1/system');
  const files = await call(env.FILES, '/api/v1/list?dir=hello-files/');
  let net;
  try {
    net = `HTTP ${(await fetch('https://example.com/', { method: 'HEAD', signal: AbortSignal.timeout(5000) })).status}`;
  } catch (e) {
    net = `連不上：${e.message}`;
  }
  const denied = (r, perm) => (r.status === 403 ? `沒有權限。${grantLink(request, perm)}` : `錯誤 ${r.status}：${esc(JSON.stringify(r.body))}`);
  const body = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Hello Files</title><link rel="icon" href="/icon.svg"></head>
<body style="font-family:sans-serif;max-width:640px;margin:24px auto;padding:0 16px;line-height:1.6">
<h1>Hello Files</h1>
<h2>系統資訊</h2>
<p id="system">${sys.ok ? `時區 ${esc(sys.body.timeZone)}，語言 ${esc(sys.body.language)}` : denied(sys, 'system:info')}</p>
<h2>「檔案」裡的 hello-files/</h2>
<div id="files">${files.ok ? (files.body.files.length ? `<ul>${files.body.files.map((f) => `<li>${esc(f.path)}（${f.size} bytes）</li>`).join('')}</ul>` : '<p>（還沒有檔案）</p>') : `<p>${denied(files, 'files:read')}</p>`}</div>
<form method="post" action="/write"><button type="submit">寫入 hello-files/hello.txt</button></form>
<h2>網際網路</h2>
<p id="network">${esc(net)}</p>
</body></html>`;
  return new Response(body, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/' && request.method === 'GET') return home(request, env);
    if (url.pathname === '/write' && request.method === 'POST') {
      const r = await call(env.FILES, '/api/v1/file?path=hello-files/hello.txt', {
        method: 'PUT',
        headers: { 'content-type': 'text/plain; charset=utf-8' },
        body: `Hello from an installed app, ${new Date().toISOString()}\n`,
      });
      if (r.status === 403) {
        return new Response(`<p>沒有寫入「檔案」的權限。${grantLink(request, 'files:write')}</p>`, { status: 403, headers: { 'content-type': 'text/html; charset=utf-8' } });
      }
      return new Response(null, { status: 303, headers: { location: '/' } });
    }
    return new Response('找不到', { status: 404 });
  },
};
