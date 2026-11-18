// 音訊的標籤：ID3v2.2/2.3/2.4 與 ID3v1（MP3）、FLAC 的 STREAMINFO／VORBIS_COMMENT／PICTURE、
// MP4（M4A）的 mvhd 與 ilst。只讀檔案開頭（ID3v1 另讀最後 128 個位元組）。
//   { type, title, artist, album, track, year, genre, duration (秒，0 = 不知道), cover: { type, bytes } | null }

const latin1 = (b) => Array.from(b, (c) => String.fromCharCode(c)).join('');
const utf8 = new TextDecoder('utf-8');
const clean = (s) => s.replace(/\u0000+$/g, '').replace(/\u0000/g, ' / ').trim();

function decodeText(b) {
  // ID3v2 文字：第一個位元組是編碼（0 Latin-1、1 UTF-16 加 BOM、2 UTF-16BE、3 UTF-8）
  const enc = b[0];
  const body = b.subarray(1);
  if (enc === 0) return clean(latin1(body));
  if (enc === 3) return clean(utf8.decode(body));
  let le = enc === 1;
  let start = 0;
  if (enc === 1 && body.length >= 2) {
    le = body[0] === 0xff && body[1] === 0xfe;
    start = 2;
  }
  return clean(new TextDecoder(le ? 'utf-16le' : 'utf-16be').decode(body.subarray(start, start + ((body.length - start) & ~1))));
}

const syncsafe = (b, o) => (b[o] << 21) | (b[o + 1] << 14) | (b[o + 2] << 7) | b[o + 3];
const u32 = (b, o) => ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3];

const GENRES = ['Blues', 'Classic Rock', 'Country', 'Dance', 'Disco', 'Funk', 'Grunge', 'Hip-Hop', 'Jazz', 'Metal', 'New Age', 'Oldies', 'Other', 'Pop', 'R&B', 'Rap', 'Reggae', 'Rock', 'Techno', 'Industrial', 'Alternative', 'Ska', 'Death Metal', 'Pranks', 'Soundtrack', 'Euro-Techno', 'Ambient', 'Trip-Hop', 'Vocal', 'Jazz+Funk', 'Fusion', 'Trance', 'Classical', 'Instrumental', 'Acid', 'House'];
const genre = (g) => g.replace(/^\((\d+)\).*$/, (_, n) => GENRES[+n] || g).replace(/^(\d+)$/, (_, n) => GENRES[+n] || g);

function id3v2(b, out) {
  const major = b[3];
  const flags = b[5];
  const end = Math.min(b.length, 10 + syncsafe(b, 6));
  let p = 10;
  if (flags & 0x40 && major >= 3) p += major === 4 ? syncsafe(b, 10) : u32(b, 10) + 4; // 延伸標頭
  const v22 = major === 2;
  const MAP = v22
    ? { TT2: 'title', TP1: 'artist', TAL: 'album', TRK: 'track', TYE: 'year', TCO: 'genre', PIC: 'pic' }
    : { TIT2: 'title', TPE1: 'artist', TALB: 'album', TRCK: 'track', TYER: 'year', TDRC: 'year', TCON: 'genre', APIC: 'pic', TLEN: 'tlen' };
  while (p + (v22 ? 6 : 10) <= end) {
    const id = latin1(b.subarray(p, p + (v22 ? 3 : 4)));
    if (!/^[A-Z0-9]+$/.test(id)) break;
    const size = v22 ? (b[p + 3] << 16) | (b[p + 4] << 8) | b[p + 5] : major === 4 ? syncsafe(b, p + 4) : u32(b, p + 4);
    const data = b.subarray(p + (v22 ? 6 : 10), Math.min(end, p + (v22 ? 6 : 10) + size));
    p += (v22 ? 6 : 10) + size;
    const key = MAP[id];
    if (!key || !data.length) continue;
    if (key === 'pic') {
      if (out.cover) continue;
      // APIC：編碼、MIME（以 0 結尾）、圖片類型、描述（以 0 或 00 結尾）、圖片
      let q = 1;
      let mime;
      if (v22) {
        mime = latin1(data.subarray(1, 4)).toLowerCase() === 'png' ? 'image/png' : 'image/jpeg';
        q = 4;
      } else {
        while (q < data.length && data[q]) q++;
        mime = latin1(data.subarray(1, q)).toLowerCase();
        q++;
      }
      q++; // 圖片類型
      const wide = data[0] === 1 || data[0] === 2;
      if (wide) {
        while (q + 1 < data.length && (data[q] || data[q + 1])) q += 2;
        q += 2;
      } else {
        while (q < data.length && data[q]) q++;
        q++;
      }
      const img = data.subarray(q);
      if (img.length) out.cover = { type: /png/.test(mime) ? 'image/png' : 'image/jpeg', bytes: img.slice() };
    } else if (key === 'tlen') {
      const ms = parseInt(decodeText(data), 10);
      if (ms > 0) out.duration = ms / 1000;
    } else if (!out[key]) {
      out[key] = key === 'genre' ? genre(decodeText(data)) : decodeText(data);
    }
  }
  return end;
}

