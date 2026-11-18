// 影片的長度與解析度，從容器讀（不解碼）：
//   MP4／QuickTime（ISO BMFF）：moov/mvhd 的 duration ÷ timescale；視訊軌 tkhd 的寬高（16.16 定點數）
//   Matroska／WebM（EBML）：Segment/Info 的 Duration × TimecodeScale；Tracks/TrackEntry/Video 的 PixelWidth／PixelHeight
// 回傳 { duration（秒，0 = 不知道）, width, height }。

const ascii = (b, o, n) => String.fromCharCode(...b.subarray(o, o + n));
const u32 = (b, o) => b[o] * 2 ** 24 + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3];

function mp4(b, out) {
  const walk = (start, end) => {
    let p = start;
    while (p + 8 <= end) {
      let size = u32(b, p);
      const type = ascii(b, p + 4, 4);
      let head = 8;
      if (size === 1) {
        size = u32(b, p + 8) * 2 ** 32 + u32(b, p + 12);
        head = 16;
      } else if (size === 0) size = end - p;
      if (size < head) return;
      const body = p + head;
      const stop = Math.min(end, p + size);
      if (type === 'moov' || type === 'trak') walk(body, stop);
      else if (type === 'mvhd' && body + 32 <= stop) {
        const v1 = b[body] === 1;
        const scale = u32(b, body + (v1 ? 20 : 12));
        const dur = v1 ? u32(b, body + 24) * 2 ** 32 + u32(b, body + 28) : u32(b, body + 16);
        if (scale) out.duration = dur / scale;
      } else if (type === 'tkhd' && !out.width) {
        // 寬高是 tkhd 最後 8 個位元組；音訊軌是 0
        const w = u32(b, stop - 8) / 65536;
        const h = u32(b, stop - 4) / 65536;
        if (w > 0 && h > 0) [out.width, out.height] = [Math.round(w), Math.round(h)];
      }
      p += size;
    }
  };
  walk(0, b.length);
}

// EBML 的變長整數：ID 保留長度標記，大小去掉標記
function vint(b, p, keepMarker) {
  const first = b[p];
  if (first === undefined || first === 0) return null;
  let len = 1;
  while (len <= 8 && !(first & (0x80 >> (len - 1)))) len++;
  let v = keepMarker ? first : first & (0xff >> len);
  for (let i = 1; i < len; i++) v = v * 256 + b[p + i];
  const unknown = !keepMarker && v === 2 ** (7 * len) - 1;
  return { value: unknown ? Infinity : v, len };
}

function ebml(b, out) {
  const SEGMENT = 0x18538067, INFO = 0x1549a966, TRACKS = 0x1654ae6b, ENTRY = 0xae, VIDEO = 0xe0;
  const SCALE = 0x2ad7b1, DURATION = 0x4489, PW = 0xb0, PH = 0xba;
  let scale = 1000000;
  let dur = 0;
  const uint = (p, n) => {
    let v = 0;
    for (let i = 0; i < n; i++) v = v * 256 + b[p + i];
    return v;
  };
  const walk = (start, end, depth) => {
    let p = start;
    while (p < end && depth < 6) {
      const id = vint(b, p, true);
      if (!id) return;
      const size = vint(b, p + id.len, false);
      if (!size) return;
      const body = p + id.len + size.len;
      const stop = size.value === Infinity ? end : Math.min(end, body + size.value);
      switch (id.value) {
        case SEGMENT: case INFO: case TRACKS: case ENTRY: case VIDEO:
          walk(body, stop, depth + 1);
          break;
        case SCALE: scale = uint(body, size.value); break;
        case DURATION:
          dur = size.value === 4 ? new DataView(b.buffer, b.byteOffset + body, 4).getFloat32(0) : new DataView(b.buffer, b.byteOffset + body, 8).getFloat64(0);
          break;
        case PW: if (!out.width) out.width = uint(body, size.value); break;
        case PH: if (!out.height) out.height = uint(body, size.value); break;
      }
      // 不必讀進 Cluster（影像資料）；遇到就停
      if (id.value === 0x1f43b675) return;
      p = stop;
    }
  };
  walk(0, b.length, 0);
  if (dur > 0) out.duration = (dur * scale) / 1e9;
}

/** { duration, width, height } of a video file's bytes (ArrayBuffer). */
export function probe(buf) {
  const b = new Uint8Array(buf);
  const out = { duration: 0, width: 0, height: 0 };
  try {
    if (ascii(b, 4, 4) === 'ftyp') mp4(b, out);
    else if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) ebml(b, out);
  } catch {
    // 壞掉的檔頭：不知道就算了
  }
  if (!Number.isFinite(out.duration) || out.duration < 0) out.duration = 0;
  return out;
}
