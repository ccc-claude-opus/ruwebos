// 相簿：上傳（multipart）、EXIF（相機、拍攝時間、GPS、方向）、PNG 尺寸、拒收非影像、格狀檢視、Range、
// 最愛、相簿（建立、加入、移出、改名、刪除）、縮圖、從「檔案」加入、刪除。

// 一個只有標頭的 JPEG：APP1 的 EXIF（大端序 TIFF）加 SOF0 的尺寸
function jpeg({ w, h, make, model, taken, orientation = 1, lat, lon }) {
  const entries = (list) => list.sort((a, b) => a[0] - b[0]);
  const enc = new TextEncoder();
  // [tag, type, count, valueBytes]
  const ascii = (tag, s) => { const b = enc.encode(s + '\0'); return [tag, 2, b.length, b]; };
  const short = (tag, v) => [tag, 3, 1, Uint8Array.of(v >> 8, v & 255, 0, 0)];
  const long = (tag, v) => [tag, 4, 1, Uint8Array.of(v >>> 24, (v >> 16) & 255, (v >> 8) & 255, v & 255)];
  const rat3 = (tag, deg) => {
    const d = Math.floor(deg), m = Math.floor((deg - d) * 60), s = Math.round(((deg - d) * 60 - m) * 60 * 100);
    const b = new Uint8Array(24); const v = new DataView(b.buffer);
    [[d, 1], [m, 1], [s, 100]].forEach(([n, q], i) => { v.setUint32(i * 8, n); v.setUint32(i * 8 + 4, q); });
    return [tag, 5, 3, b];
  };
  // lays out IFDs: offsets of sub-IFDs are patched after layout
  const ifd0 = entries([ascii(0x010f, make), ascii(0x0110, model), short(0x0112, orientation), long(0x8769, 0), long(0x8825, 0)]);
  const exif = entries([ascii(0x9003, taken)]);
  const gps = entries([ascii(1, lat >= 0 ? 'N' : 'S'), rat3(2, Math.abs(lat)), ascii(3, lon >= 0 ? 'E' : 'W'), rat3(4, Math.abs(lon))]);
  const tiff = new Uint8Array(1024); const tv = new DataView(tiff.buffer);
  tiff.set([0x4d, 0x4d, 0, 42]); tv.setUint32(4, 8);
  let end = 8;
  const write = (list) => {
    const at = end; const dataAt = at + 2 + list.length * 12 + 4; let d = dataAt;
    tv.setUint16(at, list.length);
    list.forEach(([tag, type, count, bytes], i) => {
      const e = at + 2 + i * 12;
      tv.setUint16(e, tag); tv.setUint16(e + 2, type); tv.setUint32(e + 4, count);
      if (bytes.length > 4) { tv.setUint32(e + 8, d); tiff.set(bytes, d); d += bytes.length + (bytes.length & 1); } else tiff.set(bytes, e + 8);
    });
    tv.setUint32(at + 2 + list.length * 12, 0);
    end = d;
    return at;
  };
  write(ifd0);
  const exifAt = write(exif);
  const gpsAt = write(gps);
  // patch the pointers (entries 3 and 4 of IFD0 after sorting: 0x8769, 0x8825)
  tv.setUint32(8 + 2 + 3 * 12 + 8, exifAt); tv.setUint32(8 + 2 + 4 * 12 + 8, gpsAt);
  const app1 = new Uint8Array([...enc.encode('Exif'), 0, 0, ...tiff.slice(0, end)]);
  const sof = Uint8Array.of(0xff, 0xc0, 0, 11, 8, h >> 8, h & 255, w >> 8, w & 255, 1, 1, 0x11, 0);
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, (app1.length + 2) >> 8, (app1.length + 2) & 255, ...app1, ...sof, 0xff, 0xd9]);
}

const png = (w, h) => Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, w >>> 24, (w >> 16) & 255, (w >> 8) & 255, w & 255, h >>> 24, (h >> 16) & 255, (h >> 8) & 255, h & 255, 8, 6, 0, 0, 0);

