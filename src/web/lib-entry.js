// 線上版用的函式庫（esbuild 打包成 site/js/web-lib.js）：
// 中文字外框（fontkit + Clipper）與網格轉檔（GLB/glTF/PLY/AMF/OFF），與桌機版共用同一份程式
import { Buffer } from 'buffer';
import * as fontkit from 'fontkit';
import textcore from '../main/textcore.js';
import convert from '../main/convert.js';

globalThis.Buffer = globalThis.Buffer || Buffer;

const fonts = new Map();
export function openFont(bytes, bold) {
  const key = bold ? 'b' : 'r';
  if (!fonts.has(key)) {
    let f = fontkit.create(Buffer.from(bytes));
    if (f.fonts) f = f.fonts[0];
    if (f.variationAxes?.wght) f = f.getVariation({ wght: bold ? 700 : 400 });
    fonts.set(key, f);
  }
  return fonts.get(key);
}

export function textToSvg(fontBytes, opts) {
  return textcore.textToSvgWithFont(openFont(fontBytes, !!opts.bold), opts);
}

export function convertStl(bytes, ext, name) {
  const out = convert.convertStl(Buffer.from(bytes), ext, name);
  return new Uint8Array(out.buffer, out.byteOffset, out.byteLength);
}
