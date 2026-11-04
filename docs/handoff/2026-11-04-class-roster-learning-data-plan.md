# 規劃：分班名單匯入、唯一 ID、卡牌學習數據、教材校驗（2026-11-04，Claude，BMAD）

依 BMAD 流程（Analyst → PM → Architect → PO → SM）整理。這份是**規劃，尚未實作**；第 7 節是給使用者拍板的決策，拍板後依第 8 節的 story 順序實作。

目標日期：**11/18（三）、11/23（一）** Cathy 老師課堂讓學生玩卡牌遊戲。

---

## 1. Analyst：專案簡報

### 1.1 問題

- Cathy 老師要在課堂讓學生玩，並且要看得到「誰學了什麼」。目前學生自己註冊（email + OTP），老師後台看不出誰屬於哪一班。
- 卡牌遊戲（`pecha_kucha_builder.html`）只送出每一段的錯誤數、秒數、重聽次數（`pk_results.parts_json`），看不出學生在**哪一張卡**卡住、把哪張跟哪張搞混。3D 遊戲已有逐事件紀錄（`learning_events`），卡牌遊戲沒有。
- 教材資料有錯，卡牌遊戲會把正確的答案判成錯（第 6 節）。

### 1.2 使用者

| 角色 | 需求 |
|---|---|
| 學生 | 拿到帳號就能登入、選主題玩，10 分鐘內完成 |
| Cathy 老師 | 按課程／班級看學生紀錄、知道哪些句子學生最常錯 |
| 使用者（開發／助教） | 一次匯入名單、產生帳號、寄出密碼；匯出研究用資料 |

### 1.3 限制

- 名單來源：老師給的 Google Sheets（課程／學號／姓名／nptu 信箱）。老師說第二週名單不完整，第九週會重收。
- 帳號：`學號@nptu.edu.tw`，**不用**學校預設密碼（身分證後 6 碼是個資），改用亂數密碼寄到學生學校信箱。
- 暫時關閉自行註冊，改由後台匯入。
- 現有資料、舊遊戲、訪客模式不能壞。
- 正式前後測研究延後（2026-09-20 決策），但資料格式要先能支撐日後研究。

---

## 2. PM：需求（PRD 摘要）

### 2.1 功能需求

- **FR1 課程與班級**：後台可建立課程（學期、課號、名稱、授課老師），一門課可以有多個班。
- **FR2 名單匯入**：上傳 CSV／XLSX（或貼上 Google Sheets 內容），欄位：課程、班級、學號、姓名、email。先預覽（新增／更新／衝突／錯誤），確認後才寫入。重複匯入不會產生重複帳號。
- **FR3 帳號產生**：沒帳號的學生自動建立，亂數密碼，第一次登入強制改密碼。密碼只在匯入結果出現一次（下載帳號單），不存明文。可選擇寄信到學生學校信箱。
- **FR4 唯一 ID**：每位學生一個系統內部 ID 和一個不含個資的研究代碼；同一學生修多門課只有一個帳號。
- **FR5 關閉自行註冊**：設定開關。關閉時註冊頁顯示「請使用老師提供的帳號」，訪客模式保留。
- **FR6 課程活動**：老師為每門課指定開放的主題與難度（例如 9-1、9-2、9-3 三選一），取代全站統一上鎖。
- **FR7 卡牌學習數據**：卡牌遊戲改送逐張卡事件（第 4 節），每筆紀錄帶課程。
- **FR8 老師報表**：依課程／班級篩選：完成率、每位學生進度、每張卡的首答正確率、混淆最多的卡片組合；可匯出 Excel。
- **FR9 教材校驗**：一支校驗腳本，部署前跑；錯誤會擋住 build。

### 2.2 非功能需求

