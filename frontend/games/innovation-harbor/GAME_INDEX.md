# Innovation Harbor 遊戲索引（Game Index）

這份文件索引遊戲裡**每一樣東西**在哪裡、長什麼樣、怎麼換掉。目標：將來你做真實 3D 人物、語音克隆、或老師改劇本時，不用翻程式碼就知道該改哪個檔案的哪一段。分支 `company/story-nodes`，2026-10-15。

快速查找：§2 場景物件 ｜ §3 人物與聲音 ｜ §4 劇本（節點、台詞、選擇、結局） ｜ §5 學習活動與教材 ｜ §6 動作、音效 ｜ §7 數據事件 ｜ §8 參數 ｜ §9 怎麼換成真實素材

---

## 1. 檔案地圖

```
frontend/games/innovation-harbor/
├─ index.html              頁面骨架：載入畫面、章節介紹卡、HUD、目標清單、平板（活動面板）、結局卡
├─ css/ui.css              全部樣式（HUD、對話泡泡、平板、撲克牌、羅盤、玻璃牆標籤）
├─ GAME_INDEX.md           本文件
├─ README.md               啟動方式
├─ assets/
│  ├─ lib/                 人物模型 rpm_male / rpm_female / rpm_preview / rpm_template.glb、水面法線貼圖
│  ├─ anim/                人物動作（Ready Player Me 動作庫，Mixamo 骨架）
│  ├─ avatars/             （預留）外加人物：manifest.json + GLB
│  └─ vehicles/            （預留）真實車輛模型 sedan/van/truck.glb
└─ js/
   ├─ main.js              開機：載資源、建場景、放人物、開場渡輪運鏡、啟動故事圖
   ├─ state.js             遊戲狀態 S：難度、變數、星數、指標、事件
   ├─ data.js              教材：SDG 9-1 三個難度的 12 張投影片（講稿、標題、關鍵字）
   ├─ vocab.js             目標字彙表 GLOSSARY（挖空、干擾選項、找字、口說覆蓋率都用它）
   ├─ i18n.js              介面英文字串、中文提示按鈕
   ├─ speech.js            朗讀（角色聲音）、語音辨識、錄音
   ├─ audio.js             環境音與音效（程式合成）
   ├─ telemetry.js         學習事件紀錄（Learning Log）
   ├─ account.js           讀帳號性別決定主角模型
   ├─ story.js             故事入口：站點標籤 + 跑故事圖 + 結局
   ├─ story/graph.js       故事圖引擎（節點、可用條件、光柱、到站）
   ├─ story/chapter1.js    第一章劇本：8 個 NPC 節點的台詞、選擇、結局
   ├─ activities/          六種學習活動：listening / reading / cardgame(正式卡牌 iframe) / speaking / sequence / pechakucha；cards.js 為原型內建卡牌（未使用）；common.js 選擇題、填字
   ├─ ui/bubble.js         人物頭上的 3D 對話泡泡、雲朵內心想法泡泡、選擇泡泡（永遠夾在畫面內；手機或說話者不在畫面時停靠底部）
   ├─ ui/sheet.js          平板（活動面板）、HUD、提示訊息、星數
   └─ world/
      ├─ scene.js          渲染器、天空與太陽、水面、霧、品質分級、畫面迴圈、心情（dusk/best/dim/fog）
      ├─ materials.js      程序貼圖與材質（混凝土、柏油、磚、貨櫃、玻璃窗……）
      ├─ harbor.js         港口靜態場景：陸地、道路、碼頭、六棟建築、燈塔、防波堤、天際線；STATIONS / SPOTS / PATHS
      ├─ traffic.js        會動的東西：起重機、停靠貨櫃輪、進港大船與拖船、渡輪、帆船、海鷗、旗幟、浮標、風機、無人機、機械手臂
      ├─ vehicles.js       路上的車（轎車、廂型車、貨櫃車）：減速、喇叭、跟車、撞人
      ├─ drive.js          可開的車：上車、駕駛、下車
      ├─ chatter.js        NPC 兩兩聊天與偷聽台詞
      ├─ portals.js        通往第 2、3 章的橋與玻璃牆、牆後剪影
      ├─ characters.js     人物載入、動作重定向、Actor 類別（走路、轉向、播動作）
      ├─ camera.js         鏡頭：跟隨、追尾、越肩、雙人、運鏡、淡出、震動
      └─ roam.js           自由移動：鍵盤／搖桿、跳躍、可走範圍 BLOCKS、光柱與羅盤、被撞倒
```

