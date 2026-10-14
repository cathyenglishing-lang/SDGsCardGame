# 交接文件：SDGs 教材與 Innovation Harbor 3D（2026-10-14）

寫給明天接手的公司端 AI 與開發同仁。之後這個專案由公司端 AI 與 Claude（使用者電腦上的 Claude Code）協作，這份文件是兩邊共用的起點。內容依據到 2026-10-14 為止的對話與 git 紀錄整理；只寫查證過的事，沒驗證的會標明。

先讀第 1、2 節，再依工作內容讀其他節。

---

## 1. 接手前必須知道的規則

| 規則 | 原因 |
|---|---|
| **推到 `main` 就是上線。** Vercel 監看 `main`，push 後約 1 分鐘部署到 https://www.cathylanguagehub.com 。Railway 後端也從這個 repo 部署。 | 老師正在用正式站。改動先推功能分支，跟使用者確認後再進 `main`。 |
| **`.env`、`.env.local`、`sql/app.db` 永遠不上傳、不貼到任何外部服務。** | 含正式環境密鑰，資料庫可能含使用者個資。 |
| **`dist/` 是產生物。** 只改 `frontend/`，用 `npm run build` 重建。 | `CLAUDE.md`、`AGENTS.md` 的既有規則。 |
| **舊卡牌遊戲要能一鍵回復。** 2026-09-20 使用者拍板：`frontend/pages/pecha_kucha_builder.html` 要保持可用，新遊戲不好時能立刻退回。 | 2026-10-14 為了整合 3D 遊戲，這個頁面**被修改了**（見 §4.3）。如需回復，見 §6。 |
| 使用者要求的溝通方式：分章節回報、先給結論、能測的先實測再說完成。 | 使用者以玩家角度驗收（「好不好玩」），會在平板上實際試玩。 |
| 不刪除、不改寫 `dev/security-audit-findings.docx`（舊檔名 `漏洞風險.docx`）的內容。 | 使用者明確說「都不用刪跟更改」。文件記錄了尚未輪替的正式環境密鑰與已知弱點，**仍未處理**；是否處理由使用者決定。 |

---

## 2. 帳號、repo、部署地圖

### GitHub：`cathyenglishing-lang/SDGsCardGame`

舊名 `SDGsCardGame3.0`，2026-10-13 改名，舊網址會自動轉址。

| 分支 | 內容 | 狀態 |
|---|---|---|
| `main` | 正式站程式碼，含 Innovation Harbor 3D | 正式部署中，最新 `505eaba` |
| `feat/harbor-3d-live` | 2026-10-14 的 3D 上線工作，已全部併入 `main` | 與 `main` 相同 |
| `feat/mission-engine` | 教材線：品質閘門、51 個任務的撰寫、Node 1 原型、決策紀錄 `docs/plans/conversation-log.md` | 未併入 `main` |
| `chore/tidy-repo-structure` | 整理 repo 根目錄、`dev/` 檔名正式化、README 結構說明 | 未併入 `main` |

協作者：`Iwatchyouwatchme`（write）。使用者想把它升為 admin；個人帳號的 repo 沒有 admin 角色，需要先建立 GitHub 組織再轉移 repo。**尚未進行**，轉移前要先跟使用者確認，轉移後要重新連 Vercel 與 Railway 的 Git 設定。

### Vercel（team `emi2026`，帳號 cathyenglishing-2225）

| 專案 | 用途 |
|---|---|
| `sdgscardgame-frontend` | **正式前端**，綁定 www.cathylanguagehub.com，build `npm run build`、輸出 `dist/` |
| `sdgscardgame-legacy-backend-unused` | 舊的 Vercel 後端，已不用（後端在 Railway） |
| `20ps-emi-professor-game-rz8d` | 與本專案無關，不要動 |

2026-10-13 為了「上 Vercel 一眼看出是正式環境」而改名（原名 `sd-gs-card-game3-0-v171`、`sd-gs-card-game3-0`）。

### Railway