function id3v1(tail, out) {
  if (tail.length < 128 || latin1(tail.subarray(0, 3)) !== 'TAG') return;
  const field = (o, n) => clean(latin1(tail.subarray(o, o + n)));
  out.title ||= field(3, 30);
  out.artist ||= field(33, 30);
  out.album ||= field(63, 30);
  out.year ||= field(93, 4);
  if (!out.track && tail[125] === 0 && tail[126]) out.track = String(tail[126]);
  if (!out.genre && GENRES[tail[127]]) out.genre = GENRES[tail[127]];
}

// MP3 的長度：Xing/Info 標頭的影格數，否則用第一個影格的位元率估計（CBR）
function mp3Duration(b, start, fileSize) {
  for (let p = start; p + 4 < b.length && p < start + 64 * 1024; p++) {
    if (b[p] !== 0xff || (b[p + 1] & 0xe0) !== 0xe0) continue;
    const ver = (b[p + 1] >> 3) & 3; // 3 = MPEG1, 2 = MPEG2, 0 = MPEG2.5
    const layer = (b[p + 1] >> 1) & 3; // 1 = Layer III
    const bri = b[p + 2] >> 4;
    const sri = (b[p + 2] >> 2) & 3;
    if (ver === 1 || layer !== 1 || bri === 0 || bri === 15 || sri === 3) continue;
    const rates = ver === 3 ? [44100, 48000, 32000] : ver === 2 ? [22050, 24000, 16000] : [11025, 12000, 8000];
    const kbps = (ver === 3 ? [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320] : [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160])[bri];
    const rate = rates[sri];
    const samples = ver === 3 ? 1152 : 576;
    const mono = (b[p + 3] >> 6) === 3;
    const side = ver === 3 ? (mono ? 17 : 32) : mono ? 9 : 17;
    const x = p + 4 + side;
    const tagName = latin1(b.subarray(x, x + 4));
    if ((tagName === 'Xing' || tagName === 'Info') && b[x + 7] & 1) return (u32(b, x + 8) * samples) / rate;
    return ((fileSize - p) * 8) / (kbps * 1000);
  }
  return 0;
}

function flac(b, out) {
  let p = 4;
  for (;;) {
    if (p + 4 > b.length) return;
    const last = b[p] & 0x80;
    const type = b[p] & 0x7f;
    const len = (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3];
    const d = b.subarray(p + 4, p + 4 + len);
    if (type === 0 && d.length >= 18) {
      const rate = (d[10] << 12) | (d[11] << 4) | (d[12] >> 4);
      const total = (d[13] & 0x0f) * 2 ** 32 + u32(d, 14);
      if (rate) out.duration = total / rate;
    } else if (type === 4) {
      const le = (o) => d[o] | (d[o + 1] << 8) | (d[o + 2] << 16) | ((d[o + 3] << 24) >>> 0);
      let q = 4 + le(0);
      const n = le(q);
      q += 4;
      for (let i = 0; i < n && q + 4 <= d.length; i++) {
        const l = le(q);
        const s = utf8.decode(d.subarray(q + 4, q + 4 + l));
        q += 4 + l;
        const eq = s.indexOf('=');
        const k = s.slice(0, eq).toUpperCase();
        const v = s.slice(eq + 1).trim();
        const key = { TITLE: 'title', ARTIST: 'artist', ALBUM: 'album', TRACKNUMBER: 'track', DATE: 'year', GENRE: 'genre' }[k];
        if (key && !out[key]) out[key] = v;
      }
    } else if (type === 6 && !out.cover && d.length > 32) {
      const mimeLen = u32(d, 4);
      const mime = latin1(d.subarray(8, 8 + mimeLen));
      const descLen = u32(d, 8 + mimeLen);
      const at = 8 + mimeLen + 4 + descLen + 16;
      const dataLen = u32(d, at);
      out.cover = { type: /png/.test(mime) ? 'image/png' : 'image/jpeg', bytes: d.slice(at + 4, at + 4 + dataLen) };
    }
    p += 4 + len;
    if (last) return;
  }
}

