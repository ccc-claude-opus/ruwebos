// vCard（RFC 6350，4.0）：輸出與讀入。讀入也接受 3.0 常見的寫法（TYPE=CELL、item1. 前綴）。

const TEL_TYPE = { 手機: 'cell', 住家: 'home', 公司: 'work', 其他: 'voice' };
const EMAIL_TYPE = { 住家: 'home', 公司: 'work', 手機: 'home', 其他: 'home' };

// 3.4 節：值裡的 \ , ; 與換行要跳脫（N、ADR 這類結構化欄位的分號由呼叫的人自己加）
const esc = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\r?\n/g, '\\n');
const unesc = (s) => s.replace(/\\([\\,;nN])/g, (_, c) => (c === 'n' || c === 'N' ? '\n' : c));

// 3.2 節：一行超過 75 個位元組就折行（不切斷 UTF-8 字元），續行以一個空白開頭
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

/** One contact row (phones/emails already parsed) → vCard text with CRLF. */
export function toVcard(c) {
  const lines = ['BEGIN:VCARD', 'VERSION:4.0', `UID:urn:uuid:${c.id}`, `FN:${esc(c.name)}`, `N:${esc(c.name)};;;;`];
  if (c.phonetic) lines.push(`X-PHONETIC-FIRST-NAME:${esc(c.phonetic)}`);
  if (c.org) lines.push(`ORG:${esc(c.org)}`);
  if (c.title) lines.push(`TITLE:${esc(c.title)}`);
  for (const p of c.phones) lines.push(`TEL;TYPE=${TEL_TYPE[p.label] || 'voice'}:${esc(p.value)}`);
  for (const e of c.emails) lines.push(`EMAIL;TYPE=${EMAIL_TYPE[e.label] || 'home'}:${esc(e.value)}`);
  if (c.address) lines.push(`ADR;TYPE=home:;;${esc(c.address)};;;;`);
  if (c.birthday) lines.push(`BDAY:${c.birthday.replace(/-/g, '').replace(/^(?=\d{4}$)/, '--')}`);
  if (c.url) lines.push(`URL:${esc(c.url)}`);
  if (c.note) lines.push(`NOTE:${esc(c.note)}`);
  if (c.groups) lines.push(`CATEGORIES:${c.groups.split(',').map((g) => esc(g.trim())).filter(Boolean).join(',')}`);
  lines.push(`REV:${c.updated_at.replace(/[-:]/g, '').replace(/\.\d+/, '')}`, 'END:VCARD');
  return lines.map(fold).join('\r\n') + '\r\n';
}

// TEL/EMAIL 的 TYPE → 中文標籤
function labelOf(params, kind) {
  const types = (params.type || '').toLowerCase().split(',');
  if (kind === 'tel' && types.includes('cell')) return '手機';
  if (types.includes('home')) return '住家';
  if (types.includes('work')) return '公司';
  return kind === 'tel' ? '其他' : '其他';
}

/** vCard text (one or many cards) → contact objects {name, phonetic, org, title, phones, emails, address, birthday, url, note, groups}. */
export function parseVcards(text) {
  // 3.2 節：先把折行接回去
  const lines = String(text).replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  const cards = [];
  let c = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const colon = line.search(/:(?=(?:[^"]*"[^"]*")*[^"]*$)/);
    if (colon < 0) continue;
    const [head, ...pp] = line.slice(0, colon).split(';');
    const name = head.replace(/^[\w-]+\./, '').toUpperCase(); // item1.TEL → TEL
    const params = {};
    for (const p of pp) {
      const [k, v] = p.split('=');
      if (v === undefined) params.type = [params.type, k].filter(Boolean).join(','); // 3.0：TEL;CELL:...
      else params[k.toLowerCase()] = [params[k.toLowerCase()], v.replace(/"/g, '')].filter(Boolean).join(',');
    }
    const value = line.slice(colon + 1);
    if (name === 'BEGIN' && value.toUpperCase() === 'VCARD') {
      c = { name: '', n: '', phonetic: '', org: '', title: '', phones: [], emails: [], address: '', birthday: '', url: '', note: '', groups: '' };
      continue;
    }
    if (!c) continue;
    switch (name) {
      case 'END':
        if (!c.name) c.name = c.n;
        if (c.name) cards.push(c);
        c = null;
        break;
      case 'FN': c.name = unesc(value).trim(); break;
      case 'N': {
        const [family = '', given = '', middle = ''] = value.split(/(?<!\\);/).map(unesc);
        c.n = /[\u3400-\u9fff]/.test(family + given) ? `${family}${given}` : [given, middle, family].filter(Boolean).join(' ');
        break;
      }
      case 'X-PHONETIC-FIRST-NAME': case 'X-PHONETIC-LAST-NAME': c.phonetic = (c.phonetic + ' ' + unesc(value)).trim(); break;
      case 'ORG': c.org = value.split(/(?<!\\);/).map(unesc).filter(Boolean).join(' '); break;
      case 'TITLE': c.title = unesc(value); break;
      case 'TEL': if (c.phones.length < 4) c.phones.push({ label: labelOf(params, 'tel'), value: unesc(value).replace(/^tel:/i, '') }); break;
      case 'EMAIL': if (c.emails.length < 4) c.emails.push({ label: labelOf(params, 'email'), value: unesc(value) }); break;
      case 'ADR': c.address = value.split(/(?<!\\);/).map(unesc).filter(Boolean).join(' '); break;
      case 'BDAY': {
        const d = value.replace(/T.*$/, '');
        let m;
        if ((m = /^(\d{4})-?(\d{2})-?(\d{2})$/.exec(d))) c.birthday = `${m[1]}-${m[2]}-${m[3]}`;
        else if ((m = /^--(\d{2})-?(\d{2})$/.exec(d))) c.birthday = `--${m[1]}-${m[2]}`;
        break;
      }
      case 'URL': c.url = unesc(value); break;
      case 'NOTE': c.note = unesc(value); break;
      case 'CATEGORIES': c.groups = value.split(/(?<!\\),/).map(unesc).map((s) => s.trim()).filter(Boolean).join(','); break;
    }
  }
  return cards.map(({ n, ...rest }) => rest);
}
