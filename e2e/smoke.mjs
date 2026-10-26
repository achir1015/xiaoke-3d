// 冒煙測試：啟動 App → 草圖精靈建立模型 → 列印助手量測 → 匯出全部格式 → 檢查檔案
import { launch, close, sleep } from './lib.mjs';
import { mkdirSync, rmSync, writeFileSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir, homedir } from 'node:os';

const PROFILE = 'e2e';
const out = join(tmpdir(), 'xiaoke-3d-e2e-out');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const ud = join(process.env.APPDATA || join(homedir(), 'AppData/Roaming'), `xiaoke-3d-${PROFILE}`);
mkdirSync(ud, { recursive: true });
writeFileSync(join(ud, 'settings.json'), JSON.stringify({ exportDir: out }));

let pass = 0, fail = 0;
const ok = (c, msg) => { c ? pass++ : fail++; console.log(`${c ? '✓' : '✗'} ${msg}`); };
const { app, win, logs } = await launch(PROFILE);
const until = async (fn, ms = 90000, step = 300) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await win.evaluate(fn).catch(() => null); if (v) return v; await sleep(step); } return null; };

ok(await until(() => document.getElementById('loading').classList.contains('hidden')), '引擎載入完成');
ok((await win.title()).includes('小柯機器人3D繪圖與列印工具'), '視窗標題');
const lang = await win.evaluate(async () => (await document.getElementById('engine').contentWindow.solidcraft.request('ui.prefs', {})).language);
ok(lang === 'zh', `SolidCraft 介面語言 = ${lang}`);
const tw = await win.evaluate(() => fetch('engine/index.html').then((r) => r.text()));
ok(tw.includes('false /* 小柯：不註冊 Service Worker */'), '引擎首頁已停用 Service Worker');

// 草圖精靈：收納盒
await win.click('.tpl-card[data-id="storage"]');
await win.fill('#f_length', '100');
await win.click('#tplCreate');
const m = await until(() => { const t = document.getElementById('measure').textContent; return /100\.0 × 60\.0 × 40\.0/.test(t) && t; }, 60000);
ok(!!m, `量測顯示 100×60×40：${(m || '').replace(/\s+/g, ' ').slice(0, 90)}`);
ok(/放得進/.test(m || ''), '放得進拓竹 P1S');

// 印表機換成 A1 mini、模型改大 → 超出
await win.selectOption('#printer', 'a1mini');
await win.click('#tplBack');
await win.click('.tpl-card[data-id="box"]');
await win.fill('#f_length', '200');
await win.click('#tplCreate');
const big = await until(() => { const t = document.getElementById('measure').textContent; return /200\.0 ×/.test(t) && t; }, 60000);
ok(/超出/.test(big || ''), 'A1 mini 放不下 200 mm 方塊時顯示超出');
await win.selectOption('#printer', 'p1s');

// 範本參數檢查
await win.fill('#f_radius', '40');
await win.click('#tplCreate');
ok(await until(() => !document.getElementById('tplError').classList.contains('hidden') && document.getElementById('tplError').textContent), '圓角過大時顯示錯誤');
await win.fill('#f_radius', '4');

// 文字工具：立體中文字
await win.click('#tplBack');
await win.fill('#txtValue', '小柯3D');
await win.click('#txtInsert');
ok(await until(() => /立體字/.test(document.getElementById('status').textContent)), '中文立體字建立');

// 名牌（中文字）作為匯出用模型
await win.click('.tpl-card[data-id="nameplate"]');
await win.fill('#f_text', '吳玉柱');
await win.click('#tplCreate');
ok(await until(() => /已建立「文字名牌」/.test(document.getElementById('status').textContent), 60000), '中文名牌建立');
await win.fill('#fileName', '測試名牌');

// 匯出全部格式
const formats = await win.evaluate(() => [...document.querySelectorAll('#formatList button')].map((b) => b.dataset.id));
for (const id of formats) {
  await win.click(`#formatList button[data-id="${id}"]`);
  const st = await until(() => { const s = document.getElementById('status').textContent; return /已匯出|匯出失敗/.test(s) && s; }, 90000, 250);
  ok(/已匯出/.test(st || ''), `匯出 ${id}：${st}`);
  await win.evaluate(() => (document.getElementById('status').textContent = ''));
}
const files = readdirSync(out, { recursive: true }).map(String);
console.log('  檔案：', files.join('、'));
const need = { '3mf': 'PK', glb: 'glTF', ply: 'ply', amf: '<?xml', off: 'OFF', step: 'ISO-10303', igs: '', obj: '', gltf: '{', solidcraft: '' };
for (const [ext, magic] of Object.entries(need)) {
  const f = files.find((x) => x.endsWith(`.${ext}`));
  const head = f ? readFileSync(join(out, f)).subarray(0, 16).toString('latin1') : '';
  ok(f && statSync(join(out, f)).size > 100 && head.includes(magic), `.${ext} 檔案內容正確（${f || '無'}）`);
}
ok(files.some((x) => x.endsWith('.urdf')), 'URDF 與零件 STL');

// Bambu Studio 未安裝 → 顯示安裝對話框
const installed = await win.evaluate(() => window.xk.bambuStatus().then((s) => s.installed));
if (!installed) {
  await win.click('#btnBambu');
  ok(await until(() => document.getElementById('dlgBambu').open), '未安裝 Bambu Studio 時顯示安裝說明');
  await win.click('#dlgBambu button[value="close"]');
}
// 關於
await win.click('#btnAbout');
ok(await until(() => document.getElementById('dlgAbout').open && /吳玉柱 先生與 Claude AI Opus 5\.5/.test(document.getElementById('dlgAbout').textContent)), '關於視窗顯示開發者');
await win.screenshot({ path: 'e2e/out-about.png' });
await win.click('#dlgAbout button[value="close"]');
await win.screenshot({ path: 'e2e/out-main.png' });

const errs = logs.filter((l) => l.startsWith('[error]') && !/powerPreference|integrity/.test(l));
ok(errs.length === 0, `主控台沒有錯誤${errs.length ? '：' + errs.slice(0, 3).join(' | ') : ''}`);
console.log(`\n通過 ${pass}，失敗 ${fail}`);
await close(app);
process.exit(fail ? 1 : 0);
