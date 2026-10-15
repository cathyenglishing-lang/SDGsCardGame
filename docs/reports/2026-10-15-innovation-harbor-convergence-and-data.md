# Innovation Harbor（SDG 9-1）：故事收斂與數據收集報告

日期：2026-10-15 ｜ 分支：`company/story-nodes` ｜ 作者：公司端 AI ｜ 給：使用者、老師、接手的 AI

## 1. 故事怎麼收斂

第一章有 **8 個 NPC 節點**，其中 2 個是支線（李領班、記者 Ana），1 個會把人退回（議會）。玩家在 Mei 之後可以任意順序找 Kai、Dr. Hsu、李領班；所有路線最後都經過議會 → 工坊 → 劇場，由四個變數決定六種結局之一。

```mermaid
flowchart LR
  M[Mei · 碼頭<br/>聽力] --> K[Kai · 實驗室<br/>閱讀 + 選擇一]
  M --> H[Dr. Hsu · 檔案館<br/>卡牌遊戲]
  M --> F[李領班 · 貨櫃碼頭<br/>支線：聽力一題]
  K -- 隱瞞 --> R[記者 Ana · 議會廣場<br/>選擇：說實話 / 不評論 / 否認]
  K --> C{議會<br/>Kai+Hsu 完成？<br/>證據 ≥ 2？}
  H --> C
  F -. +證據 .-> C
  R -- 否認(scandal) --> FP([Front Page<br/>提早結局])
  C -- 證據不足 --> C
  C -- 口說 --> W[工坊 · Dr. Hsu<br/>排序 + 選擇二]
  W --> T[劇場<br/>Pecha Kucha]
  T --> E1([Harbor of Integrity])
  T --> E2([The Evidence Speaks])
  T --> E3([Proceed with Caution])
  T --> E4([Standstill Harbor])
  T --> E5([Fog of Hallucination])
```

### 變數

| 變數 | 來源 | 用途 |
|---|---|---|
| `integrity` 誠信 | 選擇一（+2/+1/−2）、記者（+2/−1/−2）、選擇二（+2/0/−2） | 最佳結局門檻 ≥ 3 |
| `evidence` 證據 | Kai 陪查或通報 +1、Dr. Hsu +1、李領班答對 +1 | 議會門檻 ≥ 2；三個來源可觸發 The Evidence Speaks |
| `kai` | help / report / hide | 隱瞞開啟記者節點；影響議會、Dr. Hsu 的台詞 |
| `reporter` / `scandal` | told / silent / denied | 否認 → 到議會時提早結局 |
| `approach` | verify / ban / trust | 決定結局大類 |
| 各關星數 | 聽力、閱讀、卡牌、口說、排序、發表（0–3，口說可能「待老師評分」或「未完成」） | 平均星數 ≥ 2.3 才有最佳結局 |

### 結局判定（由上往下第一個符合的）

1. **Front Page**（提早）：對記者否認後走到議會。
2. **Fog of Hallucination**：選擇二「照單全收」，或「隱瞞」且沒選「查證」。
3. **Standstill Harbor**：選擇二「全面禁用」。
4. **Harbor of Integrity**：查證 ＋ 誠信 ≥ 3 ＋ 證據 ≥ 2 ＋ 平均星數 ≥ 2.3。
5. **The Evidence Speaks**：查證 ＋ 證據 = 3 ＋ 誠信 ≥ 1（發表不穩但證據齊全）。
6. **Proceed with Caution**：其餘。

## 2. 每個節點收集什麼數據

所有紀錄都是「學習事件」（Learning Log），正式版會寫入後端的 `learning_events` 表；目前只存在瀏覽器。

