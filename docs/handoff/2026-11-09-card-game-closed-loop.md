# 交接：卡牌遊戲閉環、老師後台、教材管理、錄音（2026-11-09，Claude，公司端）

依使用者 2026-11-09 的要求做完並推上 GitHub：分支 `company/card-game-learning`（由 `claude/class-roster-learning-data` 分出）。
**還沒合併到 `main`，所以正式站還沒變。** 合併 `main` = 上線，步驟在 §10。

**分支推到哪裡**：`machencompeq/SDGsCardGame`（本機遠端名 `backup`）。公司電腦登入的 GitHub 帳號（machencompeq）對正式倉庫 `cathyenglishing-lang/SDGsCardGame`（遠端名 `origin`，推它的 `main` 才會部署）沒有寫入權限，推送被拒絕（403）。所以上線那一步要在有權限的電腦／帳號上做。

相關文件：計畫 `2026-11-04-class-roster-learning-data-plan.md`、設計 `2026-11-08-card-game-learning-design.md`、文獻 `docs/文獻回顧.md`、操作影片 `docs/videos/`。

## 1. 現在的閉環

```
老師：建立課程 → 勾開放的主題 → 匯入名單（每位學生一個系級）→ 發帳號單
學生：登入 → 第一次先改密碼 → 選單只看到這門課開放的主題
   → 任務卡（六段、今天的目標、上次配錯幾句、個人最佳）
   → 配對（每段多 1 張陷阱卡；每次發牌、聽、重聽、放牌都記一筆）
   → 成績存檔（存不到就留在瀏覽器，連上網路自動補送；畫面寫「已儲存／儲存中／尚未送出」）
   → 收尾 3 步：① 分數＋第一次配錯的句子 ② 念一張投影片（約 20 秒，錄音自動送給老師）③ 籌碼、個人紀錄、哪天再來
   → 下一局的任務卡帶出這次配錯的句子；老師標「請重錄」的那一張會優先要學生重念
老師：學習紀錄（全班 → 一位學生 → 一局 → 每一張卡）→ 聽錄音、寫回饋、請重錄 → 匯出 Excel
老師：教材管理（改標題／講稿 → 草稿 → 預覽 → 發佈 → 版本可取回）→ 學生下一局就用新版
```

## 2. 使用者當天的決定（原話）

| 決定 | 原話 | 做法 |
|---|---|---|
| 卡牌遊戲只留一個入口 | 「卡牌遊戲只剩一個路口是對的吧，我記得之前有重覆到」 | 會員首頁拿掉「SDGs Pecha Kucha」；`loading.html`、`game_s.html`、`finish.html` 一開就轉到 Card Game |
| 先不要自評信心 | 「自評信心先不要好了」 | `pk-wrapup.js` 的 `CONFIDENCE = false`。KPI 14（信心校準）目前沒有資料 |
| 介面直接照設計圖改 | 「介面可以先改」「發牌桌沒改啊」 | 牌桌照 `docs/design/card-game/table-tablet.png` 重做（`pk-table.css`） |
| 籌碼要堆疊、要看得到累積 | 「可以有堆疊籌碼並找空白處顯示累積籌碼」，選了「安裝 Blender 算圖做籌碼」 | `frontend/assets/chips/*.png` 是 Blender 4.5 算的圖（`scripts/blender/render_chips.py`）；牌桌左下角的籌碼堆隨餘額長高 |
| 老師要掌握每位學生的全部資料，特別是語音 | 「可以一個遊戲然後知道所有學生怎麼玩，也可以點進一個學生…尤其是老師特別強調語音收集」 | 老師後台「學習紀錄」（§6）、錄音上傳（§7） |
| 每位學生一定有一個系級 | 「學生一定要帶班級，一個學生只會有一個班級」→「系級」 | `users.class_name`；名單匯入沒有系級的列是錯誤（§5） |
| 玩完要朗讀，但不要讓學生很痛苦 | 「老師說卡牌玩完朗讀，請你設計一下不要讓學生玩完還要花很多時間很痛苦，有效檢討學習」 | 收尾由 6 步減成 3 步；必做的只有「念一張」。小測、反思變成選做。實測從配完最後一張到看到「再玩一次」約 20–24 秒，其中 17–21 秒是朗讀本身 |
| 平台上不再問同意 | 「同意不必，已經在學校額外簽署紙本，確認一上平台所有資料同意公開給平台」 | `AUDIO_REQUIRE_CONSENT` 預設 `false`：登入的學生錄音直接收。設成 `true` 會恢復 App 內詢問 |
| 老師可以改任何教材，新增刪改都要方便，樹狀整齊 | 「老師可以任意對任何遊戲教材進行更改…盡量規畫收納好樹狀整齊一致」 | 老師後台「教材管理」（§8）。**目前只有卡牌遊戲的教材能改**；3D 遊戲的教材寫在各自的程式裡，清單上有列出並說明 |
| 之後要放實驗室 VM | 「未來我會部署在實驗室 VM，預估所需磁碟空間」 | `AUDIO_DIR` 把錄音存成檔案；磁碟估算在 §11 |