- **NFR1 個資**：報表與匯出預設用研究代碼；真名只在老師後台顯示（2026-09-20 決策：老師看得到真名）。名單檔、帳號單不進 git。
- **NFR2 相容**：只新增資料表與欄位，不刪不改既有欄位；`pk_results` 繼續寫入（舊報表照常可用）。
- **NFR3 課堂負載**：同時約 60–120 人；事件分批送出（沿用 `telemetry.js` 的佇列與離線暫存）。
- **NFR4 可回復**：所有新功能可用設定關閉。

### 2.3 Epic

| Epic | 內容 | 11/18 前必要？ |
|---|---|---|
| E1 教材修正與校驗 | 第 6 節的錯誤、校驗腳本 | **必要** |
| E2 課程、名單、帳號 | FR1–FR5 | **必要** |
| E3 卡牌學習數據 | FR7 | **必要**（11/18 沒收到就不能補） |
| E4 課程活動 | FR6 | 必要（老師要三選一） |
| E5 老師報表 | FR8 | 11/18 後可補（資料先收齊） |

---

## 3. Architect：資料模型

### 3.1 新資料表

```sql
-- 課程（一學期一門課一筆）
CREATE TABLE courses (
  id            INTEGER PK,
  term          TEXT NOT NULL,        -- '1151'
  code          TEXT NOT NULL,        -- 課號，沒有就用簡稱
  name          TEXT NOT NULL,
  teacher_id    INTEGER REFERENCES users(id),
  active        INTEGER DEFAULT 1,
  created_at    TEXT,
  UNIQUE(term, code)
);

-- 班級（同一門課的不同班；只有一班時就是 'A'）
CREATE TABLE course_sections (
  id         INTEGER PK,
  course_id  INTEGER NOT NULL REFERENCES courses(id),
  label      TEXT NOT NULL,           -- 'A'、'週三班'
  UNIQUE(course_id, label)
);

-- 修課關係（一個學生可在多門課）
CREATE TABLE enrollments (
  id          INTEGER PK,
  section_id  INTEGER NOT NULL REFERENCES course_sections(id),
  user_id     INTEGER NOT NULL REFERENCES users(id),
  status      TEXT NOT NULL DEFAULT 'active',   -- active / dropped
  source      TEXT,                              -- 'import:2026-11-04'
  created_at  TEXT,
  UNIQUE(section_id, user_id)
);

-- 課程開放的活動（FR6）
CREATE TABLE course_activities (
  id         INTEGER PK,
  course_id  INTEGER NOT NULL REFERENCES courses(id),
  game       TEXT NOT NULL,           -- 'pecha_kucha'、'innovation-harbor'、'sdg4-stage'
  topic_id   TEXT NOT NULL,           -- '9-2'
  levels     TEXT NOT NULL,           -- 'A2,B1,B2'
  open_from  TEXT, open_until TEXT,
  UNIQUE(course_id, game, topic_id)
);

-- 匯入批次（追查用；不存密碼）
CREATE TABLE roster_imports (
  id INTEGER PK, by_user INTEGER, filename TEXT, at TEXT,
  created INTEGER, updated INTEGER, skipped INTEGER, report_json TEXT
);
```

### 3.2 `users` 新增欄位

| 欄位 | 說明 |
|---|---|
| `student_no TEXT` | 學號；`UNIQUE(institution, student_no)` |
| `institution TEXT DEFAULT 'nptu'` | 日後其他學校不會撞學號 |
| `public_id TEXT UNIQUE` | 研究代碼，例如 `L-7K3QX9`，隨機產生、不可由學號推回 |
| `must_change_password INTEGER DEFAULT 0` | 匯入帳號第一次登入強制改密碼 |
| `account_source TEXT` | `self` / `import` / `bulk` |

### 3.3 唯一 ID 的三層

| 用途 | ID | 理由 |
|---|---|---|
| 資料庫關聯 | `users.id`（整數，既有） | 不動既有外鍵 |
| 名單比對 | `(institution, student_no)` | 重複匯入、改名、換 email 都對得上同一人 |
| 研究匯出、報表 | `public_id` | 不含學號、姓名；論文和外部 AI 只看得到這個 |

