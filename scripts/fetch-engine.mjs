// 下載 SolidCraft 網頁版引擎（wasm）與繁體中文字型到 engine/，已存在且版本相同就略過。
// 引擎是 SolidCraft 官方 Release 的 solidcraft-web-<版本>.zip（MIT / Apache-2.0），以 SHA256SUMS.txt 驗證。
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, renameSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { patchWasm, PATCH_VERSION } from './patch-locale.mjs';

export const SOLIDCRAFT_VERSION = '0.23.0';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENGINE = join(ROOT, 'engine');
const DEST = join(ENGINE, 'solidcraft');
const STAMP = join(DEST, '.xiaoke-version');
const STAMP_VALUE = `${SOLIDCRAFT_VERSION}+${PATCH_VERSION}`;
const BASE = `https://github.com/tangency-labs/solidcraft/releases/download/v${SOLIDCRAFT_VERSION}`;
const ZIP = `solidcraft-web-${SOLIDCRAFT_VERSION}.zip`;
// SolidCraft 網頁版只附日文字型；換成涵蓋繁體中文的 Noto Sans TC（SIL OFL 1.1）。
const FONT_URL = 'https://github.com/google/fonts/raw/main/ofl/notosanstc/NotoSansTC%5Bwght%5D.ttf';
const FONT = join(ENGINE, 'NotoSansTC.ttf');

async function get(url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  mkdirSync(ENGINE, { recursive: true });
  if (existsSync(STAMP) && readFileSync(STAMP, 'utf8').trim() === STAMP_VALUE) {
    console.log(`SolidCraft ${SOLIDCRAFT_VERSION} 引擎已就緒`);
  } else {
    console.log(`下載 SolidCraft ${SOLIDCRAFT_VERSION} 網頁版引擎…`);
    const [zip, sums] = await Promise.all([get(`${BASE}/${ZIP}`), get(`${BASE}/SHA256SUMS.txt`)]);
    const want = sums.toString('utf8').split('\n').find((l) => l.trim().endsWith(ZIP))?.split(/\s+/)[0];
    const got = createHash('sha256').update(zip).digest('hex');
    if (!want || want.toLowerCase() !== got) throw new Error(`${ZIP} SHA256 不符（預期 ${want}，實際 ${got}）`);
    const tmp = join(ENGINE, `.tmp-${process.pid}`);
    rmSync(tmp, { recursive: true, force: true });
    mkdirSync(tmp, { recursive: true });
    const zipPath = join(tmp, ZIP);
    writeFileSync(zipPath, zip);
    // Windows 10+ 內建 bsdtar 可解 zip（指定 System32 的，避免 Git Bash 的 GNU tar 把 C: 當成遠端主機）；
    // macOS 與 Linux（CI）用 unzip，GNU tar 不能解 zip
    if (process.platform === 'win32') execFileSync(join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe'), ['-xf', zipPath, '-C', tmp]);
    else execFileSync('unzip', ['-q', '-o', zipPath, '-d', tmp]);
    const inner = readdirSync(tmp).find((n) => n.startsWith('solidcraft-web'));
    if (!inner) throw new Error('壓縮檔內找不到 solidcraft-web 資料夾');
    rmSync(DEST, { recursive: true, force: true });
    renameSync(join(tmp, inner), DEST);
    rmSync(tmp, { recursive: true, force: true });
    const wasm = readdirSync(DEST).find((f) => f.endsWith('.wasm'));
    console.log('介面繁體中文化：', patchWasm(join(DEST, wasm)));
    writeFileSync(STAMP, STAMP_VALUE);
    console.log(`SolidCraft 引擎已解壓到 ${DEST}`);
  }
  if (!existsSync(FONT)) {
    console.log('下載 Noto Sans TC 字型…');
    writeFileSync(FONT, await get(FONT_URL));
  }
}

main().catch((e) => {
  console.error('下載引擎失敗：', e.message);
  process.exit(1);
});
