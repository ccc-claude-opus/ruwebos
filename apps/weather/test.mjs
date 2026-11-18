// 天氣：沒有網路也要通過。頁面、加入城市（檢查經緯度、重複）、城市頁（有預報或錯誤訊息，一定有資料來源）、移除、API 檢查。
export default async function (t) {
  const tag = Date.now().toString(36);
  await t.page('/', '天氣', 'Open-Meteo.com', 'CC BY 4.0');
  await t.page('/search', 'name="q"');
  t.ok((await t.post('/cities', { name: 'x', lat: '91', lon: '0' })).status === 400, 'bad latitude refused');
  t.ok((await t.post('/cities', { name: '', lat: '1', lon: '1' })).status === 400, 'empty name refused');
  const lat = String(-40 - (parseInt(tag, 36) % 4000) / 100); // a place nobody else adds
  t.ok((await t.submit('/cities', { name: `測試 <b> ${tag}`, admin: '', country: '', lat, lon: '20', tz: 'Nowhere/Atlantis' })) === '/', 'add city');
  const home = await t.page('/', `測試 &lt;b&gt; ${tag}`);
  const id = /href="\/c\/(\w+)"[^]*?測試 &lt;b&gt;/.exec(home.text.slice(home.text.lastIndexOf('href="/c/', home.text.indexOf(`測試 &lt;b&gt; ${tag}`))))[1];
  const city = await t.page(`/c/${id}`, `測試 &lt;b&gt; ${tag}`, 'Open-Meteo.com');
  t.ok(city.text.includes('7 天') || city.text.includes('無法取得天氣資料'), 'forecast or an error message');
  t.ok((await t.post('/cities', { name: '重複', lat, lon: '20.001', tz: 'UTC' })).status === 400, 'duplicate refused');
  t.ok((await t.submit(`/c/${id}/delete`)) === '/', 'delete');
  t.ok(!(await t.get('/')).text.includes(tag), 'deleted');
  t.ok((await t.get('/api/forecast?lat=999&lon=0')).status === 400, 'api checks lat');
}