登入帳號仍是 email（`學號@nptu.edu.tw`），現有登入流程不用改。之後要讓學生用學號登入，再在 `/auth/login` 加「學號」這種寫法就好。

### 3.4 紀錄要帶課程

`learning_runs` 和 `pk_results` 各加 `course_id`、`section_id`（可為空）。開始遊戲時後端自己判斷：

1. 學生只有一個有效修課 → 自動帶入。
2. 有多個 → 前端選單讓學生選（或由網址 `?course=` 指定）。
3. 沒有修課（自行註冊、訪客）→ 空值，照常可玩。

由**後端**決定課程，不信任前端送來的值，避免學生把紀錄寫進別的課。

### 3.5 名單匯入流程

```
上傳 CSV/XLSX
   ↓
POST /teacher/roster/preview   → 每列判定：新增帳號／已有帳號加修課／資料衝突／錯誤（學號格式、email 不符）
   ↓ 老師確認
POST /teacher/roster/commit    → 交易內寫入 users、enrollments、roster_imports
   ↓
回傳一次性帳號單（CSV：學號、姓名、帳號、初始密碼）＋可選「寄信」
```

- 比對順序：學號 → email。學號相同但姓名不同算「衝突」，列出來讓老師決定，不自動覆蓋。
- 名單上沒有、但系統裡有修課的學生：標成 `dropped`，不刪帳號、不刪紀錄。
- 密碼：12 碼，去掉 0/O、1/l/I 這類易混字元；不存明文。
- **既有的 `hash_password` 是沒有 salt 的 SHA-256**（`backend/main.py:761`）：資料庫外流時，常見密碼很容易被反查。這次一次要建幾十個帳號，建議同時改成 PBKDF2（Python 內建 `hashlib.pbkdf2_hmac`，每個帳號各自的 salt），舊 hash 在使用者下次登入成功時自動升級，舊帳號不受影響。
- 寄信沿用既有寄 OTP 的郵件設定；寄失敗的列在結果裡，可用帳號單補發。

### 3.6 自行註冊開關

環境變數 `ALLOW_SELF_REGISTER`（預設 `true`，課堂期間設 `false`）。`/auth/send-otp` 和 `/auth/register` 在關閉時回 403，註冊頁顯示提示並導向登入／訪客。

---

## 4. 卡牌遊戲可以收集的學習數據

### 4.1 事件（沿用 `learning_events`，`game: "pecha_kucha"`）

卡牌遊戲改用 3D 遊戲的 `telemetry.js`（佇列、批次、離線暫存、訪客不送），事件名稱和 3D 遊戲的 `card.*` 對齊，報表可以合併。

| 事件 | 時機 | data 內容 |
|---|---|---|
| `run.start` | 選好主題、難度 | topic、level、TTS 語速、裝置寬度、課程 |
| `card.deal` | 發牌 | card（投影片編號）、part、第幾張 |
| `card.listen` | 第一次念完 | card、聽完秒數 |
| `card.repeat` | 按重聽 | card、第幾次 |
| `card.drop` | 每次放卡 | card、target（放到哪張）、correct、第幾次嘗試、**從聽完到放下的毫秒數** |
| `part.done` | 一段完成 | part、errors、seconds、repeats |
| `rate.change` | 改語速 | 新語速 |
| `run.finish` | 六段完成 | 總錯誤、總時間、總重聽 |
| `run.abandon` | 中途離開（`pagehide`） | 停在哪一段、哪一張 |

### 4.2 從事件算出的指標