正式後端 API：`https://web-production-ee62.up.railway.app`（從正式站 `/static/config.js` 讀到）。CORS 已允許 www.cathylanguagehub.com。
**未完成**：使用者希望 Railway 專案也改成一致的名稱（例如 `sdgscardgame-backend`）。Railway CLI 已裝在使用者電腦，但還沒登入（`railway login` 要使用者在瀏覽器授權）。改名前要先確認前端的 API 網址不受影響。

---

## 3. 討論與決策時間線

### 3.1 2026-09 中旬到 09-25：教材線與遊戲設計（細節在 `feat/mission-engine` 分支）

完整紀錄：`feat/mission-engine` 分支的 `docs/plans/conversation-log.md`（分階段的決策紀錄）與 `docs/plans/PROGRESS.md`（教材進度表）。摘要：

1. **起點**：使用者要求以教育科技專家身分分析既有教材與遊戲，走「分析、提案、取捨、提問、決策」流程，標記 `[DECISION REQUIRED]`／`[PROPOSAL]`。現有遊戲被評為「無聊、都是文字、沒有故事性」。
2. **2026-09-20 鎖定的範圍**（D1–D17）：所有任務、所有難度一起上線，不做縮小版 MVP；舊卡牌遊戲必須保留、能一鍵回復；錄音假設每台裝置都有麥克風，永久保存；AI 口說評分只先接介面；主要裝置是電腦與平板，手機也要能用；排行榜預設關閉。
3. **教材品質閘門**：發現舊驗收只看平均值，看不出 A2/B1 是同一段文字換同義詞。新寫的 `scripts/quality.py`（fit／ladder／distance／lint 逐張檢查）與 `scripts/grammar_range.py`（各級文法結構）成為所有教材的驗收標準。各級語速：A2 95、B1 110、B2 120 wpm。
4. **擴充到 17 個 SDG × 3 個任務（51 個）**：只針對英文品質。2026-09-24 使用者要求「先把現有進度落地」：**22 個通過**，4 個半成品放在 `content/drafts/`（sdg3-3、sdg4-3、sdg5-3、sdg13-3），其餘未開始。編號統一為 `sdgN-M`。交付用 Excel `content/canonical/SDGs_PechaKucha_v1.xlsx` 被 `.gitignore` 排除，用 `python scripts/build_canonical.py` 重建。
5. **遊戲敘事設計**：Node Graph（一個節點一段故事）、3D 過場、演講視窗、演講中「把卡牌發給觀眾」的機制、保留卡牌遊戲。Gemini 額度用完，由 Claude 獨力回答設計問題，提示檔存在 `docs/plans/gemini-game-design-prompt-pending.md`，尚未重跑。
6. **Node 1 原型**：`docs/ux/prototype/node_scene_v1.html`（在 `feat/mission-engine`），含 3D 走廊過場、演講視窗、拖卡到觀眾，以及**不支援 3D 時的 2D 降級**（無 WebGL、初始化失敗、前 15 幀太慢、`webglcontextlost`）。

未決事項：sdg13-1/13-2 是否保留「台灣被排除在國際氣候談判之外」的敘述，由使用者決定。

### 3.2 2026-10-11 到 10-13：備份、整理 repo、部署命名

- 使用者要求完整內容放上 GitHub，包含先前沒推過的分支。處理了寫入權限（接受協作邀請）後，四個分支都已推上 GitHub。Google Drive 備份嘗試因檔案大小與連接器限制放棄，改以 GitHub 為主。
- 使用者要求「專案長得整齊、不要刪不要改內容」：只做歸檔與 README 說明（`chore/tidy-repo-structure`）；把命名不清的檔案（`開發需求00.docx`、`漏洞風險.docx` 等）改成 `dev/` 下的正式檔名。
- repo 改名為 `SDGsCardGame`；Vercel 專案改名（見 §2）。

### 3.3 2026-10-14：公司端 3D 原型上線與修正

