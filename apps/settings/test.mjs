// 設定：四個分頁都能開（開發時沒有系統資訊與管理埠，頁面要說明而不是出錯）
export default async function (t) {
  await t.page('/', '系統', '時區');
  await t.page('/apps', '已安裝的應用');
  const net = await t.page('/network', '連線狀態', 'Wi-Fi', '主機');
  t.ok(net.text.includes('已連上網際網路') || net.text.includes('無法連上網際網路'), 'connectivity result');
  await t.page('/licenses', '授權');
  t.ok((await t.post('/', {})).status === 404, 'POST is not a route');
}
