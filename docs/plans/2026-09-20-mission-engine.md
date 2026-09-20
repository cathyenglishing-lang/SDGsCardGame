# Mission Engine 實作設計 DRAFT v1（2026-09-20）

狀態：**待審**。本文通過後才開始寫程式碼。
依據：Round 1 Report 決策 D1–D17（`https://claude.ai/code/artifact/1aeee29a-b580-44be-b62c-6e6d0ccdc344`）。
範圍：把現行「SDGs Pecha Kucha 卡牌配對」擴充成完整的 Mission 學習遊戲，涵蓋全部 9 個主題與全部難度，可上線遊玩。

---

## 1. 決策如何落實

| # | 你的決定 | 實作方式 |
| --- | --- | --- |
| D1 | 交我決定 | A1 不另開軌道；A1 稿（僅 SDG 4-1）作為 A2 的「支援模式」文本 |
| D2 | 各種學生都要，缺的我補 | 全部 9 主題 × A2/B1/B2（4-1 另有 A1）；缺的單字、題目、決策卡由我撰寫 |
| D3 | 交我決定，但要能立刻回退 | 新遊戲是**新頁面新資料表**，舊遊戲一行不改；回退＝關掉旗標（見 §3） |
| D4 | 同意方案 A + C 查證 + B 白皮書 | 每個 Mission 一個角色；4-2/5-2/9-1 加查證機制；結局產出「任務白皮書」 |
| D5 | 可以送外部 AI | AI 介面保留，行為受 `AI_API_KEY` 控制 |
| D6 | 電腦、平板 | 版面以 ≥1024px 為主，768px 平板直/橫式可用，手機可玩 |
| D7 | 先讓遊戲真的能學 | 前後測仍做，但不掛研究流程；成效以遊戲內資料呈現 |
| D8 | 都有麥克風 | 口說預設走錄音；仍保留無麥克風替代 |
| D9 | 錄音永久保存 | 存 Postgres（`speaking_records.audio` bytea）＋大小上限；教師可聽 |
| D10 | 要 AI 評分，但沒 key 就跳過 | `.env` 留 `AI_API_KEY`；未設定時該步驟顯示「未啟用」，不擋流程 |
| D11 | 教師可聽錄音 | 教師端錄音清單＋播放 |
| D12 | 班級排行預設關閉 | 預設顯示班級共同儀表；排行榜為匿名、每 Mission×級別分榜 |
| D13 | 教師可看真名 | 教師端顯示真名，研究/匯出用匿名 ID |
| D14 | 全部主題與難度、可上線 | 不做 3 個 Mission 的縮水版 |
| D15 | 交我決定 | 前端維持純 HTML/JS（無框架），但拆成 ES modules |
| D16 | 我主導、搭配 Gemini | 我負責設計與實作，Gemini（Antigravity CLI）做內容草稿與審查 |
| D17 | 其他 5 個遊戲暫停 | 不動它們，Hub 標為「暫停更新」 |

---

## 2. 系統邊界

- 前端：Vercel，`frontend/` 靜態檔（新增頁面，不改舊頁）。
- 後端：Railway，FastAPI（新增 router，不改既有路由）。
- 資料庫：同一個 Postgres，新增資料表，不改既有表。
- 內容：JSON 檔隨程式碼部署（不進資料庫），可版控、可追溯、可回退。

## 3. 回退機制（D3）

1. 舊遊戲 `frontend/pages/pecha_kucha_builder.html`、`pk_results`、`POST /game/pk-result` 完全不動。
2. 新遊戲走新網址 `/pages/mission.html`，新資料表，前綴 `mission_*`。
3. Hub（`member_index.html`）同時列出「Pecha Kucha 卡牌（現行版）」與「SDG Mission（新版）」。
4. 後端環境變數 `MISSION_GAME_ENABLED=true|false`：設為 false 時新版 API 回 404、Hub 不顯示新版入口，等同回到今天的狀態。
5. 資料不互相依賴，回退不需要任何資料庫還原。

## 4. 內容管線

```
teach_material/*.xlsx
  └─ scripts/extract_content.py  →  content/source/<mission>.json     講稿、標題、Part、各級文本
content/authored/<mission>.json     角色、情境、儀表、決策卡、事件卡、結局、Stage 情境句（我撰寫）
content/vocab/<mission>.json        每 Stage 6 個目標字：詞性、CEFR、中文、例句（我撰寫）
  └─ scripts/build_content.py    →  content/build/<mission>.json      遊戲可直接吃的檔案（含自動生成題目）
                                 →  content/build/manifest.json       版本、雜湊、統計
```

