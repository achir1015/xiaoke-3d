// 小柯機器人3D繪圖與列印工具：Electron 主程序
// - 本機 http://127.0.0.1:<固定埠> 載入介面與 SolidCraft 網頁版引擎（同源，介面可直接呼叫 window.solidcraft）。
//   不用自訂協定，是因為 SolidCraft 存設計檔用的瀏覽器檔案空間（OPFS）只在 https／localhost 可用；
//   埠號固定，設計檔與自動備份才會跨次保留。只綁 127.0.0.1，其他電腦連不到。
// - 攔截引擎的「下載」把匯出的 3MF/STL/STEP… 存到匯出資料夾，需要時轉檔，再交給 Bambu Studio
const { app, BrowserWindow, ipcMain, shell, dialog, net, session, Menu } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const bambu = require('./bambu');
const { convertStl } = require('./convert');
const { Updater } = require('./updater');
const textsvg = require('./textsvg');
const { transformEngineHtml } = require('./enginehtml');
const updater = new Updater();

const ROOT = path.join(__dirname, '..', '..');
const RENDERER = path.join(ROOT, 'src', 'renderer');
const ENGINE = path.join(ROOT, 'engine', 'solidcraft');
const CJK_FONT = path.join(ROOT, 'engine', 'NotoSansTC.ttf');

// e2e 測試用獨立的設定資料夾
const profile = process.argv.find((a) => a.startsWith('--profile='))?.slice(10);
if (profile) app.setPath('userData', path.join(app.getPath('appData'), `xiaoke-3d-${profile}`));

const PORTS = [47831, 47832, 47833, 47834, 47835];
// 確認連上的是自己的伺服器（Windows 上別的程式可能同時綁住同一個埠）
const SERVER_TOKEN = require('node:crypto').randomBytes(16).toString('hex');
let origin = null;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8',
};

function inside(base, p) {
  const rel = path.relative(base, p);
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

// 引擎首頁：拿掉 Service Worker（桌機版不需要離線快取，也避免舊版快取蓋過新版）
let engineIndex = null;
function engineIndexHtml() {
  if (!engineIndex) {
    engineIndex = transformEngineHtml(fs.readFileSync(path.join(ENGINE, 'index.html'), 'utf8'));
  }
  return engineIndex;
}

// 回傳 [狀態碼, Content-Type, 內容]
function route(pathname) {
  let rel = decodeURIComponent(pathname).replace(/^\/+/, '');
  if (!rel) rel = 'index.html';
  if (rel.startsWith('engine/')) {
    rel = rel.slice(7) || 'index.html';
    if (rel === 'index.html') return [200, MIME['.html'], engineIndexHtml()];
    if (rel === 'sw.js') return [404, 'text/plain', ''];
    // SolidCraft 中日韓介面會下載這個日文字型；換成涵蓋繁體中文的 Noto Sans TC
    if (rel === 'fonts/BIZUDPGothic-Regular.ttf' && fs.existsSync(CJK_FONT)) return readFile(CJK_FONT, true);
    return readFile(path.join(ENGINE, rel), inside(ENGINE, path.join(ENGINE, rel)));
  }
  return readFile(path.join(RENDERER, rel), inside(RENDERER, path.join(RENDERER, rel)));
}

function readFile(file, allowed) {
  if (!allowed) return [403, 'text/plain', 'Forbidden'];
  try {
    return [200, MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', fs.readFileSync(file)];
  } catch {
    return [404, 'text/plain', 'Not found'];
  }
}

async function startServer() {
  const server = http.createServer((req, res) => {
    // 只接受本機位址的請求（擋 DNS rebinding）
    if (!/^(localhost|127\.0\.0\.1):\d+$/.test(req.headers.host || '') || (req.method !== 'GET' && req.method !== 'HEAD')) {
      res.writeHead(403).end();
      return;
    }
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/__xiaoke_token') {
      res.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' }).end(SERVER_TOKEN);
      return;
    }
    const [status, type, body] = route(pathname);
    res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : body);
  });
  const listen = (port) =>
    new Promise((resolve) => {
      server.once('error', () => resolve(false));
      server.listen(port, '127.0.0.1', () => {
        server.removeAllListeners('error');
        resolve(true);
      });
    });
  const mine = async (port) => {
    try {
      const r = await net.fetch(`http://127.0.0.1:${port}/__xiaoke_token`, { cache: 'no-store' });
      return (await r.text()) === SERVER_TOKEN;
    } catch {
      return false;
    }
  };
  for (const port of PORTS) {
    if (!(await listen(port))) continue;
    // 用 127.0.0.1 而不是 localhost：localhost 可能先解析成 IPv6 的 ::1，連到別的程式
    if (await mine(port)) return `http://127.0.0.1:${port}`;
    await new Promise((r) => server.close(r));
  }
  throw new Error('本機連接埠都被占用');
}