| 指標 | 回答的問題 | 用在 |
|---|---|---|
| 每張卡首答正確率 | 哪些句子聽了還是不懂 | 老師教學、教材修訂 |
| 混淆矩陣（卡 A 被放到卡 B） | 哪兩張投影片學生分不清 | **教材校驗**（見 6.3） |
| 重聽次數／卡 | 聽力依賴程度 | 難度分級是否合適 |
| 聽完到放下的反應時間 | 理解速度、是否亂猜（極短又錯） | 偵測亂猜 |
| 完成率、中途離開點 | 遊戲是否太長、哪段卡住 | 10 分鐘目標檢核 |
| 同一學生多次遊玩的錯誤變化 | 有沒有學到 | 日後前後測研究 |
| 語速選擇 | 學生自評聽力 | 難度建議 |
| 依 Pecha Kucha 段落彙整 | 哪個段落（Problem、Solutions…）最難 | 教學重點 |

不收集：錄音（卡牌遊戲沒有口說）、自由輸入文字、IP 以外的裝置指紋。

---

## 5. 教材校驗：做法

兩層：

1. **靜態校驗**（`scripts/validate-content.mjs`，`npm run build` 前跑，錯誤就中止）：
   - 投影片編號連續；每段張數符合格式（20 張的 3/3/3/3/4/4；12 張的 2×6）。
   - **同一段內英文標題不能重複**（卡牌遊戲顯示英文標題，重複就無法分辨）。
   - 標題、中文標題、講稿不可空白；沒有亂碼。
   - 關鍵字必須真的出現在講稿裡。
   - 各難度的投影片標題一致（同一張投影片換難度只換講稿）。
   - 講稿念讀時間估計（警告，不擋 build）。
   - 主題 ID 對應同一份來源（見 6.2 第 4 點）。
2. **實測校驗**（11/18 之後用學生資料）：首答正確率很低、或兩張卡互相混淆比例很高的組合，列入「教材待檢查」清單給老師看。

---

## 6. 教材校驗：這次的結果

用上面的規則對 `pecha_kucha_builder.html` 內嵌的 `GAME_DATA`（9 個主題）跑了一次。

### 6.1 一定要修（會讓遊戲判錯）

- **9-2、9-3 的 Part 3 兩張卡英文標題都是「Scientific Explanation」**（A2／B1／B2 都是）。中文分別是 WHY／HOW，但卡面只顯示英文。學生放到「另一張」看起來一樣的卡會被判錯。**9-2 正好是老師要的「How to Talk to AI Like a Scientist」。**
  - 修法：英文標題改成「Scientific Explanation: Why?」和「Scientific Explanation: How?」（9-1 已經是這種寫法）。

### 6.2 應該修

1. **9-2、9-3 的關鍵字錯了**：A2 的關鍵字是從 9-1（AI 幻覺、假論文出處）複製過來的中文大綱，跟講稿無關；B1、B2 完全沒有關鍵字。
2. **9-2、9-3 原始標題都寫「Topic 2:」**：畫面上已由 `unlocks.js` 的標題覆蓋，但資料本身要改正。
3. **5-2、13-2 原始標題是佔位字「SDG 5-2」「SDG 13-2」**：同上，畫面已覆蓋。
4. **卡牌遊戲沒有用到通過品質閘門的講稿**：`feat/mission-engine` 的 `content/canonical/` 有 23 個任務都已通過閘門（每張 20 秒內念得完），但卡牌遊戲 9 個主題的講稿跟它**0 張相同**。而且主題 ID 對不上：卡牌 9-2 是「How to Talk to AI Like a Scientist」，canonical 9-2 是「Finding Your Human Voice in the Age of AI」；9-3 也不同。需要決定以哪一份為準（第 7 節 D4）。
5. **講稿偏長**（估計值，以 A2 每秒 1.6 字、B2 每秒 2.1 字估）：4-1 有 68 張、13-1 有 60 張、4-2 有 52 張超過 20 秒；9-2 有 12 張（A2 全部 22–25 秒）。卡牌遊戲不限時，所以不影響玩，但跟「20 張 × 20 秒」的 Pecha Kucha 精神不符。

### 6.3 校驗腳本

這次用的腳本在 Claude 暫存區；實作 E1 時改寫成 `scripts/validate-content.mjs` 提交。

