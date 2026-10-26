// 拓竹 Bambu Studio：尋找已安裝的程式、用它開啟 3MF、下載指定版本的安裝檔。
// Bambu Studio 採 AGPL-3.0，本程式不內含也不連結它的程式碼，只以獨立程式啟動。
const { execFile, spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// 使用者指定的版本：Bambu Studio V2.8.2.61（GitHub tag v02.08.02.61）
const RECOMMENDED = {
  version: '02.08.02.61',
  label: 'V2.8.2.61',
  page: 'https://github.com/bambulab/BambuStudio/releases/tag/v02.08.02.61',
  win: 'https://github.com/bambulab/BambuStudio/releases/download/v02.08.02.61/Bambu_Studio_win-v02.08.02.61-20260820225108.exe',
  mac: 'https://github.com/bambulab/BambuStudio/releases/download/v02.08.02.61/Bambu_Studio_mac-v02.08.02.61-20260820225108.dmg',
};

function regQuery(key) {
  return new Promise((resolve) => {
    execFile('reg', ['query', key, '/s'], { windowsHide: true, maxBuffer: 32 << 20, encoding: 'utf8' }, (err, out) => resolve(err ? '' : out));
  });
}

// 解析 reg query 的輸出，找 DisplayName 含 Bambu Studio 的解除安裝項目
function parseUninstall(out) {
  const found = [];
  for (const block of out.split(/\r?\n(?=HKEY_)/)) {
    const val = (name) => block.match(new RegExp(`^\\s+${name}\\s+REG_\\w+\\s+(.*)$`, 'mi'))?.[1]?.trim();
    const name = val('DisplayName');
    if (!name || !/bambu\s*studio/i.test(name)) continue;
    found.push({ name, version: val('DisplayVersion') || '', location: val('InstallLocation') || '', icon: val('DisplayIcon') || '' });
  }
  return found;
}

async function findWindows() {
  const candidates = [];
  const keys = [
    'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  ];
  const entries = (await Promise.all(keys.map(regQuery))).flatMap(parseUninstall);
  for (const e of entries) {
    if (e.location) candidates.push({ exe: path.join(e.location.replace(/^"|"$/g, ''), 'bambu-studio.exe'), version: e.version });
    if (e.icon) candidates.push({ exe: e.icon.replace(/^"|"$/g, '').replace(/,\d+$/, ''), version: e.version });
  }
  for (const base of [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs')]) {
    if (base) candidates.push({ exe: path.join(base, 'Bambu Studio', 'bambu-studio.exe'), version: '' });
  }
  const hit = candidates.find((c) => /bambu-studio\.exe$/i.test(c.exe) && fs.existsSync(c.exe));
  return hit ? { installed: true, exe: hit.exe, version: hit.version || entries[0]?.version || '' } : { installed: false };
}

function findMac() {
  for (const app of ['/Applications/BambuStudio.app', '/Applications/Bambu Studio.app', path.join(os.homedir(), 'Applications/BambuStudio.app')]) {
    if (!fs.existsSync(app)) continue;
    let version = '';
    try {
      const plist = fs.readFileSync(path.join(app, 'Contents/Info.plist'), 'utf8');
      version = plist.match(/<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/)?.[1] || '';
    } catch {}
    return { installed: true, app, version };
  }
  return { installed: false };
}

// "02.08.02.61"、"2.8.2.61" 都轉成 [2,8,2,61] 方便比較
function versionParts(v) {
  return String(v || '').split(/[^\d]+/).filter(Boolean).map(Number);
}
function sameVersion(a, b) {
  const x = versionParts(a), y = versionParts(b);
  return x.length > 0 && x.length === y.length && x.every((n, i) => n === y[i]);
}

async function status() {
  const found = process.platform === 'win32' ? await findWindows() : process.platform === 'darwin' ? findMac() : { installed: false };
  return { ...found, recommended: RECOMMENDED, matches: found.installed && sameVersion(found.version, RECOMMENDED.version) };
}

// 用 Bambu Studio 開啟檔案（3MF / STL / STEP / OBJ…），不等待它結束
async function open(file) {
  const s = await status();
  if (!s.installed) throw new Error('尚未安裝 Bambu Studio');
  if (process.platform === 'darwin') {
    spawn('open', ['-a', s.app, file], { detached: true, stdio: 'ignore' }).unref();
  } else {
    spawn(s.exe, [file], { detached: true, stdio: 'ignore', cwd: path.dirname(s.exe) }).unref();
  }
  return s;
}

module.exports = { RECOMMENDED, status, open, parseUninstall, sameVersion, versionParts };