## 3. 檔案

後端（`main.py` 之外都是獨立模組，用 `configure()` 接上，不 import main）：

| 檔案 | 內容 |
|---|---|
| `backend/main.py` | 密碼改 PBKDF2、首次登入改密碼、`/auth/config`、自行註冊開關、`pk_results` 去重與後端算分、資料庫頁列出學習資料表 |
| `backend/classroom.py` | 課程、系級、修課、開放主題、名單匯入、重設密碼、籌碼流水帳與老師的籌碼 API |
| `backend/learning.py` | 學習事件、卡牌計分 `score_events`、個人歷史 `GET /learning/pk/me`、`clean_data`／`json_safe`（瀏覽器送來的資料一律先整理型別） |
| `backend/recordings.py` | 錄音上傳、老師的聆聽清單、回饋、保存期限 |
| `backend/learning_reports.py` | 學習紀錄：`/learning/records/games`、`/game`、`/student/{id}`、`/run/{id}`、`/export.xlsx` |
| `backend/content_library.py` | 教材庫：`content_topics`（發佈版＋草稿）、`content_versions`（每一版的快照）、匯入匯出 |

前端：

| 檔案 | 內容 |
|---|---|
| `frontend/pages/pecha_kucha_builder.html` | 卡牌遊戲本體 |
| `frontend/js/pk-telemetry.js` | 學習事件與成績的待送佇列（`window.PKT`） |
| `frontend/js/pk-wrapup.js`、`frontend/css/pk-wrapup.css` | 任務卡、收尾 3 步 |
| `frontend/css/pk-table.css` | 牌桌外觀（全部掛在 `body.pk-v2 #gameScreen` 底下） |
| `frontend/js/voice.js` | 錄音上傳（`window.CardLearnVoice`），卡牌遊戲和兩個 3D 遊戲共用 |
| `frontend/js/pk-content.js` | 題庫的出廠版本：資料庫是空的時候用它建立教材庫，之後以資料庫為準 |
| `frontend/js/teacher-courses.js` | 老師後台「課程與名單」＋籌碼；也定義 `TeacherTopics`（主題與標題的唯一來源）和 `teacherToast` |
| `frontend/js/teacher-records.js` | 老師後台「學習紀錄」 |
| `frontend/js/teacher-library.js` | 老師後台「教材管理」 |
| `frontend/pages/change_password.html` | 首次登入改密碼 |

測試與工具：

| 檔案 | 內容 |
|---|---|
| `scripts/test_classroom.py` | 後端自我測試 157 項。預設用暫存 SQLite；設 `TEST_DATABASE_URL`／`TEST_LEARNING_DATABASE_URL` 就在 PostgreSQL 上跑 |
| `scripts/playtest/cdp.mjs` | 無頭 Chrome 驅動（Node 22 內建 WebSocket，不用裝套件）；點擊是真的滑鼠事件，被蓋住的按鈕會點不到並報錯 |
| `scripts/playtest/card-game-tour.mjs` | 學生端整局走查（多種螢幕尺寸） |
| `scripts/playtest/teacher-walkthrough.mjs`、`library-walkthrough.mjs` | 老師端走查 |
| `scripts/videos/make-videos.mjs`、`recorder.mjs` | 錄操作影片並產生 `操作說明.md` |
| `scripts/validate-content.mjs`、`scripts/pk-content.lock.json` | 題庫校驗，`npm run build` 會先跑 |
| `scripts/blender/render_chips.py` | 籌碼圖的 Blender 腳本 |

## 4. 資料規則

