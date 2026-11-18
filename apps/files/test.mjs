// 檔案：資料夾、上傳（multipart）、清單、預覽、Range、改名、搬移、垃圾桶（還原、永久刪除）、HTML 當純文字、名稱檢查
export default async function (t) {
  const top = `測試-${Date.now().toString(36)}`;
  await t.page('/', '檔案');
  t.ok((await t.submit('/mkdir', { dir: '', name: top })) === `/d/${encodeURIComponent(top)}/`, 'mkdir');
  t.ok((await t.post('/mkdir', { dir: '', name: '..' })).status === 400, '.. refused');
  t.ok((await t.post('/mkdir', { dir: '', name: 'a/b' })).status === 400, 'slash refused');
  const dir = top + '/';
  const up = await t.submit('/upload', {
    dir,
    file: new File(['# 標題\n\n內容 <b>\n0123456789'], '說明.md', { type: 'text/markdown' }),
  });
  t.ok(up === `/d/${encodeURIComponent(top)}/`, `upload → ${up}`);
  await t.submit('/upload', { dir, file: new File(['<script>alert(1)</script>'], 'x.html', { type: 'text/html' }) });
  await t.submit('/upload', { dir, file: new File(['second'], '說明.md', { type: 'text/markdown' }) });
  const list = await t.page(`/d/${encodeURIComponent(top)}/`, '說明.md', '說明 (2).md', 'x.html');
  const md = `/f/${encodeURIComponent(top)}/${encodeURIComponent('說明.md')}`;
  await t.page(md, '<h1>標題</h1>', '內容 &lt;b&gt;');
  const rawUrl = `/raw/${encodeURIComponent(top)}/${encodeURIComponent('說明.md')}`;
  const r = await fetch(t.base + rawUrl, { headers: { range: 'bytes=0-4' } });
  t.ok(r.status === 206 && r.headers.get('content-range').startsWith('bytes 0-4/') && (await r.arrayBuffer()).byteLength === 5, 'range');
  t.ok((await fetch(t.base + rawUrl, { headers: { range: 'bytes=99999-' } })).status === 416, '416');
  const tail = await fetch(t.base + rawUrl, { headers: { range: 'bytes=-10' } });
  t.ok(tail.status === 206 && (await tail.text()) === '0123456789', 'suffix range');
  const dl = await t.get(rawUrl + '?download=1');
  t.ok(dl.headers.get('content-disposition').includes("filename*=UTF-8''%E8%AA%AA%E6%98%8E.md"), 'download name');
  const html = await t.get(`/raw/${encodeURIComponent(top)}/x.html`);
  t.ok(html.type.startsWith('text/plain') && html.headers.get('content-security-policy') === 'sandbox', 'html served as text');
  // 改名、搬移
  t.ok((await t.submit('/rename', { path: `${dir}x.html`, name: 'y.txt' })) === `/f/${encodeURIComponent(top)}/y.txt`, 'rename');
  t.ok((await t.post('/rename', { path: `${dir}y.txt`, name: '說明.md' })).status === 400, 'rename onto existing refused');
  await t.submit('/mkdir', { dir, name: '子資料夾' });
  t.ok((await t.submit('/move', { path: `${dir}y.txt`, to: `${dir}子資料夾/` })).endsWith('/y.txt'), 'move');
  await t.page(`/d/${encodeURIComponent(top)}/${encodeURIComponent('子資料夾')}/`, 'y.txt');
  t.ok((await t.post('/move', { path: dir, to: `${dir}子資料夾/` })).status === 400, 'move into itself refused');
  // 刪除 → 垃圾桶 → 還原 → 再刪 → 永久刪除
  await t.submit('/delete', { path: `${dir}說明 (2).md` });
  t.ok(!(await t.get(`/d/${encodeURIComponent(top)}/`)).text.includes('說明 (2).md'), 'deleted from folder');
  const trash = await t.page('/trash', `${dir}說明 (2).md`);
  const stamp = /name="key" value="(\d+)"/.exec(trash.text.slice(trash.text.indexOf(`${dir}說明 (2).md`)))[1];
  await t.submit('/trash/restore', { key: stamp });
  await t.page(`/d/${encodeURIComponent(top)}/`, '說明 (2).md');
  const api = JSON.parse((await t.get(`/api/list?dir=${encodeURIComponent(dir)}`)).text);
  t.ok(api.files.length === 2 && api.folders.includes(`${dir}子資料夾/`), 'api/list');
  // 整個測試資料夾刪掉再從垃圾桶永久刪除
  t.ok((await t.submit('/delete', { path: dir })) === '/', 'delete folder');
  t.ok(!(await t.get('/')).text.includes(top), 'folder gone');
  const trash2 = await t.page('/trash', dir);
  const stamp2 = /name="key" value="(\d+)"/.exec(trash2.text.slice(trash2.text.indexOf(`<strong>${dir}</strong>`)))[1];
  await t.submit('/trash/purge', { key: stamp2 });
  t.ok(!(await t.get('/trash')).text.includes(`<strong>${dir}</strong>`), 'purged');
}
