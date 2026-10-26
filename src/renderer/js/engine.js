// SolidCraft 引擎（同源 iframe）的呼叫介面：window.solidcraft 的 execute / request / commands
export class Engine {
  constructor(iframe) {
    this.iframe = iframe;
    this.api = null;
  }

  // 沒有 WebGPU 時改用 WebGL2（SolidCraft 的 ?webgl）
  async load() {
    let webgpu = false;
    try {
      webgpu = !!(navigator.gpu && (await navigator.gpu.requestAdapter()));
    } catch {}
    this.renderer = webgpu ? 'WebGPU' : 'WebGL2';
    this.iframe.src = `engine/index.html${webgpu ? '' : '?webgl'}`;
    const t0 = Date.now();
    while (Date.now() - t0 < 120000) {
      const api = this.iframe.contentWindow?.solidcraft;
      if (api) {
        this.api = api;
        return this;
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error('SolidCraft 引擎載入逾時');
  }

  get ready() {
    return !!this.api;
  }

  execute(command, params = {}) {
    return this.api.execute(command, params);
  }

  request(method, params = {}) {
    return this.api.request(method, params);
  }

  // 一次執行多個指令；任何一步失敗就整批還原，並回報是哪一步
  async batch(commands) {
    const r = await this.request('engine.batch', { commands, rollback: true });
    if (r?.failed) {
      const e = new Error(r.failed.error || '指令失敗');
      e.step = r.failed.index;
      e.command = r.failed.command;
      throw e;
    }
    return r;
  }

  // 量測所有實體：合併外框、總體積
  async measure() {
    const m = await this.execute('inspect.measure', {});
    const bodies = m?.bodies || [];
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (const b of bodies) {
      if (!b.bbox) continue;
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], b.bbox.min[k]);
        max[k] = Math.max(max[k], b.bbox.max[k]);
      }
    }
    const has = bodies.length > 0 && Number.isFinite(min[0]);
    return {
      count: bodies.length,
      size: has ? max.map((v, k) => v - min[k]) : null,
      min: has ? min : null,
      volume: m?.total?.volume_mm3 || 0,
      open: m?.total?.open_bodies_skipped || 0,
      names: bodies.map((b) => b.name),
    };
  }

  // 目前設計的名稱（匯出檔名用）
  async designName() {
    try {
      const d = await this.request('document.inspect', {});
      return d?.name || d?.document?.name || '';
    } catch {
      return '';
    }
  }
}
