// iCalendar（RFC 5545）：輸出與讀入 VEVENT。
import { zoned } from '../../_shared/lib.js';
import { addDays, parseRule, formatRule, isDate } from './recur.js';

const esc = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const unesc = (s) => s.replace(/\\([\\;,nN])/g, (_, c) => (c === 'n' || c === 'N' ? '\n' : c));

// 3.1 節：每行最多 75 個位元組，不切斷 UTF-8 字元
function fold(line) {
  const enc = new TextEncoder();
  const out = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (bytes + n > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = '';
      bytes = 0;
    }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}

const utc = (iso) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
const day = (d) => d.replace(/-/g, '');

export function toIcs(events) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ruwebos//calendar//ZH', 'CALSCALE:GREGORIAN'];
  const stamp = utc(new Date().toISOString());
  for (const e of events) {
    lines.push('BEGIN:VEVENT', `UID:${e.id}@ruwebos`, `DTSTAMP:${stamp}`);
    if (e.all_day) {
      // DTEND 是不含的那一天（3.6.1 節）
      lines.push(`DTSTART;VALUE=DATE:${day(e.start)}`, `DTEND;VALUE=DATE:${day(addDays(e.end, 1))}`);
    } else {
      lines.push(`DTSTART:${utc(e.start)}`, `DTEND:${utc(e.end)}`);
    }
    lines.push(`SUMMARY:${esc(e.title)}`);
    if (e.location) lines.push(`LOCATION:${esc(e.location)}`);
    if (e.note) lines.push(`DESCRIPTION:${esc(e.note)}`);
    if (e.rrule) lines.push(`RRULE:${e.rrule}`);
    lines.push(`LAST-MODIFIED:${utc(e.updated_at)}`, 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

// DTSTART/DTEND 的值 → { allDay, date } 或 { allDay: false, iso }
function when(value, params, tz) {
  let m;
  if (params.value === 'DATE' || /^\d{8}$/.test(value)) {
    m = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
    return m ? { allDay: true, date: `${m[1]}-${m[2]}-${m[3]}` } : null;
  }
  m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(value);
  if (!m) return null;
  const [, y, mo, d, hh, mm, ss, z] = m;
  if (z) return { allDay: false, iso: new Date(Date.UTC(+y, mo - 1, +d, +hh, +mm, +ss)).toISOString() };
  // TZID=…：Intl 認得就用那個時區；沒有 TZID（浮動時間）就用檢視者的時區
  let zone = tz;
  if (params.tzid) {
    try {
      new Intl.DateTimeFormat('en', { timeZone: params.tzid });
      zone = params.tzid;
    } catch {}
  }
  return { allDay: false, iso: zoned(`${y}-${mo}-${d}`, `${hh}:${mm}`, zone).toISOString() };
}

/** iCalendar text → [{ title, location, note, all_day, start, end, rrule }] (same shapes as the events table). */
export function parseIcs(text, tz) {
  const lines = String(text).replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  const out = [];
  let e = null;
  let depth = 0; // VALARM 之類的子元件裡的屬性不算
  for (const line of lines) {
    const colon = line.search(/:(?=(?:[^"]*"[^"]*")*[^"]*$)/);
    if (colon < 0) continue;
    const [head, ...pp] = line.slice(0, colon).split(';');
    const name = head.toUpperCase();
    const value = line.slice(colon + 1);
    const params = {};
    for (const p of pp) {
      const [k, v = ''] = p.split('=');
      params[k.toLowerCase()] = v.replace(/"/g, '');
    }
    if (name === 'BEGIN') {
      if (value.toUpperCase() === 'VEVENT') e = { title: '', location: '', note: '', start: null, end: null, rrule: '' };
      else if (e) depth++;
      continue;
    }
    if (name === 'END') {
      if (e && depth) depth--;
      else if (e && value.toUpperCase() === 'VEVENT') {
        if (e.start) {
          const s = e.start;
          let end = e.end;
          if (s.allDay) {
            // DTEND 不含那一天；沒有 DTEND 就是一天
            const last = end && end.allDay ? addDays(end.date, -1) : s.date;
            out.push({ title: e.title || '（無標題）', location: e.location, note: e.note, all_day: 1, start: s.date, end: last < s.date ? s.date : last, rrule: e.rrule });
          } else {
            const endIso = end && !end.allDay && end.iso >= s.iso ? end.iso : s.iso;
            out.push({ title: e.title || '（無標題）', location: e.location, note: e.note, all_day: 0, start: s.iso, end: endIso, rrule: e.rrule });
          }
        }
        e = null;
      }
      continue;
    }
    if (!e || depth) continue;
    if (name === 'SUMMARY') e.title = unesc(value).slice(0, 200);
    else if (name === 'LOCATION') e.location = unesc(value).slice(0, 200);
    else if (name === 'DESCRIPTION') e.note = unesc(value).slice(0, 5000);
    else if (name === 'DTSTART') e.start = when(value, params, tz);
    else if (name === 'DTEND') e.end = when(value, params, tz);
    else if (name === 'RRULE') e.rrule = formatRule(parseRule(value));
  }
  return out.filter((x) => (x.all_day ? isDate(x.start) : true));
}