| 節點 / 活動 | 事件 | 欄位 |
|---|---|---|
| 所有對話 | `story.line`、`story.replay`、`hint.zh` | 誰說的、是否重聽、是否開中文提示 |
| 選擇 | `story.choice` | 選項、誠信變化 |
| 聽力（Mei、李領班） | `listen.play`、`listen.answer` | 播放次數、每個空格錯幾次、漏掉的目標字彙 |
| 閱讀（Kai） | `read.match`、`read.find` | 配對錯誤、找字錯誤、閱讀秒數 |
| 卡牌（Dr. Hsu，正式卡牌遊戲） | `cardgame.open`、`card.done`（＋卡牌遊戲自己送 `/game/pk-result`） | 錯誤、重播、秒數；錯誤數 > 卡片數標「可能在猜」 |
| 口說（議會） | `speak.demo`、`speak.attempt`、`speak.record`、`speak.skip` | 每次嘗試的覆蓋率、漏念單字、是否改錄音給老師、是否略過 |
| 排序（工坊） | `seq.done` | 錯誤次數 |
| 發表（劇場） | `pk.slide`、`pk.record`、`pk.skip` | 每張投影片覆蓋率、整段錄音、是否略過 |
| 節點流程 | `node.start`、`node.done`、`objective.pick`、`move` | 走訪順序、每個節點當時可選的節點、被退回的次數、是否用 Skip |
| 世界互動 | `story.overhear`、`portal.touch`、`safety.hit`、`drive.enter`/`drive.exit`/`drive.bump` | 偷聽到的提示、碰玻璃牆、被車撞、開車時間與碰撞 |
| 結局 | `ending` | 結局、平均星數、誠信、證據、完整路線 |

## 3. 後台可以算出的指標

| 類型 | 指標 |
|---|---|
| 成績 | 各關星數、平均星數、口說覆蓋率、待老師評分的錄音清單 |
| 診斷 | 全班漏念／漏聽最多的目標字彙、重播次數分布、卡牌「可能在猜」比例、閱讀時間 vs 正確率 |
| 行為 | 走訪順序（先找誰）、支線完成率、被議會退回的比例、中文提示使用率、每關停留時間 |
| 故事 | 六種結局的分布、誠信／證據分布、隱瞞路線比例 |
| 安全與探索（遊戲設計用） | 被車撞次數、開車時間、跳躍次數、偷聽次數 |

## 4. 目前限制

- 數據只在瀏覽器，重新整理即消失；後端事件 API 尚未做。
- 口說三層中「雲端發音評分」尚未接；無麥克風時改錄音或略過。
- 9-2、9-3 尚未實作（玻璃牆後只有剪影）。

## 5. 真實素材來源（場景、人物、聲音）

程式已做成「有模型就用、沒有就用幾何體」的漸進替換（`GAME_INDEX.md` §9）。素材來源依推薦順序：

| 來源 | 授權 | 適合什麼 | 怎麼拿 |
|---|---|---|---|
| Sketchfab（sketchfab.com，搜尋勾 Downloadable＋CC-BY／CC0） | CC0 免標示；CC-BY 要在遊戲裡列出作者 | 貨櫃輪、拖船、橋式起重機、轎車／貨車、燈塔、港口建築；真實度最高、數量最多 | 下載 glTF（即 GLB），每個 ≤ 10 MB 優先；下載需帳號 |
| Poly Haven（polyhaven.com） | CC0 | 天空 HDRI（黃昏港口）、地面材質（柏油、混凝土、磚、鏽蝕金屬）、路燈、長椅 | 2K 即可，直接下載；有公開 API，公司端可直接抓 |
| Ready Player Me（readyplayer.me） | 免費 | 人物：真實比例、可捏臉選服裝、骨架與現有 30 個動作相容 | 線上捏完複製 .glb 網址，加 `?pose=T`；**公司代理擋此站，需家裡下載** |
| Mixamo（mixamo.com，Adobe 帳號免費） | 免費可商用 | 60 多個真實人物＋上千動作 | 下載 FBX → Blender 轉 GLB |
| Quaternius、Kenney | CC0 | 車輛包、城市包、人物包；乾淨低多邊形，輕量統一，不是照片級 | 直接下載，含 GLB |
| TurboSquid／CGTrader | 付費（$5–50／個） | 要「一模一樣」的特定船型、車款 | 買 glTF 或 FBX |
| Meshy、Tripo、Rodin（AI 生成） | 依方案 | 一張真實照片生成 GLB，補找不到的物件 | 線上生成後下載 |

