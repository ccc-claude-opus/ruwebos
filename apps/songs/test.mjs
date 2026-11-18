// 音樂：上傳（ID3v2.3 標籤與封面、FLAC 的 Vorbis comment、WAV），拒收非音檔、歌曲／專輯／演出者、
// 播放器、Range、編輯標籤、播放清單（建立、加入、移除、改名、刪除）、刪除。

const enc = new TextEncoder();
const u32be = (n) => [n >>> 24, (n >> 16) & 255, (n >> 8) & 255, n & 255];
const syncsafe = (n) => [(n >> 21) & 127, (n >> 14) & 127, (n >> 7) & 127, n & 127];
const PNG = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0);

// ID3v2.3（UTF-8 文字放在 v2.4 才合法，這裡用 UTF-16 加 BOM）加上一個 MPEG-1 Layer III 128 kbps 的影格
function mp3({ title, artist, album, track, year }) {
  const text = (id, s) => {
    const b = [1, 0xff, 0xfe];
    for (const c of s) { const n = c.charCodeAt(0); b.push(n & 255, n >> 8); }
    return [...enc.encode(id), ...u32be(b.length), 0, 0, ...b];
  };
  const apic = [0, ...enc.encode('image/png'), 0, 3, 0, ...PNG];
  const frames = [...text('TIT2', title), ...text('TPE1', artist), ...text('TALB', album), ...text('TRCK', track), ...text('TYER', year), ...enc.encode('APIC'), ...u32be(apic.length), 0, 0, ...apic];
  const frame = new Uint8Array(417); frame.set([0xff, 0xfb, 0x90, 0x00]);
  const audio = []; for (let i = 0; i < 20; i++) audio.push(...frame);
  return new Uint8Array([...enc.encode('ID3'), 3, 0, 0, ...syncsafe(frames.length), ...frames, ...audio]);
}

// FLAC：STREAMINFO（44100 Hz、88200 個樣本 = 2 秒）與 VORBIS_COMMENT
function flac({ title, artist, album }) {
  const le = (n) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, n >>> 24];
  const si = new Uint8Array(34);
  // sample rate 44100 (20 bits) | channels-1 (3) | bps-1 (5) | total samples (36)
  si[10] = 44100 >> 12; si[11] = (44100 >> 4) & 255; si[12] = ((44100 & 15) << 4) | (1 << 1); si[13] = 0xf0;
  si.set(u32be(88200), 14);
  const vendor = enc.encode('test');
  const comments = [`TITLE=${title}`, `ARTIST=${artist}`, `ALBUM=${album}`, 'TRACKNUMBER=2'].map((s) => enc.encode(s));
  const vc = [...le(vendor.length), ...vendor, ...le(comments.length), ...comments.flatMap((c) => [...le(c.length), ...c])];
  return new Uint8Array([...enc.encode('fLaC'), 0, 0, 0, 34, ...si, 0x84, (vc.length >> 16) & 255, (vc.length >> 8) & 255, vc.length & 255, ...vc, 0xff, 0xf8, 0, 0]);
}

function wav(seconds) {
  const rate = 8000, n = rate * seconds, b = new Uint8Array(44 + n), v = new DataView(b.buffer);
  b.set(enc.encode('RIFF')); v.setUint32(4, 36 + n, true); b.set(enc.encode('WAVEfmt '), 8);
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
  b.set(enc.encode('data'), 36); v.setUint32(40, n, true);
  return b;
}

