// 文字 → SVG 外框的核心（桌機版主程序與線上版共用；字型由呼叫端用 fontkit 開好傳進來）
const ClipperLib = require('clipper-lib');

// 中文字型的筆畫常互相重疊（尤其可變字型與楷書），直接交給 SolidCraft 會把重疊處當成孔洞。
// 所以先把曲線攤平成折線，再用 Clipper 以 nonzero 規則聯集成乾淨的外框。
const CLIP_SCALE = 10000; // Clipper 用整數座標：0.0001 mm
const TOLERANCE = 0.02; // 曲線攤平的誤差（mm）

function flatten(commands, tx, ty, scale) {
  const polys = [];
  let cur = null, sx = 0, sy = 0, px = 0, py = 0;
  const P = (x, y) => [tx + x * scale, ty + y * scale];
  const push = (x, y) => cur.push(P(x, y));
  const segs = (len) => Math.max(2, Math.min(64, Math.ceil(Math.sqrt(len * scale / TOLERANCE) / 2)));
  for (const c of commands) {
    const a = c.args;
    if (c.command === 'moveTo') {
      if (cur && cur.length > 2) polys.push(cur);
      cur = [];
      sx = px = a[0]; sy = py = a[1];
      push(px, py);
    } else if (c.command === 'lineTo') {
      push((px = a[0]), (py = a[1]));
    } else if (c.command === 'quadraticCurveTo') {
      const k = segs(Math.hypot(a[0] - px, a[1] - py) + Math.hypot(a[2] - a[0], a[3] - a[1]));
      for (let i = 1; i <= k; i++) {
        const t = i / k, u = 1 - t;
        push(u * u * px + 2 * u * t * a[0] + t * t * a[2], u * u * py + 2 * u * t * a[1] + t * t * a[3]);
      }
      px = a[2]; py = a[3];
    } else if (c.command === 'bezierCurveTo') {
      const k = segs(Math.hypot(a[0] - px, a[1] - py) + Math.hypot(a[2] - a[0], a[3] - a[1]) + Math.hypot(a[4] - a[2], a[5] - a[3]));
      for (let i = 1; i <= k; i++) {
        const t = i / k, u = 1 - t;
        push(u * u * u * px + 3 * u * u * t * a[0] + 3 * u * t * t * a[2] + t * t * t * a[4], u * u * u * py + 3 * u * u * t * a[1] + 3 * u * t * t * a[3] + t * t * t * a[5]);
      }
      px = a[4]; py = a[5];
    } else if (c.command === 'closePath') {
      if (cur && cur.length > 2) polys.push(cur);
      cur = null;
      px = sx; py = sy;
    }
  }
  if (cur && cur.length > 2) polys.push(cur);
  return polys;
}

function unionNonZero(polys) {
  const paths = polys.map((poly) => poly.map(([x, y]) => ({ X: Math.round(x * CLIP_SCALE), Y: Math.round(y * CLIP_SCALE) })));
  const c = new ClipperLib.Clipper();
  c.AddPaths(paths, ClipperLib.PolyType.ptSubject, true);
  const out = new ClipperLib.Paths();
  c.Execute(ClipperLib.ClipType.ctUnion, out, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
  // 去掉幾乎共線的點與過小的碎片（< 0.01 mm²）
  return ClipperLib.Clipper.CleanPolygons(out, 0.004 * CLIP_SCALE)
    .filter((p) => p.length > 2 && Math.abs(ClipperLib.Clipper.Area(p)) > 0.01 * CLIP_SCALE * CLIP_SCALE)
    .map((p) => p.map((q) => [q.X / CLIP_SCALE, q.Y / CLIP_SCALE]));
}

// height：大寫字母高度（mm），與 SolidCraft sketch.text 的 height 意義相同
// 回傳 { svg, width, height }，SVG 以 mm 為單位、基線在 y=0，左下角從 x=0 起
function textToSvgWithFont(f, { text, height = 10, spacing = 0 }) {
  const capRef = f.capHeight || f.unitsPerEm * 0.7;
  // 中文字沒有「大寫」，以字身框（em）的 0.88 當作字高，讓中英文看起來一樣大
  const hasCjk = /[\u3000-\u9fff\uf900-\ufaff]/.test(text);
  const scale = height / (hasCjk ? f.unitsPerEm * 0.88 : capRef);
  const lines = String(text).split(/\r?\n/);
  const lineGap = (f.ascent - f.descent + (f.lineGap || 0)) * scale * 1.05;
  const glyphPolys = [];
  let maxW = 0;
  lines.forEach((line, li) => {
    const run = f.layout(line);
    let x = 0;
    const y0 = -li * lineGap;
    run.glyphs.forEach((g, i) => {
      const p = g.path;
      // fontkit 的座標 y 向上；SVG y 向下 → y 取負
      if (p.commands.length) glyphPolys.push(...flatten(p.commands, x, y0, scale));
      x += run.positions[i].xAdvance * scale + spacing;
    });
    maxW = Math.max(maxW, x - spacing);
  });
  const outline = unionNonZero(glyphPolys);
  const fmt = (v) => +v.toFixed(4);
  const paths = outline.map((poly) => 'M' + poly.map(([px, py]) => `${fmt(px)} ${fmt(-py)}`).join('L') + 'Z');
  const total = lines.length * lineGap;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${maxW.toFixed(3)}mm" height="${total.toFixed(3)}mm" viewBox="0 ${(-height * 1.2).toFixed(3)} ${maxW.toFixed(3)} ${total.toFixed(3)}"><path d="${paths.join('')}" fill="black"/></svg>`;
  return { svg, width: maxW, height, lines: lines.length, lineGap, loops: outline.length, points: outline.reduce((a, p) => a + p.length, 0) };
}

module.exports = { textToSvgWithFont };
