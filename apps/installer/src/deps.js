// npm 相依套件：Worker 引用了 npm 套件、套件裡又沒有 node_modules 時，依 package-lock.json 從 npm 的
// registry 下載（只下載執行時要的，不含 devDependencies），比對 integrity 後放進 node_modules/。
// 不執行任何安裝腳本（postinstall 等），也不建置：需要先建置的專案（前端、wrangler 的 build）由作者打包。
import { gunzip, untar } from './tar.js';

const dec = new TextDecoder();
const REGISTRY = 'https://registry.npmjs.org/';
const SOURCE = /\.(m?[jt]s|[jt]sx|cjs|mts|cts)$/;
// import x from 'pkg'、export … from 'pkg'、import 'pkg'、import('pkg')、require('pkg')
const IMPORT = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"]([^'"\s]+)['"]/g;

/** Worker 的程式碼引用到的 npm 套件名稱（不含 node:、cloudflare:、相對路徑）。 */
export function bareImports(files, main) {
  if (!main) return [];
  const dir = main.replace(/^\.\//, '').replace(/[^/]*$/, '');
  const names = new Set();
  for (const f of files) {
    if (!f.path.startsWith(dir) || !SOURCE.test(f.path) || f.path.startsWith('node_modules/')) continue;
    for (const m of dec.decode(f.data).matchAll(IMPORT)) {
      const s = m[1];
      if (/^(\.|\/|node:|cloudflare:|data:|https?:)/.test(s) || !/^[@a-z0-9]/i.test(s)) continue;
      names.add(s.startsWith('@') ? s.split('/').slice(0, 2).join('/') : s.split('/')[0]);
    }
  }
  return [...names].sort();
}

/** package-lock.json 裡執行時要的套件：[{ path, name, version, resolved, integrity, license }]。 */
export function runtimePackages(lock) {
  if (!lock || !lock.packages || !(lock.lockfileVersion >= 2)) throw new Error('package-lock.json 要是 npm 7 以上產生的（lockfileVersion 2 或 3）');
  const out = [];
  for (const [path, p] of Object.entries(lock.packages)) {
    if (!path || p.dev || p.devOptional) continue;
    if (!/(^|\/)node_modules\/((@[^/]+\/)?[^/]+)$/.test(path)) continue;
    if (p.link) throw new Error(`${path} 是工作區（workspace）裡的連結，不支援`);
    const name = /node_modules\/((@[^/]+\/)?[^/]+)$/.exec(path)[1];
    // 平台限定的選用套件（例如只給 Windows 的原生模組）：這台機器（Linux arm64）用不到就略過
    const fits = (list, v) => !list || (list.some((x) => !x.startsWith('!')) ? list.includes(v) : !list.includes(`!${v}`));
    if (p.optional && !(fits(p.os, 'linux') && fits(p.cpu, 'arm64'))) continue;
    out.push({ path, name, version: p.version, resolved: p.resolved, integrity: p.integrity, license: typeof p.license === 'string' ? p.license : '', optional: !!p.optional });
  }
  return out;
}

async function verify(bytes, integrity) {
  const sri = String(integrity || '').split(/\s+/).find((x) => x.startsWith('sha512-'));
  if (!sri) throw new Error('沒有 sha512 的 integrity');
  const got = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-512', bytes))));
  if (got !== sri.slice(7)) throw new Error('下載的內容和 package-lock.json 的 integrity 不符');
}

/**
 * 需要的話下載相依套件，回傳 { files: node_modules 底下的檔案, count, licenses: { 授權: 個數 }, scripts: [有安裝腳本的套件] }；
 * 不需要時回傳 null。maxBytes：解開後的上限。
 */
export async function fetchDeps(files, cfg, { fetcher = fetch, maxBytes, concurrency = 8 } = {}) {
  const imports = bareImports(files, cfg?.main);
  if (!imports.length || files.some((f) => f.path.startsWith('node_modules/'))) return null;
  const lockFile = files.find((f) => f.path === 'package-lock.json');
  if (!lockFile) {
    const other = ['yarn.lock', 'pnpm-lock.yaml', 'bun.lockb', 'bun.lock'].find((n) => files.some((f) => f.path === n));
    throw new Error(`Worker 引用了 npm 套件（${imports.slice(0, 5).join('、')}），${other ? `但只有 ${other}；安裝程式只認得 package-lock.json` : '但專案裡沒有 package-lock.json'}。請作者在 GitHub Release 附上打包好的套件，或在電腦上用 ruwebos 的 tools/ruwebos-package.mjs 打包後上傳`);
  }
  let lock;
  try {
    lock = JSON.parse(dec.decode(lockFile.data));
  } catch (e) {
    throw new Error(`package-lock.json 讀不懂：${e.message}`);
  }
  const pkgs = runtimePackages(lock);
  const have = new Set(pkgs.map((p) => p.name));
  const missing = imports.filter((n) => !have.has(n));
  if (missing.length) throw new Error(`Worker 引用的 ${missing.join('、')} 不在 package-lock.json 執行時的相依套件裡（可能是 devDependencies，要先打包）`);
  const top = lock.packages[''] || {};
  const scripts = pkgs.filter((p) => lock.packages[p.path].hasInstallScript).map((p) => p.name);

  const out = [];
  let total = 0;
  const licenses = {};
  let next = 0;
  const one = async (p) => {
    if (!p.resolved || !p.resolved.startsWith(REGISTRY)) throw new Error(`${p.name} 不是從 npm 的 registry 來的（${p.resolved || '沒有網址'}），不支援`);
    const r = await fetcher(p.resolved, { signal: AbortSignal.timeout(60000) });
    if (!r.ok) throw new Error(`下載 ${p.name}@${p.version} 失敗：HTTP ${r.status}`);
    const gz = new Uint8Array(await r.arrayBuffer());
    await verify(gz, p.integrity);
    for (const f of untar(await gunzip(gz), { maxBytes })) {
      // npm 的套件檔最上層是 package/（少數是別的名字）
      const rel = f.path.replace(/^[^/]+\//, '');
      if (!rel || rel.split('/').includes('..')) continue;
      total += f.data.length;
      if (maxBytes && total > maxBytes) throw new Error(`相依套件太大（上限 ${Math.round(maxBytes / 1048576)} MB）`);
      out.push({ path: `${p.path}/${rel}`, data: f.data });
    }
    const lic = p.license || 'UNKNOWN';
    licenses[lic] = (licenses[lic] || 0) + 1;
  };
  const worker = async () => {
    while (next < pkgs.length) {
      const p = pkgs[next++];
      try {
        await one(p);
      } catch (e) {
        if (!p.optional) throw new Error(`npm 套件 ${p.name}：${e.message}`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, pkgs.length) }, worker));
  return { files: out, count: pkgs.length, licenses, scripts, name: top.name || '' };
}

/** 需要先建置的專案：wrangler 的 build 指令，或靜態檔案資料夾不在套件裡（要 npm run build 產生）。 */
export function needsBuild(files, cfg) {
  if (!cfg) return null;
  if (cfg.build?.command) return `wrangler 設定裡有建置指令（${cfg.build.command}）`;
  const dir = cfg.assets?.directory?.replace(/^\.\//, '').replace(/\/$/, '');
  if (dir && !files.some((f) => f.path.startsWith(`${dir}/`))) return `靜態檔案資料夾 ${dir} 不在套件裡（要先建置產生）`;
  const main = cfg.main?.replace(/^\.\//, '');
  if (main && !files.some((f) => f.path === main)) return `Worker 的程式 ${main} 不在套件裡（要先建置產生）`;
  return null;
}
