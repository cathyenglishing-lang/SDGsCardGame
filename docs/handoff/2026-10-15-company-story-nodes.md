# 交接文件：Innovation Harbor 故事節點版（2026-10-15，公司端 AI）

接續 `2026-10-14-innovation-harbor-handoff.md`。本文件記錄公司端 AI（Claude Code，作者 machen@compeq.com.tw）在 **2026-10-15** 於分支 `company/story-nodes` 做的事、為什麼、怎麼測、哪些沒驗證、下一步。先讀 §1 再依需要讀其他節。

---

## 1. 今日結論（先看這裡）

| 項目 | 狀態 |
|---|---|
| 分支 | `company/story-nodes`（**未併入 `main`**，正式站不受影響） |
| 使用者 2026-10-15 的新要求 | 見 §2；已做：NPC 節點圖、可自由順序、車輛反應與撞擊、NPC 兩兩聊天、跳躍、未解鎖章節玻璃牆、方向指引（羅盤＋光柱）、第三人稱追尾鏡頭、**可開車**、卡牌遊戲每個 SDG 只開一題。未做：9-2、9-3 新場景、人物外觀變化（需要素材，見 §6）。 |
| 測試 | 以 Playwright 自動完整試玩（§5）走到結局 The Evidence Speaks；開車、下車、被車撞的流程各自驗證過。**真人、真麥克風、平板觸控未驗證。** |
| 文件 | 本文件 + 收斂與數據報告（§7 連結） |

---

## 2. 使用者 2026-10-15 的要求與對應

使用者看完 10-14 的版本後的回饋（原話摘要）：
1. 「NPC 都講同一個話很無聊」→ 否決「共用引擎＋每章資料檔」的講法；要 **NPC 就是故事節點**，依對話結果走向不同節點，最後收斂多個結局。
2. 場景要更逼真：車子被撞到的樣子、NPC 聊天的樣子、可以跳躍。
3. 未解鎖場景用透明玻璃隔開但看得到。
4. SDG 9 三部曲：9-1 短篇 20–30 分、9-2 中篇 40–50 分、9-3 長篇 60–90 分；**9-2、9-3 各做新場景**（Signal Hill 研究園區／Automation Valley）。
5. 舊卡牌遊戲每個 SDG 只保留最完整的一題，其他看得到但**對所有人**上鎖。
6. 試玩後再補：人物都長得一樣；車子與場景不夠真實；點了人物不知道往哪走、看不到光圈；想開車；只用第三人稱視角行動。
7. 管理員帳號 `asd0389wsx0216@gmail.com`（密碼在對話中）— 公司端無 `DATABASE_URL`、無 Railway 登入，**無法建立**；請在 Railway Variables 設 `INITIAL_ADMIN_EMAIL`/`INITIAL_ADMIN_PASSWORD` 後重新部署，或把 `DATABASE_URL` 放進本機 `.env` 由 AI 跑腳本。建好後請改密碼。
8. 要兩份文件：收斂與數據報告（給使用者）、詳實工作紀錄（給接手 AI，即本文件）。

---

## 3. 改了什麼（`frontend/games/innovation-harbor/`）

