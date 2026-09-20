# 3D 場景建置計畫（2026-09-20）

前提修正（見 `evidence-brief-gbl-call.md`）：寫實 3D 的學習效果量近乎零（Wouters et al. 2013：寫實 d=0.14 不顯著 vs 示意式 d=0.46）。因此 **3D 必須是示意化的空間資訊圖解，而且要是謎題的一部分**，不是寫實背景。

## 0. 技術阻礙（先解）

現有頁面直接 `import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.164.1/build/three.module.js"`。但 r164 的 `examples/jsm/*`（GLTFLoader、KTX2Loader、DRACOLoader、OrbitControls）內部用 bare specifier `from 'three'`，**CDN 直載會失敗**。所有 3D 頁必須加共用 import map：

```html
<script type="importmap">
{"imports":{
  "three":"https://cdn.jsdelivr.net/npm/three@0.164.1/build/three.module.js",
  "three/addons/":"https://cdn.jsdelivr.net/npm/three@0.164.1/examples/jsm/"
}}</script>
```

另需統一版本（目前 `index.html` 用 0.166、`loading.html` 用 0.164）。

## 1. 素材授權（逐頁查證）

| 來源 | 涵蓋 | 授權原文 | 結論 |
| --- | --- | --- | --- |
| Kenney（City Kit Commercial / Suburban / Roads、Nature Kit、Furniture Kit、Space Kit） | city / campus / newsroom / lab / nature | kenney.nl/support：「all game assets … are public domain licensed (CC0)」「Attribution is not required」「Do not use our logo」 | **主幹** |
| KayKit City Builder Bits | city 細節 | 「Free for personal and commercial use, no attribution required. (CC0 Licensed)」，勿轉售未修改副本 | 補強 |
| Quaternius | city / nature / lab | 站台 license.html **已從 CC0 改為自有 Quaternius Asset License**（免署名、可商用、禁止再散布素材本身），舊 pack 頁仍寫 CC0 | 只當補件，下載當日截圖存證 |
| Poly Pizza | 零星補件 | 約 69% 是 CC-BY，需署名 `Model by Creator, https://poly.pizza/m/ID` | 只取標明 CC0 者 |

repo 需 `assets/3d/CREDITS.md`，每個 glb 記來源 URL、授權、下載日期；缺一即視為不可上線。

## 2. 效能預算（iPad 9 等級：A13、2160×1620、Wi-Fi 5）

有外部依據：單一 glTF ≤ 100,000 triangles 且 ≤ 5 MB（Khronos glTF Asset Auditor 預設門檻）；LCP ≤ 2.5 s、INP ≤ 200 ms（Core Web Vitals）；mipmap 記憶體成本 +30%（MDN WebGL best practices）。

工程估算值（上線前用 `renderer.info` 真機校正）：每幀 ≤ 150k triangles（硬上限 250k）、≤ 80 draw calls（硬上限 120）、貼圖記憶體 ≤ 48 MB、JS heap ≤ 180 MB、首載傳輸 ≤ 2.5 MB、frame time ≤ 16.7 ms（低階模式降 30 fps）。

技術：`InstancedMesh` + `.count` 控制數量（改儀表零成本）、以街廓為單位 `mergeGeometries`（整城合成一顆會讓 frustum culling 失效）、`THREE.LOD` 兩階、KTX2（`KTX2Loader().setTranscoderPath('/static/vendor/basis/')`）、Draco（`/static/vendor/draco/`）、**pixelRatio 從 2 降到 1.5**（低階 1.0）、背景場景關閉 antialias、用 `renderer.setAnimationLoop()` 取代裸 rAF。

## 3. Pipeline

```bash
npm i -g @gltf-transform/cli
gltf-transform optimize raw/city.glb dist/city.glb \
  --texture-size 1024 --texture-compress ktx2 --compress draco \
  --simplify true --simplify-ratio 0.6 --simplify-error 0.002
# 等效：gltfpack -i raw/city.glb -o dist/city.glb -si 0.6 -tc -cc -mi
```

檔案位置：`frontend/static/3d/sets/<id>/set.glb` 與 `set.json`、`frontend/static/3d/fallback/<id>.svg`、`frontend/static/vendor/{draco,basis}/`、`frontend/static/js/stage/StageShell.js`。檔名帶內容雜湊。

