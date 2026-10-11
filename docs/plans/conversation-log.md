# 專案對話與決策紀錄

這不是逐字稿——工具呼叫、重試、雜訊太多，逐字沒有用。這是按階段整理的「誰決定了什麼、為什麼、做出了什麼」，給下一次接續這個專案（不管是我還是別人）看得懂來龍去脈。時間標記是對話發生的日期，不是事件本身的日期。

## 起點（2026-09 中旬之前，壓縮前的摘要）

使用者的原始需求是一份長篇中文簡報：要我扮演資深教育科技專家（CEFR 分級、SDGs 教育、遊戲化學習、卡牌機制、學習分析、UX、系統分析、評量），先分析 `teach_material`（不重新設計）、列出問題、再提出 CEFR 分級的 SDGs 課程、學習鏈、遊戲迴圈重設計、口說系統比較、個人化測驗迴圈、裝置矩陣、後端資料設計、匿名排行榜、系統架構、資料庫設計、UX 流程、教材×遊戲對照表、分階段路線圖，最後交一份 22 節的線上報告。要求用 `[DECISION REQUIRED]` / `[PROPOSAL]` / `[FUTURE]` 標記，走「分析→提案→取捨→提問→決策→修訂」，不要我自己單方面決定。

關鍵指示：Gemini 當下屬；保留現有教材為核心；在既有程式碼基礎上做（Vercel 前端＋Railway 後端，auto-deploy 已經在跑）；現有遊戲「很無聊，草草結尾」；可以考慮 AI 輔助學習。

後續陸續加入的指示：先出 DRAFT 再寫程式碼，所有文件要進版控；要看到跟 Gemini 協作的每一頁 UI/UX；使用者指出我對現有程式碼與風格不熟（截圖對照後重做）；遊戲被批評「都是文字且沒故事性，像填鴨式教育」；要開多個 agent 團隊、外包給 Gemini 省 token；溝通要用特定的 Claude Docs 連結。

這一段做出的東西：`docs/research/`（敘事框架、3D 場景計畫、架構評論、GBL 證據摘要、程式碼整合地圖）、`docs/ux/`（風格指南、原型、線框圖）、`docs/diagrams/`、`docs/plans/2026-09-20-mission-engine.md`。

## 第一階段：教材現況分析 → 發現尺規本身是壞的（約 09-21 ～ 09-22）

使用者把焦點收斂到「先把 SDGs 教材整理乾淨」，目標是未來做成真人站上台演講、穿插卡牌遊戲、多故事線、3D 場景的形式。要求：原內容不能動，格式可以調；每個 SDG 用同一套難度分級模板；**一個 SDG＝一個任務，三個難度 A2/B1/B2**；SDG4 的自建題庫檔是標準格式，其他兩份明顯缺難度，缺的由我以專業英文老師身分補。

開發出 `scripts/extract_content.py`（從工作表解析出 `content/source/*.json`）、`scripts/author_levels.py`（找缺口、出撰寫提示、驗收）、`scripts/build_canonical.py`（收斂輸出交付格式）。

**關鍵轉折**：舊的驗收方式只看「整個任務的平均值」，看不出兩個真正的缺陷——A2 跟 B1 其實是同一段文字換同義詞、B2 只是換難字句法沒進步。我自己重寫 SDG13-1 當「黃金範本」時被自己的新閘門打回來四次，證明閘門是真的在檢查東西，不是裝飾。

同時發現 SDG1 的原始工作簿已經從硬碟上消失（`SDGS_TEXT` 資料夾不見了），從 git 歷史救回 `content/authored/missions/sdg1.source.json`。

找了三方獨立稽核 SDG13-1：一個 CEFR 評量 agent、一個口說教練＋事實查核 agent、Gemini 3.1 Pro 外部考官。三方都指向同一個結論，我據此重寫黃金範本到四項檢查全過，並記錄下哪些稽核建議被接受、哪些被我以理由駁回（例如 Gemini 建議刪掉碳費已生效的敘述，我查證後維持原樣）。

產出：`scripts/quality.py`（四項逐投影片檢查：fit／ladder／distance／lint）、`scripts/gate.py`。10 個既有 Mission（SDG1、4-1、4-2、5-1、5-2、9-1、9-2、9-3、13-1、13-2）全部通過。報告分頁「教材品質稽核」記錄完整方法論。

## 第二階段：17 SDGs × 3 任務擴充（09-23 ～ 09-24）

使用者說要補足所有 SDGs，每個都跟 SDG9 一樣有三個任務——等於要從零寫約 40 篇全新 Pecha Kucha 講稿，不是重分級。

基礎建設：`extract_content.py` 改成自動掃描 `content/authored/missions/*.source.json`（不用再為每個新 SDG 改程式碼）；`build_canonical.py` 改成自動發現任務；寫了 `docs/plans/new-mission-playbook.md` 當所有新任務 agent 的共同手冊（研究真實事實→找 Gemini 起草→我驗證→過閘門）。

在報告分頁「SDGs 教材擴充計畫（17×3）」發布完整 51 個任務選題清單（10 個既有＋41 個新提案）。開五個 agent 並行寫作，過程中多次撞到 Claude 帳號的 session rate limit 跟 Gemini 的個人額度上限（兩者都是當天多次重置），每次都原地續跑、不重新開始。

**第五項檢查**：補上 `scripts/grammar_range.py`——四項閘門看不出「B2 是否真的用了 B2 的文法」，這個新檢查直接抓結構（分裂句、倒裝、分詞子句等），不只看字難不難。

