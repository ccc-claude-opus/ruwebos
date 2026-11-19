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
  await t.page(`/install?token=${token}`, 'Hello Files', '授權 MIT', '讀取「檔案」裡的檔案', '連線到網際網路');
  t.ok((await t.submit('/install', { token, perm: ['files:read'] })).endsWith('/apps/hello-files'), 'installed');
  await t.page('/apps/hello-files', 'Hello Files', '1.0.0', '儲存權限');

  // 只有 files:read：可以列檔案，不能寫、沒有系統資訊、不能連外
  const page = async () => (await fetch(`${app}/`)).text();
  let html = await page();
  t.ok(html.includes('要求「system:info」權限') && html.includes('沒有連線到外部網路的權限'), `limited: ${html.slice(0, 400)}`);
  t.ok((await fetch(`${app}/write`, { method: 'POST', redirect: 'manual' })).status === 403, 'write without files:write');

  // 應用要求權限 → 同意 → 回到應用
  const back = `${app}/`;
  await t.page(`/grant?app=hello-files&perm=files:write&return=${encodeURIComponent(back)}`, '要求', '在「檔案」裡新增、修改、刪除檔案');
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
  await t.page(`/install?token=${tok}`, '沒有 ruwebos 的描述檔', '授權 MIT', '預設都不勾');
  t.ok((await t.submit('/install', { token: tok })).endsWith('/apps/test-plain'), 'plain installed');
  t.ok((await (await fetch(t.base.replace('//installer.', '//test-plain.') + '/')).text()) === 'count 1', 'plain app runs');
  up = await upload('test-odd', await project('test-odd', 'Some custom terms.'));
  tok = /token=(\w+)/.exec(up.headers.get('location'))[1];
  await t.page(`/install?token=${tok}`, '授權 待確認', '認不出這個專案的授權', 'Some custom terms.');
  t.ok((await t.post('/install', { token: tok })).status === 400, 'a license is required');
  t.ok((await t.submit('/install', { token: tok, license: 'LicenseRef-custom' })).endsWith('/apps/test-odd'), 'installed with the given license');
  await t.page('/apps/test-odd', 'LicenseRef-custom');
  up = await upload('test-queue', await project('test-queue', mit, '"queues": { "producers": [{ "binding": "Q", "queue": "q" }] },'));
  const refused = await up.text();
  t.ok(up.status === 400 && refused.includes('Queues'), `unsupported binding: ${up.status}`);
  for (const id of ['test-plain', 'test-odd']) t.ok((await t.post(`/apps/${id}/remove`, { data: 'purge' })).status === 303, `remove ${id}`);

  // 收尾：移除應用（含資料），檔案搬到垃圾桶再清掉
  t.ok((await remove()).status === 303, 'removed');
  t.ok((await fetch(`${app}/`)).status === 404, 'gone');
  const del = await (await fetch(`${files}/api/v1/file?path=hello-files/hello.txt`, { method: 'DELETE' })).json();
  const purged = await fetch(`${files}/trash/purge`, { method: 'POST', body: new URLSearchParams({ key: del.trash }), redirect: 'manual' });
  t.ok(purged.status === 303, 'test file purged');
}