## 4. Stage Shell + 可換 Set

Shell 擁有 renderer、camera、lights、resize、Page Visibility 暫停、loader 單例、LOD、frame-time 取樣、儀表映射、dispose。Set 只提供一顆 `set.glb` 與宣告式 `set.json`（不含程式碼）。

```js
export class StageShell {
  constructor(canvas, { quality = 'auto', orbit = 0.02 }) {}
  async loadSet(setId) {}                    // 先 dispose 舊 set
  setMeters({ emissions, energy, water, crowd, daylight }) {}  // 每項 0..1
  setQuality(level) {}                       // 'high' | 'low' | 'off'（off = 2D）
  setIdle(on) {}                             // 學生閱讀時凍結
  getStats() {}                              // { calls, triangles, fps }
  dispose() {}
}
```

`set.json` handle 型別：`fog`（`scene.fog.near/far` + `lerpColors`）、`sky`（`scene.background`）、`emissive`（材質 `emissiveIntensity`，**不新增 PointLight**，每盞燈會觸發 shader 重編）、`instanceCount`（`inst.count = Math.round(max * v)`，零 GC）、`transform`（水位）、`lightIntensity`。所有變化 0.8 秒緩動，讓學生看得見因果。

## 5. 降級與不搶注意力

偵測順序：取不到 WebGL → 直接 2D；`MAX_TEXTURE_SIZE < 4096` → low；`navigator.deviceMemory ≤ 4` → low（**iOS Safari 回傳 undefined，不可當主要依據**）；**主要依據是 frame-time**：前 90 幀中位數 > 26 ms 降級、持續 > 40 ms 切 2D；`webglcontextlost` → `preventDefault()` 後永久切 2D，不重試。

三級品質 high / low / off。2D fallback 是分層 SVG，meter 只改 CSS 變數，共用同一個 `setMeters()` 介面，呼叫端不需知道現在跑哪一種。

`prefers-reduced-motion` 為真：場景靜止但仍顯示。

**文字面板開啟時呼叫 `setIdle(true)`**：停止所有動畫，canvas 加 `blur(2px) brightness(0.75)`；meter 轉場必須在面板開啟前播完。這是回應「豐富場景干擾閱讀」的證據。

## 6. 載入與快取

冷啟目標 3.0 秒內可互動（教室 30 台共享，保守人均 3–5 Mbps）。three core ~170 KB、Draco wasm ~200 KB、Basis wasm ~240 KB、單一 set 目標 1.2 MB（硬上限 2.0 MB），9 個 set 合計約 11 MB，**絕不同時載入**。

**Vercel 預設是 `max-age=0, must-revalidate`，等於 glb 每堂課被 30 台重抓。** 必須在 `vercel.json` 對 `/static/3d/(.*)` 與 `/static/vendor/(.*)` 設 `public, max-age=31536000, immutable`，HTML 設 `max-age=0, s-maxage=86400`。另提供教師「課前預熱」按鈕一次預抓。

## 7. 風險

| # | 風險 | 偵測 | 緩解 |
| --- | --- | --- | --- |
| 1 | 30 台同時冷載塞爆教室 Wi-Fi | `PerformanceResourceTiming` p90 > 8 s | set 壓到 1.2 MB、選單頁預抓、immutable 快取、課前預熱 |
| 2 | 記憶體累積導致 WebGL context loss | `webglcontextlost`；`renderer.info.memory.textures` 只增不減 | `loadSet()` 強制 dispose，同時只留一個 set；lost 後不重建 |
| 3 | 授權踩雷 | CREDITS.md 完整性檢查 | 主幹只用 Kenney/KayKit；Quaternius 按新授權處理 |
| 4 | 3D 搶走閱讀注意力 | 閱讀面板停留中位數 < 8 s | `setIdle` + 模糊降亮；教師端全域「靜態模式」開關 |
| 5 | 低階裝置偵測失準 | frame-time 中位數 > 26 ms | 以 frame-time 為最終裁決，連兩次降級仍不達標切 2D，回傳遙測 |
