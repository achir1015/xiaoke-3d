// 線上版：在瀏覽器裡實作桌機版 preload 提供的 window.xk。
// - 匯出：叫引擎把檔案寫進瀏覽器檔案空間（OPFS），讀回來（需要時轉檔）再以中文檔名下載
// - 中文字：用打包好的 fontkit + Clipper，字型是線上版內建的思源黑體
// - Bambu Studio：瀏覽器不能啟動電腦上的程式，改成下載 3MF 再用 Bambu Studio 開啟
const BAMBU = {
  version: '02.08.02.61',
  label: 'V2.8.2.61',
  page: 'https://github.com/bambulab/BambuStudio/releases/tag/v02.08.02.61',
};
const DESKTOP_PAGE = 'https://github.com/achir1015/xiaoke-3d/releases/latest';

let libPromise = null;
const lib = () => (libPromise ||= import('./web-lib.js'));
let fontBytes = null;
const font = async () => (fontBytes ||= new Uint8Array(await (await fetch('engine/fonts/BIZUDPGothic-Regular.ttf')).arrayBuffer()));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const safe = (s) => String(s || '小柯模型').replace(/[\\/:*?"<>|]+/g, '_').trim().slice(0, 80) || '小柯模型';
const jobs = new Map();

function recentList() {
  try {
    return JSON.parse(localStorage.getItem('xk3d.recent') || '[]');
  } catch {
    return [];
  }
}
function remember(name, size) {
  const list = [{ name, size, mtime: Date.now() }, ...recentList().filter((f) => f.name !== name)].slice(0, 30);
  try {
    localStorage.setItem('xk3d.recent', JSON.stringify(list));
  } catch {}
}

function download(name, bytes) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// 等引擎把檔案寫進 OPFS（寫入是非同步的），大小穩定後讀出並刪掉暫存檔
async function readOpfs(name, timeoutMs = 120000) {
  const root = await navigator.storage.getDirectory();
  const t0 = Date.now();
  let last = -1;
  while (Date.now() - t0 < timeoutMs) {
    try {
      const file = await (await root.getFileHandle(name)).getFile();
      if (file.size > 0 && file.size === last) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        await root.removeEntry(name).catch(() => {});
        return bytes;
      }
      last = file.size;
    } catch {}
    await sleep(250);
  }
  throw new Error('引擎沒有產生檔案（逾時）');
}

function pickFile() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.solidcraft,.3mf,.stl,.step,.stp,.iges,.igs,.obj,.gltf,.glb';
    input.onchange = async () => {
      const f = input.files[0];
      resolve(f ? { name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) } : null);
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

let info = null;
const noop = () => () => {};

export const xk = {
  web: true,
  async info() {
    if (!info) {
      const v = await fetch('version.json', { cache: 'no-store' }).then((r) => r.json()).catch(() => ({}));
      info = { version: v.version || '', solidcraft: v.solidcraft || '', platform: 'web', exportDir: '瀏覽器的下載資料夾' };
    }
    return info;
  },
  settings: async () => ({ exportDir: '瀏覽器的「下載」資料夾' }),
  setSettings: async () => ({}),
  chooseDir: async () => null,
  show: async () => {},
  external: async (url) => void window.open(url, '_blank', 'noopener'),

  async exportExpect(opts) {
    const tag = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    const title = safe(opts.title);
    const ext = String(opts.ext || '3mf').toLowerCase();
    const engineExt = opts.convertTo ? 'stl' : ext;
    const job = { tag, title, ext, convertTo: opts.convertTo || null, action: opts.action, multi: !!opts.multi };
    if (job.multi) {
      // URDF 一次寫出多個檔案：直接交給瀏覽器下載
      const ascii = title.replace(/[^\w.-]+/g, '').replace(/^[._-]+/, '') || 'xiaoke_robot';
      job.enginePath = `/downloads/${ascii}.${ext}`;
      job.finalName = `${ascii}.${ext}`;
    } else {
      job.opfsName = `xk-export-${tag}.${engineExt}`;
      job.enginePath = `/opfs/${job.opfsName}`;
      job.finalName = `${title}.${ext}`;
    }
    jobs.set(tag, job);
    return { id: tag, engineFile: job.finalName, enginePath: job.enginePath };
  },

  async exportWait(id) {
    const job = jobs.get(id);
    if (!job) return { ok: false, error: '找不到匯出工作' };
    jobs.delete(id);
    try {
      if (job.multi) {
        await sleep(1500);
        remember(job.finalName, 0);
        return { ok: true, file: job.finalName, web: true };
      }
      let bytes = await readOpfs(job.opfsName);
      if (job.convertTo) bytes = (await lib()).convertStl(bytes, job.convertTo, job.title);
      download(job.finalName, bytes);
      remember(job.finalName, bytes.length);
      return { ok: true, file: job.finalName, size: bytes.length, web: true, bambu: false };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },
  async exportCancel(id) {
    jobs.delete(id);
  },
  exports: async () => recentList(),
  openFile: () => pickFile(),

  textFonts: async () => [{ id: 'noto', name: 'Noto Sans TC 思源黑體（內建）' }],
  async textSvg(opts) {
    const [l, bytes] = await Promise.all([lib(), font()]);
    return l.textToSvg(bytes, opts);
  },

  bambuStatus: async () => ({ web: true, installed: false, recommended: BAMBU, desktopPage: DESKTOP_PAGE }),
  bambuOpen: async () => {
    throw new Error('線上版無法直接開啟 Bambu Studio');
  },
  bambuDownload: async () => void window.open(BAMBU.page, '_blank', 'noopener'),

  updateCheck: async () => {
    const i = await xk.info();
    return { current: i.version, latest: i.version, newer: false, web: true };
  },
  updateInstall: async () => ({}),
  updatePage: async () => void window.open(DESKTOP_PAGE, '_blank', 'noopener'),

  onUpdateProgress: noop,
  onExportSaved: noop,
  onBambuProgress: noop,
};