export default async function (t) {
  const tag = Date.now().toString(36);
  const ids = [];
  const pls = [];
  try {
    await t.page('/', '音樂');
    const a = await t.submit('/upload', { file: new File([mp3({ title: `小星星 <b> ${tag}`, artist: `測試樂團 ${tag}`, album: `第一張 ${tag}`, track: '3/10', year: '2024' })], 'x.mp3', { type: 'audio/mpeg' }) });
    t.ok(/^\/s\/\w+$/.test(a), `upload → ${a}`);
    ids.push(a.slice(3));
    await t.page(a, `小星星 &lt;b&gt; ${tag}`, `測試樂團 ${tag}`, `第一張 ${tag}`, '第 3 首', '2024', 'audio/mpeg');
    t.ok((await t.get(`/c/${ids[0]}`)).type === 'image/png', 'cover from APIC');
    const b = await t.submit('/upload', { file: new File([flac({ title: `第二首 ${tag}`, artist: `測試樂團 ${tag}`, album: `第一張 ${tag}` })], 'y.flac', { type: 'audio/flac' }) });
    ids.push(b.slice(3));
    await t.page(b, `第二首 ${tag}`, '第 2 首', '0:02', 'audio/flac');
    const c = await t.submit('/upload', { file: new File([wav(1)], `無標籤 ${tag}.wav`, { type: 'audio/wav' }) });
    ids.push(c.slice(3));
    await t.page(c, `無標籤 ${tag}`, '0:01');
    t.ok((await t.post('/upload', { file: new File(['hello'], 'x.mp3', { type: 'audio/mpeg' }) })).status === 400, 'non-audio refused');
    // views
    await t.page('/', `小星星 &lt;b&gt; ${tag}`, '全部播放');
    await t.page('/?view=albums', `第一張 ${tag}`, '2 首');
    await t.page('/?view=artists', `測試樂團 ${tag}`);
    const album = await t.page(`/album?name=${encodeURIComponent(`第一張 ${tag}`)}&artist=${encodeURIComponent(`測試樂團 ${tag}`)}`, `第二首 ${tag}`);
    t.ok(album.text.indexOf(`第二首 ${tag}`) < album.text.indexOf(`小星星 &lt;b&gt; ${tag}`), 'album in track order');
    await t.page(`/artist?name=${encodeURIComponent(`測試樂團 ${tag}`)}`, `第一張 ${tag}`);
    const play = await t.page(`/play?album=${encodeURIComponent(`第一張 ${tag}`)}&start=1`, `src="/a/${ids[0]}"`, '/player.js');
    t.ok(/class="now"[^>]*>|data-id="\w+"[^>]*class="now"/.test(play.text), 'current track marked');
    const r = await fetch(`${t.base}/a/${ids[0]}`, { headers: { range: 'bytes=0-2' } });
    t.ok(r.status === 206 && (await r.text()) === 'ID3', 'range');
    t.ok((await t.get(`/a/${ids[1]}?download=1`)).headers.get('content-disposition').includes('.flac'), 'download name');
    // edit tags
    t.ok((await t.submit(c, { title: `改名 ${tag}`, artist: `另一位 ${tag}`, album: '', track: '1', year: '1999', genre: 'Jazz' })) === c, 'edit');
    await t.page(c, `改名 ${tag}`, `另一位 ${tag}`, '1999', 'Jazz');
    t.ok((await t.post(c, { title: '', year: '' })).status === 400, 'empty title refused');
    t.ok((await t.post(c, { title: 'x', year: '99' })).status === 400, 'bad year refused');
    // playlists
    const pl = await t.submit('/pl', { name: `清單 ${tag}` });
    pls.push(pl.slice(4));
    await t.submit(`${pl}/add`, { track: ids[2], playlist: pls[0] });
    await t.submit(`${pl}/add`, { track: ids[0], playlist: pls[0] });
    const plPage = await t.page(pl, `改名 ${tag}`, `小星星 &lt;b&gt; ${tag}`, '2 首');
    t.ok(plPage.text.indexOf(`改名 ${tag}`) < plPage.text.indexOf(`小星星 &lt;b&gt; ${tag}`), 'playlist order');
    await t.page(`/play?playlist=${pls[0]}`, `src="/a/${ids[2]}"`);
    await t.submit(`${pl}/remove`, { pos: '0' });
    t.ok(!(await t.get(pl)).text.includes(`改名 ${tag}`), 'removed from playlist');
    await t.submit(pl, { name: `清單改 ${tag}` });
    await t.page('/?view=playlists', `清單改 ${tag}`, '1 首');
    t.ok((await t.post('/pl', { name: '' })).status === 400, 'empty playlist name refused');
    const api = JSON.parse((await t.get('/api/tracks')).text);
    t.ok(api.tracks.some((x) => x.id === ids[0]), 'api/tracks');
  } finally {
    for (const id of pls) await t.post(`/pl/${id}/delete`);
    for (const id of ids) await t.post(`/s/${id}/delete`);
  }
  t.ok((await t.get(`/s/${ids[0]}`)).status === 400, 'deleted');
  t.ok(!(await t.get('/?view=playlists')).text.includes(tag), 'playlists cleaned up');
}
