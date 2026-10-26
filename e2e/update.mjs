// 版本更新：用舊版（XK_EXE）啟動，應該查到 GitHub 上的新版
import { launch, close, sleep } from './lib.mjs';
const { app, win } = await launch('e2e-update');
await sleep(3000);
const u = await win.evaluate(() => window.xk.updateCheck());
console.log(JSON.stringify({ current: u.current, latest: u.latest, newer: u.newer, asset: u.asset?.name, flavor: u.flavor, canInstall: u.canInstall }));
await close(app);
process.exit(u.newer ? 0 : 1);
