// 建立線上版到 site/（GitHub Pages 部署用）
// - 介面：src/renderer（同一份程式，沒有 preload 時自動改用 js/web-shim.js）
// - 引擎：engine/solidcraft（已繁體中文化），首頁移除 Service Worker；日文字型換成 Noto Sans TC
// - js/web-lib.js：fontkit + Clipper + 轉檔（esbuild 打包）
import { rmSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = join(ROOT, 'site');
const require = createRequire(import.meta.url);
const { transformEngineHtml } = require('../src/main/enginehtml.js');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

if (!existsSync(join(ROOT, 'engine', 'solidcraft', 'index.html'))) throw new Error('請先執行 npm run fetch-engine');

// 自己遞迴複製：Node 22 的 fs.cpSync 在 Windows 中文路徑下會當掉
function copyDir(from, to) {
  mkdirSync(to, { recursive: true });
  for (const d of readdirSync(from, { withFileTypes: true })) {
    if (d.isDirectory()) copyDir(join(from, d.name), join(to, d.name));
    else copyFileSync(join(from, d.name), join(to, d.name));
  }
}
rmSync(SITE, { recursive: true, force: true });
mkdirSync(SITE, { recursive: true });

copyDir(join(ROOT, 'src', 'renderer'), SITE);
copyDir(join(ROOT, 'engine', 'solidcraft'), join(SITE, 'engine'));
rmSync(join(SITE, 'engine', 'sw.js'), { force: true });
rmSync(join(SITE, 'engine', '.xiaoke-version'), { force: true });
const idx = join(SITE, 'engine', 'index.html');
writeFileSync(idx, transformEngineHtml(readFileSync(idx, 'utf8')));
copyFileSync(join(ROOT, 'engine', 'NotoSansTC.ttf'), join(SITE, 'engine', 'fonts', 'BIZUDPGothic-Regular.ttf'));

await build({
  entryPoints: [join(ROOT, 'src', 'web', 'lib-entry.js')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  minify: true,
  outfile: join(SITE, 'js', 'web-lib.js'),
  logLevel: 'warning',
});

const solidcraft = readFileSync(join(ROOT, 'engine', 'solidcraft', '.xiaoke-version'), 'utf8').trim().split('+')[0];
writeFileSync(join(SITE, 'version.json'), JSON.stringify({ version: pkg.version, solidcraft, built: new Date().toISOString() }));
writeFileSync(join(SITE, '.nojekyll'), '');
console.log(`線上版已建立：${SITE}（v${pkg.version}，SolidCraft ${solidcraft}）`);
