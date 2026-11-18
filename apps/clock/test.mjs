// 時鐘：世界時鐘、城市、鬧鐘、碼錶、計時器與時間 API
export default async function (t) {
  await t.page('/', '世界時鐘', 'Asia/Taipei', 'Asia/Tokyo', 'Europe/London', 'America/New_York');
  await t.page('/alarms', '鬧鐘在這一頁開著時響；背景提醒等瀏覽器支援通知後加入');
  await t.page('/stopwatch', '00:00.00', '開始', '暫停', '重設', '分圈', '需要 JavaScript');
  await t.page('/timer', '00:00.00', '1 分鐘', '3 分鐘', '5 分鐘', '10 分鐘', '需要 JavaScript');

  const api = await t.get('/api/time?tz=Asia%2FTaipei');
  t.ok(api.status === 200 && api.type.startsWith('application/json'), 'time API returns JSON');
  const time = JSON.parse(api.text);
  t.ok(time.tz === 'Asia/Taipei' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(time.local) && !Number.isNaN(Date.parse(time.iso)), 'time API payload');
  const badApi = await t.get('/api/time?tz=Not%2FAZone');
  t.ok(badApi.status === 400 && badApi.type.startsWith('application/json'), 'invalid time zone is refused as JSON');

  const cityLabel = `測試城市-${Date.now()}`;
  t.ok((await t.submit('/cities', { tz: 'Asia/Tokyo', label: cityLabel })) === '/', 'add city redirects');
  const cityPage = await t.page('/', cityLabel);
  const cityPos = cityPage.text.indexOf(cityLabel);
  const cityMarker = cityPage.text.lastIndexOf('data-city-index="', cityPos);
  t.ok(cityPos >= 0 && cityMarker >= 0, 'city is listed');
  const cityIndex = cityPage.text.slice(cityMarker + 17, cityPage.text.indexOf('"', cityMarker + 17));
  t.ok((await t.submit(`/cities/${cityIndex}/delete`)) === '/', 'delete city redirects');
  t.ok(!(await t.get('/')).text.includes(cityLabel), 'city was deleted');
  t.ok((await t.post('/cities', { tz: 'Not/AZone', label: 'bad' })).status === 400, 'invalid city time zone is refused');

  const token = `測試鬧鐘-${Date.now()}`;
  const alarmLabel = `<b>${token}</b>`;
  t.ok((await t.submit('/alarms', { time: '06:34', label: alarmLabel, days: ['1', '3'] })) === '/alarms', 'add alarm redirects');
  const alarmPage = await t.page('/alarms', `&lt;b&gt;${token}&lt;/b&gt;`);
  t.ok(!alarmPage.text.includes(`<b>${token}</b>`), 'alarm label is escaped');
  const alarmPos = alarmPage.text.indexOf(token);
  const alarmMarker = alarmPage.text.lastIndexOf('data-alarm-id="', alarmPos);
  t.ok(alarmPos >= 0 && alarmMarker >= 0, 'alarm is listed');
  const alarmId = alarmPage.text.slice(alarmMarker + 15, alarmPage.text.indexOf('"', alarmMarker + 15));
  t.ok((await t.submit(`/alarms/${alarmId}/toggle`)) === '/alarms', 'toggle alarm redirects');
  const toggled = await t.page('/alarms', token);
  t.ok(new RegExp(`data-alarm-id="${alarmId}"[^>]*data-alarm-enabled="false"`).test(toggled.text), 'alarm can be turned off');
  t.ok((await t.submit(`/alarms/${alarmId}/delete`)) === '/alarms', 'delete alarm redirects');
  t.ok(!(await t.get('/alarms')).text.includes(token), 'alarm was deleted');
  t.ok((await t.post('/alarms', { time: '99:99', label: 'bad' })).status === 400, 'invalid alarm time is refused');
  t.ok((await t.post('/alarms', { time: '07:00', days: '9' })).status === 400, 'invalid weekday is refused');
}