---

## 7. PO：要使用者拍板的決策

| # | 問題 | 建議 |
|---|---|---|
| D1 | 11/18 讓學生玩哪三個主題？ | 9-1、9-2、9-3（老師 11/2 說「三個讓它們選」，並提到 9-2 的主題）。先跟老師確認她 11/2 傳的圖片 |
| D2 | 11/18 是卡牌遊戲，還是之前說的「9-2 easy 版」（3D、單一故事線）？ | 卡牌遊戲先上（老師 11/2 說「主要是讓他們玩卡牌」）；3D easy 版排到 11/23 或之後 |
| D3 | 匯入帳號要不要直接寄信？ | 要寄到學校信箱，同時產生帳號單備份，課堂現場可補發 |
| D4 | 9-2、9-3 以卡牌版還是 canonical 版為準？ | 11/18 先用卡牌版（老師看過的、主題名稱對得上），只修 6.1、6.2 的錯；之後統一成單一資料來源 |
| D5 | 課堂期間關閉自行註冊？ | 關閉，訪客模式保留給名單漏掉的學生（訪客不留紀錄，要提醒老師） |
| D6 | 一門課有沒有分班？ | 等老師的第九週名單；資料模型兩種都支援 |

---

## 8. SM：Story（依實作順序）

| # | Story | 驗收 |
|---|---|---|
| S1 | 修 9-2、9-3 重複標題與關鍵字（6.1、6.2-1） | 校驗腳本對 9 個主題 0 個錯誤；Playwright 跑完 9-2 A2 六段，沒有誤判 |
| S2 | `scripts/validate-content.mjs` 接進 `npm run build` | 故意放一張重複標題，build 失敗 |
| S3 | 資料表 `courses`、`course_sections`、`enrollments`、`roster_imports`、`users` 新欄位（SQLite 與 Postgres 都可） | 舊資料庫啟動後自動補欄位；既有帳號登入正常 |
| S4 | `/teacher/roster/preview`、`/commit` ＋ 後台匯入頁 | 同一份名單匯兩次，第二次 0 新增；學號同姓名不同列為衝突 |
| S5 | 帳號單下載、寄信、首次登入改密碼；密碼改用加 salt 的 PBKDF2（舊 SHA-256 登入時自動升級） | 匯入帳號第一次登入一定要改密碼；資料庫沒有明文密碼；舊帳號照常登入且 hash 被升級 |
| S6 | `ALLOW_SELF_REGISTER` 開關 | 關閉時 OTP 與註冊 API 回 403，訪客按鈕仍可用 |
| S7 | `course_activities` ＋ 選單依課程顯示主題 | 該課只開 9-1、9-2、9-3 時，學生只看得到這三個 |
| S8 | 卡牌遊戲接 `telemetry.js`、送第 4.1 節事件；`learning_runs` 帶課程 | 玩完一輪，資料庫有 `card.drop` 等事件且 `course_id` 正確；訪客 0 筆請求 |
| S9 | 老師報表：課程篩選、學生進度、每張卡正確率、混淆組合、Excel 匯出 | 用 S8 的測試資料，報表數字與資料庫一致 |
| S10 | 課前演練：用老師名單的測試副本匯入、60 個模擬學生同時玩 | 無錯誤、事件無遺失 |

S1–S8 在 11/18 前完成；S9 可在 11/18 之後補（資料已經收了）。S10 在 11/16 前。

---

## 9. 風險

- 名單第九週才完整：匯入要能重複執行（S4 已涵蓋）。
- 學校信箱可能擋外部寄信：帳號單是備案。
- NPTU 網域審核未出：沿用 `www.cathylanguagehub.com`。
- three.js CDN 偶爾卡住（10-17 交接 §9）：卡牌遊戲不受影響。
- 公司 AI 同時在改：本規劃在 `claude/class-roster-learning-data` 分支，合併前先看 `git log origin/main`。
