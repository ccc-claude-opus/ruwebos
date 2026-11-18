// 影像的中繼資料：尺寸（JPEG、PNG、GIF、WebP）與 JPEG 的 EXIF（CIPA DC-008 / TIFF 6.0）：
// 拍攝時間、相機、方向、GPS。只讀檔案開頭（EXIF 在 APP1，最多 64 KB），不解碼影像。

const TAGS = { 0x010f: 'make', 0x0110: 'model', 0x0112: 'orientation', 0x0132: 'datetime', 0x8769: 'exif', 0x8825: 'gps', 0x9003: 'taken', 0xa002: 'pxWidth', 0xa003: 'pxHeight' };
const GPS = { 1: 'latRef', 2: 'lat', 3: 'lonRef', 4: 'lon' };

function readIfd(view, tiff, offset, little, names, out, depth = 0) {
  if (depth > 3 || offset + 2 > view.byteLength - tiff) return;
  const u16 = (o) => view.getUint16(tiff + o, little);
  const u32 = (o) => view.getUint32(tiff + o, little);
  const n = u16(offset);
  for (let i = 0; i < n; i++) {
    const e = offset + 2 + i * 12;
    if (tiff + e + 12 > view.byteLength) return;
    const name = names[u16(e)];
    if (!name) continue;
    const type = u16(e + 2);
    const count = u32(e + 4);
    const size = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 }[type] || 1;
    const at = size * count > 4 ? u32(e + 8) : e + 8;
    if (tiff + at + size * count > view.byteLength) continue;
    let v;
    if (type === 2) {
      v = '';
      for (let k = 0; k < count; k++) {
        const c = view.getUint8(tiff + at + k);
        if (!c) break;
        v += String.fromCharCode(c);
      }
      v = v.trim();
    } else if (type === 3) v = u16(at);
    else if (type === 4) v = u32(at);
    else if (type === 5) {
      v = [];
      for (let k = 0; k < count; k++) v.push(u32(at + k * 8) / (u32(at + k * 8 + 4) || 1));
    } else continue;
    if (name === 'exif' || name === 'gps') readIfd(view, tiff, v, little, name === 'gps' ? GPS : TAGS, out, depth + 1);
    else out[name] = v;
  }
}

function exif(view, start, length) {
  // "Exif\0\0" then a TIFF header
  if (length < 14 || view.getUint32(start) !== 0x45786966) return {};
  const tiff = start + 6;
  const little = view.getUint16(tiff) === 0x4949;
  const out = {};
  readIfd(new DataView(view.buffer, view.byteOffset, Math.min(view.byteLength, start + length)), tiff, view.getUint32(tiff + 4, little), little, TAGS, out);
  return out;
}

// "2024:05:01 13:45:10" (camera local time, no zone) → "2024-05-01T13:45:10"
const exifDate = (s) => (/^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}$/.test(s || '') && !s.startsWith('0000') ? s.replace(/^(\d{4}):(\d{2}):(\d{2}) /, '$1-$2-$3T') : '');
const dms = (v, ref) => (Array.isArray(v) && v.length === 3 ? (v[0] + v[1] / 60 + v[2] / 3600) * (ref === 'S' || ref === 'W' ? -1 : 1) : null);

/**
 * { type, width, height, taken ('YYYY-MM-DDTHH:MM:SS' local or ''), camera, orientation, lat, lon }
 * from the first bytes of an image (an ArrayBuffer; 128 KB is enough).
 */
export function imageInfo(buf) {
  const v = new DataView(buf);
  const out = { type: '', width: 0, height: 0, taken: '', camera: '', orientation: 1, lat: null, lon: null };
  const len = v.byteLength;
  if (len >= 4 && v.getUint16(0) === 0xffd8) {
    out.type = 'image/jpeg';
    let p = 2;
    while (p + 4 <= len && v.getUint8(p) === 0xff) {
      const marker = v.getUint8(p + 1);
      const size = v.getUint16(p + 2);
      if (marker === 0xe1 && !out.camera && !out.taken) {
        const x = exif(v, p + 4, size - 2);
        out.taken = exifDate(x.taken) || exifDate(x.datetime);
        out.camera = [x.make, x.model && x.make && x.model.startsWith(x.make) ? x.model.slice(x.make.length).trim() : x.model].filter(Boolean).join(' ');
        out.orientation = x.orientation >= 1 && x.orientation <= 8 ? x.orientation : 1;
        const lat = dms(x.lat, x.latRef);
        const lon = dms(x.lon, x.lonRef);
        if (lat !== null && lon !== null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && (lat || lon)) [out.lat, out.lon] = [lat, lon];
        if (x.pxWidth && x.pxHeight) [out.width, out.height] = [x.pxWidth, x.pxHeight];
      }
      // SOF0–SOF15（不含 DHT、JPG、DAC）：高、寬
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker) && p + 9 <= len) {
        out.height = v.getUint16(p + 5);
        out.width = v.getUint16(p + 7);
        break;
      }
      if (marker === 0xda) break;
      p += 2 + size;
    }
    // EXIF 方向 5–8 是轉了 90 度
    if (out.orientation >= 5) [out.width, out.height] = [out.height, out.width];
  } else if (len >= 24 && v.getUint32(0) === 0x89504e47) {
    out.type = 'image/png';
    out.width = v.getUint32(16);
    out.height = v.getUint32(20);
  } else if (len >= 10 && v.getUint32(0) === 0x47494638) {
    out.type = 'image/gif';
    out.width = v.getUint16(6, true);
    out.height = v.getUint16(8, true);
  } else if (len >= 30 && v.getUint32(0) === 0x52494646 && v.getUint32(8) === 0x57454250) {
    out.type = 'image/webp';
    const chunk = v.getUint32(12);
    if (chunk === 0x56503820) {
      // VP8：寬高在 26、28（低 14 位元）
      out.width = v.getUint16(26, true) & 0x3fff;
      out.height = v.getUint16(28, true) & 0x3fff;
    } else if (chunk === 0x5650384c) {
      const b = v.getUint32(21, true);
      out.width = (b & 0x3fff) + 1;
      out.height = ((b >> 14) & 0x3fff) + 1;
    } else if (chunk === 0x56503858) {
      out.width = 1 + (v.getUint8(24) | (v.getUint8(25) << 8) | (v.getUint8(26) << 16));
      out.height = 1 + (v.getUint8(27) | (v.getUint8(28) << 8) | (v.getUint8(29) << 16));
    }
  }
  return out;
}