// MP4：在 moov 裡找 mvhd（長度）與 udta/meta/ilst（標籤）
function mp4(b, out) {
  const walk = (start, end, path) => {
    let p = start;
    while (p + 8 <= end) {
      let size = u32(b, p);
      const type = latin1(b.subarray(p + 4, p + 8));
      let head = 8;
      if (size === 1) {
        size = u32(b, p + 8) * 2 ** 32 + u32(b, p + 12);
        head = 16;
      } else if (size === 0) size = end - p;
      if (size < head) return;
      const body = p + head;
      const stop = Math.min(end, p + size);
      if (type === 'moov' || type === 'udta' || type === 'ilst') walk(body, stop, path + '/' + type);
      else if (type === 'meta') walk(body + 4, stop, path + '/meta');
      else if (type === 'mvhd') {
        const v1 = b[body] === 1;
        const scale = u32(b, body + (v1 ? 20 : 12));
        const dur = v1 ? u32(b, body + 24) * 2 ** 32 + u32(b, body + 28) : u32(b, body + 16);
        if (scale) out.duration = dur / scale;
      } else if (path.endsWith('/ilst')) {
        // 每個項目裡有一個 data：型別（4）、地區（4）、值
        const d = b.subarray(body, stop);
        if (d.length < 16 || latin1(d.subarray(4, 8)) !== 'data') {
          p += size;
          continue;
        }
        const kind = u32(d, 8) & 0xffffff;
        const value = d.subarray(16, u32(d, 0));
        const key = { '©nam': 'title', '©ART': 'artist', '©alb': 'album', '©day': 'year', '©gen': 'genre' }[type];
        if (key && !out[key]) out[key] = utf8.decode(value).trim();
        else if (type === 'trkn' && value.length >= 4 && !out.track) out.track = String((value[2] << 8) | value[3]);
        else if (type === 'covr' && !out.cover && value.length) out.cover = { type: kind === 14 ? 'image/png' : 'image/jpeg', bytes: value.slice() };
      }
      p += size;
    }
  };
  walk(0, b.length, '');
}

/** Tags of an audio file: `head` = its first bytes (a few MB), `tail` = its last 128 bytes, `fileSize`. */
export function audioTags(head, tail, fileSize) {
  const b = new Uint8Array(head);
  const out = { type: '', title: '', artist: '', album: '', track: '', year: '', genre: '', duration: 0, cover: null };
  if (latin1(b.subarray(0, 4)) === 'fLaC') {
    out.type = 'audio/flac';
    flac(b, out);
  } else if (latin1(b.subarray(4, 8)) === 'ftyp') {
    out.type = 'audio/mp4';
    mp4(b, out);
  } else if (latin1(b.subarray(0, 4)) === 'OggS') {
    out.type = 'audio/ogg';
  } else if (latin1(b.subarray(0, 4)) === 'RIFF' && latin1(b.subarray(8, 12)) === 'WAVE') {
    out.type = 'audio/wav';
    // fmt 的位元組率，資料長度約是檔案大小
    const rate = b.length >= 32 ? b[28] | (b[29] << 8) | (b[30] << 16) | (b[31] << 24) : 0;
    if (rate > 0) out.duration = (fileSize - 44) / rate;
  } else {
    let start = 0;
    if (latin1(b.subarray(0, 3)) === 'ID3') start = id3v2(b, out);
    id3v1(new Uint8Array(tail || new ArrayBuffer(0)), out);
    const isMp3 = start > 0 || (b[start] === 0xff && (b[start + 1] & 0xe0) === 0xe0);
    if (isMp3) {
      out.type = 'audio/mpeg';
      if (!out.duration) out.duration = mp3Duration(b, start, fileSize);
    }
  }
  out.track = (out.track.match(/^\d+/) || [''])[0];
  out.year = (String(out.year).match(/\d{4}/) || [''])[0];
  return out;
}
