// 小柯草圖精靈：常用 3D 列印零件的參數化範本。
// 每個範本把參數轉成 SolidCraft 指令（與 SolidCraft 介面、腳本、MCP 相同的指令），
// 所以建立後仍是完整的參數化時間軸，可以在 SolidCraft 裡繼續編輯草圖與尺寸。

const n = (v) => Math.round(Number(v) * 1000) / 1000;
// SolidCraft 的 XZ 平面：草圖 x = 世界 X，草圖 y = 世界 -Z，所以往上畫要用負的 y
const up = ([x, y]) => [n(x), n(-y)];

// 文字（含中文）：由主程序把文字轉成 SVG 外框（p._svg），用 sketch.insert_svg 放進草圖。
// SVG 的頂端對齊草圖 y=0、往下排；基線在頂端下方 1.2 倍字高（textsvg.js 的 viewBox）。
export function textCommand(svg, centerX, baselineY) {
  return { command: 'sketch.insert_svg', params: { text: svg.svg, at: [n(centerX - svg.width / 2), n(baselineY + svg.height * 1.2)] } };
}

export const TEMPLATES = [
  {
    id: 'box',
    name: '圓角方塊',
    icon: '🧊',
    desc: '長方體，四個直角邊可倒圓角。適合墊塊、底座。',
    params: [
      { key: 'length', label: '長', unit: 'mm', value: 40, min: 1, max: 350 },
      { key: 'width', label: '寬', unit: 'mm', value: 30, min: 1, max: 350 },
      { key: 'height', label: '高', unit: 'mm', value: 20, min: 1, max: 350 },
      { key: 'radius', label: '圓角', unit: 'mm', value: 4, min: 0, max: 50 },
    ],
    build: (p) => {
      const cmds = [
        { command: 'sketch.create', params: { plane: 'XY', name: '方塊草圖' } },
        p.radius > 0
          ? { command: 'sketch.rectangle.rounded', params: { p0: [n(-p.length / 2), n(-p.width / 2)], p1: [n(p.length / 2), n(p.width / 2)], radius: n(p.radius) } }
          : { command: 'sketch.rectangle.two_point', params: { p0: [n(-p.length / 2), n(-p.width / 2)], p1: [n(p.length / 2), n(p.width / 2)] } },
        { command: 'sketch.finish' },
        { command: 'solid.extrude', params: { distance: n(p.height), operation: 'new', body_name: '圓角方塊' } },
      ];
      return cmds;
    },
    check: (p) => (p.radius * 2 >= Math.min(p.length, p.width) ? '圓角要小於長、寬較短邊的一半' : null),
  },
  {
    id: 'tube',
    name: '圓柱／圓管',
    icon: '🥫',
    desc: '圓柱體；內徑大於 0 就成為圓管（筆筒、套管）。',
    params: [
      { key: 'diameter', label: '外徑', unit: 'mm', value: 30, min: 1, max: 350 },
      { key: 'inner', label: '內徑', unit: 'mm', value: 20, min: 0, max: 340 },
      { key: 'height', label: '高', unit: 'mm', value: 40, min: 1, max: 350 },
    ],
    build: (p) => [
      { command: 'sketch.create', params: { plane: 'XY', name: '圓管草圖' } },
      { command: 'sketch.circle.center', params: { center: [0, 0], diameter: n(p.diameter) } },
      ...(p.inner > 0 ? [{ command: 'sketch.circle.center', params: { center: [0, 0], diameter: n(p.inner) } }] : []),
      { command: 'sketch.finish' },
      { command: 'solid.extrude', params: { distance: n(p.height), operation: 'new', body_name: p.inner > 0 ? '圓管' : '圓柱' } },
    ],
    check: (p) => (p.inner >= p.diameter ? '內徑要小於外徑' : null),
  },
  {
    id: 'cup',
    name: '杯子／筆筒',
    icon: '☕',
    desc: '有底的圓筒：外徑、高度、壁厚與底厚都可調。',
    params: [
      { key: 'diameter', label: '外徑', unit: 'mm', value: 70, min: 10, max: 300 },
      { key: 'height', label: '高', unit: 'mm', value: 90, min: 10, max: 300 },
      { key: 'wall', label: '壁厚', unit: 'mm', value: 2.4, min: 0.8, max: 20, step: 0.2 },
      { key: 'bottom', label: '底厚', unit: 'mm', value: 3, min: 0.8, max: 30, step: 0.2 },
    ],
    build: (p) => [
      { command: 'sketch.create', params: { plane: 'XY', name: '杯身草圖' } },
      { command: 'sketch.circle.center', params: { center: [0, 0], diameter: n(p.diameter) } },
      { command: 'sketch.finish' },
      { command: 'solid.extrude', params: { distance: n(p.height), operation: 'new', body_name: '杯子' } },
      { command: 'solid.shell', params: { faces: [[0, 0, n(p.height)]], thickness: n(p.wall), direction: 'inside', body: '杯子' } },
    ],
    check: (p) => (p.wall * 2 >= p.diameter ? '壁厚太厚' : null),
  },
  {
    id: 'storage',
    name: '收納盒',
    icon: '📦',
    desc: '開口向上的圓角收納盒，可設定壁厚。',
    params: [
      { key: 'length', label: '長', unit: 'mm', value: 80, min: 10, max: 350 },
      { key: 'width', label: '寬', unit: 'mm', value: 60, min: 10, max: 350 },
      { key: 'height', label: '高', unit: 'mm', value: 40, min: 5, max: 350 },
      { key: 'radius', label: '圓角', unit: 'mm', value: 6, min: 0, max: 50 },
      { key: 'wall', label: '壁厚', unit: 'mm', value: 2, min: 0.8, max: 20, step: 0.2 },
    ],
    build: (p) => [
      { command: 'sketch.create', params: { plane: 'XY', name: '收納盒草圖' } },
      p.radius > 0
        ? { command: 'sketch.rectangle.rounded', params: { p0: [n(-p.length / 2), n(-p.width / 2)], p1: [n(p.length / 2), n(p.width / 2)], radius: n(p.radius) } }
        : { command: 'sketch.rectangle.two_point', params: { p0: [n(-p.length / 2), n(-p.width / 2)], p1: [n(p.length / 2), n(p.width / 2)] } },
      { command: 'sketch.finish' },
      { command: 'solid.extrude', params: { distance: n(p.height), operation: 'new', body_name: '收納盒' } },
      { command: 'solid.shell', params: { faces: [[0, 0, n(p.height)]], thickness: n(p.wall), direction: 'inside', body: '收納盒' } },
    ],
    check: (p) => (p.radius * 2 >= Math.min(p.length, p.width) ? '圓角要小於長、寬較短邊的一半' : p.wall <= 0 ? '壁厚要大於 0' : null),
  },
  {
    id: 'plate',
    name: '安裝板（四孔）',
    icon: '🔩',
    desc: '圓角平板，四角各一個螺絲孔，孔距可調（例如樹莓派 58×49）。',
    params: [
      { key: 'length', label: '長', unit: 'mm', value: 70, min: 10, max: 350 },
      { key: 'width', label: '寬', unit: 'mm', value: 60, min: 10, max: 350 },
      { key: 'thick', label: '厚', unit: 'mm', value: 4, min: 1, max: 50 },
      { key: 'radius', label: '圓角', unit: 'mm', value: 5, min: 0, max: 50 },
      { key: 'hx', label: '孔距 X', unit: 'mm', value: 58, min: 2, max: 340 },
      { key: 'hy', label: '孔距 Y', unit: 'mm', value: 49, min: 2, max: 340 },
      { key: 'hole', label: '孔徑', unit: 'mm', value: 2.7, min: 0.5, max: 30, step: 0.1 },
    ],
    build: (p) => {
      const cmds = [
        { command: 'sketch.create', params: { plane: 'XY', name: '安裝板草圖' } },
        p.radius > 0
          ? { command: 'sketch.rectangle.rounded', params: { p0: [n(-p.length / 2), n(-p.width / 2)], p1: [n(p.length / 2), n(p.width / 2)], radius: n(p.radius) } }
          : { command: 'sketch.rectangle.two_point', params: { p0: [n(-p.length / 2), n(-p.width / 2)], p1: [n(p.length / 2), n(p.width / 2)] } },
      ];
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) cmds.push({ command: 'sketch.circle.center', params: { center: [n((sx * p.hx) / 2), n((sy * p.hy) / 2)], diameter: n(p.hole) } });
      cmds.push({ command: 'sketch.finish' }, { command: 'solid.extrude', params: { distance: n(p.thick), operation: 'new', body_name: '安裝板' } });
      return cmds;
    },
    check: (p) =>
      p.hx + p.hole >= p.length || p.hy + p.hole >= p.width ? '孔距加孔徑要小於板子的長、寬' : p.radius * 2 >= Math.min(p.length, p.width) ? '圓角太大' : null,
  },
  {
    id: 'nameplate',
    name: '文字名牌',
    icon: '🏷️',
    desc: '圓角底板上浮凸文字（中英文皆可），雙色列印可在文字高度換色。',
    text: (p) => ({ text: p.text, height: p.size, font: p.font, bold: true }),
    params: [
      { key: 'text', label: '文字', type: 'text', value: '小柯機器人' },
      { key: 'font', label: '字型', type: 'font', value: 'noto' },
      { key: 'length', label: '長', unit: 'mm', value: 90, min: 10, max: 350 },
      { key: 'width', label: '寬', unit: 'mm', value: 28, min: 5, max: 350 },
      { key: 'thick', label: '底板厚', unit: 'mm', value: 3, min: 0.6, max: 30, step: 0.2 },
      { key: 'size', label: '字高', unit: 'mm', value: 12, min: 2, max: 200 },
      { key: 'emboss', label: '浮凸高', unit: 'mm', value: 1.2, min: 0.2, max: 20, step: 0.2 },
    ],
    build: (p) => [
      { command: 'sketch.create', params: { plane: 'XY', name: '底板草圖' } },
      { command: 'sketch.rectangle.rounded', params: { p0: [n(-p.length / 2), n(-p.width / 2)], p1: [n(p.length / 2), n(p.width / 2)], radius: n(Math.min(4, p.width / 2 - 0.5)) } },
      { command: 'sketch.finish' },
      { command: 'solid.extrude', params: { distance: n(p.thick), operation: 'new', body_name: '名牌' } },
      { command: 'sketch.create', params: { plane: 'XY', offset: n(p.thick), name: '文字草圖' } },
      textCommand(p._svg, 0, -p.size / 2),
      { command: 'sketch.finish' },
      { command: 'solid.extrude', params: { distance: n(p.emboss), operation: 'join', targets: ['名牌'] } },
    ],
    check: (p) => (!String(p.text || '').trim() ? '請輸入文字' : null),
  },
  {
    id: 'keytag',
    name: '鑰匙圈吊牌',
    icon: '🔑',
    desc: '一端有掛孔的吊牌，可刻上中英文字。',
    text: (p) => (String(p.text || '').trim() ? { text: p.text, height: Math.min(p.width * 0.55, 14), font: p.font, bold: true } : null),
    params: [
      { key: 'text', label: '文字', type: 'text', value: '小柯' },
      { key: 'font', label: '字型', type: 'font', value: 'noto' },
      { key: 'length', label: '長', unit: 'mm', value: 50, min: 15, max: 200 },
      { key: 'width', label: '寬', unit: 'mm', value: 20, min: 8, max: 100 },
      { key: 'thick', label: '厚', unit: 'mm', value: 3, min: 1, max: 20, step: 0.2 },
      { key: 'hole', label: '掛孔徑', unit: 'mm', value: 5, min: 2, max: 30, step: 0.5 },
    ],
    build: (p) => {
      const r = Math.min(p.width / 2 - 0.5, 6);
      const hx = -p.length / 2 + p.hole / 2 + 3;
      const cmds = [
        { command: 'sketch.create', params: { plane: 'XY', name: '吊牌草圖' } },
        { command: 'sketch.rectangle.rounded', params: { p0: [n(-p.length / 2), n(-p.width / 2)], p1: [n(p.length / 2), n(p.width / 2)], radius: n(r) } },
        { command: 'sketch.circle.center', params: { center: [n(hx), 0], diameter: n(p.hole) } },
        { command: 'sketch.finish' },
        { command: 'solid.extrude', params: { distance: n(p.thick), operation: 'new', body_name: '吊牌' } },
      ];
      if (p._svg) {
        const size = p._svg.height;
        cmds.push(
          { command: 'sketch.create', params: { plane: 'XY', offset: n(p.thick), name: '刻字草圖' } },
          textCommand(p._svg, (hx + p.hole / 2 + p.length / 2) / 2, -size / 2),
          { command: 'sketch.finish' },
          { command: 'solid.extrude', params: { distance: n(Math.min(0.8, p.thick / 2)), direction: 'negative', operation: 'cut', targets: ['吊牌'] } },
        );
      }
      return cmds;
    },
    check: (p) => (p.hole + 6 >= p.width ? '掛孔太大' : null),
  },
  {
    id: 'hexnut',
    name: '六角螺帽',
    icon: '⬡',
    desc: '六角柱加中心孔（可當六角墊片、螺帽座）。',
    params: [
      { key: 'across', label: '對邊寬', unit: 'mm', value: 13, min: 3, max: 200, step: 0.5 },
      { key: 'thick', label: '厚', unit: 'mm', value: 6.5, min: 1, max: 100, step: 0.5 },
      { key: 'hole', label: '孔徑', unit: 'mm', value: 8.4, min: 0.5, max: 190, step: 0.1 },
    ],
    build: (p) => [
      { command: 'sketch.create', params: { plane: 'XY', name: '六角草圖' } },
      { command: 'sketch.polygon.inscribed', params: { center: [0, 0], radius: n(p.across / Math.sqrt(3)), sides: 6, angle: 0 } },
      { command: 'sketch.circle.center', params: { center: [0, 0], diameter: n(p.hole) } },
      { command: 'sketch.finish' },
      { command: 'solid.extrude', params: { distance: n(p.thick), operation: 'new', body_name: '六角螺帽' } },
    ],
    check: (p) => (p.hole >= p.across ? '孔徑要小於對邊寬' : null),
  },
  {
    id: 'stand',
    name: '手機架',
    icon: '📱',
    desc: '側面輪廓擠出的斜靠式手機架。',
    params: [
      { key: 'width', label: '寬', unit: 'mm', value: 70, min: 20, max: 250 },
      { key: 'depth', label: '底深', unit: 'mm', value: 80, min: 30, max: 250 },
      { key: 'height', label: '靠背高', unit: 'mm', value: 90, min: 30, max: 250 },
      { key: 'thick', label: '板厚', unit: 'mm', value: 4, min: 2, max: 20, step: 0.5 },
      { key: 'lip', label: '前擋高', unit: 'mm', value: 12, min: 4, max: 40 },
      { key: 'gap', label: '手機厚度', unit: 'mm', value: 12, min: 6, max: 30 },
    ],
    build: (p) => {
      // 在 XZ 平面畫側面輪廓：草圖 x = 世界 X，草圖 y = 世界 Z
      const t = p.thick, D = p.depth, H = p.height, L = p.lip, g = p.gap;
      const lean = 0.35; // 靠背往後傾斜的比例（約 19°）
      const bx = t + g; // 靠背底部前緣
      const pts = [
        [0, 0], [D, 0], [D, t],
        [bx + t + H * lean, t + H], [bx + H * lean, t + H], [bx, t],
        [t, t], [t, t + L], [0, t + L],
      ].map(up);
      return [
        { command: 'sketch.create', params: { plane: 'XZ', name: '手機架輪廓' } },
        { command: 'sketch.line', params: { points: pts, closed: true } },
        { command: 'sketch.finish' },
        { command: 'solid.extrude', params: { distance: n(p.width), direction: 'symmetric', operation: 'new', body_name: '手機架' } },
      ];
    },
    check: (p) => (p.thick + p.gap + p.thick + p.height * 0.35 >= p.depth ? '底深太短，靠背會超出底座' : null),
  },
  {
    id: 'vase',
    name: '花瓶（旋轉）',
    icon: '🏺',
    desc: '畫半邊輪廓再繞中心軸旋轉成形，可抽殼成空心花瓶。',
    params: [
      { key: 'height', label: '高', unit: 'mm', value: 120, min: 20, max: 300 },
      { key: 'base', label: '底半徑', unit: 'mm', value: 30, min: 5, max: 150 },
      { key: 'belly', label: '腹半徑', unit: 'mm', value: 42, min: 5, max: 150 },
      { key: 'neck', label: '頸半徑', unit: 'mm', value: 18, min: 3, max: 150 },
      { key: 'wall', label: '壁厚', unit: 'mm', value: 2, min: 0, max: 20, step: 0.2 },
    ],
    build: (p) => {
      const H = p.height;
      const profile = [
        [0, 0], [p.base, 0], [p.belly, H * 0.38], [p.neck, H * 0.8], [p.neck * 1.25, H], [0, H],
      ].map(up);
      const cmds = [
        { command: 'sketch.create', params: { plane: 'XZ', name: '花瓶輪廓' } },
        { command: 'sketch.line', params: { points: profile, closed: true } },
        { command: 'sketch.finish' },
        { command: 'solid.revolve', params: { axis: 'Z', angle: 360, operation: 'new', body_name: '花瓶' } },
      ];
      if (p.wall > 0) cmds.push({ command: 'solid.shell', params: { faces: [[0, 0, n(H)]], thickness: n(p.wall), direction: 'inside', body: '花瓶' } });
      return cmds;
    },
    check: (p) => (p.wall * 2 >= p.neck ? '壁厚太厚' : null),
  },
  {
    id: 'spring',
    name: '彈簧',
    icon: '🌀',
    desc: '圓形斷面的螺旋彈簧。',
    params: [
      { key: 'diameter', label: '彈簧外徑', unit: 'mm', value: 20, min: 4, max: 200 },
      { key: 'height', label: '高', unit: 'mm', value: 40, min: 4, max: 300 },
      { key: 'turns', label: '圈數', unit: '圈', value: 6, min: 1, max: 50, step: 0.5 },
      { key: 'wire', label: '線徑', unit: 'mm', value: 2.5, min: 0.8, max: 20, step: 0.1 },
    ],
    build: (p) => [
      // 線的斷面以螺旋線為中心，底部要墊高半個線徑才會貼齊列印板
      { command: 'solid.coil', params: { diameter: n(p.diameter), height: n(p.height - p.wire), revolutions: n(p.turns), section_size: n(p.wire), section: 'circular', section_position: 'inside', base: [0, 0, n(p.wire / 2)], operation: 'new', body_name: '彈簧' } },
    ],
    check: (p) => ((p.height - p.wire) / p.turns <= p.wire ? '圈距要大於線徑（請減少圈數或加高）' : null),
  },
  {
    id: 'ball',
    name: '球／半球',
    icon: '⚽',
    desc: '整顆球，或平底半球（平底比較好列印）。',
    params: [
      { key: 'diameter', label: '直徑', unit: 'mm', value: 40, min: 2, max: 300 },
      { key: 'half', label: '半球（1=是，0=否）', unit: '', value: 1, min: 0, max: 1, step: 1 },
    ],
    build: (p) =>
      p.half >= 1
        ? [
            { command: 'sketch.create', params: { plane: 'XZ', name: '半球輪廓' } },
            { command: 'sketch.line', params: { points: [[0, 0], [n(p.diameter / 2), 0]] } },
            { command: 'sketch.arc.center_point', params: { center: [0, 0], start: [0, n(-p.diameter / 2)], end: [n(p.diameter / 2), 0] } },
            { command: 'sketch.line', params: { points: [[0, n(-p.diameter / 2)], [0, 0]] } },
            { command: 'sketch.finish' },
            { command: 'solid.revolve', params: { axis: 'Z', angle: 360, operation: 'new', body_name: '半球' } },
          ]
        : [{ command: 'solid.sphere', params: { diameter: n(p.diameter), center: [0, 0, n(p.diameter / 2)], body_name: '球' } }],
  },
];

export function defaults(t) {
  return Object.fromEntries(t.params.map((q) => [q.key, q.value]));
}
