// Runs every app's test.mjs against a running edge:
//   node apps/test.mjs [http://localhost:8700] [app ...]
// Each apps/<name>/test.mjs exports `default async function (t)`; t talks to http://<name>.localhost:<port>.
import { readdirSync, existsSync } from 'node:fs';

const edge = new URL(process.argv[2] || 'http://localhost:8700');
const only = process.argv.slice(3);
const dir = new URL('.', import.meta.url);
const names = readdirSync(dir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith('_') && existsSync(new URL(`${d.name}/test.mjs`, dir)))
  .map((d) => d.name)
  .filter((n) => !only.length || only.includes(n));

function client(name) {
  const base = `${edge.protocol}//${name}.localhost:${edge.port}`;
  const res = async (r, ms) => ({
    status: r.status,
    location: r.headers.get('location'),
    type: r.headers.get('content-type') || '',
    headers: r.headers,
    text: await r.text(),
    ms,
  });
  const timed = async (path, opts = {}) => {
    const t0 = performance.now();
    const r = await fetch(base + path, { redirect: 'manual', ...opts });
    return res(r, performance.now() - t0);
  };
  const t = {
    base,
    get: (path) => timed(path),
    /** POST a form (urlencoded, or multipart when a value is a Blob). */
    post(path, fields = {}) {
      const multipart = Object.values(fields).some((v) => v instanceof Blob);
      let body;
      if (multipart) {
        body = new FormData();
        for (const [k, v] of Object.entries(fields)) for (const x of [].concat(v)) x instanceof File ? body.append(k, x, x.name) : body.append(k, x);
      } else {
        body = new URLSearchParams();
        for (const [k, v] of Object.entries(fields)) for (const x of [].concat(v)) body.append(k, x);
      }
      return timed(path, { method: 'POST', body });
    },
    ok(cond, msg) {
      if (!cond) throw new Error(msg);
    },
    /** A page that must be 200 HTML and contain every given string. */
    async page(path, ...must) {
      const r = await t.get(path);
      t.ok(r.status === 200, `GET ${path}: ${r.status}`);
      t.ok(r.type.startsWith('text/html'), `GET ${path}: ${r.type}`);
      for (const s of must) t.ok(r.text.includes(s), `GET ${path}: no "${s}"`);
      return r;
    },
    /** A POST that must redirect (303); returns the Location. */
    async submit(path, fields) {
      const r = await t.post(path, fields);
      t.ok(r.status === 303 && r.location, `POST ${path}: ${r.status} ${r.text.slice(0, 200)}`);
      return r.location;
    },
  };
  return t;
}

let failed = 0;
for (const name of names) {
  const t0 = performance.now();
  try {
    const { default: test } = await import(new URL(`${name}/test.mjs`, dir));
    const t = client(name);
    const m = await t.get('/manifest.webmanifest');
    t.ok(m.status === 200 && JSON.parse(m.text).name, 'no /manifest.webmanifest with a name');
    t.ok((await t.get('/icon.svg')).status === 200, 'no /icon.svg');
    await test(t);
    console.log(`ok    ${name} (${(performance.now() - t0).toFixed(0)} ms)`);
  } catch (e) {
    failed++;
    console.log(`FAIL  ${name}: ${e.message}`);
  }
}
console.log(`${names.length - failed}/${names.length} apps passed`);
process.exit(failed ? 1 : 0);