---

## 2. 場景物件（在哪裡建、怎麼換）

座標：公尺；水面 y=0；陸地（碼頭面）y=0.6（常數 `G`）；z 負方向是海，z 正方向是陸地；x 正方向是東。

| 物件 | 檔案／函式 | 現狀 | 要換成真實模型時 |
|---|---|---|---|
| 陸地、碼頭邊、繫船柱、護舷 | `harbor.js` `buildHarbor()` 開頭 | 幾何體 | 保留（地形），貼圖可換 `materials.js` 的 `T.concreteLand` |
| 渡輪碼頭（x 6–14, z −23–1）＋欄杆＋喇叭柱 | `buildHarbor()` 「ferry pier」段；喇叭柱座標 `SPOTS.speakerPole` | 幾何體 | 換 GLB，位置 (10, 0, −11) |
| 道路 A（z 16–22）、B（z 40–46）、C（x −22–−16）、D（x 36–42）與人行道 | `buildHarbor()` 「roads」段；車道中心線 `vehicles.js LANES` | 幾何體 | 道路貼圖換 `T.asphalt`；車道位置改 `LANES` |
| 樹、路燈、長椅 | `harbor.js` `tree() lamp() bench()` | 幾何體 | 各換 GLB，呼叫處座標不變 |
| 貨櫃堆場（x −60–−16, z 9–13） | `buildHarbor()` 「container quay」段 | 幾何體 | `spawnContainer()` 改載 GLB |
| 停靠貨櫃輪（中心 −38, 0, −8.5） | `traffic.js` `containerShip(48, 11)` | 幾何體（船殼擠出、貨櫃堆、艦橋） | 換 GLB：在 `buildTraffic()` 用 GLTFLoader 載入後放同座標，仍由同一段 `upd` 做搖晃 |
| 橋式起重機 ×2（x −48, −28） | `traffic.js` `api.cranes`（腳、梁、吊車、吊具、貨櫃） | 幾何體＋裝卸狀態機 | 換 GLB 時保留 `trolley / spreader` 群組名稱，狀態機就能繼續動 |
| 進港大船＋拖船（航道 z −96） | `traffic.js` `big / tugs / wake` | 幾何體 | 同上 |
| 渡輪（開場載玩家） | `traffic.js` `ferry()`、`api.ferry` | 幾何體 | 換 GLB，`main.js` 玩家站位 `player.root.position.set(4, 1.6, 2.2)` 依新甲板高度調 |
| 帆船 ×3、漁船 | `traffic.js` `sailboat() fishingBoat()` | 幾何體 | 換 GLB |
| AI 實驗室（玻璃塔 −38, 34；屋頂 AI 核心；戶外螢幕） | `buildHarbor()` 「AI Lab」段；螢幕貼圖 `T.lab` | 幾何體 | 換 GLB；可走範圍方塊在 `roam.js BLOCKS[0]` |
| 資料檔案館（磚造，−4, 60；拱廊、平台） | 「Harbor Archive」段 | 幾何體 | 換 GLB；`BLOCKS[1]` |
| 港務議會（石造，26, 66；台階、柱、穹頂、旗、講台、全息板） | 「Port Council」段；旗桿 `H.flagPoles`；台階高度在 `roam.js groundY()` | 幾何體 | 換 GLB；`BLOCKS[2]`，台階高度要同步改 `groundY()` |
| 創新工坊（鋸齒頂廠房，62, 32；無人機、機械手臂） | 「Innovation Workshop」段；動態在 `traffic.js`（`H.drone / H.arm`） | 幾何體 | 換 GLB；`BLOCKS[3]` |
| 海濱劇場（舞台 27, 5；LED 螢幕；四層看台） | 「Waterfront Theater」段；螢幕內容 `drawScreen()`；看台高度 `H.tiers`、`groundY()` | 幾何體 | 換 GLB；LED 螢幕請保留一個平面讓 `screenTex` 貼上 |
| 燈塔島（70, −70；光束、燈） | 「lighthouse」段；光束開關 `traffic.lighthouse(true)` | 幾何體 | 換 GLB，保留 `H.beam` 群組 |
| 防波堤、航標浮標 | 「breakwater & buoys」段 | 幾何體 | 換 GLB |
| 離岸風機 ×4 | 「wind turbines」段；轉動在 `traffic.js` | 幾何體 | 換 GLB，葉片群組命名 `hub` |
| 天際線 26 棟、填充街廓 | 「skyline」段 | 幾何體＋窗燈貼圖 | 可整組換城市 GLB |
| 路上的車（轎車／廂型車／貨櫃車） | `vehicles.js` `sedan() van() truck()` | 程序建模 | 放 `assets/vehicles/sedan.glb` 等，並在各 builder 前加 GLTFLoader（預留，約 30 行） |
| 可開的車 ×3（碼頭藍轎車 14, 22.7；議會白廂型車 44, 46.8；西側紅轎車 −40, 22.7） | `drive.js` `specs` | 同上 | 同上；輪子群組 `userData.wheels` 前兩個是前輪（會轉向） |
| 通往第 2／3 章的橋與玻璃牆、牆後剪影 | `portals.js` | 幾何體 | 牆後場景將來由真正的第 2、3 章取代 |
| 海鷗、旗幟、水面、天空、霧 | `traffic.js`（海鷗、旗）、`scene.js`（水、天空） | 程序 | 天空可改 HDRI（`scene.environment`） |

