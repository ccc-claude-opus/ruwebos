// 待辦：首頁檢視、快速新增、編輯、重複事項、清單與到期日 API
export default async function (t) {
  const suffix = Date.now().toString(36);
  const listName = `測試清單 <b> ${suffix}`;
  const taskTitle = `測試 <script>alert(1)</script> ${suffix}`;
  let listId = '';
  const taskIds = new Set();

  try {
    await t.page('/', '待辦', '今天', '已排程', '全部', '已完成', '快速新增');
    t.ok((await t.post('/add', { title: ' ', due: '', list_id: '' })).status === 400, 'empty title is refused');
    t.ok((await t.post('/add', { title: '錯誤日期', due: '2026-02-30', list_id: '' })).status === 400, 'invalid due date is refused');

    t.ok((await t.submit('/lists', { name: listName })) === '/lists', 'create list redirects');
    const listPage = await t.page('/lists', '測試清單 &lt;b&gt;', '重新命名', '刪除清單');
    const listMatch = /action="\/lists\/([\w-]+)"/.exec(listPage.text);
    t.ok(!!listMatch, 'list id is available');
    listId = listMatch[1];
    t.ok((await t.post(`/lists/${listId}`, { name: ' ' })).status === 400, 'empty list name is refused');
    t.ok((await t.submit(`/lists/${listId}`, { name: `已改名 ${suffix}` })) === '/lists', 'rename list');
    await t.page('/lists', `已改名 ${suffix}`);

    const taskLoc = await t.submit('/add', { title: taskTitle, due: '2000-01-02', list_id: listId });
    const taskMatch = /^\/t\/([\w-]+)$/.exec(taskLoc);
    t.ok(!!taskMatch, `add task → ${taskLoc}`);
    const taskId = taskMatch[1];
    taskIds.add(taskId);
    let taskPage = await t.page(taskLoc, '測試 &lt;script&gt;alert(1)&lt;/script&gt;', 'textarea', '不重複');
    t.ok(!taskPage.text.includes('<script>alert(1)</script>'), 'task title is escaped');
    await t.page('/', '測試 &lt;script&gt;alert(1)&lt;/script&gt;', `已改名 ${suffix}`);

    t.ok((await t.post(taskLoc, { title: '', note: '', due: '', repeat: '', list_id: '' })).status === 400, 'empty edited title is refused');
    t.ok((await t.post(taskLoc, { title: '錯誤重複', note: '', due: '', repeat: 'hourly', list_id: '' })).status === 400, 'invalid repeat is refused');
    t.ok((await t.post(taskLoc, { title: '錯誤日期', note: '', due: '2000-02-30', repeat: '', list_id: '' })).status === 400, 'invalid edited due date is refused');
    t.ok((await t.submit(taskLoc, { title: `改過 <i> ${suffix}`, note: '備註 <b>', due: '2000-01-02', repeat: 'weekly', list_id: listId })) === taskLoc, 'edit task');
    taskPage = await t.page(taskLoc, '改過 &lt;i&gt;', '備註 &lt;b&gt;', '每週');
    t.ok(!taskPage.text.includes('<b>'), 'note is escaped');

    await t.page('/?view=today', '改過 &lt;i&gt;', '逾期');
    await t.page('/?view=scheduled', '2000-01-02', '改過 &lt;i&gt;');
    await t.page(`/?list=${encodeURIComponent(listId)}`, '改過 &lt;i&gt;');
    await t.page('/?view=done', '還沒有已完成的待辦。');
    const apiBefore = await t.get("/api/due?from=2000-01-01&to=2000-01-20");
    t.ok(apiBefore.status === 200 && apiBefore.type.startsWith("application/json"), "due API returns JSON");
    const before = JSON.parse(apiBefore.text).tasks.filter((x) => x.id === taskId);
    t.ok(before.length === 1 && before[0].done === 0, 'due API lists the task');

    // 完成每週重複的待辦：原本的標成完成，並新增一週後的下一次
    t.ok((await t.submit(`/t/${taskId}/toggle`)) === '/', 'toggle redirects home');
    const after = JSON.parse((await t.get('/api/due?from=2000-01-01&to=2000-01-20')).text).tasks.filter((x) => x.title === `改過 <i> ${suffix}`);
    t.ok(after.some((x) => x.id === taskId && x.done === 1), 'task is done');
    const next = after.find((x) => x.due === '2000-01-09' && x.done === 0);
    t.ok(next, 'next weekly occurrence is created');
    taskIds.add(next.id);
    await t.page('/?view=done', '改過 &lt;i&gt;');
    t.ok((await t.get('/api/due?from=2000-01-20&to=2000-01-01')).status === 400, 'due API checks the range');

    // 刪除清單：清單裡的待辦留下來、不屬於任何清單
    t.ok((await t.submit(`/lists/${listId}/delete`)) === '/lists', 'delete list');
    listId = '';
    await t.page(`/t/${next.id}`, '改過 &lt;i&gt;');
  } finally {
    for (const id of taskIds) await t.post(`/t/${id}/delete`);
    if (listId) await t.post(`/lists/${listId}/delete`);
  }
  for (const id of taskIds) t.ok((await t.get(`/t/${id}`)).status !== 200, 'cleaned up');
}
