// 線上版測試：本機伺服器 + Chrome → 草圖精靈、中文字、匯出（OPFS 讀回 + 轉檔 + 下載）
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 8791;
const server = spawn(process.execPath, ['scripts/serve-web.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
await sleep(800);
const out = join(tmpdir(), 'xiaoke-3d-web-dl');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const chrome = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await chromium.launch({ executablePath: chrome, headless: process.env.HEADED ? false : true, args: ['--enable-unsafe-webgpu'] });
const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1600, height: 950 } });
const page = await ctx.newPage();
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message} @ ${String(e.stack || '').split(/\n/).slice(0, 4).join(' / ')}`));
await ctx.addInitScript(() => addEventListener('error', (e) => console.log(`[winerr] ${e.message} ${e.filename}:${e.lineno}:${e.colno} in ${location.pathname}`)));
const saved = [];
page.on('download', async (d) => { const p = join(out, d.suggestedFilename()); await d.saveAs(p); saved.push(d.suggestedFilename()); });
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`${c ? '✓' : '✗'} ${m}`); };
const until = async (fn, ms = 120000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await page.evaluate(fn).catch(() => null); if (v) return v; await sleep(300); } return null; };
try {
  await page.goto(`http://127.0.0.1:${PORT}/`);
  ok(await until(() => document.getElementById('loading').classList.contains('hidden')), '線上版引擎載入');
  ok(await page.evaluate(() => document.body.classList.contains('web')), '線上版模式');
  ok((await page.textContent('#btnBambu')).includes('下載 3MF'), 'Bambu 按鈕改為下載 3MF');
  console.log('  ', await page.textContent('#engineInfo'));
  await page.click('.tpl-card[data-id="nameplate"]');
  await page.fill('#f_text', '小柯機器人');
  await page.click('#tplCreate');
  ok(await until(() => /已建立「文字名牌」/.test(document.getElementById('status').textContent)), '線上版中文名牌建立');
  const m = await until(() => { const t = document.getElementById('measure').textContent; return /90\.0 × 28\.0/.test(t) && t; });
  ok(!!m, '量測 90×28');
  await page.fill('#fileName', '線上名牌');
  for (const id of ['3mf', 'stl', 'step', 'glb', 'amf', 'solidcraft']) {
    await page.evaluate(() => (document.getElementById('status').textContent = ''));
    await page.click(`#formatList button[data-id="${id}"]`);
    const st = await until(() => { const s = document.getElementById('status').textContent; return /已匯出|已下載|匯出失敗/.test(s) && s; });
    ok(/已匯出|已下載/.test(st || ''), `匯出 ${id}：${st}`);
  }
  await page.click('#btnBambu');
  ok(await until(() => /已下載 線上名牌/.test(document.getElementById('status').textContent)), '下載 3MF 給 Bambu Studio');
  await sleep(1500);
  console.log('   下載：', saved.join('、'));
  for (const [ext, magic] of [['3mf', 'PK'], ['glb', 'glTF'], ['amf', '<?xml'], ['step', 'ISO-10303']]) {
    const f = saved.find((x) => x.endsWith(`.${ext}`));
    ok(f && f.startsWith('線上名牌') && readFileSync(join(out, f)).subarray(0, 12).toString('latin1').includes(magic), `.${ext} 中文檔名與內容正確（${f}）`);
  }
  const left = await page.evaluate(async () => { const r = await navigator.storage.getDirectory(); const n = []; for await (const k of r.keys()) n.push(k); return n.filter((x) => x.startsWith('xk-export-')); });
  ok(left.length === 0, 'OPFS 暫存檔已清除');
  await page.click('#btnAbout');
  ok(await until(() => /吳玉柱 先生與 Claude AI Opus 5\.5/.test(document.getElementById('dlgAbout').textContent) && /線上版每次開啟都是最新版本/.test(document.getElementById('updateText').textContent)), '關於：開發者與線上版說明');
  await page.screenshot({ path: 'e2e/out-web.png' });
} finally {
  console.log(logs.filter((l) => l.includes('[winerr]')).join(' | '));
  const errs = logs.filter((l) => /\[(error|pageerror)\]/.test(l) && !/powerPreference|integrity|favicon/.test(l));
  ok(errs.length === 0, `沒有錯誤${errs.length ? '：' + errs.slice(0, 4).join(' | ') : ''}`);
  console.log(`\n通過 ${pass}，失敗 ${fail}`);
  await browser.close();
  server.kill();
  process.exit(fail ? 1 : 0);
}
