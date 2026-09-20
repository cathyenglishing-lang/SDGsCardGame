# 敘事框架與參考劇本（2026-09-20）

依證據修正：敘事只當任務框架（有敘事 d=0.25 vs 無敘事 d=0.46），每關開場 ≤ 3 句，不寫世界觀與角色支線。

## 1. 六拍骨架（9 個 Mission 共用）

| 拍點 | 修辭段 | 玩家做什麼 | 產出 |
| --- | --- | --- | --- |
| S1 ARRIVAL | 引言 | 接委任、見盟友、讀 1 句數據句 + 1 題理解檢核 | E1 |
| S2 THE CRACK | 問題 | 判讀 2 句數據真偽 → **決策點 1** | 儀表首次變動 |
| S3 WHAT WORKS | 成果 | 訪談懷疑者，用他的條件換證據 | 瓶頸（無分支） |
| S4 THE BUILD | 解方 | 方案配對證據 → **決策點 2** | 花掉 token |
| S5 THE PUSHBACK | 影響 | 承受質疑 → **挑戰節拍**（3 種回應） | 單次最大擺動 |
| S6 THE STAND | 行動呼籲 | 結局揭曉 + **學生念出結尾句**（可錄音） | 結局 + 口說 |

固定不變：拍點順序、三角色原型（盟友給證據 / 懷疑者給條件 / 阻擋者給壓力）、三儀表、決策與挑戰的位置、「採 5 用 4」的 token 經濟、結局函式、recap 模板。
每個 Mission 才變：主題與場景、角色姓名、五句證據（**一律抄自該講稿 A2 欄**）、選項文字、結局文案、結尾句（取自第 20 張）。

## 2. 可控分支規格

狀態變數：`clarity, trust, impact`（int 0–20，起始各 8，寫入後 clamp）、`evidence 0–5`、`tokens_spent`、`stage 1–6`、`d1,d2 ∈ {A,B,C}`、`ch ∈ {strong,weak,bad}`（**僅供 recap 顯示，後續關卡不得讀取**）。

分支只在關卡內部展開，關卡邊界一律收斂。瓶頸重設後，下一關的地點、在場角色、導言、可採集證據池在 9 種組合下完全相同。跨邊界只保留三儀表 + evidence 數 + 一行 memory stub。

**撰寫量**：每 Mission 45 units（6 導言 + 5 證據 + 5 檢核 + 2×7 決策 + 7 挑戰 + 3 結局 + 1 結尾句 + 3 角色登場 + 1 委任卡），硬上限 55。總量 `9×45 + 40（全域共用）= 445`；加 20% 重寫緩衝 `9×54 + 40 = 526 < 600`。
成長是加法不是乘法，因為結果文字掛在「選項」而不是「後續關卡」。任何要求「依前次選擇改寫下一關導言」的稿件一律退件。

## 3. Previously on…（對抗 context collapse）

觸發：距上次存檔 > 20 分鐘或跨堂。長度 6 張卡、40–60 秒、第 3 張後可 skip；另有常駐 Case File 可隨時重看。

內容全部由 state 生成，零手寫：①你是誰／在哪／任務名 ②目標 + `Stage n of 6` ③你做過的決策（樣板 `At the [beat], you chose: [選項標籤]`）④三儀表 + 與上次比較 + 由門檻表選出的 1 句評語 ⑤持有／已花 token，並**重播你當初收集到的英文句子**（免費的理解再啟動）⑥`Now: [beat]. You must [動詞片語]`。

唯一手寫的是 9 句門檻語與 6 句 beat 動詞，全 9 個 Mission 共用。

## 4. 參考劇本：SDG 13-1 Taiwan's Path to Net Zero

- **Role**: Student Energy Reporter for the university's Net-Zero Review（校園淨零評估的學生能源記者）
- **Place**: campus Green Energy Office → Taipei City Climate Hearing
- **Cast**: Ms. Lin 校園能源主任（盟友，S1/S3/S6）／Kevin 晶圓廠工程師（懷疑者，S3/S4，需要 24 小時穩定電力）／Councillor Hsu 市議員（阻擋者，S5/S6）

