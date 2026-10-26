// 讓 SolidCraft 介面完整顯示繁體中文。
// SolidCraft 的繁體中文目錄（zh-TW）只翻了約六成，簡體中文目錄（zh）則是完整的。
// 這裡在 wasm 內把 zh 目錄換成繁體：優先用 SolidCraft 官方 zh-TW 的人工翻譯，
// 缺的再由簡體以 OpenCC「簡→繁（台灣用語）」轉換。wasm 內的目錄是精簡 JSON，
// 新目錄寫回原位置，長度不超過原本（多的空間補空白，JSON 允許結尾空白）。
import * as OpenCC from 'opencc-js';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export const PATCH_VERSION = 'zh-hant-1';

// 從 start（必須是 '{'）掃到對應的 '}'，正確處理字串與跳脫字元
function objectEnd(buf, start) {
  let depth = 0, inStr = false;
  for (let i = start; i < buf.length; i++) {
    const c = buf[i];
    if (inStr) {
      if (c === 0x5c) i++;
      else if (c === 0x22) inStr = false;
    } else if (c === 0x22) inStr = true;
    else if (c === 0x7b) depth++;
    else if (c === 0x7d && --depth === 0) return i + 1;
  }
  throw new Error('找不到目錄結尾');
}

function catalogAt(buf, marker) {
  const at = buf.indexOf(Buffer.from(marker, 'utf8'));
  if (at < 0) throw new Error(`wasm 內找不到 ${marker} 目錄`);
  const start = at + Buffer.byteLength(marker, 'utf8');
  if (buf[start] !== 0x7b) throw new Error(`${marker} 後面不是 JSON`);
  const end = objectEnd(buf, start);
  return { start, end, json: JSON.parse(buf.toString('utf8', start, end)) };
}

// 簡→繁（台灣慣用詞）之後再修正幾個 CAD／列印常用詞
const FIX = [
  [/文檔/g, '文件'], [/菜單/g, '選單'], [/打印/g, '列印'], [/默認/g, '預設'], [/保存/g, '儲存'],
  [/設置/g, '設定'], [/視圖/g, '視圖'], [/鼠標/g, '滑鼠'], [/屏幕/g, '螢幕'], [/信息/g, '資訊'],
  [/項目/g, '專案'], [/創建/g, '建立'], [/添加/g, '新增'], [/刪除/g, '刪除'], [/導出/g, '匯出'], [/導入/g, '匯入'],
  [/加載/g, '載入'], [/撤銷/g, '復原'], [/重做/g, '重做'], [/快捷鍵/g, '快速鍵'], [/文件夾/g, '資料夾'],
  [/程序/g, '程式'], [/網格/g, '網格'], [/質量/g, '質量'], [/支持/g, '支援'], [/運行/g, '執行'],
];

export function buildTraditional(zh, zhTW) {
  const s2twp = OpenCC.Converter({ from: 'cn', to: 'twp' });
  const s2t = OpenCC.Converter({ from: 'cn', to: 't' });
  const out = {}, plain = {};
  for (const [k, v] of Object.entries(zh)) {
    plain[k] = s2t(v);
    if (typeof zhTW[k] === 'string' && zhTW[k].trim()) out[k] = zhTW[k];
    else {
      let t = s2twp(v);
      for (const [re, to] of FIX) t = t.replace(re, to);
      out[k] = t;
    }
  }
  return { out, plain };
}

// 依長度限制組出 JSON：太長時把差最多的條目換回逐字轉換（位元組數與簡體相同）
function fit(out, plain, limit) {
  const size = (o) => Buffer.byteLength(JSON.stringify(o), 'utf8');
  let cur = { ...out };
  let bytes = size(cur);
  if (bytes > limit) {
    const diffs = Object.keys(cur)
      .map((k) => [k, Buffer.byteLength(JSON.stringify(cur[k])) - Buffer.byteLength(JSON.stringify(plain[k]))])
      .filter(([, d]) => d > 0)
      .sort((a, b) => b[1] - a[1]);
    for (const [k, d] of diffs) {
      if (bytes <= limit) break;
      cur[k] = plain[k];
      bytes -= d;
    }
  }
  bytes = size(cur);
  if (bytes > limit) throw new Error(`繁體目錄 ${bytes} 位元組，超過可用的 ${limit}`);
  return JSON.stringify(cur);
}

export function patchWasm(file) {
  const buf = readFileSync(file);
  if (buf.includes(Buffer.from(`"xiaoke-locale":"${PATCH_VERSION}"`))) return { already: true };
  const zh = catalogAt(buf, 'zh中文');
  const tw = catalogAt(buf, 'zh-TW繁體中文');
  const { out, plain } = buildTraditional(zh.json, tw.json);
  const limit = zh.end - zh.start;
  out['xiaoke-locale'] = PATCH_VERSION;
  plain['xiaoke-locale'] = PATCH_VERSION;
  const json = fit(out, plain, limit);
  const bytes = Buffer.from(json, 'utf8');
  bytes.copy(buf, zh.start);
  buf.fill(0x20, zh.start + bytes.length, zh.end);
  writeFileSync(file, buf);
  const human = Object.keys(zh.json).filter((k) => typeof tw.json[k] === 'string').length;
  return { entries: Object.keys(zh.json).length, human, converted: Object.keys(zh.json).length - human, used: bytes.length, limit };
}

// 直接執行：node scripts/patch-locale.mjs [引擎資料夾]
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('patch-locale.mjs')) {
  const dir = process.argv[2] || join(import.meta.dirname, '..', 'engine', 'solidcraft');
  const wasm = readdirSync(dir).find((f) => f.endsWith('.wasm'));
  console.log(patchWasm(join(dir, wasm)));
}
