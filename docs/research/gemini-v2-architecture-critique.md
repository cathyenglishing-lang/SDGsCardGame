## 1. 最先崩潰的三個點 (Classroom Environment)

1. **WebGL Context Loss / OOM (記憶體溢出)**
   - **原因**: 30 台平板同時連線，瀏覽器記憶體限制極嚴。3D 場景 + UI + React 狀態樹，只要切換分頁或背景閒置，極易觸發 Context Loss，導致整個 Canvas 崩潰黑屏。
   - **Cheapest Mitigation**: 預設加載 2D SVG fallback。啟動時執行極簡的 WebGL benchmark，僅在分數達標且非低電量模式時才允許載入 three.js 模組。

2. **跨 Session 的 State Desync (狀態失步)**
   - **原因**: 你計畫將 40 分鐘的任務拆成兩堂課。台灣校園網路不穩，如果 Stage 3 結束時 Server API 呼叫失敗，學生下週登入會被迫從 Stage 1 重打，直接引發課堂暴動。
   - **Cheapest Mitigation**: State mutation 必須 `localStorage` 優先，並帶上 timestamp。每次 session 啟動時比對 Local 與 Server 紀錄，若 Local 較新，提示並自動執行背景 sync。

3. **"Click Through" Epidemic (狂點通關)**
   - **原因**: A2/B1 學生面對 40 words/slide 的英文，一旦失去耐心，會直接狂點螢幕尋找下一步按鈕，5 分鐘的 Stage 會在 30 秒內被 Skip 掉。
   - **Cheapest Mitigation**: UI 鎖定機制 (Lockout timer)。對話節點強制鎖定 1.5 秒；關鍵 Evidence 的收集改用 Drag-and-Drop 而非單擊，增加物理操作成本。

---

## 2. Branching & Authoring Budget

**結論：你的 Ceiling 太高了，絕對會超支。**
9 missions × 3 levels = 27 套劇本基底。
加上 2 decisions (3 options) = 每個任務 6 條分支路徑。加上 1 stance tag (2 variants) = 複雜度再乘 1.5。

**具體 Authoring Budget (單一 Mission，單一 Level)：**
- **字數 (Words)**: 
  - Spine (6 stages): 6 × 200 = 1,200 words
  - Branches (2 decisions × 3 options): 6 × 100 = 600 words
  - Stance variants (2 variants per beat): 增加約 400 words
  - **總計**: ~2,200 words / level → **6,600 words / mission** → **59,400 words 總量**。
- **工時 (Hours)**: 考量到 A2-B2 的詞彙限制與 CEFR 分級審查，每個 Mission 至少需要 45-50 小時的編寫、校對與資料結構 mapping。
- **資產 (Assets)**: 每個 SDG 需要 1 個 Set，附帶 3 種基於 Meters 的動態變化。

**What to cut first:**
**立刻砍掉 `stance` tag。** 對於 A2/B1 的學生來說，語氣 (cautious vs. bold) 的文本微調 (subtlety) 完全是無效資訊 (Noise)。他們連核心句意都在掙扎，根本感受不到這種 RPG 式的沈浸感。保留那 3 個純數值的 Meters 作為結局依據即可。

---

## 3. 3D 的致命傷與妥協

**The Case AGAINST 3D:**
- **Thermals & Battery**: 平板在連續渲染 three.js 15 分鐘後會開始降頻 (Thermal throttling)。掉幀會讓 UI 反應遲鈍，嚴重破壞閱讀節奏 (Reading rhythm)。
- **Cognitive Overload**: 我們的核心是「閱讀理解」。背景裡旋轉的風力發電機和走動的人群，會大量消耗 A2 學習者的注意力資源 (Attention budget)。
- **Authoring Cost**: 你需要 Technical Artist 來處理 KTX2 壓縮、LOD 和 Instanced Meshes。這超出了純 Web 開發團隊的維護能力。

**When 3D earns its place:**
只有當 3D 場景本身就是 **Puzzle 的一部分** 時才值得（例如：必須旋轉視角才能看到隱藏的碳排放源，將其轉化為 Evidence）。如果它只是個會動的背景 (Reactive background)，那就是純粹的 Vanity metric。

**如果改用 2.5D (Pre-rendered layers + Parallax)，我們失去什麼？**
失去了「無縫的攝影機運鏡 (Cinematic sweeps)」、「動態光影漸變 (如日夜交替)」以及「真實的空間縱深感」。但我們換來了 60FPS 的絕對流暢、0 當機率，以及美術發包成本降低 70%。

---

## 4. The One Mechanic to Keep

**保留 Evidence Economy。**

**Why:**
因為它達成了最完美的 **Intrinsic Integration**。將「閱讀理解」直接等同於「資源採集」。學生不再是「為了玩遊戲而被迫先看一段英文」，而是「必須從英文中挖出武器 (Evidence token) 才能解鎖最強的政策選項」。
Showtime speech 只是輸出驗收；3D 只是視覺包裝；Decision cards 若沒有 Evidence 支撐就只是瞎猜。只有 Evidence Economy 真正將 Pedagogical goal 轉化為 Core loop。

---

## 5. 測量指標 (Measurement & Revert Threshold)

我們需要 5 個 Telemetry signals，在兩次上課內定生死：

1. **Time-in-Stage Variance**: 單一 Stage 的平均停留時間。
2. **Evidence Conversion Rate**: (收集到的 Evidence Tokens / 總文本長度)。衡量閱讀轉化效率。
3. **Decision Entropy**: 學生在 A/B/C 選項的分布集中度。若 80% 盲目選擇同一個，代表決策設計失敗。
4. **Session 2 Return Rate**: 跨週上課時，第二堂課的無縫接軌率與完成率。
5. **Fallback Trigger Rate**: 觸發 2D SVG fallback 或 WebGL crash 的設備比例。

**Revert Threshold (何時退回卡牌遊戲):**
如果 **Time-in-Stage 的中位數低於 2 分鐘**（代表全班都在 Spam click 盲按），或是 **Fallback Trigger Rate 超過 20%**（代表硬體根本撐不住），立刻啟動 Rollback。

---

## 6. The Trap You Haven't Seen

**The "Context Collapse" Trap (語境斷裂陷阱)。**

**說明**: 
你計畫將 30-40 分鐘的 Mission 切割到兩堂課。學生在第二週回來時，絕對會忘記第一週累積的 Meters 狀態、當下扮演的角色目標，甚至忘記自己為何走到這一步。他們面對 Stage 4/5 的決策時，將失去所有認知脈絡，淪為瞎猜。

**How to test early**: 
下週立刻做 Paper Prototype 測試。讓受測者玩完 Stage 1-3，然後強制中斷 20 分鐘讓他們滑手機或做其他事。20 分鐘後讓他們回來繼續 Stage 4，並要求他們「放聲思考 (Think aloud)」為什麼選這個選項。如果他們無法連結之前的劇情，你必須在架構中硬塞一個強制的 "Previously on..." 狀態回顧機制，否則就得把總時長砍到 20 分鐘內，確保單堂課通關。
