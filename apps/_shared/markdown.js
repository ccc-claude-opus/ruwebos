// A small Markdown renderer for notes and file previews (CommonMark subset: headings, paragraphs,
// emphasis, code, fenced code, lists, task lists, quotes, links, images, rules, tables).
// Everything is escaped first; only http(s), mailto, relative and data:image URLs become links.
import { escape } from './lib.js';

function safeUrl(u) {
  const s = u.trim();
  if (/^(https?:|mailto:|\/|\.|#)/i.test(s) || !/^[a-z][a-z0-9+.-]*:/i.test(s)) return s;
  if (/^data:image\/(png|jpeg|gif|webp);/i.test(s)) return s;
  return '#';
}

function inline(text) {
  const codes = [];
  let s = escape(text).replace(/`([^`]+)`/g, (_, c) => {
    codes.push(c);
    return `\u0000${codes.length - 1}\u0000`;
  });
  s = s
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, u) => `<img alt="${alt}" src="${safeUrl(u)}">`)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => `<a href="${safeUrl(u)}">${t}</a>`)
    .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2">$2</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`);
}

function table(rows) {
  const cells = (r) => r.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());
  const head = cells(rows[0]);
  const body = rows.slice(2).map(cells);
  return `<table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${body
    .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`)
    .join('')}</tbody></table>`;
}

/** Markdown → HTML string (safe to insert with raw()). */
export function markdown(src) {
  const lines = String(src ?? '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    let m;
    if (/^\s*$/.test(line)) {
      i++;
    } else if ((m = /^(```|~~~)\s*([\w-]*)/.exec(line))) {
      const fence = m[1];
      const body = [];
      for (i++; i < lines.length && !lines[i].startsWith(fence); i++) body.push(lines[i]);
      i++;
      out.push(`<pre><code${m[2] ? ` class="language-${escape(m[2])}"` : ''}>${escape(body.join('\n'))}</code></pre>`);
    } else if ((m = /^(#{1,6})\s+(.*?)\s*#*$/.exec(line))) {
      out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`);
      i++;
    } else if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      out.push('<hr>');
      i++;
    } else if (/^\s*>/.test(line)) {
      const body = [];
      for (; i < lines.length && /^\s*>/.test(lines[i]); i++) body.push(lines[i].replace(/^\s*>\s?/, ''));
      out.push(`<blockquote>${markdown(body.join('\n'))}</blockquote>`);
    } else if (/^\s*\|.*\|\s*$/.test(line) && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1] || '') && (lines[i + 1] || '').includes('-')) {
      const rows = [];
      for (; i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i]); i++) rows.push(lines[i]);
      out.push(table(rows));
    } else if ((m = /^\s*([-*+]|\d+[.)])\s+/.exec(line))) {
      const ordered = /\d/.test(m[1]);
      const items = [];
      for (; i < lines.length; i++) {
        const l = lines[i];
        const im = /^\s*([-*+]|\d+[.)])\s+(.*)$/.exec(l);
        if (im) items.push(im[2]);
        else if (/^\s{2,}\S/.test(l) && items.length) items[items.length - 1] += ' ' + l.trim();
        else break;
      }
      const li = items.map((t) => {
        const task = /^\[([ xX])\]\s+(.*)$/.exec(t);
        return task
          ? `<li class="task"><input type="checkbox" disabled${task[1] === ' ' ? '' : ' checked'}> ${inline(task[2])}</li>`
          : `<li>${inline(t)}</li>`;
      });
      out.push(ordered ? `<ol>${li.join('')}</ol>` : `<ul>${li.join('')}</ul>`);
    } else {
      const para = [];
      for (; i < lines.length && !/^\s*$/.test(lines[i]) && !/^(#{1,6}\s|```|~~~|\s*>|\s*([-*+]|\d+[.)])\s+)/.test(lines[i]); i++) para.push(lines[i]);
      if (!para.length) para.push(lines[i++]);
      out.push(`<p>${para.map(inline).join('<br>')}</p>`);
    }
  }
  return out.join('\n');
}
