// 影片：上傳（multipart，依檔頭判斷格式）、拒收非影片、清單、播放頁、Range、進度（表單與 JSON）、
// 繼續觀看、#t= 從上次的位置開始、改名、刪除。

// MP4 標頭：ftyp 加上 moov（mvhd：timescale 1000、長度 8000；trak/tkhd：640×360）。不是能播的影片，
// 但格式判斷、長度與解析度、傳送都看得到。
const mp4 = () => {
  const box = (type, ...parts) => {
    const body = parts.flatMap((p) => [...p]);
    const n = body.length + 8;
    return [n >>> 24, (n >> 16) & 255, (n >> 8) & 255, n & 255, ...new TextEncoder().encode(type), ...body];
  };
  const be32 = (n) => [n >>> 24, (n >> 16) & 255, (n >> 8) & 255, n & 255];
  const mvhd = box('mvhd', [0, 0, 0, 0], be32(0), be32(0), be32(1000), be32(8000), new Array(80).fill(0));
  const tkhd = box('tkhd', [0, 0, 0, 3], new Array(72).fill(0), be32(640 * 65536), be32(360 * 65536));
  const b = new Uint8Array(1000);
  const head = [...box('ftyp', new TextEncoder().encode('isom'), [0, 0, 2, 0], new TextEncoder().encode('isomiso2')), ...box('moov', mvhd, box('trak', tkhd))];
  b.set(head);
  return b;
};
const png = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0);

export default async function (t) {
  const tag = Date.now().toString(36);
  const ids = [];
  try {
    await t.page('/', '影片');
    const v = await t.submit('/upload', { file: new File([mp4()], `旅行 <b> ${tag}.mp4`, { type: 'video/mp4' }) });
    t.ok(/^\/v\/\w+$/.test(v), `upload → ${v}`);
    ids.push(v.slice(3));
    await t.page(v, `旅行 &lt;b&gt; ${tag}`, '<video', `src="/raw/${ids[0]}"`, '/videos.js', '0:08', '640×360', 'data-needs-poster', 'width="640" height="360"');
    await t.page('/', '0:08 · 360p');
    // poster from the browser's canvas
    t.ok((await fetch(`${t.base}${v}/poster`, { method: 'POST', headers: { 'content-type': 'image/png' }, body: png })).status === 200, 'poster');
    t.ok((await fetch(`${t.base}${v}/poster`, { method: 'POST', body: 'xx' })).status === 400, 'bad poster refused');
    await t.page(v, `poster="/p/${ids[0]}"`);
    await t.page('/', `src="/p/${ids[0]}"`);
    t.ok((await t.get(`/p/${ids[0]}`)).type === 'image/png', 'poster served');
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