1. **公司端成果**（陳洺安，commit `5155976`）：`prototype/innovation-harbor/`，SDG 9-1「Can We Trust AI?」的 3D 故事遊戲。6 個地點對應 Pecha Kucha 6 段、2 個劇情選擇、4 種結局、A2/B1/B2、中文提示、Learning Log 預覽。使用者看完後確認方向。
2. **使用者需求（同日）**：角色能在場景中自由移動；其中一個場景進入卡牌遊戲；SDG 9 先上正式站讓老師體驗；女生帳號用女生角色、預設男生；圖文報告。
3. 之後依使用者試玩回饋陸續修正：語速可調、自適應視窗、平板要有方向搖桿、卡牌只有兩張（二選一）不合理、女性 NPC 卻是男聲、搖桿卡住、第一位 NPC 說完就沒有後續、按兩次 Play 題目才出現、Kai 不見、卡牌遊戲在平板上被遮住。最後要求「好好玩過一次找到問題並修好」，以腳本完整玩過六站後修正（§4.4）。
4. 圖文報告（給使用者與老師）：https://claude.ai/artifact/5RkQZWTv24bxDgsrayAHmU （私人，需使用者分享；內容停在 `5a7a960` 的版本，未含之後的修正）。

---

## 4. Innovation Harbor 3D 現況

正式網址：https://www.cathylanguagehub.com/games/innovation-harbor/index.html ，會員首頁第一張遊戲卡「Innovation Harbor 3D」。

### 4.1 架構

純前端，不需要後端改動。three.js r160 由 jsDelivr 載入（import map），角色是 Ready Player Me 模型與 Mixamo 相容動畫（約 19 MB）。

| 路徑 | 內容 |
|---|---|
| `frontend/games/innovation-harbor/` | 遊戲本體（由 `prototype/innovation-harbor/` 搬入，隨正式站 build） |
| `js/story.js` | 6 站劇情、選擇、移動、結局；`STOP_ACTIVITY` 是移動面板顯示的活動名稱 |
| `js/world/harbor.js` | 場景幾何、`STATIONS`、`SPOTS`（NPC 站位）、`PATHS`（自動行走路線） |
| `js/world/roam.js` | **新增**：自由移動、可走範圍（`BLOCKS` 是建築方塊）、地面高度、目的地光圈、搖桿 |
| `js/world/camera.js` | 鏡頭；新增 `setFreeFollow`（自由移動時鏡頭角度用世界座標，不隨角色轉向） |
| `js/ui/bubble.js` | 對話泡泡；新增「泡泡出畫面就固定到底部」與「說話者被擋住就把鏡頭轉到他前面」 |
| `js/activities/cardgame.js` | **新增**：檔案館站以全螢幕 iframe 開正式卡牌遊戲，收 `pk-finished` 訊息換算星等 |
| `js/account.js` | **新增**：呼叫 `/auth/me`，`gender === "female"` 用女性角色，其他情況男性；`?avatar=female|male` 可強制 |
| `js/speech.js` | 依性別選聲音、逐句朗讀加保險計時、語速設定（localStorage `cardlearn_tts_rate`，與卡牌遊戲共用） |
| `js/activities/cards.js` | 原型的場景內卡牌活動，**目前未使用**（被 `cardgame.js` 取代），保留供參考 |
| `scripts/serve-frontend.py` | 本機伺服器，`/` 和 `/static/` 都對應 `frontend/`，與 Vercel 相同 |
| `scripts/playtest/harbor-playthrough.js` | 自動完整試玩腳本（§5） |

### 4.2 遊戲流程

