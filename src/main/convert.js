// SolidCraft 引擎沒有的網格格式：由引擎匯出的二進位 STL 轉成 GLB、glTF、PLY、AMF、OFF。
// 單位一律是公釐（glTF 規定公尺，轉檔時縮小 1000 倍）。

// 讀二進位 STL（也接受 ASCII STL），合併相同頂點，回傳 { positions: Float32Array, indices: Uint32Array }
function parseStl(buf) {
  const ascii = buf.length >= 84 ? buf.readUInt32LE(80) * 50 + 84 !== buf.length : true;
  const raw = [];
  if (ascii && /^\s*solid/.test(buf.toString('latin1', 0, Math.min(buf.length, 256)))) {
    const re = /vertex\s+(\S+)\s+(\S+)\s+(\S+)/g;
    const text = buf.toString('latin1');
    let m;
    while ((m = re.exec(text))) raw.push(+m[1], +m[2], +m[3]);
  } else {
    const n = buf.readUInt32LE(80);
    for (let i = 0; i < n; i++) {
      const o = 84 + i * 50 + 12;
      for (let k = 0; k < 9; k++) raw.push(buf.readFloatLE(o + k * 4));
    }
  }
  const map = new Map();
  const pos = [];
  const idx = new Uint32Array(raw.length / 3);
  for (let i = 0; i < raw.length; i += 3) {
    const key = `${raw[i]},${raw[i + 1]},${raw[i + 2]}`;
    let v = map.get(key);
    if (v === undefined) {
      v = pos.length / 3;
      map.set(key, v);
      pos.push(raw[i], raw[i + 1], raw[i + 2]);
    }
    idx[i / 3] = v;
  }
  return { positions: Float32Array.from(pos), indices: idx };
}

function bounds(p) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      if (p[i + k] < min[k]) min[k] = p[i + k];
      if (p[i + k] > max[k]) max[k] = p[i + k];
    }
  }
  return { min, max };
}

// glTF 是 Y 朝上、公尺；CAD 是 Z 朝上、公釐 → (x, z, -y) / 1000
function gltfParts(mesh, name) {
  const p = new Float32Array(mesh.positions.length);
  for (let i = 0; i < p.length; i += 3) {
    p[i] = mesh.positions[i] / 1000;
    p[i + 1] = mesh.positions[i + 2] / 1000;
    p[i + 2] = -mesh.positions[i + 1] / 1000;
  }
  const { min, max } = bounds(p);
  const posBytes = Buffer.from(p.buffer, p.byteOffset, p.byteLength);
  const idxBytes = Buffer.from(mesh.indices.buffer, mesh.indices.byteOffset, mesh.indices.byteLength);
  const bin = Buffer.concat([posBytes, idxBytes]);
  const json = {
    asset: { version: '2.0', generator: '小柯機器人3D繪圖與列印工具' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name }],
    meshes: [{ name, primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
    materials: [{ name: '小柯橘', pbrMetallicRoughness: { baseColorFactor: [0.96, 0.55, 0.2, 1], metallicFactor: 0, roughnessFactor: 0.6 } }],
    buffers: [{ byteLength: bin.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: posBytes.length, target: 34962 },
      { buffer: 0, byteOffset: posBytes.length, byteLength: idxBytes.length, target: 34963 },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: p.length / 3, type: 'VEC3', min, max },
      { bufferView: 1, componentType: 5125, count: mesh.indices.length, type: 'SCALAR' },
    ],
  };
  return { json, bin };
}

function toGlb(mesh, name) {
  const { json, bin } = gltfParts(mesh, name);
  const pad = (b, fill) => (b.length % 4 ? Buffer.concat([b, Buffer.alloc(4 - (b.length % 4), fill)]) : b);
  const jsonChunk = pad(Buffer.from(JSON.stringify(json), 'utf8'), 0x20);
  const binChunk = pad(bin, 0);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); // "glTF"
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binChunk.length, 8);
  const ch = (len, type) => {
    const b = Buffer.alloc(8);
    b.writeUInt32LE(len, 0);
    b.writeUInt32LE(type, 4);
    return b;
  };
  return Buffer.concat([header, ch(jsonChunk.length, 0x4e4f534a), jsonChunk, ch(binChunk.length, 0x004e4942), binChunk]);
}

