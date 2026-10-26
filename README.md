# 小柯機器人3D繪圖與列印工具

以 **SolidCraft** 開源參數化 CAD 繪製 3D 草圖與模型，一鍵送到 **拓竹 Bambu Studio**（建議 V2.8.2.61）切片列印。

**開發者：吳玉柱 先生與 Claude AI Opus 5.5**

## 功能

- **完整的 SolidCraft 3D 繪圖**：草圖（直線、矩形、圓、圓弧、多邊形、槽、雲形線、文字…）、拘束與尺寸、擠出、旋轉、掃掠、疊層、圓角、倒角、薄殼、孔、螺紋、陣列、鏡射、組裝、鈑金……SolidCraft 的所有功能都在，介面完整繁體中文化。
- **小柯草圖精靈**：12 種常用 3D 列印零件範本（圓角方塊、圓柱／圓管、杯子／筆筒、收納盒、四孔安裝板、文字名牌、鑰匙圈吊牌、六角螺帽、手機架、花瓶、彈簧、球／半球），填尺寸就建好參數化模型，之後仍可在 SolidCraft 修改。
- **中文文字工具**：把繁體中文轉成草圖外框（思源黑體、微軟正黑體、標楷體、細明體），可做立體字、名牌、刻字。
- **列印助手**：選擇拓竹印表機（A1 mini、A1、P1P、P1S、P2S、X1C、X1E、H2S、H2D），自動檢查模型是否放得進列印範圍，估算線材重量與長度。
- **一鍵送到 Bambu Studio**：匯出 3MF 並直接用 Bambu Studio 開啟；沒安裝時可在 App 內下載官方 V2.8.2.61 安裝檔。
- **匯出所有 3D 格式**：3MF、STL（二進位／文字）、STEP、IGES、OBJ、GLB、glTF、PLY、AMF、OFF、URDF、SolidCraft 設計檔。
- **版本更新**：App 內檢查 GitHub 最新版本並一鍵更新。

## 平台

| 平台 | 狀態 |
|---|---|
| Windows 11 桌機版 | ✅ 安裝版與免安裝版，一鍵開啟 Bambu Studio |
| macOS（MacBook Pro）桌機版 | ✅ Apple 晶片（arm64）與 Intel（x64）dmg |
| 線上版 | ✅ https://achir1015.github.io/xiaoke-3d/（Chrome／Edge，免安裝；下載 3MF 再用 Bambu Studio 開啟） |

下載桌機版：[GitHub Releases](https://github.com/achir1015/xiaoke-3d/releases/latest)

### macOS 第一次開啟
安裝檔尚未經 Apple 公證：把 App 拖進「應用程式」後，第一次請在 App 上按右鍵 →「打開」→「打開」。

## 開發

需要 Node.js 22.12 以上。

```bash
npm install          # 會自動下載 SolidCraft 網頁版引擎並繁體中文化
npm start            # 啟動
npm test             # 單元測試
node e2e/smoke.mjs   # 桌機版端對端測試
node e2e/web.mjs     # 線上版端對端測試（Chrome）
node e2e/bambu.mjs   # 實機送到 Bambu Studio（需已安裝）
npm run dist:win     # 建立 Windows 安裝檔與免安裝版（dist/）
npm run build:web    # 建立線上版（site/），npm run serve:web 本機預覽
```

## 授權與致謝

- 本程式：MIT
- [SolidCraft](https://github.com/tangency-labs/solidcraft)（MIT／Apache-2.0）：3D 繪圖引擎，使用官方網頁版發行檔，安裝時把介面的中文目錄換成繁體中文。
- [Bambu Studio](https://github.com/bambulab/BambuStudio)（AGPL-3.0）：獨立安裝的切片軟體，本程式不內含、不連結其程式碼，只負責以檔案開啟它。
- [Noto Sans TC](https://fonts.google.com/noto/specimen/Noto+Sans+TC)（SIL OFL 1.1）、fontkit（MIT）、Clipper（Boost）、OpenCC（Apache-2.0）。

SolidCraft 與 Bambu Studio 為其各自所有者的專案，本工具與其無隸屬關係。