| 段 | 地點 | 活動 | 劇情 |
|---|---|---|---|
| 1 Hook | Ferry Pier | 聽力（填空） | Mei 說明 HARBOR-AI 報告可疑 |
| 2 Problem | AI Lab | 閱讀配對 | Kai 坦白文獻是 AI 寫的；選擇一：陪他查／通報／隱瞞 |
| 3 Explain | Harbor Archive | **正式卡牌遊戲**，Part 2–5 共 8 張一輪 | 許博士（女性）解釋 AI 幻覺 |
| 4 Impact | Port Council | 口說（瀏覽器語音辨識，失敗則錄音或略過） | 議會反應依選擇一 |
| 5 Strategy | Innovation Workshop | 句子排序；選擇二：人類查證／全面禁用／照單全收 | |
| 6 Conclusion | Waterfront Theater | Pecha Kucha（每張 20 秒自動換頁） | 結局判定 |

結局：照單全收、或隱瞞且未選查證 → Fog of Hallucination；全面禁用 → Standstill Harbor；人類查證＋誠信至少 3＋平均星數至少 2.3 → Harbor of Integrity；其餘 → Proceed with Caution。

### 4.3 對既有平台頁面的改動

- `frontend/pages/member_index.html`：遊戲列表第一張加入 Innovation Harbor 3D。
- `frontend/pages/pecha_kucha_builder.html`（舊卡牌遊戲，**一般模式也受影響**）：
  - 新網址參數：`?topic=9-1&level=A2&parts=2,3,4,5&merge=1&embed=harbor`（直接開局、只玩指定段落、合併成一輪、完成時通知 3D 遊戲）。不帶參數時行為與以前相同。
  - **一般模式也會看到的改變**：語速按鈕；投影片卡標題下方顯示中文關鍵詞（原本同段兩張卡標題幾乎一樣）；朗讀逐句播放加保險計時；狀態列與朗讀文字從「浮在卡片上」改為「卡片上方的面板」；遊戲標題縮短為第一句；直式平板的下方面板縮小、計時器移入面板。

### 4.4 2026-10-14 的修正與原因

| 問題（使用者回報或試玩發現） | 原因 | 修正 |
|---|---|---|
| 第一位 NPC 說完就沒有後續 | 第二句是 HARBOR-AI，泡泡掛在 5 m 高的喇叭桿上，超出畫面，Continue 按不到 | 泡泡出畫面就固定在畫面底部 |
| 女性 NPC 是男聲 | 依名稱找不到聲音時退回系統第一個聲音（Windows 通常是男聲 David） | 依性別選聲音；沒有該性別的聲音就調整音高。許博士劇本寫「she」但模型是男性，改用女性模型 |
| 搖桿移動卡住 | 下渡輪的位置在碼頭可走範圍外，小幅度移動無法離開 | 位於可走範圍外時允許任何移動；拖曳中途結束移動時釋放搖桿 |
| 要按兩次 Play 題目才出現 | 題目等朗讀結束才出現；Chrome 網路語音約 15 秒會中斷且不觸發結束事件 | 第一次按 Play 就出題；朗讀逐句播放並有保險計時（3D 與卡牌遊戲都改） |
| 第 2 站 Kai 不見 | Kai 的站位在 AI Lab 大樓模型裡面 | 移到大樓前廣場 `[-33.6, G, 24.4]` |
| 卡牌只有兩張可選 | 每段只有 2 張投影片 | 合併 Part 2–5 成 8 張一輪，卡面加中文關鍵詞 |
| 卡牌遊戲在平板被遮住 | 朗讀文字、狀態列、直式下方面板都是固定定位，蓋住卡片 | 改為卡片上方的面板；直式面板縮小 |
| 選項的「中」變成灰條 | 按鈕包在按鈕裡（HTML 不允許） | 問題上的「中」一次顯示所有選項的中文 |
| 口說時按「Use this attempt」出錯 | 收音中就能按，遲到的辨識結果寫入已關閉的畫面 | 收音中隱藏該按鈕 |
| 劇場鏡頭下半是黑色看台 | 鏡頭在看台內、高度太低 | 提高鏡頭 |
| 不知道卡牌遊戲在哪 | 沒有提示 | 移動面板顯示「地點 · 活動」 |

---

## 5. 如何測試

