// 行事曆：新增（定時、整天、每週重複）、月曆與一天的檢視、輸入檢查、iCalendar 匯出與匯入、生日與待辦的整合、刪除
// 時區用 UTC（測試沒有 tz cookie）
export default async function (t) {
  // 名稱都加上這次的代號，清理時只刪自己建立的行程
  const tag = Date.now().toString(36);
  await t.page('/?m=2031-03', '2031 年 3 月', '下個月');
  const a = await t.submit('/new', { title: `開會 <b> ${tag}`, start_date: '2031-03-10', start_time: '09:30', end_date: '2031-03-10', end_time: '10:30', location: '會議室', note: '議程', freq: '' });
  t.ok(/^\/e\/\w+$/.test(a), `new → ${a}`);
  await t.page(a, '開會 &lt;b&gt;', '會議室', '09:30');
  const b = await t.submit('/new', { title: `連假 ${tag}`, all_day: '1', start_date: '2031-03-14', end_date: '2031-03-16' });
  const c = await t.submit('/new', { title: `每週課 ${tag}`, start_date: '2031-03-03', start_time: '13:00', end_time: '15:00', freq: 'WEEKLY', interval: '1', byday: ['1', '3'], until: '2031-03-31' });
  await t.page(c, '每週一、三，到 2031/03/31');
  const month = await t.page('/?m=2031-03', '開會 &lt;b&gt;', '連假', '每週課');
  // 每週一、三，到 3/31：3/3 起共 9 次（月曆一格最多列 3 項，所以逐日檢查）
  for (const d of [3, 5, 10, 12, 17, 19, 24, 26, 31]) await t.page(`/day/2031-03-${String(d).padStart(2, '0')}`, `每週課 ${tag}`);
  t.ok(!(await t.get('/day/2031-03-04')).text.includes(`每週課 ${tag}`), 'not on Tuesdays');
  await t.page('/day/2031-03-15', '連假');
  await t.page('/day/2031-03-12', '每週課', '13:00–15:00');
  t.ok(!(await t.get('/day/2031-04-02')).text.includes('每週課'), 'until is respected');
  t.ok((await t.post('/new', { title: '', start_date: '2031-03-01' })).status === 400, 'title required');
  t.ok((await t.post('/new', { title: 'x', start_date: '2031-03-01', start_time: '10:00', end_date: '2031-03-01', end_time: '09:00' })).status === 400, 'end before start refused');
  t.ok((await t.post('/new', { title: 'x', start_date: '2031-02-30' })).status === 400, 'bad date refused');
  t.ok((await t.post('/new', { title: 'x', start_date: '2031-03-01', freq: 'HOURLY' })).status === 400, 'bad freq refused');
  // 編輯
  t.ok((await t.submit(a, { title: '開會（改）', start_date: '2031-03-10', start_time: '11:00', end_date: '2031-03-10', end_time: '12:00' })) === a, 'edit');
  await t.page(a, '開會（改）', '11:00');
  // 匯出、匯入
  const ics = await t.get('/export.ics');
  t.ok(ics.type.startsWith('text/calendar') && ics.text.includes('DTSTART;VALUE=DATE:20310314\r\nDTEND;VALUE=DATE:20310317') && ics.text.includes('RRULE:FREQ=WEEKLY;UNTIL=20310331;BYDAY=MO,WE'), 'export');
  const imp = await t.submit('/import', { text: `BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nSUMMARY:匯入的\\, 行程 ${tag}\r\nDTSTART:20310320T020000Z\r\nDTEND:20310320T030000Z\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n` });
  t.ok(imp === '/?imported=1', `import → ${imp}`);
  await t.page('/day/2031-03-20', `匯入的, 行程 ${tag}`, '02:00–03:00');
  t.ok((await t.post('/import', { text: 'nothing' })).status === 400, 'non-ics refused');
  const small = `BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nSUMMARY:上傳的 ${tag}\r\nDTSTART;VALUE=DATE:20310322\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`;
  const up = await t.post('/import', { file: new File([small], 'a.ics', { type: 'text/calendar' }) });
  t.ok(up.status === 303, `upload import: ${up.status}`);
  // 通訊錄的生日、待辦的期限出現在那一天（兩個應用都在跑的時候）
  const contacts = t.base.replace('//calendar.', '//contacts.');
  const todo = t.base.replace('//calendar.', '//todo.');
  const cl = await fetch(contacts + '/new', { method: 'POST', body: new URLSearchParams({ name: '生日測試', birthday: '2001-03-21' }), redirect: 'manual' });
  const tl = await fetch(todo + '/add', { method: 'POST', body: new URLSearchParams({ title: '期限測試', due: '2031-03-21' }), redirect: 'manual' });
  if (cl.status === 303 && tl.status === 303) await t.page('/day/2031-03-21', '🎂 生日測試（30 歲）', '☐ 期限測試');
  if (cl.status === 303) await fetch(contacts + cl.headers.get('location') + '/delete', { method: 'POST', redirect: 'manual' });
  if (tl.status === 303) await fetch(todo + tl.headers.get('location') + '/delete', { method: 'POST', redirect: 'manual' });
  // 清掉這次建立的行程（名稱有 tag 的）
  const mine = new Set();
  for (const d of ['2031-03-03', '2031-03-10', '2031-03-14', '2031-03-20', '2031-03-22']) {
    const r = await t.get(`/day/${d}`);
    for (const x of r.text.matchAll(/href="\/e\/(\w+)">(?:<span[^>]*>[^<]*<\/span> )?([^<]*)<\/a>/g)) if (x[2].includes(tag)) mine.add(x[1]);
  }
  for (const id of mine) await t.post(`/e/${id}/delete`);
  t.ok(!(await t.get('/?m=2031-03')).text.includes(tag), 'cleaned up');
  t.ok((await t.get(b)).status === 400, 'deleted event is gone');
}
