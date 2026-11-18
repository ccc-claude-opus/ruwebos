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

  // 收尾：移除應用（含資料），檔案搬到垃圾桶再清掉
  t.ok((await remove()).status === 303, 'removed');
  t.ok((await fetch(`${app}/`)).status === 404, 'gone');
  const del = await (await fetch(`${files}/api/v1/file?path=hello-files/hello.txt`, { method: 'DELETE' })).json();
  const purged = await fetch(`${files}/trash/purge`, { method: 'POST', body: new URLSearchParams({ key: del.trash }), redirect: 'manual' });
  t.ok(purged.status === 303, 'test file purged');
}