| 檔案 | 內容 |
|---|---|
| `js/story/graph.js` | **新增** 故事圖引擎：`StoryGraph(nodes, ctx)`。每輪計算可用節點（`requires(vars, done)`），全部顯示光柱，玩家自由走到任一個；`run()` 回傳結果，`"retry"` 不算完成，`"END"` 提早結束。 |
| `js/story/chapter1.js` | **新增** 第一章 8 個節點（Mei、Kai、Dr. Hsu、Foreman Lee（支線）、記者 Ana（只在隱瞞路線出現）、議會、工坊、劇場）、台詞依變數變化、6 種結局（含提早結局 Front Page）與判定 `decideEnding()`。 |
| `js/story.js` | 改為薄殼：站點標籤＋跑圖＋結局。舊的六站線性流程已移除。 |
| `js/state.js` | `vars` 加 `evidence / trust / scandal / reporter / hsuBeforeKai`；`done` 路線；`metrics` 加 `hits / jumps / eavesdrops / walkSec / driveSec / bumps`。 |
| `js/world/roam.js` | 重寫：多目標光柱（60 m 光柱＋浮動箭頭，主要目標橘色）、HUD 羅盤 `#compass`、空白鍵跳躍（`jump` 動作）、被撞倒（`knockdown`）、議會台階高度、`roamInput()` 給開車用、`setDriving()`。 |
| `js/world/vehicles.js` | **新增** 轎車／廂型車／貨櫃車（程序建模，煞車燈、車頭燈、後照鏡、車門縫、車牌、clearcoat 烤漆），四條車道，前方有人減速按喇叭、跟車、真撞到時急停＋玩家踉蹌（`fall` 動作）＋鏡頭震動＋記錄 `safety.hit`。取代 `traffic.js` 的舊卡車。 |
| `js/world/drive.js` | **新增** 可開的車（碼頭藍轎車、議會白廂型車、西側紅轎車）：靠近按 E 或點「E · Drive」上車，WASD／搖桿駕駛，追尾鏡頭，撞牆回彈（`drive.bump`），E 下車；開車到目標光圈會自動到站。 |
| `js/world/chatter.js` | **新增** 三組 NPC 兩兩聊天（碼頭工人、學生、議會職員），輪流說話＋手勢＋小泡泡，走近 9 m 可偷聽（記 `story.overhear`），台詞是劇情提示。 |
| `js/world/portals.js` | **新增** 東西兩座橋＋磨砂玻璃牆（第 2、3 章），牆後有山坡校園／工業區剪影與燈光，標籤「Locked · finish Chapter 1」，靠近提示。`unlock(key)` 預留。 |
| `js/world/camera.js` | 追尾鏡頭：自由移動時相機自動繞到角色背後（拖曳後 1.2 秒內不介入）；`shake()`。 |
| `js/world/characters.js` | 動作加 `jump_m/f`、`fall_m/f`、表情 004/010；`playFor()`；**外加人物清單** `assets/avatars/manifest.json`（§6）。 |
| `js/audio.js` | 汽車喇叭、撞擊聲、引擎聲。 |
| `js/main.js` | 新 NPC（李領班、記者 Ana）、車輛、聊天、玻璃牆、可開的車；`startBtn` 防重複觸發（之前自動測試時 run.start 觸發兩次，跑了兩條故事線）。 |
| `index.html` / `css/ui.css` | 「Talk to」目標清單取代「Next stop」；HUD 加 Evidence、⚠ 撞擊次數；羅盤；跳躍／開車按鈕。 |
| `assets/anim/` | 新增 8 個動作檔（跳、跌、表情）。 |
| `frontend/pages/pecha_kucha_builder.html` | `PK_OPEN_TOPICS = ["4-1","5-1","9-1","13-1"]`；其他主題灰階＋🔒，`pkStartGame` 拒絕；`embed=harbor` 不受限（3D 遊戲仍可開任何主題）。 |

### 3.1 第一章節點圖

```
Mei（碼頭，聽力）
 ├─▶ Kai（實驗室，閱讀）─ 選擇：陪查(+2 誠信,+證據) / 通報(+1,+證據) / 隱瞞(−2) ─┐
 ├─▶ Dr. Hsu（檔案館，正式卡牌遊戲）+證據                                     │ 任意順序，台詞互相引用
 └─▶ Foreman Lee（貨櫃碼頭，支線：一題聽力填空）答對 +證據 +信任；答錯可再來  │
隱瞞 ──▶ 記者 Ana（議會廣場）：說實話(+2) / 不評論(−1) / 否認(−2, scandal)
議會（需 Kai+Hsu）：scandal → 提早結局 Front Page；證據 < 2 → 退回（retry）；否則口說
 └─▶ 工坊（排序＋政策選擇：查證/禁用/照單全收）──▶ 劇場（Pecha Kucha）──▶ 結局
```
結局判定順序：Front Page（scandal 到議會）→ Fog（照單全收，或隱瞞且未選查證）→ Standstill（禁用）→ Harbor of Integrity（查證＋誠信≥3＋證據≥2＋平均星≥2.3）→ The Evidence Speaks（查證＋證據 3）→ Proceed with Caution。