// ---------- 設定 ----------
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
function loadSettings() {
  try {
    return JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));
  } catch {
    return {};
  }
}
function saveSettings(patch) {
  const s = { ...loadSettings(), ...patch };
  fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
  fs.writeFileSync(settingsFile(), JSON.stringify(s, null, 2));
  return s;
}
function exportDir() {
  const dir = loadSettings().exportDir || path.join(app.getPath('documents'), '小柯3D列印');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// 不覆蓋舊檔（Bambu Studio 可能正開著它）：同名就加 (2)、(3)…
function uniquePath(dir, name) {
  const ext = path.extname(name), stem = name.slice(0, name.length - ext.length);
  let p = path.join(dir, name);
  for (let i = 2; fs.existsSync(p); i++) p = path.join(dir, `${stem} (${i})${ext}`);
  return p;
}

// ---------- 匯出工作 ----------
// 介面先呼叫 export:expect 登記，再叫引擎把檔案寫到 /downloads/<檔名>；引擎觸發的下載在這裡接手。
const pending = [];
let win = null;
let forceClose = process.argv.includes('--force-close'); // e2e 測試：直接關閉不詢問

function handleDownload(item) {
  const name = item.getFilename();
  const job = pending.find((j) => j.engineFile === name || (j.multi && name.startsWith(j.stem)));
  if (!job) {
    // 使用者從 SolidCraft 自己的選單匯出：照樣存到匯出資料夾
    const target = uniquePath(exportDir(), name);
    item.setSavePath(target);
    item.once('done', (_e, state) => {
      if (state === 'completed') win?.webContents.send('export:saved', { file: target, name: path.basename(target) });
    });
    return;
  }
  const target = job.convertTo || job.multi ? path.join(job.workDir, name) : uniquePath(job.dir, job.finalName);
  if (job.multi || job.convertTo) fs.mkdirSync(job.workDir, { recursive: true });
  item.setSavePath(target);
  item.once('done', async (_e, state) => {
    if (state !== 'completed') return finish(job, { ok: false, error: `下載中斷（${state}）` });
    if (job.multi) {
      if (name.toLowerCase().endsWith(`.${job.ext}`)) finish(job, { ok: true, file: target, folder: job.workDir });
      return;
    }
    try {
      let file = target;
      if (job.convertTo) {
        file = uniquePath(job.dir, job.finalName);
        fs.writeFileSync(file, convertStl(fs.readFileSync(target), job.convertTo, job.title));
        fs.rmSync(job.workDir, { recursive: true, force: true });
      }
      const result = { ok: true, file, size: fs.statSync(file).size };
      if (job.action === 'bambu') {
        try {
          await bambu.open(file);
          result.bambu = true;
        } catch (e) {
          result.bambuError = e.message;
        }
      }
      finish(job, result);
    } catch (e) {
      finish(job, { ok: false, error: e.message });
    }
  });
}

function finish(job, result) {
  const i = pending.indexOf(job);
  if (i < 0) return;
  pending.splice(i, 1);
  clearTimeout(job.timer);
  job.resolve(result);
}

ipcMain.handle('export:expect', (_e, opts) => {
  const dir = exportDir();
  const safe = (s) => String(s || '小柯模型').replace(/[\\/:*?"<>|]+/g, '_').trim().slice(0, 80) || '小柯模型';
  const title = safe(opts.title);
  const ext = String(opts.ext || '3mf').toLowerCase();
  const convertTo = opts.convertTo || null;
  const engineExt = convertTo ? 'stl' : ext;
  const tag = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  // URDF 由 SolidCraft 一次寫出多個檔案，零件 STL 檔名會把中文換成底線，所以改用英數主檔名
  const asciiStem = title.replace(/[^\w.-]+/g, '').replace(/^[._-]+/, '') || 'xiaoke_robot';
  const job = {
    title, ext, convertTo, dir,
    action: opts.action || 'save',
    multi: !!opts.multi,
    stem: asciiStem,
    engineFile: convertTo ? `xk-${tag}.stl` : opts.multi ? `${asciiStem}.${ext}` : `${title}.${engineExt}`,
    finalName: `${title}.${ext}`,
    workDir: opts.multi ? uniquePath(dir, title) : path.join(app.getPath('temp'), `xiaoke-3d-${tag}`),
  };
  job.id = tag;
  job.promise = new Promise((resolve) => {
    job.resolve = resolve;
  });
  job.timer = setTimeout(() => finish(job, { ok: false, error: '引擎沒有產生檔案（逾時）' }), opts.timeoutMs || 180000);
  pending.push(job);
  return { id: job.id, engineFile: job.engineFile, enginePath: `/downloads/${job.engineFile}` };
});

ipcMain.handle('export:wait', (_e, id) => {
  const job = pending.find((j) => j.id === id);
  return job ? job.promise : { ok: false, error: '找不到匯出工作' };
});

ipcMain.handle('export:cancel', (_e, id) => {
  const job = pending.find((j) => j.id === id);
  if (job) finish(job, { ok: false, error: '已取消' });
});

ipcMain.handle('settings:get', () => ({ ...loadSettings(), exportDir: exportDir() }));
ipcMain.handle('settings:set', (_e, patch) => saveSettings(patch));
ipcMain.handle('dir:choose', async () => {
  const r = await dialog.showOpenDialog(win, { title: '選擇匯出資料夾', defaultPath: exportDir(), properties: ['openDirectory', 'createDirectory'] });
  if (r.canceled || !r.filePaths[0]) return null;
  saveSettings({ exportDir: r.filePaths[0] });
  return r.filePaths[0];
});
ipcMain.handle('shell:show', (_e, file) => {
  if (file && fs.existsSync(file)) shell.showItemInFolder(file);
  else shell.openPath(exportDir());
});
ipcMain.handle('shell:external', (_e, url) => {
  if (/^https:\/\/(github\.com|bambulab\.com|wiki\.bambulab\.com|solidcraft\.io|docs\.solidcraft\.io)\//.test(url)) shell.openExternal(url);
});
ipcMain.handle('exports:list', () => {
  const dir = exportDir();
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isFile())
      .map((d) => {
        const st = fs.statSync(path.join(dir, d.name));
        return { name: d.name, file: path.join(dir, d.name), size: st.size, mtime: st.mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, 30);
  } catch {
    return [];
  }
});

// 開啟電腦裡的 3D 檔：讀成位元組交給介面，再放進引擎（SolidCraft 的上傳路徑）
ipcMain.handle('file:open', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: '開啟 3D 檔案',
    properties: ['openFile'],
    filters: [
      { name: '3D 檔案', extensions: ['solidcraft', '3mf', 'stl', 'step', 'stp', 'iges', 'igs', 'obj', 'gltf', 'glb'] },
      { name: '所有檔案', extensions: ['*'] },
    ],
  });
  if (r.canceled || !r.filePaths[0]) return null;
  const file = r.filePaths[0];
  const st = fs.statSync(file);
  if (st.size > 512 * 1024 * 1024) throw new Error('檔案超過 512 MB');
  return { name: path.basename(file), bytes: fs.readFileSync(file) };
});

// ---------- 文字外框（中文字） ----------
ipcMain.handle('text:fonts', () => textsvg.fontList());
ipcMain.handle('text:svg', (_e, opts) => textsvg.textToSvg(opts));

// ---------- Bambu Studio ----------
ipcMain.handle('bambu:status', () => bambu.status());
ipcMain.handle('bambu:open', (_e, file) => bambu.open(file));
let installerDownload = null;
ipcMain.handle('bambu:download', async () => {
  if (installerDownload) return installerDownload;
  const url = process.platform === 'darwin' ? bambu.RECOMMENDED.mac : bambu.RECOMMENDED.win;
  const target = path.join(app.getPath('downloads'), decodeURIComponent(url.split('/').pop()));
  installerDownload = (async () => {
    if (!fs.existsSync(target)) {
      const res = await net.fetch(url);
      if (!res.ok) throw new Error(`下載失敗 HTTP ${res.status}`);
      const total = Number(res.headers.get('content-length')) || 0;
      const tmp = `${target}.part`;
      const out = fs.createWriteStream(tmp);
      let got = 0, last = 0;
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        got += value.length;
        if (!out.write(value)) await new Promise((r) => out.once('drain', r));
        if (Date.now() - last > 250) {
          last = Date.now();
          win?.webContents.send('bambu:progress', { got, total });
        }
      }
      await new Promise((r, j) => out.end((e) => (e ? j(e) : r())));
      fs.renameSync(tmp, target);
    }
    win?.webContents.send('bambu:progress', { got: 1, total: 1, done: true });
    const err = await shell.openPath(target);
    if (err) throw new Error(err);
    return { installer: target };
  })().finally(() => {
    installerDownload = null;
  });
  return installerDownload;
});