- 內容版本 `content_version = 2026.09.1`，寫進每一筆學習事件，日後改題不會污染舊資料。
- 重建指令：`python scripts/build_content.py`（純函式，輸入相同輸出相同）。

### 4.1 `content/source/<mission>.json`（抽取產物）

```json
{
  "mission_id": "sdg13-1",
  "sdg": 13,
  "title_en": "Climate Action – Taiwan's Path to Net Zero",
  "levels": ["A2", "B1", "B2"],
  "stages": [
    { "part_no": 1, "title_zh": "引言", "title_en": "Introduction",
      "cards": [
        { "slide_no": 1, "title_en": "The Hook", "title_zh": "吸睛開場",
          "script": { "A2": "...", "B1": "...", "B2": "..." },
          "numbers": ["1.5°C"] }
      ] }
  ]
}
```

### 4.2 `content/authored/<mission>.json`（我撰寫）

```json
{
  "mission_id": "sdg13-1",
  "role": { "en": "City energy planner", "zh": "城市能源規劃師" },
  "briefing": { "en": "...", "zh": "..." },
  "meters": [
    { "id": "emissions", "label_en": "Emissions", "label_zh": "排放", "start": 5, "good": "down" },
    { "id": "security",  "label_en": "Energy security", "label_zh": "能源安全", "start": 5, "good": "up" },
    { "id": "economy",   "label_en": "Economy", "label_zh": "經濟", "start": 5, "good": "up" }
  ],
  "stage_intros": { "1": { "en": "...", "zh": "..." }, "...": {} },
  "decision": {
    "stage": 4, "prompt_en": "You can fund two of these this year.",
    "options": [
      { "id": "grid", "text_en": "Smart grids that cut waste with AI",
        "energy": 3, "requires_evidence": ["emissions-gap"],
        "effects": { "emissions": -2, "security": 2, "economy": 0 } }
    ]
  },
  "event": { "stage": 5, "text_en": "A summer peak hits the grid.",
             "options": [ { "id": "ration", "text_en": "...", "effects": {} } ] },
  "endings": [
    { "id": "pioneer", "when": { "emissions": "<=3", "security": ">=6" },
      "title_zh": "淨零先驅", "report_en": "..." }
  ],
  "final_prompt": { "en": "Explain in 20 seconds why you funded these two.", "zh": "…" }
}
```

### 4.3 `content/vocab/<mission>.json`（我撰寫）

```json
{ "mission_id": "sdg13-1",
  "stages": { "4": [
    { "word": "efficient", "pos": "adj.", "cefr": "B1", "zh": "有效率的",
      "example_card": 10, "collocations": ["energy efficient"] }
  ] } }
```

---

## 5. 遊戲規則（可調參數集中在 `content/build/rules.json`）

### 5.1 一個 Stage（約 4–5 分鐘）

| 步驟 | 內容 | 給分 / 資源 |
| --- | --- | --- |
| 1 情境卡 | 2 句英文任務情境（我撰寫），可切中文 | — |
| 2 單字暖身 | 3 題（本 Stage 目標字） | 每題答對 +1 Energy |
| 3 卡牌建構 | 現行配對機制：抽句子卡 → 聽 → 配到 slide 標題；本 Stage 3–4 張 | 全對 +2 Talk Strength；含數字的卡答對得 1 張 Evidence |
| 4 決策 / 事件 | Part 4 決策卡、Part 5 事件卡；其餘 Stage 為小抉擇（花 1 Energy 取提示） | 消耗 Energy，改變儀表 |
| 5 Stage 小測 | 2 題（理解 1、語言形式 1） | 每題答對 +1 Talk Strength |
| 6 解鎖 slide | 該 Stage 的 slide 進入「我的演講」 | — |

- 起始 Energy 10，每 Stage 補 3；不足時只能選便宜的決策選項。
- 答錯不扣分，該題進入複習佇列；同一張卡第 2 次錯 → 顯示提示（降一級改寫，Phase 2 由 AI 產生，先用 A2 稿當提示）。
- **速度完全不計分**（只記錄時間供分析）。

