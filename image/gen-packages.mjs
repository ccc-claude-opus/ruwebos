// 把 rucloud 的範例應用打包成預裝套件：apps/installer/public/packages/<id>.tar.gz 與 index.json。
// 安裝程式在第一次開機（以及系統碟換成新版時）把它們裝好；使用者可以像其他應用一樣移除、管理權限。
// 版本是 1.0.<改過這個應用資料夾的 commit 數>，所以 rucloud 的範例一改，新系統碟就會更新已裝的版本。
//   node image/gen-packages.mjs <rucloud checkout>
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, cpSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const root = new URL('..', import.meta.url).pathname;
const rucloud = process.argv[2] || join(root, '../rucloud');
const out = join(root, 'apps/installer/public/packages');

// id、資料夾、名稱、說明、顏色、字（沒有圖示時主畫面顯示的）
const EXAMPLES = [
  ['myshop', 'apps/myshop', 'MyShop', '個人商店與收銀', '#e8590c', '店'],
  ['friendbook', 'apps/friendbook', 'Friendbook', '貼文、按讚、留言、追蹤', '#1971c2', '友'],
  ['markpedia', 'apps/markpedia', 'Markpedia', 'Markdown 知識庫', '#2f9e44', '典'],
  ['music', 'apps/music', '琴鍵實驗室', '樂理、彈琴、MIDI', '#9c36b5', '琴'],
  ['boardgame', 'apps/boardgame', '棋藝軒', '棋類與桌遊對戰', '#c92a2a', '棋'],
  ['webportal', 'sites/webportal', 'Webportal', '入口網站', '#f08c00', '門'],
  ['ccc', 'sites/ccc', '網頁導航', '常用網站連結', '#495057', '航'],
];
const SKIP = new Set(['node_modules', '.wrangler', '.rucloud', '.git', '.DS_Store', 'package-lock.json']);

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const index = [];
for (const [id, dir, name, description, color, glyph] of EXAMPLES) {
  const src = join(rucloud, dir);
  const stage = join(tmpdir(), `ruwebos-pkg-${id}`);
  rmSync(stage, { recursive: true, force: true });
  cpSync(src, stage, {
    recursive: true,
    filter: (p) => {
      const base = p.split('/').pop();
      return !SKIP.has(base) && !base.startsWith('.dev.vars') && base !== '.env' && !base.startsWith('.env.');
    },
  });
  cpSync(join(rucloud, 'LICENSE'), join(stage, 'LICENSE'));
  const count = execFileSync('git', ['-C', rucloud, 'rev-list', '--count', 'HEAD', '--', dir], { encoding: 'utf8' }).trim();
  const devVars = join(src, '.dev.vars.example');
  const secrets = existsSync(devVars)
    ? readFileSync(devVars, 'utf8').split('\n').map((l) => /^([A-Z_][A-Z0-9_]*)=/.exec(l)?.[1]).filter(Boolean)
    : [];
  const manifest = {
    id,
    name,
    version: `1.0.${count}`,
    description,
    license: 'MIT',
    author: 'ccc-claude-opus',
    source: `https://github.com/ccc-claude-opus/rucloud/tree/main/${dir}`,
    color,
    glyph,
    permissions: [],
    ...(secrets.length ? { secrets } : {}),
    ...(existsSync(join(src, 'schema.sql')) ? { d1_init: { DB: 'schema.sql' } } : {}),
  };
  writeFileSync(join(stage, 'ruwebos-app.json'), JSON.stringify(manifest, null, 2) + '\n');
  const file = `${id}.tar.gz`;
  // COPYFILE_DISABLE：macOS 的 tar 不要放進 ._ 檔（延伸屬性）
  execFileSync('tar', ['-czf', join(out, file), '-C', stage, ...readdirSync(stage)], { env: { ...process.env, COPYFILE_DISABLE: '1' } });
  rmSync(stage, { recursive: true, force: true });
  index.push({ id, name, version: manifest.version, file });
}
writeFileSync(join(out, 'index.json'), JSON.stringify({ packages: index }, null, 2) + '\n');

// 範例（不會自動安裝；測試與給應用開發者參考）：apps/installer/samples/<id>/ → packages/samples/<id>.tar.gz
const samples = join(root, 'apps/installer/samples');
mkdirSync(join(out, 'samples'), { recursive: true });
for (const id of readdirSync(samples)) {
  execFileSync('tar', ['-czf', join(out, 'samples', `${id}.tar.gz`), '-C', join(samples, id), ...readdirSync(join(samples, id))], { env: { ...process.env, COPYFILE_DISABLE: '1' } });
}
console.log(`   packages: ${index.map((p) => `${p.id} ${p.version}`).join(', ')}; samples: ${readdirSync(samples).join(', ')}`);