規格：GLB＋Draco，單一模型 ≤ 10 MB，整個場景手機 ≤ 60 MB、桌機 ≤ 150 MB；人物 T-pose、RPM／Mixamo 骨架；會動的部件分開命名。每個素材的作者與授權寫進 `assets/CREDITS.md`。
公司代理實測（2026-10-15）：sketchfab.com、polyhaven.com、mixamo.com 可連；readyplayer.me 被擋。

## 6. 相關案例研究：別人怎麼做（2026-10-15 查）

| 案例 | 做法 | 我們可以學的 |
|---|---|---|
| **Crystal Island**（北卡州立大學，敘事中心學習環境，科學探究） | 學生扮演調查員在 3D 島上與 NPC 對話找線索；研究發現「學生與 NPC 的對話特徵」加入模型後比只看解題行為更能預測學習成效；嵌入反思提示（寫下你學到什麼）與學習成果相關；團隊版 EcoJourneys 前後測有顯著學習 | 把 NPC 對話當成數據來源（我們已記錄每句、每個選擇）；在關鍵節點加「反思提示」（例如議會後請學生用一句英文寫下為什麼要查證），記進事件 |
| **Stealth assessment**（Shute，證據中心設計 ECD） | 先定義要評什麼能力（claim）、什麼行為算證據（evidence）、什麼任務引出證據（task），再用貝氏網路累積證據，學生不覺得在考試 | 我們的「證據／誠信／星數」就是這個結構；下一步把每個活動對應到能力指標（聽力辨識、字彙、口說流暢），讓後台報「能力」而不只「分數」 |
| **POMY**（POSTECH 沉浸式英語，對話型 3D 學習遊戲） | 與 3D 角色自由對話；關鍵元件是對話管理、提示生成、文法錯誤偵測與回饋 | 口說活動可加「提示」與「錯誤回饋」兩層，而不只算覆蓋率 |
| **EverQuest 2 當 ESL 工具**（2006 先導研究） | 中高級學生與 NPC 互動，字彙量提升 40%、對話訊息量倍增 | 自由探索與偷聽 NPC 聊天（我們已做）對字彙有幫助；低程度學生需要更多鷹架 |
| **台灣 3D 虛擬情境 EFL**（蘭國屏／NTNU 等） | 國小生一學期在虛擬情境學英語，表現提升；Second Life 台韓合作專案口說顯著進步、焦慮未升高 | 情境化＋低焦慮是 3D 的強項；可加跨班／跨校合作任務 |
| **老師要什麼樣的後台**（Kim & Scianna 2022；Calvo-Morata 2017；Fishman） | 老師看不懂點數與星星代表學了什麼；簡單、針對學習目標、和老師共同設計的儀表板比複雜通用的好 | 後台指標要對應學習目標（字彙弱點、口說覆蓋率、路線與決策），少堆數字；下一版請老師一起挑指標 |

來源：Crystal Island 反思研究 https://www.intellimedia.ncsu.edu/wp-content/uploads/sites/42/carpenter-lak-2021.pdf ；科學思考量測 https://www.frontiersin.org/journals/education/articles/10.3389/feduc.2020.572546/pdf ；Shute 隱性評量 https://myweb.fsu.edu/vshute/pdf/sa.pdf ；POMY https://globals.ieice.org/en_transactions/information/10.1587/transinf.E97.D.1830/_p ；EverQuest 2 ESL https://diglib.eg.org/handle/10.2312/eged.20061005.033-038 ；台灣 3D EFL https://scholar.lib.ntnu.edu.tw/en/publications/contextual-efl-learning-in-a-3d-virtual-environment-2/ ；老師儀表板 https://library.apsce.net/index.php/ICCE/article/view/4526 、 https://www.jucs.org/jucs_25_12/improving_teacher_game_learning.html 、 https://www.gamesandlearning.org/?p=2050