### 5.2 結局判定

Mission 結束時比對 `endings[].when`，取第一個成立者；都不成立則用 `fallback`。報告內容：三個儀表最終值、Talk Strength 等級（S/A/B）、最常錯的 3 個字、最弱技能、下一步按鈕。

### 5.3 Showtime

把 6 個 Stage 解鎖的 slide 依序播放，每張 20 秒；學生可選：
(a) 錄音跟讀（預設，D8/D9）、(b) 靜音排練＋自評 3 題、(c) 同儕互評。

---

## 6. 題目自動生成規則

| 題型 | 生成方式 | 干擾項 |
| --- | --- | --- |
| 單字克漏字 | 目標字在講稿原句中挖空 | 同 Stage 其他目標字（同詞性優先） |
| 定義配對 | 中文釋義 → 選英文字 | 同 Stage 其他目標字 |
| 標題配對 | 句子 → 選 slide 標題 | 同 Mission 其他 Part 的標題 |
| 數字細節 | 句中數字挖空 | 數字 ±倍數、同主題其他數字 |
| 段落排序 | 同 Part 的 3 張卡排序 | — |

答案不寫在前端下載的內容裡：前端送 `item_id + response`，由後端比對（後端有同一份 build 檔）。

---

## 7. 資料庫（新增，不改舊表）

```sql
player_profiles(anon_id uuid pk, user_id int fk users, nickname text, level text,
                consent_audio bool, consent_ai bool, created_at timestamptz)
classes(class_id serial pk, teacher_user_id int fk users, name text, term text, join_code text unique,
        settings_json jsonb)
class_members(class_id int, anon_id uuid, joined_at timestamptz, primary key(class_id, anon_id))
mission_runs(run_id uuid pk, anon_id uuid, mission_id text, level text, status text,
             energy int, evidence jsonb, meters jsonb, talk_strength int, ending_id text,
             content_version text, started_at, ended_at)
mission_actions(action_id bigserial pk, run_id uuid, stage_no int, action_type text,
                card_id text, choice_id text, energy_delta int, meter_delta jsonb, at timestamptz)
attempts_v2(attempt_id bigserial pk, anon_id uuid, run_id uuid, item_id text, context text,
            response text, is_correct bool, attempt_no int, duration_ms int, error_tag text, at timestamptz)
vocab_progress(anon_id uuid, word text, box int, due_at date, correct_count int, wrong_count int,
               primary key(anon_id, word))
skill_mastery(anon_id uuid, skill text, score numeric, updated_at, primary key(anon_id, skill))
speaking_records(record_id bigserial pk, anon_id uuid, run_id uuid, card_id text, mode text,
                 duration_s numeric, wpm numeric, self_score int, teacher_score int,
                 mime text, audio bytea, created_at)   -- 永久保存，單檔上限 5 MB
learning_events(event_id uuid pk, anon_id uuid, run_id uuid, type text, object_kind text,
                object_id text, result_json jsonb, duration_ms int, content_version text,
                device_json jsonb, client_ts timestamptz, server_ts timestamptz)
mission_leaderboard(season_id text, mission_id text, level text, anon_id uuid, best_score int,
                    improvement int, hidden bool, primary key(season_id, mission_id, level, anon_id))
```

SQLite 本機開發用同一組 DDL 的相容版本（`bytea` → `BLOB`、`jsonb` → `TEXT`），沿用現有 `init_db()` 寫法。

## 8. API 契約（新增 `/mission/*`）

| 方法 | 路徑 | 用途 | 權限 |
| --- | --- | --- | --- |
| GET | `/mission/catalog` | 9 個 Mission 的清單、可用級別、完成狀態 | JWT |
| GET | `/mission/{id}?level=B1` | 遊戲內容（不含答案） | JWT |
| POST | `/mission/{id}/runs` | 開始一場，回 `run_id`、起始資源 | JWT |
| POST | `/mission/runs/{run_id}/answer` | `{item_id, response, duration_ms}` → 對錯、資源變化 | JWT |
| POST | `/mission/runs/{run_id}/action` | 決策/事件/提示 → 儀表變化 | JWT |
| POST | `/mission/runs/{run_id}/finish` | 結算 → 結局、弱點、複習清單 | JWT |
| POST | `/events` | 批次事件（≤50 筆） | JWT |
| GET | `/review/next` | 個人化複習路徑 | JWT |
| POST | `/review/vocab` | 單字複習結果 | JWT |
| POST | `/speaking` | 上傳錄音（multipart，≤5 MB） | JWT |
| GET | `/mission/leaderboard?mission&level` | 匿名榜 | JWT |
| GET | `/teacher/classes/{id}/missions` | 班級進度（含真名） | teacher |
| GET | `/teacher/speaking?class_id` | 錄音清單與播放 | teacher |

