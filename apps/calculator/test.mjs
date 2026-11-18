// 計算機：伺服器計算、角度模式、格式、輸入驗證與 HTML 跳脫
export default async function (t) {
  await import(new URL('./public/calc-core.js', import.meta.url));
  const { evaluate, format } = globalThis.CalcCore;

  t.ok(evaluate('2^3^2') === 512, 'power is right-associative');
  t.ok(Math.abs(evaluate('sin(30)', { angle: 'deg' }) - 0.5) < 1e-12, 'degree mode');
  t.ok(format(1 / 3) === '0.333333333333', '12 significant digits');
  t.ok(format(Infinity) === '∞', 'infinity format');

  await t.page('/', '計算機', '計算式', '歷史紀錄', 'method="get"');
  await t.page('/?expr=' + encodeURIComponent('1+2*3'), '>7<');
  await t.page('/?expr=' + encodeURIComponent('2^10'), '>1024<');
  await t.page('/?expr=' + encodeURIComponent('sin(30)'), '>0.5<');
  await t.page('/?expr=' + encodeURIComponent('sqrt(16)+5!'), '>124<');
  await t.page('/?expr=' + encodeURIComponent('(1+2'), '括號沒有關閉');

  const escaped = await t.page('/?expr=' + encodeURIComponent('<b>'), '&lt;b&gt;');
  t.ok(!escaped.text.includes('<b>'), 'expression is escaped');

  t.ok((await t.get('/?angle=xx')).status === 400, 'invalid angle is refused');
  t.ok((await t.get('/?expr=' + encodeURIComponent('1'.repeat(501)))).status === 400, 'long expression is refused');
  t.ok((await t.post('/')).status === 404, 'POST is not a route');
}
