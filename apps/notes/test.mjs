// 備忘錄：新增、閱讀、搜尋、資料夾、釘選、匯出、編輯、刪除
export default async function (t) {
  await t.page('/', '備忘錄');
  const loc = await t.submit('/new', { title: '測試 <b>', folder: '測試', body: '# 標題\n- [x] 完成\n<script>alert(1)</script>' });
  t.ok(/^\/n\/\w+$/.test(loc), `new → ${loc}`);
  const view = await t.page(loc, '測試 &lt;b&gt;', '<h1>標題</h1>', '&lt;script&gt;');
  t.ok(!view.text.includes('<script>alert'), 'script not escaped');
  await t.page('/?q=' + encodeURIComponent('完成'), loc);
  await t.page('/?folder=' + encodeURIComponent('測試'), loc);
  await t.submit(loc + '/pin');
  await t.page('/', '📌');
  const md = await t.get(loc + '.md');
  t.ok(md.status === 200 && md.headers.get('content-disposition').startsWith('attachment') && md.text.includes('# 標題'), 'export .md');
  await t.page(loc + '/edit', 'textarea');
  t.ok((await t.submit(loc, { title: '改過', folder: '', body: '新內容' })) === loc, 'edit redirect');
  await t.page(loc, '改過', '新內容');
  t.ok((await t.post('/new', { title: '', body: ' ' })).status === 400, 'empty note is refused');
  t.ok((await t.submit(loc + '/delete')) === '/', 'delete');
  t.ok((await t.get(loc)).status === 400, 'deleted note is gone');
}
