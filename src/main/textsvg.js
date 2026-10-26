// 把文字（含繁體中文）轉成 SVG 外框路徑，交給 SolidCraft 的 sketch.insert_svg 放進草圖。
// SolidCraft 網頁版無法讀取字型檔，內建字型又沒有中文字，所以由這裡用 fontkit 產生外框。
const fs = require('node:fs');
const path = require('node:path');
const fontkit = require('fontkit');
const { textToSvgWithFont } = require('./textcore');

const ROOT = path.join(__dirname, '..', '..');
const WINFONTS = path.join(process.env.SystemRoot || 'C:\\Windows', 'Fonts');

// macOS 新版把蘋方放在可下載的字型資源（AssetsV2）裡，路徑含亂數資料夾，要找一下
function findMacFont(name) {
  const direct = path.join('/System/Library/Fonts', name);
  if (fs.existsSync(direct)) return direct;
  const base = '/System/Library/AssetsV2';
  try {
    for (const a of fs.readdirSync(base).filter((d) => d.includes('Font'))) {
      for (const b of fs.readdirSync(path.join(base, a))) {
        const p = path.join(base, a, b, 'AssetData', name);
        if (fs.existsSync(p)) return p;
      }
    }
  } catch {}
  return null;
}

// 可選的字型：內建 Noto Sans TC（可調粗細），以及系統裡找得到的中文字型
function fontList() {
  const list = [{ id: 'noto', name: 'Noto Sans TC 思源黑體（內建）', file: path.join(ROOT, 'engine', 'NotoSansTC.ttf'), variable: true }];
  const sys = process.platform === 'win32'
    ? [
        { id: 'msjh', name: '微軟正黑體', file: path.join(WINFONTS, 'msjh.ttc'), bold: path.join(WINFONTS, 'msjhbd.ttc') },
        { id: 'kaiu', name: '標楷體', file: path.join(WINFONTS, 'kaiu.ttf') },
        { id: 'mingliu', name: '細明體', file: path.join(WINFONTS, 'mingliu.ttc') },
      ]
    : process.platform === 'darwin'
      ? [
          { id: 'pingfang', name: '蘋方-繁', file: findMacFont('PingFang.ttc'), postscript: 'PingFangTC-Regular', boldPostscript: 'PingFangTC-Semibold' },
          { id: 'heiti', name: '黑體-繁', file: '/System/Library/Fonts/STHeiti Medium.ttc', postscript: 'STHeitiTC-Medium' },
          { id: 'songti', name: '宋體-繁', file: '/System/Library/Fonts/Supplemental/Songti.ttc', postscript: 'STSongti-TC-Regular', boldPostscript: 'STSongti-TC-Bold' },
        ]
      : [];
  return list.concat(sys).filter((f) => f.file && fs.existsSync(f.file));
}

const cache = new Map();
function openFont(def, bold) {
  const file = bold && def.bold && fs.existsSync(def.bold) ? def.bold : def.file;
  const key = `${file}|${bold && def.variable ? 'b' : ''}|${def.postscript || ''}`;
  if (cache.has(key)) return cache.get(key);
  let font;
  try {
    font = fontkit.openSync(file, bold && def.boldPostscript ? def.boldPostscript : def.postscript);
  } catch {
    font = fontkit.openSync(file);
  }
  if (!font) font = fontkit.openSync(file);
  if (font.fonts) font = font.fonts[0]; // TTC：取第一個（繁中）字型
  if (def.variable && font.variationAxes?.wght) font = font.getVariation({ wght: bold ? 700 : 400 });
  cache.set(key, font);
  return font;
}

// height：大寫字母高度（mm），與 SolidCraft sketch.text 的 height 意義相同
function textToSvg({ text, height = 10, font = 'noto', bold = false, spacing = 0 }) {
  const def = fontList().find((f) => f.id === font) || fontList()[0];
  if (!def) throw new Error('找不到可用的字型');
  return textToSvgWithFont(openFont(def, bold), { text, height, spacing });
}

module.exports = { textToSvg, fontList: () => fontList().map(({ id, name }) => ({ id, name })) };
