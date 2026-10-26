// 由 src/renderer/img/logo.svg 產生 build/icon.png（1024）與 build/icon.ico（多尺寸）
// 執行：npx electron scripts/make-icon.cjs
const { app, BrowserWindow, nativeImage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');

function ico(pngs) {
  // ICO 檔頭 + 每個尺寸一筆目錄 + PNG 資料
  const head = Buffer.alloc(6 + pngs.length * 16);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(pngs.length, 4);
  let offset = head.length;
  pngs.forEach(({ size, data }, i) => {
    const o = 6 + i * 16;
    head.writeUInt8(size >= 256 ? 0 : size, o);
    head.writeUInt8(size >= 256 ? 0 : size, o + 1);
    head.writeUInt16LE(1, o + 4);
    head.writeUInt16LE(32, o + 6);
    head.writeUInt32LE(data.length, o + 8);
    head.writeUInt32LE(offset, o + 12);
    offset += data.length;
  });
  return Buffer.concat([head, ...pngs.map((p) => p.data)]);
}

app.whenReady().then(async () => {
  const svg = fs.readFileSync(path.join(ROOT, 'src/renderer/img/logo.svg'), 'utf8');
  // 用 canvas 繪製，與螢幕縮放比例無關
  const win = new BrowserWindow({ show: false });
  await win.loadURL('data:text/html,<html><body></body></html>');
  const dataUrl = await win.webContents.executeJavaScript(`new Promise((ok) => {
    const img = new Image();
    img.onload = () => { const c = document.createElement('canvas'); c.width = c.height = 1024; c.getContext('2d').drawImage(img, 0, 0, 1024, 1024); ok(c.toDataURL('image/png')); };
    img.src = 'data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}';
  })`);
  const big = nativeImage.createFromDataURL(dataUrl);
  fs.writeFileSync(path.join(ROOT, 'build/icon.png'), big.toPNG());
  const sizes = [256, 128, 64, 48, 32, 16].map((s) => ({ size: s, data: big.resize({ width: s, height: s, quality: 'best' }).toPNG() }));
  fs.writeFileSync(path.join(ROOT, 'build/icon.ico'), ico(sizes));
  console.log('icon ok');
  app.quit();
});