---

## 4. 做法上的決定與原因

- **節點不是「站點」**：節點綁 NPC 與其目標；同一個 NPC（Dr. Hsu）在不同節點有不同台詞；Kai／Hsu 會依「誰先見到」改開場白。這是回應「NPC 都講同一個話」。
- **證據機制**讓順序有意義：議會沒兩個來源就退回，支線（領班）成為有用的選擇而非裝飾。
- **卡牌活動用正式卡牌遊戲 iframe**（沿用 10-14 做法），原型內建卡牌 `activities/cards.js` 保留未用。
- **車輛碰撞只做「反應像真的」**：three.js 做不到車體變形；做急停、喇叭、燈、人倒地、鏡頭震動。
- **開車用與走路同一張可走地圖**，所以車不會穿牆、不能上鎖住的橋；到站自動下車。
- **玻璃牆用 BLOCKS 擋**，牆後的區域是剪影＋燈光，不是可玩場景（9-2、9-3 尚未做）。

---

## 5. 如何測試

```bash
python scripts/serve-frontend.py 8766
# http://127.0.0.1:8766/games/innovation-harbor/?q=low&speed=4   （speed 只是開發加速）
```
- 主控台 `window.__dbg` 多了 `foreman, reporter, vehicles, drivable, portals, chatter`。
- 自動試玩：`scripts/playtest/harbor-nodes-playthrough.js`（節點圖版，含五種尺寸版面檢查，見 §10）。
- 驗證過：mei→foreman→kai(help)→hsu→council→workshop→theater → The Evidence Speaks；開車上下車；站在車道被車撞倒。
- **沒驗證**：真人操作手感、平板搖桿＋開車、真實語音、隱瞞／記者／Front Page 路線（邏輯寫了、未自動跑）、`npm run build`（待跑）。

---

## 6. 素材：需要家裡端（無公司代理）協助下載

公司代理擋住 readyplayer.me、Mixamo 需登入，所以人物只有 4 個模型（`rpm_male / rpm_female / rpm_preview / rpm_template`），使用者反映「人物都長得一樣」。程式已預留：

1. **更多人物**：在 https://readyplayer.me 建 8–12 個不同臉孔／服裝的全身 avatar，匯出 GLB（T-pose，`?pose=T`），放到 `frontend/games/innovation-harbor/assets/avatars/`，並寫 `manifest.json`：
   ```json
   [{ "file": "worker1.glb", "gender": "m" }, { "file": "nurse.glb", "gender": "f" }]
   ```
   載入後自動加入路人／觀眾池；要指定給主要 NPC 改 `main.js` 的 `makeActor(kind, …)` 即可。Mixamo 角色（FBX→GLB）也可，骨架為 `mixamorig` 時會自動加前綴。
2. **車輛模型**（CC0）：建議 Kenney「Car Kit」或 Quaternius「Vehicles」，轉成 GLB 後放 `assets/vehicles/`（`sedan.glb`、`van.glb`、`truck.glb`）；目前 `vehicles.js` 尚未讀取外部模型，接上約 30 行（在 `sedan()/van()/truck()` 前先嘗試 GLTFLoader）。
3. 素材授權在正式推廣前要再確認（RPM 動作庫與 avatar 條款）。

---

## 7. 下一步（依使用者要求排序）

