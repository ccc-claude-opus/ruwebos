// 地圖：頁面、釘選的新增、列表、統計、刪除（JSON API）
export default async function (t) {
  await t.page('/', '地圖', 'id="list"');
  const r = await fetch(t.base + '/api/markers', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lat: 24.45, lng: 118.38, title: '測試 <b>', note: '' }) });
  t.ok(r.status === 201, `POST /api/markers: ${r.status}`);
  const { id } = await r.json();
  const all = await (await fetch(t.base + '/api/markers')).json();
  t.ok(all.markers.some((m) => m.id === id && m.title === '測試 <b>'), 'marker listed');
  const bad = await fetch(t.base + '/api/markers', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"lat":"x"}' });
  t.ok(bad.status === 400, 'bad marker refused');
  t.ok((await fetch(t.base + '/api/stats')).ok, '/api/stats');
  t.ok((await fetch(t.base + `/api/markers/${id}`, { method: 'DELETE' })).ok, 'delete');
}