## 9. 前端頁面

| 頁面 | 內容 |
| --- | --- |
| `pages/mission_map.html` | 9 個 Mission 卡片、級別選擇、完成度、待複習數 |
| `pages/mission.html` | 主遊戲：Stage 進度列、資源列（Energy/Evidence/三儀表）、卡桌、決策面板、小測 |
| `pages/showtime.html` | 20 秒節奏播放、錄音、自評 |
| `pages/mission_report.html` | 結局、儀表結算、弱點、下一步、匿名榜 |
| `js/mission/*.js` | ES modules：`state.js`、`engine.js`、`cards.js`、`api.js`、`events.js` |

舊頁面與 `js/api.js` 保持不動，新模組獨立。

## 10. 口說與錄音

- 錄音在瀏覽器以 `MediaRecorder` 取得（iOS 產出 mp4、Chrome 產出 webm，後端兩者都收）。
- 上傳到 `POST /speaking`，存進 `speaking_records`（bytea）；**永久保存**（D9）。
- 前端顯示時長與語速（本機計算），不需要 AI。
- 教師端可列出、播放、給 1–3 分。
- `AI_API_KEY` 有設定時才呼叫 AI 評分（D10），否則該區塊顯示「AI 評分未啟用」。

## 11. 教師端（沿用現有 dashboard 再加分頁）

班級總覽（完成率、平均技能）、學生個人頁（真名）、單字弱點 Top 20、錄音清單、CSV 匯出。

## 12. 里程碑（每個里程碑都有你看得到的東西）

| M | 交付 | 你可以驗收什麼 |
| --- | --- | --- |
| M1 | 內容管線 + 9 個 `content/source` + 1 個完整 Mission（4-1）的 authored/vocab | 看 JSON 內容、看抽出來的講稿對不對 |
| M2 | `build_content.py` 與自動題目 | 看 4-1 的題目品質 |
| M3 | 後端資料表與 `/mission/*` API（本機） | 用 curl 或我附的測試腳本看回應 |
| M4 | 前端 Mission Map + Stage 迴圈（4-1 可玩） | 本機實際玩一個 Mission |
| M5 | Showtime + 報告 + 複習 + 匿名榜 | 玩完整一輪 |
| M6 | 其餘 8 個 Mission 內容補齊 | 每個主題都能玩 |
| M7 | 錄音、教師端、部署上線 | 線上玩、教師後台看資料 |

每個里程碑一次 commit，訊息前綴 `feat(mission):`，文件同步更新。

## 13. 驗收與驗證

- 每次 commit 前：`python -m py_compile backend/*.py`、`python scripts/build_content.py`、`npm run build`。
- 新增 `scripts/test_mission_engine.py`：內容完整性（每個 Mission 每級都有 6 Stage、題目答案存在、結局條件互斥）、API 煙霧測試。
- 我不會宣稱「可以玩」而沒有實際跑過一輪。

## 14. 風險與取捨

| 風險 | 取捨 |
| --- | --- |
| 內容量大（9 主題 × 6 Stage 的單字與決策） | 先把 4-1 做完整當樣板，其餘照模板量產；Gemini 產草稿、我審 |
| 音檔 130 MB 不進版控 | 先用瀏覽器 TTS；之後改用預先產生的 MP3 放物件儲存 |
| 錄音永久保存會長大 | 單檔 5 MB 上限、只存必要片段；超過再搬物件儲存 |
| Postgres 存 bytea 不是長久之計 | 介面抽成 `storage.py`，日後換 S3/R2 不動上層 |

## 15. 待你確認（不擋開工，但會影響細節）

1. 錄音永久保存：先存資料庫可以嗎？（之後可搬物件儲存）
2. 班級功能要不要在這一輪就做？（不做的話教師端只看得到全部學生）
3. Showtime 要不要強制錄音才算完成？（建議不強制）
