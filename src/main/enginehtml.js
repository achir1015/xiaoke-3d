// SolidCraft 引擎首頁的調整（桌機版主程序與線上版建置共用）
// - 拿掉 Service Worker（避免舊版快取蓋過新版）
// - 拿掉 integrity：wasm 已換成繁體中文目錄，原本的雜湊不再適用
// - 標題、語系、隱藏捲軸
function transformEngineHtml(html) {
  return html
    .replace('"serviceWorker" in navigator', 'false /* 小柯：不註冊 Service Worker */')
    .replace(/\s+integrity="[^"]*"/g, '')
    .replace('<html lang="en">', '<html lang="zh-Hant">')
    .replace('<title>SolidCraft</title>', '<title>SolidCraft（小柯機器人3D繪圖與列印工具）</title><style>html,body{overflow:hidden}</style>');
}
module.exports = { transformEngineHtml };
