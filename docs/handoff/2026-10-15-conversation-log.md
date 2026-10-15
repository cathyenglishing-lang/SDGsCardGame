# 對話紀錄：2026-10-15 公司端 AI 工作日誌（Innovation Harbor）

給長期記憶用：這一天使用者（專案擁有者）與公司端 AI（Claude Code）說了什麼、決定了什麼、做了什麼、結果如何、哪些還沒做。技術細節在同資料夾的 `2026-10-15-company-story-nodes.md` §1–§15；這份是「對話與決策」的時間順序。下一個接手的 AI 先讀這份，再讀技術文件。

分支：`company/story-nodes`（11 次提交，最新 `見 git log`）。**截至本文件撰寫，尚未合併進 `main`**：公司端 AI 嘗試合併時被工具的「正式部署」權限擋下，需要使用者執行 §9 的指令或授權。

---

## 1. 早上：承接昨天的進度，確認協作方式

- 使用者說：「去把最新程式碼抓下來，我昨天回家有請我的 Claude 續做，妳一看就知道，妳也要習慣跟他協作模式。」→ 讀了家裡端的交接文件 `2026-10-14-innovation-harbor-handoff.md`。規則：推 `main` 就上線；功能分支＋使用者確認才合併；上線前跑試玩與 `npm run build`；交接文件每段更新；截圖與測試輸出不進 repo；`.env`、`sql/app.db` 永不提交。
- 使用者問管理員帳密（兩次）：公司端沒有 `DATABASE_URL`、沒有 Railway 登入，**無法直接建**，請使用者在 Railway 設 `INITIAL_ADMIN_EMAIL`／`INITIAL_ADMIN_PASSWORD`。帳號 `asd0389wsx0216@gmail.com`，密碼只在對話中出現，不寫進 repo。

## 2. 上午：故事節點圖、逼真度、三部曲、索引文件

- 使用者否決「共用引擎＋每章資料檔」（NPC 都講一樣的話很無聊），要求：**NPC 即故事節點**，依對話結果開其他節點，收斂到多個結局；場景逼真（車子被撞、NPC 聊天、跳躍）；未解鎖場景用透明玻璃隔開；可開車；只用第三人稱；方向指引要明顯；人物要有變化；舊撲克卡牌遊戲**不可簡化**；克漏字用目標字彙。
- 三部曲：9-1 短篇 20–30 分、9-2 中篇 40–50 分（Signal Hill Research Campus）、9-3 長篇 60–90 分（Automation Valley）；9-2、9-3 是新場景、尚未建。舊卡牌遊戲每個 SDG 只留一題（4-1、5-1、9-1、13-1），其餘對所有人上鎖、看得到。
- 做了：節點圖引擎、8 個節點、6 個結局、車流與碰撞、路人聊天、跳躍、光柱＋羅盤、追尾鏡頭、可開車、磨砂玻璃牆、卡牌遊戲上鎖；`GAME_INDEX.md`（遊戲內所有東西的索引）；收斂與數據報告（artifact）。
- 使用者要求「報告裡整理素材來源表」「上網查教育 3D 故事遊戲案例」→ 報告 §5–6。代理實測：Sketchfab、Poly Haven、Mixamo 可連，Ready Player Me 被擋。
- 使用者選了下一優先：**學習數據層＋老師分析後台＋Excel，學習數據另開資料庫** → `backend/learning.py`、後台分頁、8 張 Excel 表（commit `f88f0f3`）。

## 3. 中午：試玩與跑框、雲朵泡泡

- 使用者：「我們的主要是 PECHA 的演講概念喔！妳用 Playwright 完一次確定無任何 BUG 跑框」「任何尺寸的瀏覽器螢幕大小都要盡量能用不跑框元件沒有遮擋」。
- 做了 `scripts/playtest/harbor-nodes-playthrough.js`：假麥克風、鍵盤走第一段、Skip 其餘、iframe 玩卡牌、每個活動自動作答、五種尺寸版面檢查。找到並修了：傳送後鏡頭飛太久（硬切）、泡泡跑出畫面（手動定位＋停靠）、結局卡手機上看不到上半（flex 捲動）。
- 使用者問「所以你無法手刻更精細的場景嗎」→ 回答可以（程序化，非照片級），之後做了細節修整。
- 使用者：「我希望可以多一點不一樣例如雲泡泡動畫表示角色內心想法」→ `think()` 雲朵泡泡 ×4 處。使用者「好試試看」→ 加了情緒圖示、章節／地點字卡、褐色閃回（`ui/fx.js`）。踩坑：CSS2D 元素不能在同一元素動 `transform`。

## 4. 下午：場景細節、幻覺體驗、光門

