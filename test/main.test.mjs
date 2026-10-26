import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { parseStl, convertStl } = require('../src/main/convert.js');
const { parseUninstall, sameVersion } = require('../src/main/bambu.js');
const { textToSvg } = require('../src/main/textsvg.js');
import { fits, estimate } from '../src/renderer/js/printers.js';
import { TEMPLATES, defaults } from '../src/renderer/js/templates.js';

// 一個四面體的二進位 STL
function tetraStl() {
  const tris = [[[0, 0, 0], [10, 0, 0], [0, 10, 0]], [[0, 0, 0], [0, 10, 0], [0, 0, 10]], [[0, 0, 0], [0, 0, 10], [10, 0, 0]], [[10, 0, 0], [0, 0, 10], [0, 10, 0]]];
  const b = Buffer.alloc(84 + tris.length * 50);
  b.writeUInt32LE(tris.length, 80);
  tris.forEach((t, i) => t.flat().forEach((v, k) => b.writeFloatLE(v, 84 + i * 50 + 12 + k * 4)));
  return b;
}

test('STL 讀取會合併相同頂點', () => {
  const m = parseStl(tetraStl());
  assert.equal(m.positions.length / 3, 4);
  assert.equal(m.indices.length, 12);
});

test('轉出 GLB／glTF／PLY／AMF／OFF', () => {
  const glb = convertStl(tetraStl(), 'glb', '測試');
  assert.equal(glb.toString('latin1', 0, 4), 'glTF');
  assert.equal(glb.readUInt32LE(8), glb.length);
  const json = JSON.parse(glb.toString('utf8', 20, 20 + glb.readUInt32LE(12)));
  assert.equal(json.accessors[0].count, 4);
  assert.ok(Math.abs(json.accessors[0].max[1] - 0.01) < 1e-6); // Z 朝上 10 mm → glTF Y 0.01 m
  const gltf = JSON.parse(convertStl(tetraStl(), 'gltf', 'x').toString());
  assert.match(gltf.buffers[0].uri, /^data:application\/octet-stream;base64,/);
  assert.match(convertStl(tetraStl(), 'ply', 'x').toString('latin1', 0, 60), /^ply\nformat binary_little_endian/);
  assert.match(convertStl(tetraStl(), 'amf', 'x').toString(), /<amf unit="millimeter"[\s\S]*<triangle>/);
  assert.match(convertStl(tetraStl(), 'off', 'x').toString(), /^OFF\n4 4 0\n/);
  assert.throws(() => convertStl(tetraStl(), 'xyz', 'x'));
});

test('解析登錄檔的 Bambu Studio 安裝資訊', () => {
  const out = 'HKEY_LOCAL_MACHINE\SOFTWARE\X\Bambu Studio\r\n    DisplayName    REG_SZ    Bambu Studio\r\n    DisplayVersion    REG_SZ    02.08.02.61\r\n    InstallLocation    REG_SZ    C:\Program Files\Bambu Studio\r\n\r\nHKEY_LOCAL_MACHINE\SOFTWARE\X\Other\r\n    DisplayName    REG_SZ    Other\r\n';
  const r = parseUninstall(out);
  assert.equal(r.length, 1);
  assert.equal(r[0].version, '02.08.02.61');
  assert.equal(r[0].location, 'C:\Program Files\Bambu Studio');
  assert.ok(sameVersion('2.8.2.61', '02.08.02.61'));
  assert.ok(!sameVersion('02.08.04.57', '02.08.02.61'));
});

test('列印範圍與重量估算', () => {
  assert.ok(fits([100, 60, 40], [256, 256, 256]).ok);
  assert.ok(!fits([200, 20, 20], [180, 180, 180]).ok);
  const r = fits([300, 100, 50], [340, 320, 340]);
  assert.ok(r.ok && !r.rotate);
  assert.ok(fits([330, 340, 10], [340, 330, 340]).rotate);
  const e = estimate(1000, 1.24);
  assert.ok(Math.abs(e.grams - 1.24) < 1e-9);
});

test('中文字轉外框：重疊筆畫聯集成封閉外框', () => {
  const t = textToSvg({ text: '小柯機器人', height: 10, font: 'noto', bold: true });
  assert.match(t.svg, /^<svg[\s\S]*<path d="M/);
  assert.ok(t.loops >= 5 && t.width > 40);
  assert.ok(!/NaN/.test(t.svg));
});

test('每個範本的預設值都通過檢查並產生指令', () => {
  for (const t of TEMPLATES) {
    const p = defaults(t);
    if (t.text?.(p)) p._svg = textToSvg(t.text(p));
    assert.equal(t.check?.(p) ?? null, null, t.id);
    const cmds = t.build(p);
    assert.ok(cmds.length > 0 && cmds.every((c) => typeof c.command === 'string'), t.id);
  }
});