1. 使用者實機試玩本分支（開車、羅盤、光柱、追尾鏡頭、撞車、偷聽）→ 修手感。
2. 人物／車輛素材（§6）。
3. 9-2 Signal Hill 研究園區（中篇 40–50 分，新場景＋新節點圖）；9-3 Automation Valley（長篇）。世界地圖上透過東西兩座橋連接，`portals.unlock()` 開門。
4. 遊戲列表改成「SDG 9 · AI 系列」一張卡列三章（等 9-2 做出來再改）。
5. `scripts/playtest/harbor-playthrough.js` 改成節點圖版。
6. 學習紀錄存後端（事件 API）；目前仍只在瀏覽器。
7. 收斂與數據報告：`docs/reports/2026-10-15-innovation-harbor-convergence-and-data.md`（同日產出，內容與本文件 §3.1 一致，另列每個節點收集的數據欄位）。

---

## 8. 回復方式

- 整個節點版：不併入 `main` 即可；`main` 仍是 10-14 的線性版。
- 只回復卡牌遊戲上鎖：`PK_OPEN_TOPICS` 改回全部或刪除 `pkTopicOpen` 檢查。

---

## 9. 同日下午：學習數據層 ＋ 老師分析後台 ＋ Excel（第二次提交）

使用者決定：先做資料層與分析後台，學習數據**另開一個資料庫**；之後才做老師劇本編輯器與真實素材。

| 檔案 | 內容 |
|---|---|
| `backend/learning.py` | **新增** 獨立模組，自己的資料庫：`LEARNING_DATABASE_URL`（PostgreSQL）或 `sql/learning.db`（SQLite 預設）。表：`learning_runs`（每次遊玩：學生、章節、難度、結局、變數、星數、指標、路線）、`learning_events`（每個事件：seq、秒數、階段、節點、型別、說明、結構化 data）。學生端：`POST /learning/runs`、`POST /learning/events`（批次、以 run_id+seq 去重）、`POST /learning/runs/{id}/finish`（token 可有可無；有就帶 user_id）。老師端：`GET /learning/analytics`（篩選 chapter/level/from/to/user，彙整結局、各階段星數、漏掉字彙、重播分布、選擇、節點退回、路線、口說模式、探索行為、學生總表、時間線）、`GET /learning/runs`、`GET /learning/runs/{id}/events`、`GET /learning/export.xlsx`（openpyxl，8 張工作表：Summary、Runs、Students、Vocabulary、Endings、Choices、Routes、Events）。 |
| `backend/main.py` | 只加三行掛載 + `/learning` 進限流清單；`.env.example` 加 `LEARNING_DATABASE_URL`。 |
| `frontend/games/innovation-harbor/js/telemetry.js` | `log(type, detail, data)` 第三個參數是結構化資料；事件先排隊，每 4 秒或 25 筆送一批；`startRun()` 在 run.start、`finishRun()` 在結局；離線存 localStorage，關閉分頁用 sendBeacon 補送。遊戲永遠不等伺服器。 |
| 各活動 / 節點 | 關鍵事件都帶 `data`：`listen.answer {word, wrong, plays}`、`read.find {word, wrong}`、`speak.attempt {coverage, missed}`、`pk.slide`、`card.done {errors, repeats, seconds}`、`story.choice {key, value, d}`、`node.start/done {node, outcome, vars}`、`safety.hit`、`drive.*`、`story.overhear`、`ending {key, avg, integrity, evidence, route}`。 |
| `frontend/js/api.js` | `api.teacher.learningAnalytics / learningRuns / learningRunEvents / learningExport`。 |
| `frontend/pages/teacher_dashboard.html` | 新分頁「3D 故事 · 學習分析」（`data-module="story_analytics"`）：篩選列、7 個 KPI、結局甜甜圈、各階段星數、每日趨勢、漏字排行、重播分布、劇情選擇、節點退回、路線、探索／口說模式、學生總表（點一列篩選）、最近遊玩（點一列展開事件）、匯出 Excel。 |
| `frontend/config.js` | 本機測試可用 `?api=http://127.0.0.1:8001` 指到別的後端埠。 |
| `frontend/pages/pecha_kucha_builder.html` | 修正上鎖補丁留下的引號錯誤（整頁曾無法執行；原因是工具層吃掉反斜線，已改用不含反斜線的寫法）。 |

