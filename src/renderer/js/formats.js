// 可匯出的檔案格式
// engine：SolidCraft 引擎直接寫出（file.export 的 format）；convert：引擎先出 STL，再由小柯轉檔
export const FORMATS = [
  { id: '3mf', ext: '3mf', name: '3MF', desc: '拓竹 Bambu Studio 建議格式，直接開啟切片', engine: '3mf', bambu: true },
  { id: 'stl', ext: 'stl', name: 'STL', desc: '最通用的 3D 列印網格（二進位）', engine: 'stl', bambu: true },
  { id: 'stla', ext: 'stl', name: 'STL（文字）', desc: 'ASCII 文字版 STL', engine: 'stla', suffix: '-ascii', bambu: true },
  { id: 'step', ext: 'step', name: 'STEP', desc: '精確曲面，可給其他 CAD，Bambu Studio 也能開', engine: 'step', bambu: true },
  { id: 'iges', ext: 'igs', name: 'IGES', desc: '舊式 CAD 交換格式', engine: 'iges' },
  { id: 'obj', ext: 'obj', name: 'OBJ', desc: '網格模型，3D 軟體通用', engine: 'obj', bambu: true },
  { id: 'glb', ext: 'glb', name: 'GLB', desc: 'glTF 二進位，網頁／AR／Blender', convert: 'glb' },
  { id: 'gltf', ext: 'gltf', name: 'glTF', desc: 'glTF 文字版（內嵌資料）', convert: 'gltf' },
  { id: 'ply', ext: 'ply', name: 'PLY', desc: '掃描與點雲軟體常用網格', convert: 'ply' },
  { id: 'amf', ext: 'amf', name: 'AMF', desc: '積層製造格式（Bambu Studio 可開）', convert: 'amf', bambu: true },
  { id: 'off', ext: 'off', name: 'OFF', desc: '學術／幾何軟體網格', convert: 'off' },
  { id: 'urdf', ext: 'urdf', name: 'URDF', desc: '機器人描述檔（含各零件 STL）', engine: 'urdf', multi: true },
  { id: 'solidcraft', ext: 'solidcraft', name: 'SolidCraft 設計檔', desc: '保留參數與時間軸，之後可繼續編輯', engine: 'json' },
];

export const QUALITIES = [
  { id: 'standard', name: '標準' },
  { id: 'fine', name: '精細' },
  { id: 'finest', name: '最精細' },
];