// ---------- 版本更新 ----------
ipcMain.handle('update:check', () => updater.check());
ipcMain.handle('update:install', async () => {
  const file = await updater.download((got, total) => win?.webContents.send('update:progress', { got, total }));
  return updater.install(file);
});
ipcMain.handle('update:page', () => updater.info?.page && shell.openExternal(updater.info.page));

ipcMain.handle('app:info', () => ({
  version: app.getVersion(),
  solidcraft: (() => {
    try {
      return fs.readFileSync(path.join(ENGINE, '.xiaoke-version'), 'utf8').trim().split('+')[0];
    } catch {
      return '';
    }
  })(),
  platform: process.platform,
  exportDir: exportDir(),
}));

function createWindow() {
  win = new BrowserWindow({
    width: 1560,
    height: 960,
    minWidth: 1100,
    minHeight: 700,
    title: '小柯機器人3D繪圖與列印工具',
    backgroundColor: '#1d2129',
    icon: path.join(ROOT, 'build', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.loadURL(`${origin}/index.html`);
  win.on('closed', () => {
    win = null;
  });
  // 外部連結一律用預設瀏覽器開，不在 App 內開新視窗
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  // SolidCraft 在設計未儲存時會阻止關閉頁面；Electron 預設會默默取消關閉，所以這裡詢問使用者
  win.webContents.on('will-prevent-unload', (e) => {
    if (forceClose) return e.preventDefault();
    const choice = dialog.showMessageBoxSync(win, {
      type: 'question',
      buttons: ['關閉', '取消'],
      defaultId: 1,
      cancelId: 1,
      title: '小柯機器人3D繪圖與列印工具',
      message: '目前的設計尚未儲存，確定要關閉嗎？',
      detail: 'SolidCraft 會保留一份自動備份，下次開啟時可以復原。',
    });
    if (choice === 0) e.preventDefault();
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(origin)) e.preventDefault();
  });
}

// macOS 一定要有選單列（複製、貼上等快速鍵靠「編輯」選單）；Windows 不顯示選單列
function setupMenu() {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null);
    return;
  }
  const name = '小柯機器人3D繪圖與列印工具';
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: name,
        submenu: [
          { label: `關於 ${name}`, click: () => win?.webContents.executeJavaScript("document.getElementById('dlgAbout').showModal()") },
          { label: '檢查更新…', click: () => win?.webContents.executeJavaScript("document.getElementById('dlgAbout').showModal();document.getElementById('btnCheckUpdate').click()") },
          { type: 'separator' },
          { role: 'hide', label: `隱藏 ${name}` },
          { role: 'hideOthers', label: '隱藏其他' },
          { role: 'unhide', label: '全部顯示' },
          { type: 'separator' },
          { role: 'quit', label: `結束 ${name}` },
        ],
      },
      {
        label: '編輯',
        submenu: [
          { role: 'undo', label: '還原' },
          { role: 'redo', label: '重做' },
          { type: 'separator' },
          { role: 'cut', label: '剪下' },
          { role: 'copy', label: '拷貝' },
          { role: 'paste', label: '貼上' },
          { role: 'selectAll', label: '全選' },
        ],
      },
      {
        label: '顯示方式',
        submenu: [
          { role: 'togglefullscreen', label: '進入／結束全螢幕' },
          { role: 'resetZoom', label: '實際大小' },
          { role: 'zoomIn', label: '放大' },
          { role: 'zoomOut', label: '縮小' },
        ],
      },
      { role: 'windowMenu', label: '視窗' },
    ]),
  );
}

// 只開一個視窗：再次開啟時把原本的視窗叫到前面（每個設定資料夾各自一個）
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
}

app.whenReady().then(async () => {
  if (!app.hasSingleInstanceLock()) return;
  setupMenu();
  try {
    origin = await startServer();
  } catch (e) {
    dialog.showErrorBox('小柯機器人3D繪圖與列印工具', `無法啟動：${e.message}`);
    app.quit();
    return;
  }
  session.defaultSession.on('will-download', (_e, item) => handleDownload(item));
  session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(['clipboard-read', 'clipboard-sanitized-write', 'fileSystem'].includes(perm)));
  createWindow();
  app.on('activate', () => {
    if (!BrowserWindow.getAllWindows().length) createWindow();
  });
});

app.on('window-all-closed', () => {
  // 關閉視窗就結束所有工作（未完成的匯出一併放棄）
  for (const job of [...pending]) finish(job, { ok: false, error: '程式已關閉' });
  app.quit();
});