使用者一度要求「先把目前進度確實落地，後面可以先不做」——照做：盤點所有 agent 已產出但未驗證的東西、全部提交、如實記錄哪些完成、哪些卡在半路。

後續指示「把編號檔名改一下，未過品質審查進行到一半的放一個資料夾，canonical只放能用的」：把 `sdg1` 改名成 `sdg1-1`（統一編號格式）；新增 `content/drafts/`，未完成/失敗的任務移出掃描範圍；`build_canonical.py` 跟 `extract_content.py` 都改成每次執行自清，不留殘留檔（清掉了 18 個舊版殘留）。

**目前狀態：51 個 Mission 中 22 個完全通過雙閘門**，4 個進行到一半（在 `content/drafts/`），其餘未開始。

## 第三階段：遊戲敘事設計（09-24）

使用者轉向遊戲層：要故事情節、多條可控故事線、3D 場景（走上台演講）、彈出的演講視窗、保留卡牌遊戲（在演講中可以發卡給觀眾，接續卡牌對戰）。明確要求我自己先想一輪，再交給 Gemini 用最強模型深度發想。

我自己先提出 Node Graph + 3D 過場 + 發卡機制的構想，寫出完整提示交給 Gemini（`agy.exe --model gemini-3.1-pro-high`）——結果 Gemini 個人額度當天已被稍早的任務撞滿（46 小時後重置）。沒有空等，自己把五個設計問題全部回答完，提示檔存進 `docs/plans/gemini-game-design-prompt-pending.md` 供額度恢復後重跑。

完整設計發布在報告分頁「遊戲敘事設計 DRAFT」：Node Graph 架構（沿用既有六拍骨架與 Evidence Economy）、發卡機制完整設計（1 張卡＝1 個既有 evidence 單位，不超支撰寫預算）、SDG13-1 完整六拍走一遍的體驗敘述、一套引擎跑 51 個 Mission 的資料結構、我認為哪些既有限制可以挑戰哪些不行。

## 第四階段：Node 1 可玩原型（09-25）

使用者要求「接手先做出第一個場景我看看就好」。做出 `docs/ux/prototype/node_scene_v1.html`——3D 過場（走廊→辦公室門）＋演講視窗（真實 SDG13-1 B1 講稿 1-6 張）＋拖卡到觀眾頭像的新機制。用 headless Chrome 實機驗證全流程（含數學：儀表從 8/8/8 正確算到 12/11/11）。

使用者看完回饋：「3d場景不夠細緻，如果遇到不支援3d的瀏覽器怎辦」。兩個都補：

1. 3D 場景加了天花板燈板、柱子裝飾、天際線剪影窗、雙色地板走道、門框、走路手臂擺動——維持示意化風格，不是寫實。
2. 補上真正的降級路徑（`docs/research/3d-scene-plan.md` 早就寫好規格，但第一版原型完全沒實作）：沒有 WebGL → 立即 2D；WebGL 初始化失敗 → 2D；前 15 幀 frame time 太慢 → 中途切 2D；`webglcontextlost` → 攔截＋切 2D＋不重試。用 headless Chrome 測試時，軟體渲染真的觸發了 frame-time watchdog，不是刻意模擬的假測試。

## 第五階段：備份嘗試（10-11）

時間跳到 10-11（中間有 session 間隔）。使用者要求「完整內容須在github上」。查出這個 repo（`SDGsprogram_5.0`）其實有 GitHub remote（`cathyenglishing-lang/SDGsCardGame3.0`），但工作分支 `feat/mission-engine` 從沒推過，本機領先 `origin/main` 30 個 commit。推送時被拒絕 403——本機兩個已登入帳號（`Iwatchyouwatchme`、`machencompeq`）都沒有這個 repo 的寫入權限。使用者選擇「把其中一個帳號加為 collaborator」，但尚未確認完成。

使用者接著改口「算了你丟上google drive」，並強調「所有內容都要一個都不少」。查出三個分開的地方才算完整：
1. git 有追蹤的內容（`git archive HEAD`，22MB）
2. 被 `.gitignore` 排除的交付用 Excel（`content/canonical/SDGs_PechaKucha_v1.xlsx`，不在 git 裡）
3. 這個 repo 外面的四份原始教材 Excel（`../teach_material/`，從未被動過的原始來源）

明確排除：`.env`／`.env.local`（密鑰，絕不上傳）、`sql/`（本機執行期資料庫快照）、舊版 `SDGsprogram_1.0`～`4.0`（不同專案版本）、跟這個專案無關的個人行政文件。

本機已打包好三份檔案待傳，但 Google Drive 連接器本身權限範圍不足（`Insufficient scope`），連列出檔案都不行——需要使用者到 claude.ai 連接器設定重新授權。**截至這份紀錄寫下時，GitHub 跟 Google Drive 兩邊都還沒有真的傳成功，本機是唯一完整副本。**

## 目前真正的狀態（給下一次接續看的人）

- 教材：51 個 Mission 中 22 個完全通過品質閘門（四項＋文法範圍），4 個半成品在 `content/drafts/`，其餘未開始。細節見 `docs/plans/PROGRESS.md`。
- 遊戲設計：Node Graph＋3D 過場＋發卡機制的完整 DRAFT 已寫完，Node 1 可玩原型已驗證（含 2D 降級路徑）。還沒做：Gemini 的深度審查（額度卡住，提示檔已存）、地圖層、S3-S6 其餘節點、答辯回合卡牌對戰的實作。
- 備份：GitHub 權限未解決；Google Drive 連接器未授權。本機 `feat/mission-engine` 分支是目前唯一存在這批工作的地方——**還沒有任何異地備份**，這是目前最大的風險，不是教材或遊戲設計本身。