**部署前要做**：Railway 新增一個 PostgreSQL 服務，把它的連線字串設成後端的 `LEARNING_DATABASE_URL`（沒設就寫本機 SQLite，Railway 重新部署會清掉）；`psycopg[binary]` 已在 requirements。

**測試（本機）**：`.venv` 以 Python 3.14 安裝了較新的 fastapi/pydantic（requirements 的舊 pin 在 3.14 沒有 wheel；requirements 未改）。後端 `INITIAL_ADMIN_EMAIL=… FRONTEND_ORIGINS=http://127.0.0.1:8766 uvicorn backend.main:app --port 8001`；遊戲 `?api=http://127.0.0.1:8001`。兩次自動試玩（一次 help 路線、一次 hide→記者否認→Front Page 提早結局）共 108 筆事件進資料庫；`/learning/analytics` 彙整正確；Excel 匯出 8 張表；後台分頁用 Playwright 截圖檢查過版面與事件展開。
**沒驗證**：PostgreSQL 版（只跑過 SQLite）、大量資料效能（analytics 一次載入所有 runs 的事件，超過數千次遊玩要分頁或預先彙整）、真實學生帳號、Excel 在 Excel/Numbers 的開啟外觀。

**案例研究與素材來源**：寫在 `docs/reports/2026-10-15-innovation-harbor-convergence-and-data.md` §5–6（Crystal Island 把 NPC 對話當數據並加反思提示；Shute 的隱性評量／證據中心設計；POMY 對話遊戲的提示與錯誤回饋；台灣 3D EFL 研究；老師儀表板研究指出要簡單、對應學習目標、與老師共同設計）。對後台的影響：下一版把每個活動對應到能力指標，並請老師一起挑指標。

## 10. 同日傍晚：全流程自動試玩、任意尺寸不跑框、雲朵內心想法（第三次提交）

使用者要求：「用 Playwright 跑完一次確定無任何 bug 跑框」「任何尺寸的瀏覽器都要能用、元件不跑框不遮擋」「多一點不一樣，例如雲泡泡動畫表示角色內心想法」。

**試玩腳本** `scripts/playtest/harbor-nodes-playthrough.js`（節點圖版，取代 10-14 的舊版）：登入本機管理員、假造瀏覽器語音辨識（唸出目標句，讓口說與 Pecha Kucha 真的跑完）、第一段用鍵盤走（測漫遊＋羅盤）、其餘 Skip walk、iframe 內把 8 張牌配完、每個活動自動作答；每到新畫面（目標清單、前三段對話、每個活動、第一張 PK 投影片、結局）都把視窗切成 390×844、768×1024、1024×768、1366×800、1920×1080 五種尺寸，檢查所有可點元件與泡泡是否在畫面內、面板是否重疊 >15%，並檢查說話者是否在鏡頭內／被幾何擋住。跑法：Playwright MCP `browser_run_code`（filename）；MCP 斷線時用 node 直接跑（`scratchpad/run-playtest.cjs` 的做法：從 npx 快取 `require('playwright')`、`channel:'chrome'`、`--use-angle=swiftshader`），約 7 分鐘。

