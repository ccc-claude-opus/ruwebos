// tar（POSIX ustar 與 pax 延伸標頭、GNU 長檔名）與 gzip，用 Web 標準的 CompressionStream 解壓縮與壓縮。
// 只處理一般檔案；資料夾、連結與其他種類一律略過（連結可能指到套件外面）。

const dec = new TextDecoder();
const enc = new TextEncoder();

async function pipe(bytes, stream) {
  const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

export const gunzip = (bytes) => pipe(bytes, new DecompressionStream('gzip'));
export const gzip = (bytes) => pipe(bytes, new CompressionStream('gzip'));
export const isGzip = (bytes) => bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;

const field = (h, off, len) => {
  const s = dec.decode(h.subarray(off, off + len));
  const nul = s.indexOf('\0');
  return nul < 0 ? s : s.slice(0, nul);
};
const octal = (h, off, len) => parseInt(field(h, off, len).trim() || '0', 8);

// pax 延伸標頭：「長度 key=value\n」的記錄
function paxRecords(bytes) {
  const out = {};
  let i = 0;
  while (i < bytes.length) {
    const sp = bytes.indexOf(0x20, i);
    if (sp < 0) break;
    const len = parseInt(dec.decode(bytes.subarray(i, sp)), 10);
    if (!(len > 0)) break;
    const rec = dec.decode(bytes.subarray(sp + 1, i + len - 1));
    const eq = rec.indexOf('=');
    if (eq > 0) out[rec.slice(0, eq)] = rec.slice(eq + 1);
    i += len;
  }
  return out;
}

/** 解開 tar：[{ path, data }]（只有一般檔案）。maxBytes：所有檔案加起來的上限。 */
export function untar(tar, { maxBytes = Infinity } = {}) {
  const files = [];
  let off = 0;
  let total = 0;
  let longName = null;
  let pax = {};
  while (off + 512 <= tar.length) {
    const h = tar.subarray(off, off + 512);
    if (h.every((b) => b === 0)) break;
    const size = octal(h, 124, 12);
    const type = String.fromCharCode(h[156] || 0x30);
    const data = tar.subarray(off + 512, off + 512 + size);
    off += 512 + Math.ceil(size / 512) * 512;
    if (type === 'x') { pax = paxRecords(data); continue; }
    if (type === 'g') continue;
    if (type === 'L') { longName = field(data, 0, data.length); continue; }
    const prefix = field(h, 345, 155);
    let path = pax.path || longName || (prefix ? `${prefix}/${field(h, 0, 100)}` : field(h, 0, 100));
    pax = {};
    longName = null;
    if (type !== '0' && type !== '\0' && type !== '7') continue;
    path = path.replace(/^\.\//, '');
    total += size;
    if (total > maxBytes) throw new Error(`套件解開後超過 ${Math.round(maxBytes / 1048576)} MB`);
    files.push({ path, data: data.slice() });
  }
  return files;
}

function header(name, size, type = '0') {
  const h = new Uint8Array(512);
  const put = (s, off, len) => h.set(enc.encode(s).subarray(0, len), off);
  const num = (n, off, len) => put(n.toString(8).padStart(len - 1, '0') + '\0', off, len);
  put(name, 0, 100);
  num(0o644, 100, 8);
  num(0, 108, 8);
  num(0, 116, 8);
  num(size, 124, 12);
  num(Math.floor(Date.now() / 1000), 136, 12);
  put('        ', 148, 8);
  put(type, 156, 1);
  put('ustar\0', 257, 6);
  put('00', 263, 2);
  let sum = 0;
  for (const b of h) sum += b;
  put(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8);
  return h;
}

/** 打包成 tar：files 是 [{ path, data }]；長於 100 bytes 的路徑用 pax 標頭。 */
export function tar(files) {
  const parts = [];
  const pad = (n) => new Uint8Array((512 - (n % 512)) % 512);
  for (const f of files) {
    if (enc.encode(f.path).length > 100) {
      // 記錄的長度包含它自己的位數
      const rec = ` path=${f.path}\n`;
      const n = enc.encode(rec).length;
      let d = String(n).length;
      while (String(n + d).length !== d) d++;
      const body = enc.encode(`${n + d}${rec}`);
      parts.push(header('PaxHeader', body.length, 'x'), body, pad(body.length));
    }
    parts.push(header(f.path.slice(0, 100), f.data.length), f.data, pad(f.data.length));
  }
  parts.push(new Uint8Array(1024));
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
