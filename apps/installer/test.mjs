// 安裝程式：安裝範例套件（只給部分權限）、應用要求權限、更新檢查、壞的套件、移除。只動自己的資料：
// 範例應用 hello-files（測試前後都移除）與它寫進「檔案」的 hello-files/hello.txt（搬到垃圾桶後清掉）。
export default async function (t) {
  const app = t.base.replace('//installer.', '//hello-files.');
  const files = t.base.replace('//installer.', '//files.');
  const remove = () => t.post('/apps/hello-files/remove', { data: 'purge' });
  await remove();
  await t.page('/', '已安裝的應用', 'GitHub');

  // 安裝：先下載、檢查，顯示權限讓使用者同意
  const r = await t.get(`/install?src=${encodeURIComponent(`${t.base}/packages/samples/hello-files.tar.gz`)}`);
  t.ok(r.status === 303 && /token=/.test(r.location), `install: ${r.status} ${r.text.slice(0, 300)}`);
  const token = /token=(\w+)/.exec(r.location)[1];
  const consentPage = await t.page(`/install?token=${token}`, 'Hello Files', '授權 MIT', '讀取「檔案」裡的檔案', '連線到網際網路', '不勾也能安裝', '應用的說明：「列出你在「檔案」裡的 hello-files 資料夾」', '如果同時給');
  t.ok(!/type="checkbox"[^>]* checked/.test(consentPage.text), 'no permission is checked by default');
  t.ok((await t.submit('/install', { token, perm: ['files:read'] })).endsWith('/apps/hello-files'), 'installed');
  await t.page('/apps/hello-files', 'Hello Files', '1.0.0', '儲存權限', '應用的說明');

  // 只有 files:read：可以列檔案，不能寫、沒有系統資訊、不能連外
  const page = async () => (await fetch(`${app}/`)).text();
  let html = await page();
  t.ok(html.includes('要求「system:info」權限') && html.includes('沒有連線到外部網路的權限'), `limited: ${html.slice(0, 400)}`);
  t.ok((await fetch(`${app}/write`, { method: 'POST', redirect: 'manual' })).status === 403, 'write without files:write');

  // 應用要求權限 → 同意 → 回到應用
  const back = `${app}/`;
  await t.page(`/grant?app=hello-files&perm=files:write&return=${encodeURIComponent(back)}`, '要求', '在「檔案」裡新增、修改、刪除檔案', '按「寫入」時');
  // files:read 已經給了：再要求網路時提醒危險的組合
  await t.page(`/grant?app=hello-files&perm=network&return=${encodeURIComponent(back)}`, '允許之後，這個應用就可以讀取你「檔案」裡的檔案，並傳到網際網路上');
  t.ok((await t.get(`/grant?app=hello-files&perm=files:write&return=${encodeURIComponent('https://example.com/')}`)).status === 400, 'return must be the app');
  t.ok((await t.get(`/grant?app=hello-files&perm=photos:read&return=${encodeURIComponent(back)}`)).status === 400, 'undeclared permission');
  t.ok((await t.submit('/grant', { app: 'hello-files', perm: 'files:write', return: back, answer: 'yes' })) === back, 'granted');
  t.ok((await fetch(`${app}/write`, { method: 'POST', redirect: 'manual' })).status === 303, 'write with files:write');
  const list = await (await fetch(`${files}/api/v1/list?dir=hello-files/`)).json();
  t.ok(list.files.some((f) => f.path === 'hello-files/hello.txt'), 'file written');
  html = await page();
  t.ok(html.includes('hello-files/hello.txt'), 'app lists its file');

  await t.page('/', 'Hello Files');
  const removePage = await t.page('/apps/hello-files/remove', '保留資料', '無法復原');
  t.ok(removePage.status === 200, 'remove page');
  const upd = await t.post('/apps/hello-files/update', {});
  t.ok(upd.status === 200 && upd.text.includes('已經是最新版'), `update check: ${upd.status}`);

  // 壞的來源
  const bad = await t.get(`/install?src=${encodeURIComponent(`${t.base}/packages/nope.tar.gz`)}`);
  t.ok(bad.status === 400 && bad.text.includes('下載'), `bad source: ${bad.status}`);
  t.ok((await t.get('/install?src=ftp://x/')).status === 400, 'only http(s)');

  // 沒有 ruwebos-app.json 的一般 wrangler 專案（上傳）：描述自動產生；授權認不出時要使用者填；不支援的服務直接拒絕
  const { tar, gzip } = await import('./src/tar.js');
  const enc = new TextEncoder();
  const project = (name, license, extra = '') => gzip(tar(Object.entries({
    [`${name}/wrangler.jsonc`]: `// plain\n{ "name": "${name}", "main": "src/index.js", "compatibility_date": "2025-11-01", ${extra} "kv_namespaces": [{ "binding": "KV", "id": "x" }], }`,
    [`${name}/src/index.js`]: 'export default { async fetch(r, env) { const n = Number((await env.KV.get("n")) || 0) + 1; await env.KV.put("n", String(n)); return new Response("count " + n); } };',
    [`${name}/package.json`]: JSON.stringify({ name, version: '0.3.1', description: 'test project' }),
    [`${name}/LICENSE`]: license,
  }).map(([path, text]) => ({ path, data: enc.encode(text) }))));
  const upload = async (name, bytes) => {
    const body = new FormData();
    body.append('file', new File([bytes], `${name}.tar.gz`, { type: 'application/gzip' }));
    return fetch(`${t.base}/install/upload`, { method: 'POST', body, redirect: 'manual' });
  };
  const mit = 'MIT License\n\nPermission is hereby granted, free of charge, to any person obtaining a copy of this software';
  let up = await upload('test-plain', await project('test-plain', mit));
  t.ok(up.status === 303, `plain upload: ${up.status}`);
  let tok = /token=(\w+)/.exec(up.headers.get('location'))[1];
  await t.page(`/install?token=${tok}`, '沒有 ruwebos 的描述檔', '授權 MIT', '權限預設都不給', '應用沒有說明為什麼需要');
  t.ok((await t.submit('/install', { token: tok })).endsWith('/apps/test-plain'), 'plain installed');
  t.ok((await (await fetch(t.base.replace('//installer.', '//test-plain.') + '/')).text()) === 'count 1', 'plain app runs');
  up = await upload('test-odd', await project('test-odd', 'Some custom terms.'));
  tok = /token=(\w+)/.exec(up.headers.get('location'))[1];
  await t.page(`/install?token=${tok}`, '授權 待確認', '認不出這個專案的授權', 'Some custom terms.');
  t.ok((await t.post('/install', { token: tok })).status === 400, 'a license is required');
  t.ok((await t.submit('/install', { token: tok, license: 'LicenseRef-custom' })).endsWith('/apps/test-odd'), 'installed with the given license');
  await t.page('/apps/test-odd', 'LicenseRef-custom');
  // Queues 與 Workflows 可以用（rucloud 替佇列名稱加上應用名稱前綴）
  up = await upload('test-queue', await project('test-queue', mit, '"queues": { "producers": [{ "binding": "Q", "queue": "q" }], "consumers": [{ "queue": "q" }] },'));
  t.ok(up.status === 303, `queue upload: ${up.status}`);
  tok = /token=(\w+)/.exec(up.headers.get('location'))[1];
  t.ok((await t.submit('/install', { token: tok })).endsWith('/apps/test-queue'), 'queue app installed');
  // Worker 引用 npm 套件、沒有 node_modules：依 package-lock.json 從 npm 下載（要能連到 registry.npmjs.org）
  const lock = {"name":"test-npm","version":"1.0.0","lockfileVersion":3,"requires":true,"packages":{"":{"name":"test-npm","version":"1.0.0","license":"MIT"},"node_modules/hono":{"version":"4.6.20","resolved":"https://registry.npmjs.org/hono/-/hono-4.6.20.tgz","integrity":"sha512-5qfNQeaIptMaJKyoJ6N/q4gIq0DBp2FCRaLNuUI3LlJKL4S37DY/rLL1uAxA4wrPB39tJ3s+f7kgI79O4ScSug==","license":"MIT"},"node_modules/ms":{"version":"2.1.3","resolved":"https://registry.npmjs.org/ms/-/ms-2.1.3.tgz","integrity":"sha512-6FlzubTLZG3J2a/NVCAleEhjzq5oxgHyaCU9yYXvcLsvoVaHJq/s5xXI6/XXP6tz7R9xAOtHnSO/tXtF3WRTlA==","license":"MIT"}}};
  const npmProject = (lockText) => gzip(tar(Object.entries({
    'wrangler.jsonc': '{ "name": "test-npm", "main": "src/index.js" }',
    'src/index.js': "import { Hono } from 'hono'; import ms from 'ms'; const app = new Hono(); app.get('/', (c) => c.text('hono ' + ms(60000))); export default app;",
    'package.json': JSON.stringify({ name: 'test-npm', version: '1.0.0', license: 'MIT', dependencies: { hono: '4.6.20', ms: '2.1.3' } }),
    'package-lock.json': lockText,
  }).map(([path, text]) => ({ path, data: enc.encode(text) }))));
  if ((await fetch('https://registry.npmjs.org/ms', { method: 'HEAD', signal: AbortSignal.timeout(5000) }).catch(() => null))?.ok) {
    up = await upload('test-npm', await npmProject(JSON.stringify(lock)));
    t.ok(up.status === 303, `npm upload: ${up.status} ${up.status === 303 ? '' : (await up.text()).slice(0, 300)}`);
    tok = /token=(\w+)/.exec(up.headers.get('location'))[1];
    await t.page(`/install?token=${tok}`, 'npm 套件', '2 個', 'MIT 2');
    t.ok((await t.submit('/install', { token: tok })).endsWith('/apps/test-npm'), 'npm app installed');
    const got = await (await fetch(t.base.replace('//installer.', '//test-npm.') + '/')).text();
    t.ok(got === 'hono 1m', `npm app runs: ${got.slice(0, 200)}`);
    // integrity 不符就拒絕
    const bad = JSON.parse(JSON.stringify(lock));
    bad.packages['node_modules/ms'].integrity = bad.packages['node_modules/hono'].integrity;
    up = await upload('test-npm', await npmProject(JSON.stringify(bad)));
    t.ok(up.status === 400 && (await up.text()).includes('integrity'), `integrity mismatch: ${up.status}`);
    t.ok((await t.post('/apps/test-npm/remove', { data: 'purge' })).status === 303, 'remove test-npm');
  } else {
    console.log('  (skip npm: registry.npmjs.org unreachable)');
  }
  up = await upload('test-browser', await project('test-browser', mit, '"browser": { "binding": "B" },'));
  const refused = await up.text();
  t.ok(up.status === 400 && refused.includes('Browser Rendering'), `unsupported binding: ${up.status}`);
  // ai 綁定：可以裝，自動要求「使用 AI」權限（預設不勾）
  up = await upload('test-ai', await project('test-ai', mit, '"ai": { "binding": "AI" },'));
  t.ok(up.status === 303, `ai upload: ${up.status}`);
  tok = /token=(\w+)/.exec(up.headers.get('location'))[1];
  await t.page(`/install?token=${tok}`, '使用 AI');
  up = await upload('test-build', await project('test-build', mit, '"assets": { "directory": "./dist" },'));
  t.ok(up.status === 400 && (await up.text()).includes('要先建置'), `needs a build: ${up.status}`);
  for (const id of ['test-plain', 'test-odd', 'test-queue']) t.ok((await t.post(`/apps/${id}/remove`, { data: 'purge' })).status === 303, `remove ${id}`);

  // 收尾：移除應用（含資料），檔案搬到垃圾桶再清掉
  t.ok((await remove()).status === 303, 'removed');
  t.ok((await fetch(`${app}/`)).status === 404, 'gone');
  const del = await (await fetch(`${files}/api/v1/file?path=hello-files/hello.txt`, { method: 'DELETE' })).json();
  const purged = await fetch(`${files}/trash/purge`, { method: 'POST', body: new URLSearchParams({ key: del.trash }), redirect: 'manual' });
  t.ok(purged.status === 303, 'test file purged');
}