**找到並修掉的問題**
| 問題 | 原因 | 修法 |
|---|---|---|
| Skip walk 傳送後 NPC 不在畫面、泡泡飛到畫面外 | 鏡頭從舊位置慢慢飛過來；加上骨架世界矩陣在傳送同一幀還是舊的 | `camera.js setFollow({instant})` 下一幀直接貼到人物後方；`shot({cut:true})`：目標鏡位距離 >4 m 就硬切（overShoulder／twoShot／frontShot 都用）；`characters.js setPos/face` 後 `updateMatrixWorld(true)` |
| 泡泡在小螢幕被截掉 | 原本交給 CSS2DObject，不會夾在畫面內 | `bubble.js` 改成每幀手動定位 `place()`：夾在視窗內（上方留 72px 給 HUD）、頭太高就改在頭下方（`.below`）、說話者在鏡頭後方或太偏、或手機寬度（<760）就停靠底部（`.docked`）；泡泡寬度固定（取消手機 `width:auto`，否則 auto 寬度會跟著舊的 left 撐大而鎖死在畫面外） |
| 結局卡在手機上看不到上半部、按鈕按不到 | `.cover` 用 grid 置中，內容比螢幕高時上下都溢出 | 改 flex + `.card{margin:auto}`，可從頂端捲動 |
| 主控台 404 | `assets/avatars/manifest.json` 不存在 | 放空的 `[]`（之後要加頭像就填這個檔） |
| 內嵌卡牌遊戲打到 8000 埠 | iframe 沒帶 `?api=` | `cardgame.js` 轉傳 `api` 參數（只影響本機測試） |
| 試玩把「停靠泡泡」誤判為跑框 | 軟體渲染下 resize 事件 350 ms 內還沒觸發 | 測試改成等兩個 `requestAnimationFrame` 再量 |

**雲朵內心想法** `bubble.js think()`：虛線雲朵、三顆小泡泡尾巴、斜體、上下漂浮、不做口型，按「…」或 `hold` 毫秒自動消失；記錄 `story.thought`。chapter1 加了四處：梅說完開場後玩家心聲、凱坦白後凱的內心話（`anim:"react"`）、議會王議員的內心話（依證據數不同）、上台前玩家心聲（6 秒自動消失）。捷徑 `me()`、`kT()/wT()/mT()`。

**最後一次試玩結果**：7.3 分鐘，mei→foreman→kai(help)→hsu→council→workshop→theater → The Evidence Speaks；4 個雲朵泡泡；PK 兩張投影片各 20 秒、麥克風即時分數；79 筆事件；五種尺寸的目標清單／對話／活動／PK／結局都沒有跑框或重疊；唯一剩下的是 `/favicon.ico` 404（無害）。截圖在 `.playwright-mcp/report/nodes-*.jpg`（不進 repo）。
**沒驗證**：真人在手機上的觸控手感（搖桿＋跳躍＋開車按鈕同時出現時的擁擠度只看了截圖）、`hide` 路線在這版的鏡頭切換、`think()` 用在沒有 listener 的 NPC 上（目前都有）。
**觀察到但沒修**：議會兩位議員的待機動作有一位身體歪斜（動畫重定向問題，見截圖 `nodes-line-Councillor_Wang.jpg`）。

## 11. 同日晚上：故事表現手法三件組（第四次提交）

使用者對「多一點不一樣」的回覆是「好試試看」，所以三種都做了小規模版本，集中在新模組 `js/ui/fx.js`（樣式在 `ui.css` 最後一段）：

| 手法 | API | 用在哪 |
|---|---|---|
| 情緒圖示 | `emote(actor, kind, ms)`，kind：`! ? idea worry ok love angry sweat music` | 梅「太完美了」❓、李領班「看到二號起重機？」❗、凱坦白前 💦、幫忙 ✅／通報或隱瞞 😟、許博士解釋 💡、王議員聽到證據 ❗／證據不足 💢 |
| 字卡 | `titleCard({kicker, title, zh, sub}, ms)` 左側滑入的下三分之一字卡 | 開場「Chapter 1 · Can We Trust AI?」（`main.js`）；每個節點第一次抵達出地點字卡 1.4 秒（`graph.js`，final 節點除外） |
| 回憶閃回 | `flashback(fn, {caption, zh})` 白閃→褐色＋暗角＋上方標題→fn→白閃回來 | 李領班節點：重播「上週二」——鏡頭切到二號起重機、卡車按喇叭、起重機凍結（`traffic.cranes[1].frozen`），6 秒 |

