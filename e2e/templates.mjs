// 逐一執行小柯草圖精靈範本，量測實體是否封閉、體積大於 0
import { launch, engineFrame, close } from './lib.mjs';
import { TEMPLATES, defaults } from '../src/renderer/js/templates.js';
import { createRequire } from 'node:module';
const { textToSvg } = createRequire(import.meta.url)('../src/main/textsvg.js');
const only = process.argv[2];
const { app, win } = await launch('tpl');
const f = await engineFrame(win);
let fail = 0;
for (const t of TEMPLATES) {
  if (only && t.id !== only) continue;
  const p = defaults(t);
  const tx = t.text?.(p);
  if (tx) p._svg = textToSvg(tx);
  const cmds = [{ command: 'file.new', params: { name: t.name } }, ...t.build(p)];
  const r = await f.evaluate(async (cmds) => {
    try {
      const out = [];
      for (const c of cmds) out.push(await solidcraft.execute(c.command, c.params || {}));
      const m = await solidcraft.execute('inspect.measure', {});
      return { ok: true, m };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  }, cmds);
  if (!r.ok) { fail++; console.log(`✗ ${t.id}: ${r.error.slice(0, 600)}`); continue; }
  const bb = r.m.bodies.reduce((a, b) => [a[0].map((v, k) => Math.min(v, b.bbox.min[k])), a[1].map((v, k) => Math.max(v, b.bbox.max[k]))], [[1e9, 1e9, 1e9], [-1e9, -1e9, -1e9]]).map((v) => v.map((x) => +x.toFixed(1)));
  const closed = r.m.bodies.every((b) => b.closed);
  if (!closed || bb[0][2] < -0.01 || !(r.m.total.volume_mm3 > 0)) fail++;
  console.log(`${closed && bb[0][2] >= -0.01 ? '✓' : '✗'} ${t.id}: 實體 ${r.m.body_count}，體積 ${r.m.total.volume_mm3.toFixed(0)} mm³，外框 ${JSON.stringify(bb)}`);
  if (only) console.log(JSON.stringify(r.m, null, 1).slice(0, 2500));
}
await close(app);
process.exit(fail ? 1 : 0);
