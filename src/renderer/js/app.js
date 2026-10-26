// 小柯機器人3D繪圖與列印工具：介面邏輯
import { Engine } from './engine.js';
import { TEMPLATES, defaults, textCommand } from './templates.js';
import { PRINTERS, MATERIALS, fits, estimate } from './printers.js';
import { FORMATS, QUALITIES } from './formats.js';

const $ = (id) => document.getElementById(id);
// 桌機版由 preload 提供 window.xk；線上版改用瀏覽器實作
const xk = window.xk || (await import('./web-shim.js')).xk;
const WEB = !!xk.web;
const store = {
  get(k, d) {
    try {
      const v = localStorage.getItem(`xk3d.${k}`);
      return v == null ? d : JSON.parse(v);
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(`xk3d.${k}`, JSON.stringify(v));
    } catch {}
  },
};

const engine = new Engine($('engine'));
const S = { busy: false, measure: null, revision: null, fonts: [], bambu: null, info: null };

// ---------- 小工具 ----------
function status(text) {
  $('status').textContent = text;
}
let toastTimer = null;
function toast(html, err = false, ms = 5000) {
  const t = $('toast');
  t.innerHTML = html;
  t.classList.toggle('err', err);
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), ms);
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const mm = (v) => `${(+v).toFixed(1)}`;
const size = (b) => (b > 1 << 20 ? `${(b / (1 << 20)).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

// SolidCraft 的英文錯誤訊息轉成比較好懂的中文
function friendly(e) {
  const m = String(e?.message || e);
  if (/no bod|nothing to export|no solid|empty/i.test(m)) return '目前沒有可匯出的實體，請先建立 3D 模型（例如用左邊的草圖精靈）。';
  if (/profile/i.test(m) && /no|not/i.test(m)) return '草圖沒有封閉的輪廓，無法擠出。請確認線段首尾相接。';
  if (/radius/i.test(m) && /fit|large|too/i.test(m)) return '圓角半徑太大，請改小一點。';
  if (/select at least one face/i.test(m)) return '找不到要移除的面（抽殼）。';
  return m;
}

async function withBusy(label, fn) {
  if (S.busy) {
    toast('上一個工作還在進行中，請稍候。', true);
    return;
  }
  S.busy = true;
  document.body.style.cursor = 'progress';
  status(label);
  try {
    return await fn();
  } finally {
    S.busy = false;
    document.body.style.cursor = '';
  }
}

// ---------- 啟動 ----------
async function boot() {
  if (WEB) {
    document.body.classList.add('web');
    $('btnBambu').textContent = '下載 3MF 給 Bambu Studio';
    $('btnBambu2').textContent = '下載 3MF 給 Bambu Studio 列印';
    $('brandSub').textContent = '線上版・SolidCraft 參數化 3D 草圖 ✕ 拓竹 Bambu Studio 列印';
  }
  S.info = await xk.info();
  $('aboutVersion').textContent = `v${S.info.version}`;
  $('aboutSc').textContent = S.info.solidcraft ? `v${S.info.solidcraft}` : '';
  document.title = `小柯機器人3D繪圖與列印工具 v${S.info.version}`;
  setupPanels();
  setupTemplates();
  setupPrintPanel();
  setupTextTool();
  setupDialogs();
  refreshBambu();
  refreshRecent();

  try {
    await engine.load();
    // 介面一律繁體中文（SolidCraft 的「中文」目錄已在安裝時換成完整繁體版）
    await engine.request('ui.prefs', { language: 'zh', default_units: 'mm' }).catch(() => engine.request('ui.prefs', { language: 'zh' }));
    $('loading').classList.add('hidden');
    $('engineInfo').textContent = `SolidCraft ${S.info.solidcraft}・${engine.renderer}`;
    status('準備完成：可以用左邊的草圖精靈，或直接在 SolidCraft 裡畫草圖。');
    setInterval(autoMeasure, 3000);
    setTimeout(checkUpdate, 4000);
  } catch (e) {
    $('loadingText').textContent = `引擎啟動失敗：${e.message}`;
    status('引擎啟動失敗');
  }
}

function setupPanels() {
  const toggle = (btn, panel, key) => {
    const apply = (on) => {
      $(panel).classList.toggle('hidden', !on);
      $(btn).classList.toggle('on', on);
      store.set(key, on);
    };
    apply(store.get(key, true));
    $(btn).onclick = () => apply($(panel).classList.contains('hidden'));
  };
  toggle('btnWizard', 'wizard', 'wizard');
  toggle('btnPrintPanel', 'printPanel', 'print');
}

// ---------- 小柯草圖精靈 ----------
let current = null;
function setupTemplates() {
  $('tplGrid').innerHTML = TEMPLATES.map((t) => `<button class="tpl-card" data-id="${t.id}" title="${esc(t.desc)}"><span class="ico">${t.icon}</span><b>${esc(t.name)}</b></button>`).join('');
  $('tplGrid').onclick = (e) => {
    const b = e.target.closest('.tpl-card');
    if (b) openTemplate(TEMPLATES.find((t) => t.id === b.dataset.id));
  };
  $('tplBack').onclick = () => {
    $('tplForm').classList.add('hidden');
    $('tplGrid').classList.remove('hidden');
  };
  $('tplCreate').onclick = () => createFromTemplate();
}

function fontOptions(value) {
  return S.fonts.map((f) => `<option value="${f.id}" ${f.id === value ? 'selected' : ''}>${esc(f.name)}</option>`).join('');
}

function openTemplate(t) {
  current = t;
  const saved = store.get(`tpl.${t.id}`, {});
  $('tplName').textContent = `${t.icon} ${t.name}`;
  $('tplDesc').textContent = t.desc;
  $('tplFields').innerHTML = t.params
    .map((q) => {
      const v = saved[q.key] ?? q.value;
      if (q.type === 'text') return `<label for="f_${q.key}">${esc(q.label)}</label><div class="val"><input type="text" id="f_${q.key}" name="${q.key}" value="${esc(v)}" maxlength="40"></div>`;
      if (q.type === 'font') return `<label for="f_${q.key}">${esc(q.label)}</label><div class="val"><select id="f_${q.key}" name="${q.key}">${fontOptions(v)}</select></div>`;
      const step = q.step ?? 1;
      return `<label for="f_${q.key}">${esc(q.label)}</label><div class="val"><input type="range" min="${q.min}" max="${q.max}" step="${step}" value="${v}" data-for="${q.key}"><input type="number" id="f_${q.key}" name="${q.key}" min="${q.min}" max="${q.max}" step="${step}" value="${v}"><span class="muted small">${esc(q.unit || '')}</span></div>`;
    })
    .join('');
  // 拉桿與數字欄位同步
  $('tplFields').oninput = (e) => {
    if (e.target.type === 'range') $(`f_${e.target.dataset.for}`).value = e.target.value;
    else if (e.target.type === 'number') {
      const r = $('tplFields').querySelector(`input[type=range][data-for="${e.target.name}"]`);
      if (r) r.value = e.target.value;
    }
    $('tplError').classList.add('hidden');
  };
  $('tplError').classList.add('hidden');
  $('tplGrid').classList.add('hidden');
  $('tplForm').classList.remove('hidden');
}

function readTemplateValues(t) {
  const p = {};
  for (const q of t.params) {
    const el = $(`f_${q.key}`);
    if (q.type === 'text' || q.type === 'font') p[q.key] = el.value;
    else {
      const v = Number(el.value);
      if (!Number.isFinite(v)) throw new Error(`「${q.label}」要填數字`);
      if (v < q.min || v > q.max) throw new Error(`「${q.label}」要在 ${q.min}～${q.max} ${q.unit || ''} 之間`);
      p[q.key] = v;
    }
  }
  return p;
}

async function createFromTemplate() {
  const t = current;
  if (!t || !engine.ready) return;
  let p;
  try {
    p = readTemplateValues(t);
    const bad = t.check?.(p);
    if (bad) throw new Error(bad);
  } catch (e) {
    $('tplError').textContent = e.message;
    $('tplError').classList.remove('hidden');
    return;
  }
  store.set(`tpl.${t.id}`, p);
  await withBusy(`小柯正在建立「${t.name}」…`, async () => {
    try {
      const tx = t.text?.(p);
      if (tx) p._svg = await xk.textSvg(tx);
      if ($('tplNewDesign').checked) await engine.execute('file.new', { name: t.name });
      else await finishSketchIfAny();
      await engine.batch(t.build(p));
      await engine.request('ui.home', { open: false }).catch(() => {});
      await engine.execute('view.isometric', {}).catch(() => {});
      status(`已建立「${t.name}」。可以在 SolidCraft 的時間軸點兩下特徵來修改尺寸。`);
      toast(`✅ 已建立「${esc(t.name)}」`);
      await measureNow();
    } catch (e) {
      $('tplError').textContent = `建立失敗：${friendly(e)}`;
      $('tplError').classList.remove('hidden');
      status('建立失敗');
    }
  });
}

async function finishSketchIfAny() {
  const d = await engine.request('document.inspect', {}).catch(() => null);
  if (d?.active_sketch != null) await engine.execute('sketch.finish', {}).catch(() => {});
}

// ---------- 中文文字工具 ----------
async function setupTextTool() {
  S.fonts = await xk.textFonts();
  $('txtFont').innerHTML = fontOptions(store.get('txt.font', 'noto'));
  $('txtValue').value = store.get('txt.value', '小柯機器人');
  $('txtInsert').onclick = () => insertText();
}

async function insertText() {
  if (!engine.ready) return;
  const text = $('txtValue').value.trim();
  if (!text) return toast('請先輸入文字', true);
  const height = Number($('txtSize').value) || 10;
  const depth = Number($('txtDepth').value) || 0;
  store.set('txt.font', $('txtFont').value);
  store.set('txt.value', text);
  await withBusy('正在把文字轉成草圖外框…', async () => {
    try {
      const svg = await xk.textSvg({ text, height, font: $('txtFont').value, bold: $('txtBold').checked });
      const d = await engine.request('document.inspect', {});
      if (d?.active_sketch != null) {
        // 正在編輯草圖：放在草圖原點附近，使用者可以再移動、標尺寸
        await engine.batch([textCommand(svg, 0, -height / 2)]);
        status(`已把「${text}」放進目前的草圖（${svg.loops} 個外框）。`);
        toast('✅ 文字已放進草圖，完成草圖後就可以擠出。');
      } else {
        const cmds = [{ command: 'sketch.create', params: { plane: 'XY', name: `文字：${text.slice(0, 12)}` } }, textCommand(svg, 0, -height / 2), { command: 'sketch.finish' }];
        if (depth > 0) cmds.push({ command: 'solid.extrude', params: { distance: depth, operation: 'new', body_name: `立體字 ${text.slice(0, 12)}` } });
        await engine.request('ui.home', { open: false }).catch(() => {});
        await engine.batch(cmds);
        await engine.execute('view.isometric', {}).catch(() => {});
        status(depth > 0 ? `已建立立體字「${text}」。` : `已建立文字草圖「${text}」。`);
        toast(depth > 0 ? '✅ 已建立立體字' : '✅ 已建立文字草圖');
        await measureNow();
      }
    } catch (e) {
      toast(`文字建立失敗：${esc(friendly(e))}`, true);
      status('文字建立失敗');
    }
  });
}

// ---------- 列印助手 ----------
function setupPrintPanel() {
  $('printer').innerHTML = PRINTERS.map((p) => `<option value="${p.id}">${esc(p.name)}（${p.bed.join('×')}）</option>`).join('');
  $('material').innerHTML = MATERIALS.map((m) => `<option value="${m.id}">${m.name}</option>`).join('');
  $('quality').innerHTML = QUALITIES.map((q) => `<option value="${q.id}">${q.name}</option>`).join('');
  $('printer').value = store.get('printer', 'p1s');
  $('material').value = store.get('material', 'pla');
  $('quality').value = store.get('quality', 'standard');
  $('printer').onchange = () => (store.set('printer', $('printer').value), renderMeasure());
  $('material').onchange = () => (store.set('material', $('material').value), renderMeasure());
  $('quality').onchange = () => store.set('quality', $('quality').value);
  $('formatList').innerHTML = FORMATS.map((f) => `<button data-id="${f.id}" title="${esc(f.desc)}">${esc(f.name)}<small>.${f.ext}</small></button>`).join('');
  $('formatList').onclick = (e) => {
    const b = e.target.closest('button');
    if (b) exportAs(FORMATS.find((f) => f.id === b.dataset.id), 'save');
  };
  $('btnBambu').onclick = $('btnBambu2').onclick = () => sendToBambu();
  $('btnMeasure').onclick = () => measureNow();
  $('btnSave').onclick = () => exportAs(FORMATS.find((f) => f.id === 'solidcraft'), 'save');
  $('btnOpen').onclick = () => openFile();
  $('btnChooseDir').onclick = async () => {
    const d = await xk.chooseDir();
    if (d) (await showExportDir(), refreshRecent());
  };
  $('btnOpenDir').onclick = () => xk.show(null);
  showExportDir();
  xk.onExportSaved((r) => {
    toast(`💾 已存到匯出資料夾：${esc(r.name)}`);
    refreshRecent();
  });
}

async function showExportDir() {
  const s = await xk.settings();
  $('exportDir').textContent = s.exportDir;
  $('exportDir').title = s.exportDir;
}

async function measureNow() {
  if (!engine.ready) return;
  try {
    S.measure = await engine.measure();
  } catch (e) {
    S.measure = { error: friendly(e) };
  }
  renderMeasure();
}

// 設計有變更（revision 改變）才重新量測
async function autoMeasure() {
  if (!engine.ready || S.busy || document.hidden || $('printPanel').classList.contains('hidden')) return;
  try {
    const d = await engine.request('document.inspect', {});
    const rev = `${d?.name}|${d?.revision}|${d?.bodies?.length}`;
    if (rev !== S.revision) {
      S.revision = rev;
      await measureNow();
    }
  } catch {}
}

function renderMeasure() {
  const el = $('measure');
  const m = S.measure;
  const printer = PRINTERS.find((p) => p.id === $('printer').value) || PRINTERS[0];
  const mat = MATERIALS.find((x) => x.id === $('material').value) || MATERIALS[0];
  if (!m) return void (el.textContent = '尚未量測');
  if (m.error) return void (el.innerHTML = `<span class="error">${esc(m.error)}</span>`);
  if (!m.count || !m.size) return void (el.innerHTML = '目前設計沒有實體。<br>用左邊的草圖精靈建立，或在 SolidCraft 畫草圖後「擠出」。');
  const f = fits(m.size, printer.bed);
  const est = estimate(m.volume, mat.density);
  const below = m.min[2] < -0.01;
  el.innerHTML = `
    <div class="big">${mm(m.size[0])} × ${mm(m.size[1])} × ${mm(m.size[2])} mm</div>
    <div>${m.count} 個實體${m.open ? `（${m.open} 個未封閉）` : ''}・體積 ${(m.volume / 1000).toFixed(2)} cm³</div>
    <div>${mat.name} 實心約 ${est.grams.toFixed(1)} g、線材 ${est.meters.toFixed(2)} m <span class="muted small">（實際依填充率較少）</span></div>
    <div>${f.ok ? `<span class="fit-ok">✔ 放得進 ${esc(printer.name)}</span>${f.rotate ? '（需在 Bambu Studio 旋轉 90°）' : ''}` : `<span class="fit-bad">✘ 超出 ${esc(printer.name)} 列印範圍 ${printer.bed.join('×')} mm</span>`}</div>
    ${below ? '<div class="muted small">提示：模型有部分在 Z=0 以下，Bambu Studio 會自動放到列印板上。</div>' : ''}
    ${m.open ? '<div class="error small">有未封閉的實體，切片可能失敗，建議在 SolidCraft 修補。</div>' : ''}`;
}

// ---------- 匯出 ----------
async function exportName() {
  const typed = $('fileName').value.trim();
  if (typed) return typed;
  const n = await engine.designName();
  return n && n !== 'Untitled' ? n : '小柯模型';
}

async function exportAs(fmt, action) {
  if (!engine.ready || !fmt) return;
  return withBusy(`匯出 ${fmt.name} 中…`, async () => {
    try {
      await finishSketchIfAny();
      if (fmt.id !== 'solidcraft') {
        const m = await engine.measure();
        if (!m.count) throw new Error('目前沒有可匯出的實體，請先建立 3D 模型（例如用左邊的草圖精靈）。');
      }
      const base = await exportName();
      const title = base + (fmt.suffix || '');
      const job = await xk.exportExpect({ title, ext: fmt.ext, convertTo: fmt.convert || null, action, multi: !!fmt.multi });
      const params = { path: job.enginePath, format: fmt.convert ? 'stl' : fmt.engine };
      if (['3mf', 'stl', 'stla', 'obj'].includes(params.format) || fmt.convert) params.quality = $('quality').value;
      if (params.format === 'stla') delete params.quality;
      try {
        await engine.execute('file.export', params);
      } catch (e) {
        await xk.exportCancel(job.id);
        throw e;
      }
      const r = await xk.exportWait(job.id);
      if (!r.ok) throw new Error(r.error);
      refreshRecent();
      const name = r.file.split(/[\\/]/).pop();
      if (action === 'bambu' && WEB) {
        status(`已下載 ${name}`);
        toast(`🖨️ 已下載 <b>${esc(name)}</b>。<br>請在 Bambu Studio 選「檔案 → 匯入 → 匯入 3MF/STL…」或直接把檔案拖進 Bambu Studio，再選印表機與線材切片列印。<br><span class="muted">想一鍵直接開啟 Bambu Studio，請改用桌機版。</span>`, false, 12000);
      } else if (action === 'bambu') {
        if (r.bambu) {
          status(`已送到 Bambu Studio：${name}`);
          toast(`🖨️ 已用 Bambu Studio 開啟 <b>${esc(name)}</b>，請在 Bambu Studio 選擇印表機與線材後切片列印。`, false, 8000);
        } else {
          status(`已匯出 ${name}，但無法開啟 Bambu Studio`);
          toast(`已匯出 ${esc(name)}，但 Bambu Studio 無法開啟：${esc(r.bambuError || '')}`, true, 8000);
          if (!S.bambu?.installed) $('dlgBambu').showModal();
        }
      } else {
        status(`已匯出 ${name}${r.size ? `（${size(r.size)}）` : ''}`);
        toast(WEB ? `💾 已下載 <b>${esc(name)}</b>（瀏覽器的「下載」資料夾）` : `💾 已匯出 <b>${esc(name)}</b> <button class="link" id="toastShow">在資料夾中顯示</button>`, false, 7000);
        $('toastShow')?.addEventListener('click', () => xk.show(r.file));
      }
      return r;
    } catch (e) {
      toast(`匯出失敗：${esc(friendly(e))}`, true, 8000);
      status('匯出失敗');
    }
  });
}

async function sendToBambu() {
  await refreshBambu();
  if (!S.bambu?.installed && !WEB) {
    $('dlgBambu').showModal();
    return;
  }
  await exportAs(FORMATS[0], 'bambu');
}

async function refreshRecent() {
  const list = await xk.exports();
  $('recent').innerHTML = list.length
    ? list.slice(0, 12).map((f, i) => WEB
        ? `<li><span>${esc(f.name)}</span><small class="muted">${f.size ? size(f.size) : ''} ${new Date(f.mtime).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</small></li>`
        : `<li title="${esc(f.file)}"><span>${esc(f.name)}</span><small class="muted">${size(f.size)}</small><button data-i="${i}" data-a="bambu">列印</button><button data-i="${i}" data-a="show">位置</button></li>`).join('')
    : '<li class="muted">還沒有匯出的檔案</li>';
  $('recent').onclick = async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const f = list[+b.dataset.i];
    if (b.dataset.a === 'show') return xk.show(f.file);
    await refreshBambu();
    if (!S.bambu?.installed) return $('dlgBambu').showModal();
    try {
      await xk.bambuOpen(f.file);
      toast(`🖨️ 已用 Bambu Studio 開啟 ${esc(f.name)}`);
    } catch (err) {
      toast(`無法開啟 Bambu Studio：${esc(err.message)}`, true);
    }
  };
}

// 開啟電腦裡的檔案：交給 SolidCraft 的拖放處理（與把檔案拖進視窗相同）
async function openFile() {
  if (!engine.ready) return;
  const f = await xk.openFile().catch((e) => (toast(esc(e.message), true), null));
  if (!f) return;
  const win = engine.iframe.contentWindow;
  const file = new win.File([f.bytes], f.name);
  const dt = new win.DataTransfer();
  dt.items.add(file);
  const target = win.document.getElementById('solidcraft_canvas') || win.document.body;
  for (const type of ['dragenter', 'dragover', 'drop']) target.dispatchEvent(new win.DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true }));
  status(`正在開啟 ${f.name}…`);
  setTimeout(measureNow, 2500);
}

// ---------- Bambu Studio ----------
async function refreshBambu() {
  const s = (S.bambu = await xk.bambuStatus());
  const el = $('bambuStatus');
  $('aboutBambu').textContent = `建議 ${s.recommended.label}`;
  $('bambuRec').textContent = `Bambu Studio ${s.recommended.label}`;
  if (s.web) {
    el.className = 'status-card';
    el.innerHTML = `線上版會把模型下載成 3MF，再用 Bambu Studio 開啟列印。<div class="row"><button id="btnGetBambu" class="link small">下載 Bambu Studio ${s.recommended.label}</button><button id="btnGetDesktop" class="link small">下載桌機版（可一鍵開啟）</button></div>`;
    $('btnGetBambu').onclick = () => xk.external(s.recommended.page);
    $('btnGetDesktop').onclick = () => xk.external(s.desktopPage);
  } else if (s.installed) {
    el.className = `status-card ${s.matches ? 'ok' : 'warn'}`;
    el.innerHTML = `✔ 已安裝 Bambu Studio ${esc(s.version || '')}${s.matches ? '' : `<br><span class="muted">建議版本為 ${s.recommended.label}，目前版本一樣可以使用。</span>`}`;
  } else {
    el.className = 'status-card warn';
    el.innerHTML = `⚠ 尚未安裝 Bambu Studio<div class="row"><button id="btnInstallBambu" class="primary">安裝 ${s.recommended.label}</button></div>`;
    $('btnInstallBambu').onclick = () => $('dlgBambu').showModal();
  }
  return s;
}

// ---------- 對話框、版本更新 ----------
function setupDialogs() {
  $('btnAbout').onclick = () => $('dlgAbout').showModal();
  $('btnUpdate').onclick = () => $('dlgAbout').showModal();
  document.querySelectorAll('[data-ext]').forEach((a) => (a.onclick = () => xk.external(a.dataset.ext)));
  $('btnCheckUpdate').onclick = () => checkUpdate(true);
  $('btnUpdatePage').onclick = () => xk.updatePage();
  $('btnInstallUpdate').onclick = async () => {
    $('btnInstallUpdate').disabled = true;
    $('updateProgress').classList.remove('hidden');
    try {
      const r = await xk.updateInstall();
      $('updateText').textContent = r.quitting ? '安裝程式已啟動，程式即將關閉並更新…' : `已下載：${r.path}，請依畫面完成安裝。`;
    } catch (e) {
      $('updateText').textContent = `更新失敗：${e.message}`;
      $('btnInstallUpdate').disabled = false;
    }
  };
  xk.onUpdateProgress(({ got, total }) => {
    $('updateProgress').firstElementChild.style.width = total ? `${(got / total) * 100}%` : '30%';
    $('updateText').textContent = `下載新版中… ${size(got)}${total ? ` / ${size(total)}` : ''}`;
  });

  $('btnBambuPage').onclick = () => xk.external(S.bambu?.recommended.page || 'https://github.com/bambulab/BambuStudio/releases');
  $('btnBambuDownload').onclick = async () => {
    $('btnBambuDownload').disabled = true;
    $('bambuProgress').classList.remove('hidden');
    $('bambuDlText').textContent = '開始下載…';
    try {
      await xk.bambuDownload();
      $('bambuDlText').textContent = '已開啟 Bambu Studio 安裝程式，請依畫面完成安裝；裝好後回到這裡就能直接列印。';
    } catch (e) {
      $('bambuDlText').textContent = `下載失敗：${e.message}（可以改用「官方下載頁」）`;
    } finally {
      $('btnBambuDownload').disabled = false;
    }
  };
  xk.onBambuProgress(({ got, total, done }) => {
    $('bambuProgress').firstElementChild.style.width = total ? `${(got / total) * 100}%` : '30%';
    if (!done) $('bambuDlText').textContent = `下載中… ${size(got)}${total ? ` / ${size(total)}` : ''}`;
  });
  // 裝完 Bambu Studio 回到視窗時重新偵測
  if (!WEB) window.addEventListener('focus', () => refreshBambu());
}

async function checkUpdate(manual = false) {
  if (WEB) {
    $('updateText').textContent = '線上版每次開啟都是最新版本。也可以下載 Windows／Mac 桌機版，離線使用並一鍵開啟 Bambu Studio。';
    $('btnCheckUpdate').classList.add('hidden');
    $('btnUpdatePage').classList.remove('hidden');
    $('btnUpdatePage').textContent = '下載桌機版';
    return;
  }
  if (manual) $('updateText').textContent = '檢查中…';
  try {
    const u = await xk.updateCheck();
    if (u.newer) {
      $('btnUpdate').classList.remove('hidden');
      $('btnUpdate').textContent = `⬆️ 新版本 v${u.latest}`;
      $('updateText').textContent = `有新版本 v${u.latest}（目前 v${u.current}）${u.notes ? `\n\n${u.notes}` : ''}`;
      $('btnInstallUpdate').classList.toggle('hidden', !u.canInstall);
      $('btnUpdatePage').classList.remove('hidden');
      if (!manual) toast(`⬆️ 有新版本 v${esc(u.latest)}，按右上角「新版本」更新。`, false, 8000);
    } else {
      $('updateText').textContent = `已是最新版本（v${u.current}）`;
    }
  } catch (e) {
    if (manual) $('updateText').textContent = `無法檢查更新：${e.message}`;
  }
}

boot();
