// Generates home/public/apps.json, the system apps the home screen shows, from the apps in image/rucloud.toml:
// each app's public/manifest.webmanifest (name, description, theme_color, icon); apps without a manifest
// (app-builder from rucloud's examples) use the fallback table below. Installed apps and favorites come from
// the installer at run time (home/src/worker.js).
//   node image/gen-home.mjs <rucloud checkout>
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const rucloud = process.argv[2] || join(root, '../rucloud');
const fallback = {
  'app-builder': ['App Builder', 'AI 網站產生器（需自備金鑰）', '#5f3dc4', '造'],
};

// the app paths in the system disk's rucloud.toml: /opt/ruwebos/apps/<x> (ours) and /opt/ruwebos/examples/... (rucloud's)
const toml = readFileSync(join(root, 'image/rucloud.toml'), 'utf8');
const paths = [...toml.matchAll(/^path\s*=\s*"([^"]+)"/gm)].map((m) => m[1]).filter((p) => !p.endsWith('/home'));

const apps = [];
for (const p of paths) {
  const local = p.replace('/opt/ruwebos/apps/', join(root, 'apps/')).replace('/opt/ruwebos/examples/', join(rucloud, '/'));
  const name = basename(p);
  const mf = join(local, 'public/manifest.webmanifest');
  if (existsSync(mf)) {
    const m = JSON.parse(readFileSync(mf, 'utf8'));
    apps.push({ id: name, name: m.short_name || m.name, description: m.description || '', color: m.theme_color, icon: m.icons?.[0]?.src || '' });
  } else {
    const [title, description, color, glyph] = fallback[name] || [name, '', '#868e96', name[0].toUpperCase()];
    apps.push({ id: name, name: title, description, color, glyph });
  }
}
writeFileSync(join(root, 'home/public/apps.json'), JSON.stringify({ apps }, null, 2) + '\n');
console.log(`   home: ${apps.length} system apps`);