function toGltf(mesh, name) {
  const { json, bin } = gltfParts(mesh, name);
  json.buffers[0].uri = `data:application/octet-stream;base64,${bin.toString('base64')}`;
  return Buffer.from(JSON.stringify(json, null, 1), 'utf8');
}

function toPly(mesh) {
  const nv = mesh.positions.length / 3, nf = mesh.indices.length / 3;
  const header = Buffer.from(
    `ply\nformat binary_little_endian 1.0\ncomment 小柯機器人3D繪圖與列印工具 (mm)\nelement vertex ${nv}\nproperty float x\nproperty float y\nproperty float z\nelement face ${nf}\nproperty list uchar uint vertex_indices\nend_header\n`,
    'utf8',
  );
  const body = Buffer.alloc(nv * 12 + nf * 13);
  let o = 0;
  for (let i = 0; i < mesh.positions.length; i++, o += 4) body.writeFloatLE(mesh.positions[i], o);
  for (let f = 0; f < nf; f++) {
    body.writeUInt8(3, o++);
    for (let k = 0; k < 3; k++, o += 4) body.writeUInt32LE(mesh.indices[f * 3 + k], o);
  }
  return Buffer.concat([header, body]);
}

function toOff(mesh) {
  const nv = mesh.positions.length / 3, nf = mesh.indices.length / 3;
  const lines = ['OFF', `${nv} ${nf} 0`];
  for (let i = 0; i < mesh.positions.length; i += 3) lines.push(`${+mesh.positions[i].toFixed(5)} ${+mesh.positions[i + 1].toFixed(5)} ${+mesh.positions[i + 2].toFixed(5)}`);
  for (let i = 0; i < mesh.indices.length; i += 3) lines.push(`3 ${mesh.indices[i]} ${mesh.indices[i + 1]} ${mesh.indices[i + 2]}`);
  return Buffer.from(lines.join('\n') + '\n', 'utf8');
}

function toAmf(mesh, name) {
  const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]);
  const out = ['<?xml version="1.0" encoding="UTF-8"?>', '<amf unit="millimeter" version="1.1">', `  <metadata type="name">${esc(name)}</metadata>`, '  <object id="0">', '    <mesh>', '      <vertices>'];
  for (let i = 0; i < mesh.positions.length; i += 3) {
    out.push(`        <vertex><coordinates><x>${+mesh.positions[i].toFixed(5)}</x><y>${+mesh.positions[i + 1].toFixed(5)}</y><z>${+mesh.positions[i + 2].toFixed(5)}</z></coordinates></vertex>`);
  }
  out.push('      </vertices>', '      <volume>');
  for (let i = 0; i < mesh.indices.length; i += 3) out.push(`        <triangle><v1>${mesh.indices[i]}</v1><v2>${mesh.indices[i + 1]}</v2><v3>${mesh.indices[i + 2]}</v3></triangle>`);
  out.push('      </volume>', '    </mesh>', '  </object>', '</amf>');
  return Buffer.from(out.join('\n') + '\n', 'utf8');
}

const CONVERTERS = { glb: toGlb, gltf: toGltf, ply: toPly, off: toOff, amf: toAmf };

function convertStl(stlBuffer, ext, name) {
  const fn = CONVERTERS[ext];
  if (!fn) throw new Error(`不支援的格式：${ext}`);
  const mesh = parseStl(stlBuffer);
  if (!mesh.indices.length) throw new Error('模型沒有任何三角面，請先建立實體');
  return fn(mesh, name);
}

module.exports = { parseStl, convertStl, CONVERTERS: Object.keys(CONVERTERS) };
