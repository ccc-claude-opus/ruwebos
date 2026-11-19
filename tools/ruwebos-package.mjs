#!/usr/bin/env node
// Packages a Cloudflare Workers project as a ruwebos app: <id>.ruwebos.tar.gz, which ruwebos's installer
// installs (as a GitHub Release asset it is preferred over the repository's source). Run it in the
// project after `npm ci` and the project's build (if any):
//   node ruwebos-package.mjs [project dir] [--out DIR]
// The Worker is bundled with the project's own wrangler (`wrangler deploy --dry-run --outdir`) when it
// imports npm packages, so the package needs no node_modules; static assets (assets.directory),
// migrations, schema.sql, the license and ruwebos-app.json go in as they are. Without ruwebos-app.json a
// description is generated from wrangler's config, package.json and the license file (as the installer
// does); a project whose license cannot be told needs a ruwebos-app.json with "license".
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, cpSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const { generateManifest, unsupportedBindings, LICENSE_FILES } = await import(join(here, '../apps/installer/src/detect.js'));
const { parseJsonc, checkManifest } = await import(join(here, '../apps/installer/src/package.js'));

const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const outDir = resolve(outIdx >= 0 ? args[outIdx + 1] : '.');
const dir = resolve(args.find((a, i) => !a.startsWith('--') && i !== outIdx + 1) || '.');
const fail = (msg) => {
  console.error(`ruwebos-package: ${msg}`);
  process.exit(1);
};

const wranglerFile = ['wrangler.jsonc', 'wrangler.json', 'wrangler.toml'].find((f) => existsSync(join(dir, f)));
if (!wranglerFile) fail(`no wrangler.jsonc, wrangler.json or wrangler.toml in ${dir}`);
const wranglerText = readFileSync(join(dir, wranglerFile), 'utf8');
if (wranglerFile === 'wrangler.toml') fail('wrangler.toml: please use wrangler.jsonc (the package rewrites the config)');
const cfg = parseJsonc(wranglerText);
const unsupported = unsupportedBindings(cfg);
if (unsupported.length) fail(`uses Cloudflare services ruwebos does not offer installed apps yet: ${unsupported.join(', ')}`);

// the description
const files = (paths) => paths.filter((p) => existsSync(join(dir, p))).map((p) => ({ path: p, data: readFileSync(join(dir, p)) }));
let manifest;
if (existsSync(join(dir, 'ruwebos-app.json'))) {
  manifest = checkManifest(JSON.parse(readFileSync(join(dir, 'ruwebos-app.json'), 'utf8')));
} else {
  const top = readdirSync(dir).filter((f) => LICENSE_FILES.test(f) || f === 'package.json' || f === 'schema.sql');
  const g = generateManifest(cfg, cfg.name, [...files(top), ...(existsSync(join(dir, 'migrations')) ? [{ path: 'migrations/', data: new Uint8Array() }] : [])]);
  if (!g.manifest.license) fail('cannot tell the license from the license file: add a ruwebos-app.json with "license" (an SPDX name)');
  manifest = checkManifest(g.manifest, { generated: true });
  delete manifest.generated;
}

// the Worker: bundled when it imports npm packages (bare specifiers), else as it is
const stage = join(tmpdir(), `ruwebos-package-${process.pid}`);
rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
const out = { ...cfg };
if (cfg.main) {
  const src = readFileSync(join(dir, cfg.main), 'utf8');
  const bare = /(?:^|\n)\s*(?:import|export)\b[^'"]*?from\s*['"](?!\.|\/|node:|cloudflare:)[^'"]+['"]|import\(\s*['"](?!\.|\/|node:|cloudflare:)/.test(src);
  if (bare || existsSync(join(dir, 'node_modules', '.bin', 'wrangler'))) {
    const wrangler = join(dir, 'node_modules', '.bin', 'wrangler');
    if (!existsSync(wrangler)) fail('the Worker imports npm packages: run `npm ci` first (wrangler is needed to bundle it)');
    console.log('== bundling the Worker with wrangler');
    execFileSync(wrangler, ['deploy', '--dry-run', '--outdir', join(stage, 'worker')], { cwd: dir, stdio: 'inherit' });
    const entry = readdirSync(join(stage, 'worker')).find((f) => /\.(m?js)$/.test(f));
    if (!entry) fail('wrangler produced no bundle');
    out.main = `worker/${entry}`;
  } else {
    // no npm imports: the source folder of main goes in as it is
    const srcDir = cfg.main.replace(/^\.\//, '').split('/')[0];
    cpSync(join(dir, srcDir), join(stage, srcDir), { recursive: true });
  }
}
const copy = (p) => {
  if (p && existsSync(join(dir, p))) cpSync(join(dir, p), join(stage, p), { recursive: true });
};
copy(cfg.assets?.directory?.replace(/^\.\//, ''));
copy('migrations');
for (const db of cfg.d1_databases || []) copy(db.migrations_dir?.replace(/^\.\//, ''));
for (const f of readdirSync(dir)) if (LICENSE_FILES.test(f) || /^(README(\.md)?|schema\.sql|package\.json)$/i.test(f)) copy(f);
if (manifest.icon) copy(manifest.icon.replace(/^\.?\//, ''));
// the build of wrangler config that ruwebos runs (comments dropped; build steps are done)
delete out.build;
writeFileSync(join(stage, 'wrangler.json'), JSON.stringify(out, null, 2) + '\n');
writeFileSync(join(stage, 'ruwebos-app.json'), JSON.stringify(manifest, null, 2) + '\n');

mkdirSync(outDir, { recursive: true });
const file = join(outDir, `${manifest.id}.ruwebos.tar.gz`);
const entries = readdirSync(stage);
execFileSync('tar', ['-czf', file, '-C', stage, ...entries], { env: { ...process.env, COPYFILE_DISABLE: '1' } });
rmSync(stage, { recursive: true, force: true });
console.log(`${file} (${manifest.name} ${manifest.version}, ${manifest.license}; ${Math.round(statSync(file).size / 1024)} KB)`);