---

## 3. 人物與聲音

| 角色 | 身分 | 模型（`main.js makeActor`） | 站位（`harbor.js SPOTS` 或 `main.js`） | 聲音（`speech.js VOICES`） | 台詞在 |
|---|---|---|---|---|---|
| 你（Envoy） | 永續特使 | 帳號女性→`female`，否則 `male`（`account.js`） | 渡輪→碼頭末端 `playerStart` | — | 選擇泡泡 `bubble.js ask()` |
| Harbor Master Mei 梅港長 | 港務局長 | `female`（染色 c8d2e6） | `SPOTS.mei`、議會前 (22, 48.5)、劇場前排 `meiTheater` | `mei`（女） | `chapter1.js` 節點 mei、council、theater |
| Kai 凱 | 實習生 | `preview`（衣服染色） | `SPOTS.kai`、工坊 `kai2` | `kai`（男） | 節點 kai |
| Dr. Hsu 許博士 | AI 研究員 | `female`（染色 9a7f6a） | `SPOTS.hsu`、工坊 `hsu2` | `hsu`（女） | 節點 hsu、workshop |
| Councillor Wang 王議員＋兩位議員 | 議會 | `male` / `female` / `preview` | `SPOTS.wang / councilA / councilB` | `wang`（男） | 節點 council |
| Foreman Lee 李領班 | 貨櫃碼頭工頭 | `preview`（橘色反光衣） | (−21.5, 0.6, 14.3) | 借用 `wang` | 節點 foreman |
| Ana Reyes 記者 | 港灣時報 | `female`（青色） | (18.4, 0.6, 46.2)，隱瞞路線才顯示 | 借用 `hsu` | 節點 reporter |
| HARBOR-AI | 港口 AI | 無模型；碼頭喇叭柱 `SPOTS.speakerPole`、議會全息板 `councilHolo` | — | `ai`（低音） | 節點 mei |
| 路人 ×8、觀眾 ×10、聊天組 ×3 對 | 背景 | `CROWD_KINDS` 隨機＋染色 | `PATHS.crowdA/B/C`、看台 `H.tiers`、`chatter.js PAIRS` | 無（聊天泡泡只有文字） | `chatter.js PAIRS[].lines` |