- 使用者「繼續」→ 港口擺設（繩索、護舷、救生圈、油桶、堆高機、三角錐、投光燈塔、斑馬線、貨櫃屋）、人物配件（安全帽、鴨舌帽、眼鏡、反光背心、吊牌、背包；路人隨機穿搭）、議員歪斜姿勢修正（固定待機動作）。實測骨頭軸向：+z 前、+x 右、+y 上、脊椎在背面。
- 使用者：「想要有一個故事情節是讓學生真實體會到 HALLUCINATION，船可以開嗎？可以做比較震撼的場景例如跳樓或飛機之類的，然後封鎖後續場景希望更好看」。
  - AI 提案並用選單確認：幻覺劇情放第一章新節點「燈塔之行」；震撼場景三種都要（防波堤撞船＝第一章本次做；水上飛機近距離擦過＝第二章；屋頂滑索／跳傘＝創新工坊，待做）；**「跳樓」意象不做**（對學生有輕生暗示），使用者接受安全版本；光門一起做。
  - 做了：巡邏艇可開（`world/boat.js`，水面碰撞、警報、水花、紅閃）；燈塔節點（AI 以 99% 信心指出不存在的航道；trust 撞船 AI 仍說安全、verify 走海圖＋無線電口說）；Keeper Ho；全息光門（掃描線、警示燈、進度條、門後無人機／機械手臂／輸送帶、解鎖消散）。兩條路線都用試玩腳本跑通。

## 5. 下午後段：報告重寫成長篇

- 使用者：「Innovation Harbor story report 修得更加詳細，圖文並茂，目前簡單到我看不懂。篇幅可以很長分章節，尤其是我們到底從遊戲收到那些數據怎麼呈現怎麼分析，遊戲過程中如何收集數據，學生在每一個地方練到甚麼，目前整個遊戲用上帝視角來看。」
- 做了第 3 版（同一連結 https://claude.ai/artifact/AuSkpvg5j5tL3Jt9NL7FhM ）：14 章＋24 張實際畫面、手繪地圖／節點圖／資料流／時間線、真實（測試）資料圖表、49 種事件目錄、後台面板怎麼算怎麼讀、個案解讀、研究問題。產生器在 session scratchpad（不進 repo）。

## 6. 傍晚：上線、帳號、投資人、回饋、作弊偵測、共創

使用者一次提出：
1. 「完成之後用 Playwright 玩一次給我看」→ 每次改動都跑完整試玩；截圖在 `.playwright-mcp/report/`（不進 repo）。
2. 「學生結束後是不是應該給一些甚麼回饋」→ 結局卡新增個人回饋：每項技能一句話、漏字＋字義、選擇的意義、下一步建議、「對凱說一句話」（反思）。
3. 「可以先合併上線目前只做 sdg9-1？」→ 可以；但合併動作被工具權限擋下（§9）。
4. 「我明天要去投資人簡報會議，他們都不了解專案、手上握有千萬資金」→ 本地 PPT（見 §7）。使用者補充：「投資人演示腳本我是希望妳把我們 artifact 做成易讀的本地 ppt」。
5. 「開十隻學生帳號、一隻管理員帳號 asd0389wsx0216@gmail.com，把這些帳號記成 txt」→ 註冊需要 email OTP、沒有管理員建帳 API，所以新增 `POST /teacher/users/bulk`（admin 專用、免 OTP）＋ `scripts/create_class_accounts.py`（寫 `demo-accounts.txt`，已 gitignore）。**帳號本身還沒建**：要先在正式站有一個管理員（§9）。
6. 「你是不是很久沒更新與其他 AI 協作的文件」→ 這份對話紀錄、技術文件 §15、`CLAUDE.md` 指向最新文件。
7. 「後面教學計劃我的想法是為了讓學生認真玩理解故事情節，希望它們可以去發想後續劇情讓他們同時參與故事開發」→ 結局卡加「和我們一起寫第二章」提案欄（`story.proposal`），後台面板「學生反思與下一章提案」，Excel `StudentTexts`。
8. 「一個學生的完整紀錄怎麼解讀我有點難理解」→ 後台每場遊玩自動產生白話中文總結（`_summarize_run`），報告第 9 章改以總結為主。
9. 「學生會不會用 AI 破關或打 API 回完美的成績紀錄，我希望後台能抓出學習數據異常的 outlier」→ 規則式異常偵測（太快、全跳過、口說每句 100%、音檔沒播完就作答、一次灌入、時間戳對不上、無頭瀏覽器、星數離群）；後台「學習數據異常」面板；Excel `Anomalies`。我們自己的 17 場機器人試玩全部被標 high。
10. 「把我們今天工作對話內容詳實記錄成 md 才能長久記憶」→ 本文件。