- **聽懂分數**：每張卡只看第一次放牌。`k` = 當下桌上還沒配對的標題卡數（含陷阱卡）。`s = (x − 1/k) / (1 − 1/k)`，`k = 1` 不計。分數 = 平均 s × 100，最低 0，四捨五入（.5 進位）。前端 `pkScoreOf` 和後端 `score_events` 同一條公式；成績表和籌碼只用後端算的。
- **事件**（`learning_events`，`game = "pecha_kucha"`）：`run.start`、`mission.close`、`part.start`、`card.deal`、`card.listen`、`card.repeat`、`card.drop`、`part.done`、`rate.change`、`run.finish`、`run.abandon`、`wrap.start`、`wrap.read.start`、`wrap.read.done`、`wrap.read.sent`、`wrap.read.skip`、`wrap.quiz.answer`、`wrap.reflect`、`wrap.done`。
- `card.drop` 的 data：`card`、`target`、`correct`、`attempt`、`k`、`rt_ms`、`since_audio_ms`、`repeats`、`decoy`、`review`（上次配錯、這次再出現）。卡片編號是 `主題/難度/s投影片`（`4-1/A2/s07`）。
- **只有登入才記名**：沒帶 token 的紀錄一律是 `anonymous`，請求裡的名字不採用。有主人的紀錄只有本人的 token 能寫。卡牌遊戲帶了**失效的** token 會回 401（頁面會保留資料並請學生重新登入），不再默默存成匿名。
- **重送安全**：`learning_runs.client_id`、`pk_results.client_id`、`speech_recordings.client_id`、事件的 `(run_id, seq)` 都是「已存在就跳過」。
- **瀏覽器送來的資料不可信**（匿名也能送）：存入和讀出時都經過 `learning.clean_data()`——卡片編號必須是文字、`k`／秒數必須是數字、沒有 NaN／Infinity。讀不出來的局會被略過（`overview.unreadable_runs`），不會讓整份報表壞掉。老師頁面印出的每個值都經過跳脫。
- **3D 遊戲裡內嵌的卡牌站**（`metrics.embed`）不算一局卡牌遊戲：會列在局數清單並標示，但不進全班統計、不算個人最佳、不算「今天第幾局」。
- **教材版本**：每一局記下當時的 `content_version`。老師改了講稿或標題再發佈，版本加 1；只改中文提示之類不影響作答的欄位，版本不變。報表的「最難的句子」依版本分開算。
- **課程歸屬由後端決定**：學生只有一門課就自動帶入；多門課由選單選，後端確認他真的修這門課才採用。

## 5. 帳號、名單、系級、籌碼

- 密碼：`pbkdf2_sha256$200000$salt$hash`。舊帳號（無 salt 的 SHA-256）照常登入，登入成功時自動升級。**升級後不能退版**：舊版程式看不懂新的密碼格式（§10）。
- 名單匯入：`POST /teacher/roster/preview`（不寫入）→ `/commit`（重新判定後才寫入）。第一列必須是欄位名稱（系級、學號、姓名、email；email 可不填，會用學號＋`ROSTER_EMAIL_DOMAIN` 產生）。
  - 每位學生一個系級（`users.class_name`）。新學生沒有系級 → 錯誤；舊學生沒填 → 沿用原本的；填了不同的 → 「系級由 X 改為 Y」。
  - 學號相同但姓名不同 → 衝突，勾「以名單為準」才更新。
  - 名單上沒有的在學學生可以選擇標為退選（帳號和紀錄保留）。有錯誤的列只要認得出是誰，就不會被當成「不在名單上」；認不出是誰時這一次不標任何人退選。
- 初始密碼 12 碼，只在匯入結果出現一次（可下載 CSV）；資料庫和匯入紀錄都沒有明文。
- 研究代碼 `users.public_id`（如 `L-7K3QX9`）：所有帳號都有，既有帳號在啟動時補上。Excel 可以匯出「只有研究代碼」的版本（檔名帶 `codes-only`；含姓名的帶 `WITH-NAMES`）。
- 籌碼：流水帳 `chip_ledger`，餘額 = `posted` 的加總，每人每天最多 60。規則（`classroom.chips_for_run`）：

| 規則 | 籌碼 |
|---|---|
| 聽懂分數 ÷ 10（最多 10） | `pk.score` |
| 走完一局含收尾 | `pk.finish` 5 |
| 完成朗讀（不論有沒有上傳） | `pk.read` 3 |
| 小測每對 1 題（選做） | `pk.quiz` 最多 5 |
| 寫反思（選做） | `pk.reflect` 2 |
| 同主題隔 2 天以上再玩 | `spaced.return` 5 |
| 3D Harbor 每顆星（每站最多 3） / SDG 4 Stage 正式模式 | `harbor.stars` / `sdg4.formal` 5 |

  同主題同難度當天第 3 局起只給 `pk.score`。「10 秒內同一句連錯 3 次」或「分數 ≥ 80 且反應中位數 < 1.5 秒」的局，籌碼先記為 `held`，老師在「課程與名單 → 籌碼」按「入帳」才算。老師也可以在那裡手動加減（要寫理由）。