**Evidence（全部改寫自該講稿 A2 欄）**

- E1（Slide 4）"Taiwan is getting hot faster than other places."
- E2（Slide 7）"Taiwan made a new climate law. Our goal is Net Zero by 2050."
- E3（Slide 8）"There are many new wind turbines in the sea. Our wind power is growing fast."
- E4（Slide 10）"Smart Grids use AI to share electricity. This stops energy waste."
- E5（Slide 16）"Some companies say they are green, but they do not change. This is called greenwashing."

**Stage intros（≤ 2 句，A2）**

1. "Ms. Lin gives you a red folder. Your school must write one honest report about climate action."
2. "The old report has no data inside. You must find the real problem first."
3. "Ms. Lin shows you the good news from Taiwan. Kevin listens, but he is not happy."
4. "Kevin needs stable power every hour. Now choose the solution you will pitch."
5. "You stand at the city hearing. Councillor Hsu does not believe your school."
6. "The room is quiet now. It is your turn to speak."

**Decision 1（S2 結尾）"How will you open the report?"**

| 選項 | 英文 | clarity | trust | impact |
| --- | --- | --- | --- | --- |
| A | "The chip factories made this mess." | −1 | −3 | +1 |
| B | "Everyone should recycle more." | +1 | +1 | −2 |
| C（需 E1+E2） | "Taiwan is heating faster than other places, and our law says Net Zero by 2050." | +3 | +2 | +2 |

**Decision 2（S4 結尾）"Which solution do you pitch?"**

| 選項 | 英文 | clarity | trust | impact |
| --- | --- | --- | --- | --- |
| A | "Ask students to turn off the lights." | +1 | +2 | −1 |
| B | "Ask the city to buy more electric scooters." | +1 | −1 | +3 |
| C（需 E3+E4） | "Build a smart grid test on campus, with AI and wind power." | +2 | +2 | +3 |

**Challenge（S5）** Hsu: "Your school only wants good news photos. This is greenwashing."

| 品質 | 回應 | clarity | trust | impact |
| --- | --- | --- | --- | --- |
| bad | "No! Our school is very green already." | −2 | −2 | 0 |
| weak | "We are not perfect, but we are trying hard." | 0 | +1 | 0 |
| strong | "Greenwashing means talking without changing. So we will publish our power data every month." | +3 | +3 | +1 |

**Endings**（total = clarity + trust + impact，起始 24，範圍 19–49）

- The Standing Ovation：total ≥ 40 且 min(c,t,i) ≥ 10
- The Working Draft：31 ≤ total ≤ 39，或 total ≥ 40 但有任一 meter < 10
- Notes for Next Time：total ≤ 30

**Closing line（學生念出，取自 Slide 20）**："The clock is ticking. Taiwan is ready for SDG 13, and so am I. Let's start together, right now."

## 5. 稿件品管清單（審 LLM 草稿用）

1. 事實鎖：每個數字與主張都能標回投影片編號；新增統計數字＝退件。
2. A2 檢核：每句 ≤ 14 字、單子句、無被動與假設語氣；導言 ≤ 2 句。
3. 無明顯最佳選項：未上鎖選項至少一升一降；上鎖選項較強的唯一理由是花掉 2 個 token。
4. 證據鎖真的會失敗：理解檢核要有合理誘答；答錯只鎖選項，**任務永不卡死**。
5. 瓶頸完整性：把 9 種選擇組合代入，下一關導言仍通順。
6. 結局只由 meters 推導，不得提及未編碼進 meter 的選擇。
7. 三名角色各出現 ≥ 2 關，且至少一次影響 meter。
8. 量體：每 Mission ≤ 55 units、單 unit ≤ 2 句、選項文字 ≤ 12 字。
9. Recap 可由模板生成，不得出現分支限定的手寫文字。
10. 不指名政黨、不負面點名真實公司；核能與天然氣維持講稿原本的開放立場。
