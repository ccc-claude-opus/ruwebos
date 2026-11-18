// 影片：上傳（multipart，依檔頭判斷格式）、拒收非影片、清單、播放頁、Range、進度（表單與 JSON）、
// 繼續觀看、#t= 從上次的位置開始、改名、刪除。

// 只有 ftyp 的 MP4 標頭（不是能播的影片，但格式判斷與傳送都看得到）
const mp4 = () => {
  const b = new Uint8Array(1000);
  b.set([0, 0, 0, 24, ...new TextEncoder().encode('ftypisom'), 0, 0, 2, 0, ...new TextEncoder().encode('isomiso2')]);
  return b;
};

export default async function (t) {
  const tag = Date.now().toString(36);
  const ids = [];
  try {
    await t.page('/', '影片');
    const v = await t.submit('/upload', { file: new File([mp4()], `旅行 <b> ${tag}.mp4`, { type: 'video/mp4' }) });
    t.ok(/^\/v\/\w+$/.test(v), `upload → ${v}`);
    ids.push(v.slice(3));
    await t.page(v, `旅行 &lt;b&gt; ${tag}`, '<video', `src="/raw/${ids[0]}"`, '/videos.js');
    t.ok((await t.post('/upload', { file: new File(['hello'], 'x.mp4', { type: 'video/mp4' }) })).status === 400, 'non-video refused');
    t.ok((await t.post('/upload', { file: new File(['hello'], 'x.txt', { type: 'text/plain' }) })).status === 400, 'text refused');
    const r = await fetch(`${t.base}/raw/${ids[0]}`, { headers: { range: 'bytes=0-99' } });
    t.ok(r.status === 206 && (await r.arrayBuffer()).byteLength === 100 && r.headers.get('content-type') === 'video/mp4', 'range');
    t.ok((await t.get(`/raw/${ids[0]}?download=1`)).headers.get('content-disposition').includes('.mp4'), 'download name');
    // progress: form → redirect; JSON for the script
    t.ok((await t.submit(`${v}/position`, { position: '12' })) === v, 'position form');
    const j = await fetch(`${t.base}${v}/position`, { method: 'POST', headers: { accept: 'application/json' }, body: new URLSearchParams({ position: '30', duration: '100' }) });
    t.ok(j.status === 200 && (await j.json()).ok, 'position json');
    await t.page('/', '繼續觀看', `旅行 &lt;b&gt; ${tag}`, '看到 0:30', '1:40');
    await t.page(v, `src="/raw/${ids[0]}#t=30"`, '從頭看');
    t.ok((await t.post(`${v}/position`, { position: '-1' })).status === 400, 'bad position refused');
    await t.submit(`${v}/position`, { position: '0' });
    t.ok(!(await t.get(v)).text.includes('#t='), 'from the start again');
    // rename
    t.ok((await t.submit(v, { title: `改名 ${tag}` })) === v, 'rename');
    await t.page(v, `改名 ${tag}`);
    t.ok((await t.post(v, { title: ' ' })).status === 400, 'empty title refused');
  } finally {
    for (const id of ids) await t.post(`/v/${id}/delete`);
  }
  t.ok((await t.get(`/v/${ids[0]}`)).status === 400, 'deleted');
  t.ok((await t.get(`/raw/${ids[0]}`)).status === 404, 'file deleted');
}