## 6. 老師後台

選單三個新項目，其他舊項目保留：

- **課程與名單**：建立課程 → 勾開放的主題和難度（勾了就存；上鎖的主題有 🔒）→ 貼上或上傳名單 → 預覽 → 確認匯入 → 帳號單 → 學生名單（重設密碼、退選）→ 籌碼。
- **學習紀錄**：課程／系級／日期篩選；依遊戲分頁。
  - 最上面「先看這幾位」：還沒玩、分數偏低、有異常標記、有錄音還沒聽，各附原因，可以按「先不用看」。
  - 全班表（還沒玩的也列出）→ 點一位學生 → 個人總覽（各主題的進步、需要再練的句子、錄音、每一局）→ 點一局 → 每一張卡（第一次對不對、放了幾次、重聽幾次、放錯到哪一張）和全部操作紀錄。
  - 「最難的句子」「學生把什麼和什麼搞混」各有一句白話結論；數字寫成「3 / 12」。
  - 「語音」分頁：播放（播了就標成已聽）、狀態（未聽／已聽／已回饋／請重錄）、文字回饋、刪除。
  - Excel：含姓名／只有研究代碼兩種；第一張工作表是中文的欄位說明。
- **教材管理**：左邊樹狀（遊戲 → 主題 → 難度）＋搜尋；右邊上方是固定的狀態列（草稿／已發佈第幾版、預覽、放棄修改、發佈、復原上一步），下面是投影片清單和編輯區。改了自動存草稿；檢查訊息用白話寫在欄位旁；刪除不跳確認框、改用復原；每一版都可以取回；可從試算表貼上匯入、匯出 Excel；新增主題、上鎖、刪除（可復原）。
- 規則：**上鎖的主題誰都不能玩**，課程勾了也一樣（課程清單會標 🔒）。
- 舊的「遊戲數據」頁還在，頁首加了說明：它只算玩完的局、同名會併成一人，完整資料看「學習紀錄」。

後台是單一頁面（`frontend/pages/teacher_dashboard.html`），三個新模組各一個 JS 檔。圖表全部是手寫的 HTML／SVG（長條、折線、環圈、熱力格），沒有用圖表套件。

## 7. 錄音

- 學生在收尾念一張投影片，停止後自動上傳（`POST /me/recordings`）；可以試聽、重錄。3D 遊戲的口說站和整段發表也用同一支上傳。
- 錄音設定 32 kbps（實測約 3.9 KB／秒，20 秒約 78 KB）。單檔上限 `AUDIO_MAX_BYTES`（預設 4 MB），每人每天上限 `AUDIO_MAX_PER_DAY`（預設 60 段）。
- 存放：設了 `AUDIO_DIR`（實驗室 VM）→ 檔案放在 `<AUDIO_DIR>/<年-月>/`，資料庫只存路徑；沒設（Railway）→ 存在資料庫欄位裡，重新部署不會消失。
- 保存 `AUDIO_RETENTION_DAYS` 天（預設 150），到期自動刪除。
- 只有老師和管理員的帳號能列出和播放。**目前所有老師帳號都看得到所有課程的學生**（`courses.teacher_id` 有存但沒有用來限制）；如果之後有第二位老師，要加上這個限制。

## 8. 教材庫

- 一個主題一筆 `content_topics`：`published_json`（學生拿到的）、`draft_json`（老師改到一半的）、`version`、`locked`、`archived`。每次發佈在 `content_versions` 留一份。
- 第一次啟動且資料庫沒有卡牌教材時，從 `frontend/js/pk-content.js` 建立；之後不再讀那個檔。出廠設定 9-2、9-3、13-2 是上鎖的。
- 學生端 `GET /content/library` 只給已發佈、沒刪除的主題；連不上時退回 `pk-content.js`。
- `?preview=1` 是老師預覽草稿：需要老師的 token，不記錄任何學習資料。
- 檢查規則（`check_doc`，和 `validate-content.mjs` 同一套）：每個難度 12 或 20 張、六段的張數固定、同一段標題不能重複、講稿不能空白；講稿估計超過 20 秒只是提醒。