export default async function (t) {
  const tag = Date.now().toString(36);
  const ids = [];
  try {
    await t.page('/', '相簿');
    // JPEG with EXIF; orientation 6 (rotated 90°) swaps the size
    const j = jpeg({ w: 4000, h: 3000, make: 'Canon', model: 'Canon EOS R6', taken: '2021:07:04 09:15:30', orientation: 6, lat: 24.4321, lon: 118.3171 });
    const loc = await t.submit('/upload', { file: new File([j], `金門 <b> ${tag}.jpg`, { type: 'image/jpeg' }) });
    t.ok(/^\/p\/\w+$/.test(loc), `upload → ${loc}`);
    ids.push(loc.slice(3));
    const view = await t.page(loc, `金門 &lt;b&gt; ${tag}.jpg`, '2021/07/04 09:15', 'Canon EOS R6', '3000 × 4000', 'mlat=24.432100', 'mlon=118.317100');
    t.ok(!view.text.includes('Canon Canon'), 'make is not repeated in the model');
    await t.page('/', '2021 年 7 月', `/p/${ids[0]}`);
    // PNG (no EXIF): size only; the month is the upload month
    const loc2 = await t.submit('/upload', { file: new File([png(640, 480)], `圖 ${tag}.png`, { type: 'image/png' }) });
    ids.push(loc2.slice(3));
    await t.page(loc2, '640 × 480');
    t.ok((await t.post('/upload', { file: new File(['not an image'], 'x.jpg', { type: 'image/jpeg' }) })).status === 400, 'non-image refused');
    // original with Range; thumbnail falls back to the original
    const r = await fetch(`${t.base}/o/${ids[0]}`, { headers: { range: 'bytes=0-1' } });
    t.ok(r.status === 206 && (await r.arrayBuffer()).byteLength === 2, 'range');
    t.ok((await t.get(`/t/${ids[0]}`)).status === 302, 'no thumbnail yet → original');
    const th = await fetch(`${t.base}/p/${ids[1]}/thumb`, { method: 'POST', headers: { 'content-type': 'image/png' }, body: png(64, 48) });
    t.ok(th.status === 200, `thumb: ${th.status}`);
    t.ok((await t.get(`/t/${ids[1]}`)).status === 200, 'thumbnail served');
    t.ok((await fetch(`${t.base}/p/${ids[1]}/thumb`, { method: 'POST', body: 'xx' })).status === 400, 'bad thumbnail refused');
    t.ok((await t.get(`/o/${ids[0]}?download=1`)).headers.get('content-disposition').startsWith('attachment'), 'download');
    // favorite
    await t.submit(`${loc}/favorite`);
    await t.page('/?view=fav', `/p/${ids[0]}`);
    // albums
    const a = await t.submit('/albums', { name: `旅行 ${tag}` });
    t.ok((await t.post('/albums', { name: ' ' })).status === 400, 'empty album name refused');
    await t.submit(`${loc}/albums`, { album: a.slice(3) });
    await t.page(a, `旅行 ${tag}`, `/p/${ids[0]}`);
    await t.page('/albums', `旅行 ${tag}`, '1 張');
    await t.submit(`${loc}/albums/remove`, { album: a.slice(3) });
    t.ok(!(await t.get(a)).text.includes(`/p/${ids[0]}`), 'removed from album');
    await t.submit(a, { name: `旅行（改）${tag}` });
    await t.page(a, `旅行（改）${tag}`);
    t.ok((await t.submit(`${a}/delete`)) === '/albums', 'delete album');
    await t.page(loc, '金門');
    // 從「檔案」加入（files 應用也在跑的時候）
    const files = t.base.replace('//photos.', '//files.');
    const fd = new FormData();
    fd.append('dir', '');
    fd.append('file', new File([png(10, 20)], `匯入測試-${tag}.png`, { type: 'image/png' }));
    const up = await fetch(files + '/upload', { method: 'POST', body: fd, redirect: 'manual' });
    if (up.status === 303) {
      await t.page('/import', `匯入測試-${tag}.png`);
      const imp = await t.submit('/import', { path: `匯入測試-${tag}.png` });
      t.ok(/^\/p\/\w+$/.test(imp), `import → ${imp}`);
      ids.push(imp.slice(3));
      await t.page(imp, '10 × 20');
      await fetch(files + '/delete', { method: 'POST', body: new URLSearchParams({ path: `匯入測試-${tag}.png` }), redirect: 'manual' });
    }
    const api = JSON.parse((await t.get('/api/photos?limit=5')).text);
    t.ok(api.photos.some((p) => p.id === ids[1]), 'api/photos lists the newest upload');
  } finally {
    for (const id of ids) await t.post(`/p/${id}/delete`);
  }
  t.ok((await t.get(`/p/${ids[0]}`)).status === 400, 'deleted');
}