```bash
python scripts/serve-frontend.py 8766
# http://127.0.0.1:8766/games/innovation-harbor/   （?q=low 低畫質、?avatar=female、?speed=4 加速）
npm run build                                       # 前端 build 檢查
```

**自動完整試玩**：`scripts/playtest/harbor-playthrough.js` 是一個接收 Playwright `page` 的 async 函式（例如 Playwright MCP 的 `browser_run_code`，或包進 `@playwright/test`）。它開本機遊戲，用鍵盤沿人行道自由走到每一站，作答所有活動、玩完 8 張卡牌、到達結局，同時記錄：

- 行走是否卡住；
- 說話者是否在畫面內、是否被建築擋住；
- 對話泡泡與按鈕是否超出畫面。

2026-10-14 最後一次：6 分鐘完成，無任何問題回報（headless 沒有語音，所以朗讀走保險計時）。

**版面**：卡牌遊戲在 768×1024、820×1180、1024×768、1180×820、1366×800、1920×1080 檢查過，卡片沒有被遮住、沒有超出視窗。3D 介面在 390、768、1024、1366、1906 寬檢查過。

**沒有驗證的**：真實聲音（測試瀏覽器沒有語音）；實體平板的觸控手感與效能；真實女性帳號登入後的角色（邏輯與 CORS 已確認）；Safari／Firefox（沒有語音辨識，會走錄音）。使用者回報過「右側一大塊空白」，在相同寬度下無法重現，判斷可能是 Chrome 側邊欄，**尚未確認**。

---

## 6. 回復方式

- 只回復舊卡牌遊戲：`git checkout 4ca1cbd -- frontend/pages/pecha_kucha_builder.html`。注意：回復後 3D 遊戲的檔案館站會失去自動開局與回傳功能，需同時把 `story.js` 改回 `actCards`。
- 下架 3D 遊戲入口：移除 `frontend/pages/member_index.html` 裡 `id: "innovation-harbor"` 那一筆。
- 整體回到 3D 上線前：`main` 回到 `5155976`（公司原型 commit），用 revert 而不是 force push。

---

## 7. 建議的下一步

依使用者提過的需求排序，開始前請先跟使用者確認優先順序。

1. **使用者實機驗收**：老師體驗後的回饋優先處理。
2. **題目換成通過品質審查的新教材**：目前 `js/data.js` 是舊題庫的 SDG 9-1。新版在 `feat/mission-engine` 的 `content/canonical/`（A2/B1/B2，已過閘門）。
3. **演講中把卡牌發給觀眾**：使用者 09 月提出，3D 版尚未實作；設計在 `feat/mission-engine` 的遊戲敘事 DRAFT 與 Node 1 原型。
4. **不支援 3D 的裝置**：目前只有低畫質模式，沒有 2D 替代；可移植 Node 1 原型的降級流程。
5. **學習紀錄存到後端**：目前只有卡牌遊戲成績存伺服器（`/game/pk-result`），其他活動只在瀏覽器；需要後端事件 API 與教師後台。
6. **擴充其他 SDG**：地點、台詞、選擇目前寫在程式裡，需抽成資料檔。
7. **素材授權**：Ready Player Me 模型與動畫正式推廣前確認條款。
8. **教材線**：51 個任務中 22 個通過，4 個在 drafts，25 個未開始（使用者暫停中）。
9. **雜項**：Railway 改名（需使用者登入）；GitHub 組織轉移與 admin 權限；`feat/mission-engine`、`chore/tidy-repo-structure` 是否併入 `main` 由使用者決定。

---

## 8. 協作建議（公司端 AI 與 Claude）

- 開新分支工作，分支名稱帶上作者，例如 `company/…`、`claude/…`；合併前在 PR 描述寫清楚改了什麼、怎麼測。
- 推 `main` 前，跑一次 `scripts/playtest/harbor-playthrough.js` 與 `npm run build`。
- 每完成一段工作，在本資料夾新增一份日期開頭的交接文件，或更新這份文件的 §4、§7。
- 試玩的截圖與測試輸出不要提交進 repo。
