// 通訊錄：新增、檢查輸入、搜尋、群組、最愛、vCard 匯出與匯入（含折行、3.0 寫法）、生日 API、刪除
export default async function (t) {
  // 名稱都加上這次的代號，清理時只刪自己建立的聯絡人
  const tag = Date.now().toString(36);
  await t.page('/', '通訊錄');
  const loc = await t.submit('/new', {
    name: `王小明 <b> ${tag}`, phonetic: 'wang', org: '金門大學', title: '老師',
    phone_label: ['手機', '公司'], phone: ['0912-345-678', ''], email_label: ['公司'], email: ['ming@example.com'],
    birthday: '1990-12-25', groups: '同事,朋友', note: '第一行\n第二行; 有分號',
  });
  t.ok(/^\/c\/\w+$/.test(loc), `new → ${loc}`);
  await t.page(loc, `王小明 &lt;b&gt; ${tag}`, 'tel:0912345678', 'mailto:ming@example.com', '1990 年 12 月 25 日');
  t.ok((await t.post('/new', { name: '' })).status === 400, 'empty name refused');
  t.ok((await t.post('/new', { name: 'x', phone: 'abc' })).status === 400, 'bad phone refused');
  t.ok((await t.post('/new', { name: 'x', email: 'nope' })).status === 400, 'bad email refused');
  t.ok((await t.post('/new', { name: 'x', url: 'javascript:alert(1)' })).status === 400, 'bad url refused');
  await t.page('/?q=0912', loc);
  await t.page('/?group=' + encodeURIComponent('同事'), loc);
  await t.submit(loc + '/favorite');
  await t.page('/', '我的最愛');
  const vcf = await t.get(loc + '.vcf');
  t.ok(vcf.type.startsWith('text/vcard') && vcf.headers.get('content-disposition').startsWith('attachment'), 'vcf download');
  t.ok(vcf.text.includes(`\r\nFN:王小明 <b> ${tag}\r\n`) && vcf.text.includes('TEL;TYPE=cell:0912-345-678') && vcf.text.includes('NOTE:第一行\\n第二行\\; 有分號') && vcf.text.includes('BDAY:19901225'), 'vcf content: ' + JSON.stringify(vcf.text));
  t.ok(vcf.text.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75), 'vcf folded at 75 octets');
  const year = new Date().getFullYear();
  const bd = JSON.parse((await t.get(`/api/birthdays?from=${year}-12-01&to=${year + 1}-01-31`)).text);
  t.ok(bd.birthdays.some((b) => b.name === `王小明 <b> ${tag}` && b.date === `${year}-12-25` && b.age === year - 1990), 'birthdays api');
  t.ok((await t.get('/api/birthdays?from=x')).status === 400, 'birthdays api checks dates');
  // 匯入：自己匯出的檔（4.0）與 3.0 的寫法、折行
  const v3 = `BEGIN:VCARD\r\nVERSION:3.0\r\nN:陳;大文${tag};;;\r\nitem1.TEL;TYPE=CELL:0987 654 321\r\nEMAIL;TYPE=INTERNET;TYPE=WORK:da\r\n wen@example.com\r\nBDAY:--0229\r\nCATEGORIES:測試匯入\r\nEND:VCARD\r\n`;
  const imp = await t.submit('/import', { text: v3 });
  t.ok(imp === '/?imported=1', `import → ${imp}`);
  const list = await t.page('/?group=' + encodeURIComponent('測試匯入'), `陳大文${tag}`);
  const id2 = /href="(\/c\/\w+)"/.exec(list.text.slice(list.text.indexOf(`陳大文${tag}`) - 300))[1];
  await t.page(id2, '0987 654 321', 'dawen@example.com', '2 月 29 日');
  const up = await t.post('/import', { file: new File([vcf.text], 'a.vcf', { type: 'text/vcard' }) });
  t.ok(up.status === 303 && up.location === '/?imported=1', `upload import: ${up.status}`);
  t.ok((await t.post('/import', { text: 'hello' })).status === 400, 'non-vcard refused');
  // 清掉測試資料
  for (const q of [tag]) {
    const r = await t.get('/?q=' + encodeURIComponent(q));
    for (const m of r.text.matchAll(/href="(\/c\/\w+)"/g)) await t.submit(m[1] + '/delete');
  }
  t.ok((await t.get(loc)).status === 400, 'deleted');
}
