// Serving R2 objects from a Worker: single Range requests (RFC 9110 14.2), validators and download names.
// Used by files, photos, songs and videos.

/** content-disposition for a download (ASCII fallback plus the UTF-8 name, RFC 6266 / 8187). */
export function attachment(name) {
  return `attachment; filename="${name.replace(/[^\x20-\x7e]|["\\]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/**
 * The object `key` of `bucket` as a Response: 200, 206 for one byte range, 416 when the range is outside,
 * 304 when If-None-Match matches, 404 when missing.
 *   type      content type to send (default: the object's, else application/octet-stream)
 *   download  a file name: send as an attachment
 *   headers   extra headers (e.g. a content-security-policy)
 */
export async function serveObject(request, bucket, key, { type, download, headers: extra = {} } = {}) {
  const head = await bucket.head(key);
  if (!head) return new Response('找不到這個檔案', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  const etag = `"${head.etag}"`;
  const headers = {
    'content-type': type || head.httpMetadata?.contentType || 'application/octet-stream',
    etag,
    'last-modified': new Date(head.uploaded).toUTCString(),
    'accept-ranges': 'bytes',
    'cache-control': 'private, max-age=0, must-revalidate',
    ...extra,
  };
  if (download) headers['content-disposition'] = attachment(download);
  if ((request.headers.get('if-none-match') || '').split(/\s*,\s*/).includes(etag)) return new Response(null, { status: 304, headers });
  const total = head.size;
  const m = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range') || '');
  if (m && (m[1] || m[2])) {
    let start, end;
    if (m[1]) {
      start = +m[1];
      end = m[2] ? Math.min(+m[2], total - 1) : total - 1;
    } else {
      start = Math.max(0, total - +m[2]);
      end = total - 1;
    }
    if (start >= total || end < start) return new Response(null, { status: 416, headers: { ...headers, 'content-range': `bytes */${total}` } });
    const o = await bucket.get(key, { range: { offset: start, length: end - start + 1 } });
    return new Response(request.method === 'HEAD' ? null : o.body, { status: 206, headers: { ...headers, 'content-range': `bytes ${start}-${end}/${total}`, 'content-length': String(end - start + 1) } });
  }
  if (request.method === 'HEAD') return new Response(null, { headers: { ...headers, 'content-length': String(total) } });
  const o = await bucket.get(key);
  return new Response(o.body, { headers: { ...headers, 'content-length': String(total) } });
}

/** The uploaded File objects of a form field (ignores empty file inputs). */
export const filesOf = (value) => [].concat(value || []).filter((f) => f && typeof f === 'object' && typeof f.arrayBuffer === 'function' && f.name);

/** Human-readable size: 1.5 MB. */
export function size(n) {
  if (n < 1024) return `${n} B`;
  const u = ['KB', 'MB', 'GB', 'TB'];
  let i = -1;
  do {
    n /= 1024;
    i++;
  } while (n >= 1024 && i < u.length - 1);
  return `${n < 10 ? n.toFixed(1) : Math.round(n)} ${u[i]}`;
}