## 6b. 晚上：本地試玩、老師的三個要求

- 使用者：「可以先本地我想玩看看」→ 給了本地網址與帳號（本機 8766／8001，demo01@harbor-dev.com）。
- 使用者轉述老師：「希望有人下船動畫並剪票，剪票時跳出票的資訊＝Pecha Kucha 簡介，讓學生理解這個遊戲要幹嘛、怎麼用 Pecha Kucha 練習演講稿」「進到卡牌遊戲之前需要有 NPC 發卡動畫」「用 Playwright 確保每一個畫面無任何遮擋要絕對正確無 bug」→ 做了跳板下船、剪票員、船票（登機證）、HUD Ticket 按鈕、Dr. Hsu 發卡動畫；試玩腳本加船票畫面的五種尺寸檢查（技術文件 §16）。

## 7. 交付物位置

| 東西 | 位置 |
|---|---|
| 長篇報告（第 4 版） | https://claude.ai/artifact/AuSkpvg5j5tL3Jt9NL7FhM （私人，分享前要在頁面 Share 開權限） |
| 投資人簡報（14 張、每張有演講備註＝演示腳本） | `docs/reports/2026-10-15-Innovation-Harbor-投資人簡報.pptx`（未提交 git） |
| 技術交接 | `docs/handoff/2026-10-15-company-story-nodes.md` §1–§15 |
| 遊戲索引 | `frontend/games/innovation-harbor/GAME_INDEX.md` |
| 試玩腳本 | `scripts/playtest/harbor-nodes-playthrough.js` |
| 開帳號腳本 | `scripts/create_class_accounts.py` |
| 試玩截圖 | `.playwright-mcp/report/nodes-*.jpg`、`boat-*.jpg`、`gate-*.jpg`、`dash-*.jpg`（本機） |

## 8. 今天的決策清單（之後不要再問）

- Pecha Kucha 演講是核心；六站＝六段講稿。
- NPC 即節點；劇情分岔由選擇＋表現決定；六結局。
- 口說三層（辨識／錄音／略過），**沒有自評**。
- 學習數據獨立資料庫；沒設 `LEARNING_DATABASE_URL` 時改用主資料庫的 PostgreSQL（同庫不同表），只有兩者都沒有才用 SQLite。
- 舊卡牌遊戲每個 SDG 只開一題，其餘上鎖。
- 震撼場景不用「跳樓」意象。
- 第一章先上線；9-2、9-3 之後做。
- 帳號清單只存本機 `demo-accounts.txt`，不進 git。
- 對話與交接文件每段更新；回覆用繁體中文、先給結論、分章節。

## 9. 待使用者處理

1. ~~合併上線~~ **已完成**（使用者說「幫我用」後離開自動模式，AI 在使用者允許下執行）：`main` 08798fd → 98dd890，2026-10-15 傍晚推上，Vercel 與 Railway 自動部署。遊戲：https://www.cathylanguagehub.com/games/innovation-harbor/index.html
2. **管理員帳號**：Railway 後端 Variables 設 `INITIAL_ADMIN_EMAIL=asd0389wsx0216@gmail.com`、`INITIAL_ADMIN_PASSWORD=（對話中的密碼）`、`INITIAL_ADMIN_NAME=Cathy` → Redeploy → 用它登入即可。建好後建議改密碼。
3. **十隻學生帳號**：管理員存在後，在本機執行（PowerShell）：
   ```powershell
   $env:ADMIN_EMAIL="asd0389wsx0216@gmail.com"; $env:ADMIN_PASSWORD="（密碼）"
   python scripts/create_class_accounts.py --api https://web-production-ee62.up.railway.app --out demo-accounts.txt --prefix demo --domain cathylanguagehub.com --count 10
   ```
   會產生 `demo-accounts.txt`（demo01–demo10@cathylanguagehub.com，密碼 Harbor2026-01 … -10）。或把 Railway 的 `DATABASE_URL` 給公司端 AI 由它執行。
4. （選）Railway 加 `LEARNING_DATABASE_URL`；沒加也會寫進主資料庫的 `learning_*` 表。

## 10. 明天演示前的檢查清單

- 用 demo 學生帳號登入正式站，玩到燈塔之行確認開船；用管理員登入後台確認「3D 故事 · 學習分析」有資料。
- 麥克風：Chrome 桌機最穩；沒有麥克風口說會自動改錄音／略過，流程不中斷。
- 網路慢：每一段路都可 Skip walk；航行也可 Skip。
- 投影片備註就是講稿；第 13 張是演示順序。
