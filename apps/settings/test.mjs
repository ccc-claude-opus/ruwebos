// 設定：四個分頁都能開（開發時沒有系統資訊與管理埠，頁面要說明而不是出錯）
export default async function (t) {
  await t.page('/', '系統', '時區');
  await t.page('/apps', '已安裝的應用');
  // in a VM the network is the host's; installed directly (native/install.sh) it is this machine's
  const net = await t.page('/network', '連線狀態', 'Wi-Fi');
  t.ok(net.text.includes('主機') || net.text.includes('這台機器'), 'where the network comes from');
  t.ok(net.text.includes('已連上網際網路') || net.text.includes('無法連上網際網路'), 'connectivity result');
  await t.page('/licenses', '授權');
  // 寄信：開發時沒有管理埠只有說明；在 ruwebos 裡存一份設定、讀回來、清掉（不會真的連 SMTP）
  const mail = await t.page('/email', '寄信的帳號');
  if (mail.text.includes('name="host"')) {
    const saved = await t.post('/email', { action: 'save', host: 'smtp.example.com', security: 'starttls', port: '587', from: 'me@example.com', recipients: 'me@example.com' });
    t.ok(saved.status === 200 && saved.text.includes('已儲存') && saved.text.includes('smtp.example.com'), `save email: ${saved.status}`);
    t.ok((await t.post('/email', { action: 'clear' })).text.includes('已清除'), 'clear email');
  }
  const forged = await fetch(`${t.base}/email`, { method: 'POST', headers: { origin: 'http://evil.localhost:8700', 'content-type': 'application/x-www-form-urlencoded' }, body: 'action=clear' });
  t.ok(forged.status === 403, `cross-site post refused: ${forged.status}`);
  t.ok((await t.post('/', {})).status === 404, 'POST is not a route');
}