**換成真實人物**：把 GLB 放 `assets/avatars/`，`manifest.json` 寫 `[{"file":"mei.glb","gender":"f"}]`，載入後鍵名為 `extra0, extra1…`；在 `main.js` 把 `makeActor("female", "Harbor Master Mei", …)` 改成 `makeActor("extra0", …)` 即可。骨架需為 Ready Player Me／Mixamo（`mixamorig` 前綴會自動處理）。身高自動正規化（女 1.68、男 1.78 m）。

**語音克隆接口**：所有台詞都經由 `speech.js speak(text, who)`。要接克隆聲音，只需讓 `speak()` 在 `who` 有對應音檔或 API 時改播音檔／呼叫 TTS 服務並在結束時 resolve；呼叫端（`bubble.js`、各活動）不用改。

---

## 4. 劇本

- **節點**：`story/chapter1.js` `chapter1Nodes(ctx)` 回傳陣列，每個節點 `{ id, title, place, spot:[x,z], stage, requires(vars, done), repeatable, final, run() }`。`run()` 內用 `say()` 講台詞、`ask()` 給選擇、呼叫活動，回傳結果字串；`"retry"` = 節點保持可用；`"END"` = 提早結束。
- **台詞格式**：`say({actor}, { who, role, voice, en, zh, anim })` → 英文、中文提示、聲音、動作（`talk`／`react`／`null`）。
- **內心想法（雲朵泡泡）**：`think({actor}, { who, voice, en, zh, anim, hold })` → 虛線雲朵、三顆小泡泡尾巴、斜體、上下漂浮；不做說話口型。`hold` 毫秒後自動消失（不給就等按「…」）。chapter1 的捷徑：`me()` 玩家心聲、`kT()/wT()/mT()` 凱／王議員／梅的內心話；資料記錄為 `story.thought`。樣式在 `ui.css .bubble.thought`。
- **選擇**：`ask(player, {en, zh}, [{en, zh, ...自訂欄位}], 對話對象)`，回傳被選的物件；變數用 `S.vars`，`bump("integrity", 2)`。
- **變數**：`state.js S.vars`：integrity、evidence、trust、kai、approach、reporter、scandal、hsuBeforeKai。
- **結局**：`chapter1.js ENDINGS` 文案；`decideEnding()` 判定順序；`runEnding()` 場景效果（燈塔、霧、起重機停）與結局卡。
- **站點標籤**：`harbor.js STATIONS`（名稱、標籤位置、鏡頭）。
- **目標清單文字**：節點的 `title / place`。
- **開場介紹**：`index.html` `#intro`。
- 第一章節點圖與結局判定表：`docs/reports/2026-10-15-innovation-harbor-convergence-and-data.md`。

---

## 5. 學習活動與教材

