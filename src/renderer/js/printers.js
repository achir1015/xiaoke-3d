// 拓竹（Bambu Lab）印表機的列印尺寸（公釐，X × Y × Z）
export const PRINTERS = [
  { id: 'a1mini', name: '拓竹 A1 mini', bed: [180, 180, 180] },
  { id: 'a1', name: '拓竹 A1', bed: [256, 256, 256] },
  { id: 'p1p', name: '拓竹 P1P', bed: [256, 256, 256] },
  { id: 'p1s', name: '拓竹 P1S', bed: [256, 256, 256] },
  { id: 'p2s', name: '拓竹 P2S', bed: [256, 256, 256] },
  { id: 'x1c', name: '拓竹 X1 Carbon', bed: [256, 256, 256] },
  { id: 'x1e', name: '拓竹 X1E', bed: [256, 256, 256] },
  { id: 'h2s', name: '拓竹 H2S', bed: [340, 320, 340] },
  { id: 'h2d', name: '拓竹 H2D（單噴嘴）', bed: [350, 320, 325] },
  { id: 'h2d2', name: '拓竹 H2D（雙噴嘴）', bed: [325, 320, 325] },
];

// 線材密度（g/cm³）
export const MATERIALS = [
  { id: 'pla', name: 'PLA', density: 1.24 },
  { id: 'petg', name: 'PETG', density: 1.27 },
  { id: 'abs', name: 'ABS', density: 1.04 },
  { id: 'asa', name: 'ASA', density: 1.07 },
  { id: 'tpu', name: 'TPU', density: 1.21 },
  { id: 'pacf', name: 'PA-CF', density: 1.2 },
];

// 模型尺寸能不能放進列印板：X、Y 可以在 Bambu Studio 裡旋轉 90°，Z 不變
export function fits(size, bed) {
  const [x, y, z] = size;
  const [bx, by, bz] = bed;
  const flat = (x <= bx && y <= by) || (x <= by && y <= bx);
  return { ok: flat && z <= bz, flat, tall: z <= bz, rotate: !(x <= bx && y <= by) && x <= by && y <= bx };
}

// 實心體積 → 重量（g）與 1.75 mm 線材長度（m）
export function estimate(volumeMm3, density) {
  const cm3 = volumeMm3 / 1000;
  const grams = cm3 * density;
  const meters = cm3 / (Math.PI * 0.0875 * 0.0875) / 100;
  return { grams, meters };
}
