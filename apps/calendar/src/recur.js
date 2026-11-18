// 重複規則（RFC 5545 RRULE 的子集）：FREQ=DAILY|WEEKLY|MONTHLY|YEARLY、INTERVAL、COUNT、UNTIL、
// BYDAY（只用在 WEEKLY）。展開在檢視者時區的「牆上時間」進行，所以每週一 09:00 跨過日光節約時間仍是 09:00。
import { parts, zoned } from '../../_shared/lib.js';

const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const DAY_ZH = ['日', '一', '二', '三', '四', '五', '六'];
export const FREQS = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'];

// ---- 'YYYY-MM-DD' 的日期運算（用 UTC 的 Date，不受時區影響）
const D = (s) => new Date(`${s}T00:00:00Z`);
const S = (d) => d.toISOString().slice(0, 10);
export const addDays = (s, n) => S(new Date(D(s).getTime() + n * 86400000));
export const dow = (s) => D(s).getUTCDay();
export const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && S(D(s)) === s;
function addMonths(s, n) {
  // 那個月沒有這一天（例如 1/31 的下個月）就回傳 null：RFC 5545 規定跳過
  const [y, m, d] = s.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, d));
  return t.getUTCDate() === d ? S(t) : null;
}
const daysBetween = (a, b) => Math.round((D(b) - D(a)) / 86400000);

/** Local wall-clock date and time of an instant: { date: 'YYYY-MM-DD', time: 'HH:MM' }. */
export function local(instant, tz) {
  const p = parts(instant instanceof Date ? instant : new Date(instant), tz);
  const two = (n) => String(n).padStart(2, '0');
  return { date: `${p.y}-${two(p.m)}-${two(p.d)}`, time: `${two(p.hh)}:${two(p.mm)}` };
}

/** 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE' → { freq, interval, count, until, byday: [1, 3] }（不支援的部分忽略） */
export function parseRule(text) {
  if (!text) return null;
  const r = { freq: '', interval: 1, count: 0, until: '', byday: [] };
  for (const part of text.replace(/^RRULE:/i, '').split(';')) {
    const [k, v = ''] = part.split('=');
    const key = k.toUpperCase();
    if (key === 'FREQ') r.freq = v.toUpperCase();
    else if (key === 'INTERVAL') r.interval = Math.max(1, Math.min(999, parseInt(v, 10) || 1));
    else if (key === 'COUNT') r.count = Math.max(0, Math.min(5000, parseInt(v, 10) || 0));
    else if (key === 'UNTIL') r.until = v.toUpperCase();
    else if (key === 'BYDAY') r.byday = v.toUpperCase().split(',').map((d) => DAYS.indexOf(d.replace(/^[+-]?\d+/, ''))).filter((i) => i >= 0);
  }
  return FREQS.includes(r.freq) ? r : null;
}

export function formatRule(r) {
  if (!r) return '';
  const out = [`FREQ=${r.freq}`];
  if (r.interval > 1) out.push(`INTERVAL=${r.interval}`);
  if (r.count) out.push(`COUNT=${r.count}`);
  if (r.until) out.push(`UNTIL=${r.until}`);
  if (r.freq === 'WEEKLY' && r.byday.length) out.push(`BYDAY=${[...new Set(r.byday)].sort().map((i) => DAYS[i]).join(',')}`);
  return out.join(';');
}

/** UNTIL 換成檢視者時區的最後一天 'YYYY-MM-DD'。 */
function untilDate(until, tz) {
  let m;
  if ((m = /^(\d{4})(\d{2})(\d{2})$/.exec(until))) return `${m[1]}-${m[2]}-${m[3]}`;
  if ((m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(until))) {
    return local(new Date(Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6])), tz).date;
  }
  return '';
}

/** 「每週一、三，到 2026/12/31」這類說明 */
export function describe(rrule, tz) {
  const r = parseRule(rrule);
  if (!r) return '';
  const unit = { DAILY: '天', WEEKLY: '週', MONTHLY: '個月', YEARLY: '年' }[r.freq];
  let s = r.interval > 1 ? `每 ${r.interval} ${unit}` : { DAILY: '每天', WEEKLY: '每週', MONTHLY: '每月', YEARLY: '每年' }[r.freq];
  if (r.freq === 'WEEKLY' && r.byday.length) s += r.byday.slice().sort().map((i) => DAY_ZH[i]).join('、').replace(/^/, r.interval > 1 ? '的週' : '');
  if (r.count) s += `，共 ${r.count} 次`;
  const u = untilDate(r.until, tz);
  if (u) s += `，到 ${u.replace(/-/g, '/')}`;
  return s;
}

/**
 * The occurrences of an event that touch the local dates [from, to] (inclusive) in time zone tz:
 * [{ event, date, endDate, start, end, time, endTime }] — start/end are Date instants for timed events;
 * for all-day events date/endDate are the local days and start/end are null.
 */
export function occurrences(ev, from, to, tz) {
  let first, time = '', durMs = 0, durDays = 0;
  if (ev.all_day) {
    first = ev.start;
    durDays = Math.max(0, daysBetween(ev.start, ev.end));
  } else {
    ({ date: first, time } = local(ev.start, tz));
    durMs = Math.max(0, new Date(ev.end) - new Date(ev.start));
  }
  const rule = parseRule(ev.rrule);
  const until = rule ? untilDate(rule.until, tz) : '';
  const out = [];
  const emit = (date) => {
    if (ev.all_day) {
      const endDate = addDays(date, durDays);
      if (date <= to && endDate >= from) out.push({ event: ev, date, endDate, start: null, end: null, time: '', endTime: '' });
      return;
    }
    const start = zoned(date, time, tz);
    const end = new Date(start.getTime() + durMs);
    const e = local(end, tz);
    if (date <= to && e.date >= from) out.push({ event: ev, date, endDate: e.date, start, end, time, endTime: e.time });
  };
  if (!rule) {
    emit(first);
    return out;
  }
  // 往前多看最長一次的長度，跨日的行程也算進來
  const lookback = ev.all_day ? durDays : Math.ceil(durMs / 86400000);
  const lo = addDays(from, -lookback);
  let n = 0; // 已經產生的次數（COUNT 從第一次開始算）
  const done = (date) => (until && date > until) || (rule.count && n >= rule.count) || date > to;
  const step = (k) => {
    if (rule.freq === 'DAILY') return [addDays(first, k * rule.interval)];
    if (rule.freq === 'MONTHLY') return [addMonths(first, k * rule.interval)];
    if (rule.freq === 'YEARLY') return [addMonths(first, 12 * k * rule.interval)];
    // WEEKLY：以週一為一週的開始（WKST=MO）
    const monday = addDays(first, -((dow(first) + 6) % 7) + 7 * k * rule.interval);
    const days = rule.byday.length ? rule.byday : [dow(first)];
    return days.map((d) => addDays(monday, (d + 6) % 7)).sort();
  };
  // 沒有 COUNT 時可以直接跳到區間附近，不必從很久以前一次一次算
  let k = 0;
  if (!rule.count && lo > first) {
    const days = daysBetween(first, lo);
    const per = { DAILY: 1, WEEKLY: 7, MONTHLY: 28, YEARLY: 365 }[rule.freq] * rule.interval;
    k = Math.max(0, Math.floor(days / per) - 2);
  }
  for (let guard = 0; guard < 5000; guard++, k++) {
    const dates = step(k);
    let stop = false;
    for (const date of dates) {
      if (!date || date < first) continue;
      if (done(date)) {
        stop = true;
        break;
      }
      n++;
      if (date >= lo) emit(date);
    }
    if (stop) break;
  }
  return out;
}