| 活動 | 檔案 | 用到的教材 | 可調參數 |
|---|---|---|---|
| 聽力填空 | `activities/listening.js` | `data.js` Part 1；領班節點自帶一段文字 | A2 選擇、B1/B2 打字；目標字 `vocab.js targetWords()` |
| 閱讀配對＋找字 | `activities/reading.js` | Part 2 ＋兩段干擾 | — |
| 卡牌遊戲 | `activities/cardgame.js` → `/pages/pecha_kucha_builder.html?topic=9-1&parts=2,3,4,5&merge=1&embed=harbor` | 正式卡牌遊戲題庫 | `parts` |
| 口說 | `activities/speaking.js` | Part 4 一張 | 三層：瀏覽器辨識→錄音給老師→麥克風提示；最多 3 次、覆蓋率 ≥ 80% 即過 |
| 排序 | `activities/sequence.js` | Part 5 句子 | 最多 6 句 |
| Pecha Kucha 發表 | `activities/pechakucha.js` | Part 6 | 每張 `SEC = 20` 秒 |
| 教材本體 | `data.js`（由題庫 `pecha_kucha_builder.html` 的 GAME_DATA 複製而來） | — | 換教材：同格式 `{A2:[{no, part, title_en, title_zh, script, keywords}], B1, B2}` |
| 字彙表 | `vocab.js GLOSSARY / COMMON` | — | 新主題要補字彙與釋義 |

---

## 6. 動作與音效

- 動作（`characters.js ANIM_FILES`，檔案在 `assets/anim/`）：idle（男 4 種／女 3 種）、walk、jog、talk（男 4／女 3）、react（表情 8 種）、dance、jump（走跳／跑跳）、fall。`actor.play("talk")` 隨機挑一種；`playFor("fall", 1.6)` 播固定秒數。
- 音效（`audio.js`，全部程序合成）：海浪、風、海鷗、船笛、霧笛、掌聲、提示音、汽車喇叭、撞擊、引擎。要換真實錄音：在對應函式改播 `<audio>`。
- 朗讀速度：HUD「Speed」按鈕，localStorage `cardlearn_tts_rate`，與卡牌遊戲共用。

---

## 7. 數據事件（Learning Log）

事件型別與欄位清單見報告 `docs/reports/2026-10-15-innovation-harbor-convergence-and-data.md` §2；程式入口 `telemetry.js log(type, detail)`；畫面右上「Learning Log」可看；目前只存在瀏覽器（後端事件 API 待做）。

---

## 8. 參數

| 參數 | 位置 | 說明 |
|---|---|---|
| `?q=low|high` | `scene.js quality` | 品質分級（反光水面、陰影、人群數） |
| `?speed=4` | `scene.js SPEED` | 開發用模擬加速 |
| `?avatar=female|male` | `account.js` | 強制主角模型 |
| 走路／跑步速度 3.0／5.4 m/s、跳躍初速 5.6 | `roam.js` | |
| 車速 6–8 m/s（貨車 4.5–5.5）、煞停距離 | `vehicles.js` | |
| 開車極速 15 m/s、倒車 5 | `drive.js` | |
| 光柱高度 60 m、到站半徑 2.6 m | `roam.js makeBeacon() / startRoam()` | |
| 心情（黃昏、最佳結局、暗、霧） | `scene.js setMood()` | 太陽角度、霧、路燈 |

---

## 9. 把場景換成真實素材的建議步驟

1. 先決定素材來源與授權（Sketchfab CC-BY／CC0、Poly Haven、Kenney、自建模）；每個模型壓成 GLB＋Draco，整個場景控制在 60 MB 內（手機）／150 MB（桌機）。
2. 建一個 `assets/models/manifest.json`：`{ "ship_container": "models/ship_container.glb", "crane_sts": … }`，由一個共用的 `loadModel(key)` 載入；`harbor.js / traffic.js / vehicles.js` 的每個 builder 先查 manifest，有就用模型、沒有就用現在的幾何體（漸進替換，隨時可玩）。
3. 動態物件（起重機、渡輪、車）保留群組命名（`trolley / spreader / wheels`），動畫程式不用改。
4. 人物：Ready Player Me 或自建（Blender + Mixamo 骨架）→ `assets/avatars/`。
5. 聲音：每個角色一組克隆聲音檔或 TTS 服務；接在 `speech.js speak()`。
6. 劇本：目標是搬到後端資料庫，讓老師在後台視覺化編輯（節點、台詞、選擇、結局），前端 `chapter1.js` 改成讀資料；這是下一階段的工作。
