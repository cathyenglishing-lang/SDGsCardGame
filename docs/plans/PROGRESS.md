# 專案進度與續作說明（最後更新 2026-09-21）

分支 `feat/mission-engine`，**尚未 push**（push 會觸發 Vercel / Railway 自動部署，等使用者同意）。
溝通主文件：https://claude.ai/code/artifact/1aeee29a-b580-44be-b62c-6e6d0ccdc344 （四個頁籤：Round 1 Report / 實作 DRAFT v1 / UI/UX 線框圖 v1 / 設計 DRAFT v2）

## 已完成

| 項目 | 位置 | 狀態 |
| --- | --- | --- |
| 現有教材分析、十大問題、新架構、匿名排行榜、資料模型 | 文件頁籤 1（22 節） | 完成，決策 D1–D17 已由使用者填答 |
| 實作設計 v1 | `docs/plans/2026-09-20-mission-engine.md`、文件頁籤 2 | 完成，部分被 v2 取代 |
| 七張架構圖（drawio + PNG + 產生器） | `docs/diagrams/` | 完成 |
| UI/UX 線框圖 v1（淺色） | `docs/ux/` | **作廢**：風格與現有產品不符 |
| 可玩原型（SDG 13-1 片段，深色風格 + 故事 + 會變的城市） | `docs/ux/prototype/mission_prototype.html` | 完成，點兩下可開 |
| 深色風格樣式指南（token 都標來源行號、SDG 17 色、對比驗證） | `docs/ux/style-guide.html` | 完成 |
| 文獻證據簡報（10 原則、3 個推翻現有決策的發現、證據薄弱清單） | `docs/research/evidence-brief-gbl-call.md` | 完成 |
| 現有程式碼整合地圖（file:line、重用/擴充/不要動、11 個地雷） | `docs/research/codebase-integration-map.md` | 完成 |
| 3D 場景計畫（授權、效能預算、pipeline、StageShell API、降級） | `docs/research/3d-scene-plan.md` | 完成 |
| 敘事框架 + SDG 13-1 參考劇本 + 10 項品管清單 | `docs/research/story-framework.md` | 完成 |
| Gemini 架構反駁（6 點） | `docs/research/gemini-v2-architecture-critique.md` | 完成，已採納 5 點 |
| Gemini 撰寫的 9 個 Mission 故事草稿 | `content/authored/_drafts/gemini-story-drafts-v1.md` | **未審核**，需套 10 項品管清單 |

## 未完成

1. **評量與內容管線規格**（抽取 schema、目標字演算法、自動出題規則、CEFR 校準、驗證腳本）— 原本的 agent 因額度中斷，需重做。
2. 文件頁籤 4 的第 6、7、10 節（UI/UX v2、內容管線、里程碑與風險）。
3. Gemini 故事草稿的品管審核與改寫。
4. 任何程式碼實作（尚未開始寫 Mission Engine 的前後端）。

## 已鎖定的設計決策

- 只重構 SDGs 遊戲；登入、視覺風格、教師後台沿用；現行卡牌遊戲一行不改，作為隨時回退的版本。
- 核心機制 = **Evidence Economy**：讀懂英文數據句才拿得到證據，證據解鎖更強的決策選項。
- 故事 = branch-and-bottleneck，六拍骨架，每 Mission 2 個決策點 + 1 個挑戰節拍，三個儀表決定三種結局。**砍掉語氣分支（stance）**。
- 敘事壓薄（每關開場 ≤ 3 句），**3D 做示意化空間圖解、不做寫實**，弱裝置自動降 2D，學生閱讀時場景凍結。
- 一週一個 Mission、鋪 6–8 週；每關後綁 10 分鐘教師 debriefing（效果量從 0.40 拉到 0.91 的關鍵）。
- 回饋一律附解釋，禁止純 ✓/✗；口說強制兩人一組互錄互評。
- 成效目標 d ≈ 0.4–0.6，必須加做四週後的延宕後測。

## 待使用者決定

1. **排行榜**：文獻顯示「匿名排行榜」是最沒有理論支持的組合（犧牲關聯感又保留比較壓力）。建議改「個人進度 + 4–6 人具名小組榜」。這會推翻原本的 D12。
2. 錄音永久保存先存 Postgres 可否（之後可搬物件儲存）。
3. 班級功能這一輪是否要做。
4. Showtime 是否強制錄音才算完成（建議不強制）。
5. **是否 push 分支到 GitHub**（會觸發自動部署）。

## 續作時的第一步

讀本檔 → 讀 `docs/research/` 四份 → 讀文件頁籤 4（設計 DRAFT v2）→ 從「未完成」第 1 項開始。