資料記錄：`story.emote {who, kind}`、`story.title {kicker, title}`、`story.flashback {caption}`。

**踩到的坑**：情緒圖示第一版用 CSS 動畫改 `transform`，把 CSS2DRenderer 定位用的 inline transform 蓋掉，圖示卡在畫面左上角；改成動畫套在內層 `<span>`。任何掛在 3D 物件上的 CSS2D 元素都不能在同一個元素動 `transform`。

**試玩**：加入三種特效後整輪 8 分鐘，路線與結局不變，93 筆事件（其中 14 筆特效）。試玩腳本現在會各截一張 `nodes-fx-title/flash/emote.jpg` 並檢查情緒圖示有跟著頭。
**沒驗證**：閃回在手機直式的鏡位（起重機可能只看到一半）；地點字卡與手機停靠泡泡的先後（字卡等完才出對話，不會同時出現）。

## 12. 同日深夜：場景細節手刻 —— 港口擺設、角色配件、議員姿勢（第五次提交）

使用者說「繼續」（先前答應的細節修整）。兩個新模組，都是用基本幾何手刻、不需要外部素材：

| 檔案 | 內容 |
|---|---|
| `js/world/dressing.js` `buildDressing()` | 岸邊：繫船柱之間的鬆垂繩索（TubeGeometry 沿二次貝茲曲線）、輪胎護舷、碼頭欄杆上的救生圈；貨櫃碼頭：棧板＋油桶（四色）＋木箱、停著的堆高機（含護頂架、桅桿、貨叉、警示燈）、三角錐、兩座投光燈塔（登記 `registerLamp` 隨夜色亮起）、電纜捲盤、禁止進入牌、工務貨櫃屋（有窗、門、冷氣、門燈）；街道：六處斑馬線（每條步行路線穿越馬路的地方）。固體物件都呼叫 `addBlock` 讓玩家與車子繞行。 |
| `js/world/outfits.js` | 掛在骨頭上的配件：安全帽（Head）、鴨舌帽（Head）、眼鏡（Head +7 cm）、反光背心（Spine2，前後薄板＋肩帶＋側帶，不是一個大方塊）、識別證吊牌（Spine2）、背包（Spine2 後方）。`dressRandom(actor, i)` 依序號決定路人／觀眾的穿搭（約 2/3 的人有配件）。主要角色：李領班白色安全帽＋背心、許博士眼鏡＋吊牌、凱吊牌、王議員眼鏡、梅吊牌、議員 B 眼鏡。 |
| `js/world/characters.js` | `actor.idleVariant`：指定待機動作版本。主要角色固定用第 0 個（基本站姿）；「variations」版本會換腳重心、歪頭，站在講台上看起來像壞掉（截圖 `nodes-line-Councillor_Wang.jpg` 的歪斜議員就是這個）。路人／觀眾仍隨機。 |

**骨頭軸向（實測，之後做配件要用）**：RPM 骨架所有骨頭 local **+z = 角色正前方、+x = 角色右手邊、+y = 上**；bone world scale 0.968（配件群組用 `unscale()` 補回公尺）。脊椎骨在軀幹**背面**，胸前的東西要 +z 0.13–0.17；眼睛在 Head 骨原點上方約 0.07。第一次做錯是因為把背心做成置中大方塊、前面陷進胸口，不是軸向反了。
**沒驗證**：配件在跑步／跌倒動畫下有沒有穿模（只看了站姿）；手機低畫質（`q=low`）下投光燈塔與貨櫃屋的 draw call 影響（估計 <40 個 mesh，應無感）。