## 9. 驗證（2026-11-09 實際跑過的）

| 檢查 | 結果 |
|---|---|
| `python scripts/test_classroom.py`（SQLite） | 157 項全過 |
| 同一支測試在 **PostgreSQL 16.4**（本機免安裝版，空資料庫） | 157 項全過 |
| **升級測試**：用 `main` 分支的程式建立 PostgreSQL 資料庫（＝正式站現在的結構）＋舊格式的帳號和紀錄，再用新程式啟動 | 啟動時的欄位升級沒有錯誤；舊帳號（SHA-256 密碼）可以登入並自動升級；舊的卡牌成績和 3D 紀錄照常顯示；新流程（開局、事件、結算、籌碼、報表、Excel、改教材、發佈）28 項全過 |
| `npm run build` | 題庫 9 個主題、488 張卡、0 個錯誤（316 個提醒，多半是講稿估計超過 20 秒）；建置成功 |
| 學生端整局走查 `card-game-tour.mjs` | 1024×768、768×1024、390×844、360×640、1180×820 各 27 個畫面，0 個問題、0 個頁面錯誤 |
| 老師端走查 `teacher-walkthrough.mjs`、`library-walkthrough.mjs` | 都是 0 個問題 |
| 操作影片 `make-videos.mjs` | 4 支都錄成功，抽格看過畫面和字幕 |
| 三個 agent 各自審查（老師端可用性 20 項、後端程式與 PostgreSQL 25 項、學生端品質 18 項） | 找到的問題與處理見 §9.2 |

**沒有驗證的**：真實的語音朗讀和麥克風（自動測試用假的語音合成和 Chrome 的假麥克風）、真的觸控和 iOS Safari、寄信（Resend）、3D 遊戲頁面在瀏覽器裡的錄音上傳（本機後端沒有掛 3D 遊戲的路徑，只用 API 驗過上傳）、Railway 實際部署、多人同時使用。

### 9.2 審查找到、已修掉的重點

- **PostgreSQL 上籌碼完全不會入帳**：SQL 裡寫了 `LIKE 'teacher.%'`，psycopg 把 `%` 當成參數符號。SQLite 沒事，所以原本的測試抓不到。已改成參數，並加了「SQL 裡不能有 `LIKE '`」的檢查，也真的在 PostgreSQL 上跑過。
- **老師頁面的 XSS**：匿名的人可以把 HTML 塞進 3D 遊戲的分數或朗讀秒數，老師打開學習紀錄時會被執行。後端現在只放行數字，前端全部跳脫。
- **一筆偽造的事件就能讓全班報表永久打不開**：已加型別整理和逐局容錯。
- 錄音上傳沒有大小／次數限制、`/me/*` 不在流量限制內 → 已加。
- 名單：沒有系級的列被填成「A」、沒有標題列時把系級當成姓名、一個打錯的 email 會讓該生被標退選 → 已修。
- 老師端：筆電上講稿輸入框只有 80px 寬；老師自己新增的主題在學習紀錄顯示成代碼、在課程裡勾不到；刪除後 9 秒就不能復原；表格的答案欄被切掉；「先看這幾位」原因標錯、超過 12 位就不顯示；語音狀態改了沒存 → 已修。
- 學生端：手牌的句子在手機上被切掉、短螢幕上標題卡被底部蓋住、iPad 橫放時收尾的按鈕在畫面外、陷阱卡沒有中文提示所以一眼看得出來、網路慢時可以玩到課程沒開放的主題、沒登入時畫面仍寫「紀錄中」、畫面上看不到現在是誰登入 → 都已修，並寫進走查腳本（句子被切掉、標題卡被蓋住、任務卡按「換主題」卻留下一局，走查都會報錯）。

## 10. 上線（合併到 `main`）

推上 `main`，Railway（後端）和 Vercel（前端）會自動部署。順序：

