// e2e 共用：啟動 Electron、等引擎就緒
import { _electron as electron } from 'playwright-core';
import electronPath from 'electron';
export async function launch(profile, extra = []) {
  // XK_EXE=打包後的 exe：測試安裝版
  const exe = process.env.XK_EXE;
  const app = await electron.launch({ args: [...(exe ? [] : ['.']), `--profile=${profile}`, '--force-close', ...extra], executablePath: exe || electronPath });
  const win = await app.firstWindow();
  const logs = [];
  win.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  return { app, win, logs };
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function engineFrame(win, timeout = 90000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const f = win.frames().find((x) => x.url().includes('/engine/'));
    if (f && (await f.evaluate(() => !!window.solidcraft).catch(() => false))) return f;
    await sleep(400);
  }
  throw new Error('引擎沒有就緒');
}
export async function close(app) {
  const pid = app.process().pid;
  await Promise.race([app.close().catch(() => {}), sleep(8000)]);
  // 保險：只結束自己啟動的那個程序樹
  if (process.platform === 'win32') {
    try { (await import('node:child_process')).execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' }); } catch {}
  }
}