1. **先備份正式站的 PostgreSQL**（Railway 的資料庫備份或 `pg_dump`）。密碼格式升級後不能退回舊版程式：退版會讓「升級後登入過的帳號」和「名單匯入的帳號」登不進去。
2. Railway 環境變數（不設就是括號裡的預設）：`ALLOW_SELF_REGISTER`（`true`；課堂期間建議 `false`）、`ROSTER_EMAIL_DOMAIN`（`nptu.edu.tw`）、`PUBLIC_SITE_URL`、`AUDIO_RETENTION_DAYS`（150）、`AUDIO_MAX_BYTES`（4 MB）、`AUDIO_MAX_PER_DAY`（60）、`AUDIO_REQUIRE_CONSENT`（`false`）。Railway 上**不要**設 `AUDIO_DIR`（沒有持久磁碟，錄音會存在資料庫裡）。
3. 合併（要用對 `cathyenglishing-lang/SDGsCardGame` 有寫入權限的帳號）：
   ```bash
   git remote add backup https://github.com/machencompeq/SDGsCardGame.git   # 家裡的電腦如果還沒有這個遠端
   git fetch backup company/card-game-learning
   git checkout main && git pull origin main
   git merge --no-ff backup/company/card-game-learning
   git push origin main        # 這一步會部署到正式站
   ```
4. 部署完成後檢查：`/health` 回 `database: postgresql`；用老師帳號登入後台，三個新選單都打得開；「教材管理」有 9 個以上主題（表示教材庫建立成功）；用一個學生帳號玩一局、念一段，回後台「學習紀錄」和「語音」看得到。
5. 用真的平板和手機、真的聲音玩一局（自動測試用的是假的語音合成和假的麥克風）。
6. 名單匯入的寄信功能（Resend）沒有實測過：第一次用時先匯一位測試學生。

## 11. 實驗室 VM 的磁碟估算

實測（測試資料）：一局卡牌約 75 筆事件（最多 90），含索引約 15–18 KB；錄音約 3.9 KB／秒。

| 項目 | 假設 | 每位學生每學期 |
|---|---|---|
| 卡牌事件與成績 | 每週 2 局 × 15 週 = 30 局 | 約 0.6 MB |
| 卡牌朗讀錄音 | 每局 1 段 20 秒，平均重錄半次 | 約 3.5 MB |
| 3D 遊戲錄音 | 整段發表 4–7 分鐘 × 4 次，加口說站 | 約 6 MB |
| 合計 | | **約 10 MB** |

| 規模 | 一學期 | 錄音保留 3 年（6 學期）不刪 |
|---|---|---|
| 120 位學生 | 約 1.2 GB | 約 7 GB |
| 300 位學生 | 約 3 GB | 約 18 GB |

建議：系統＋程式＋PostgreSQL 約 15 GB，資料照上表，再留一倍放備份（每天資料庫備份留 7 份、每週錄音備份）。**120 人抓 40 GB、300 人抓 80–100 GB。** 預設錄音 150 天就刪；研究要長期保留就把 `AUDIO_RETENTION_DAYS` 調大，並照上表右欄估。事件資料很小（300 人 3 年不到 1 GB），不需要刪。

VM 上要設：`DATABASE_URL`（PostgreSQL）、`AUDIO_DIR`（例如 `/srv/cardlearn/audio`，要納入備份）、`SECRET_KEY`、`FRONTEND_ORIGINS`。

## 12. 還沒做、已知限制

- **3D 遊戲的教材不能在後台改**（寫在各遊戲的 JS 裡）。教材管理的清單有列出並說明。
- 老師帳號沒有分課程權限（§7）。
- 改密碼或重設密碼不會讓已經登入的裝置登出（token 效期很長，沒有版本號）；「必須先改密碼」只由頁面擋，API 沒有擋。
- 上鎖和「課程沒開放」只在瀏覽器端擋：`GET /content/library` 仍會回傳上鎖主題的講稿。
- 小測的關鍵字是程式從講稿挑的，不是老師定的。
- 老師的回饋只有文字（文獻建議加語音，見 `docs/文獻回顧.md` 的 B 表）；錄音播放器沒有波形。
- 沒有記錄老師怎麼使用後台。
- 研究模式（前後測、分組）：欄位有了，沒有畫面。
- 60 人同時玩的負載測試沒做。
- 設計圖裡「翻開 7 張牌」的收尾和「3D 寶箱」沒做。
- 舊的「帳號管理」頁的 Game Records 欄讀的是已經不用的舊資料表。

## 13. 這台電腦上留下的東西（不在 repo 裡）

- `C:\Users\machen\tools\blender\`：Blender 4.5.15 免安裝版（算籌碼圖用）。
- `C:\Users\machen\tools\postgres\`：PostgreSQL 16.4 免安裝版（實測用；沒有註冊成服務，測完已停止）。不需要可以整個資料夾刪掉。
