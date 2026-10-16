# 交接：訪客模式、開放規則、難度命名（2026-10-17，Claude）

依使用者 2026-10-17 的要求。程式在 `claude/guest-mode` 分支，已併入 `main` 並上線。

## 1. 訪客模式

使用者原話：「我需要你開訪客模式可以直接玩不用註冊」「所有遊戲都要能訪客，不記錄學習數據」「一樣要有註冊模式」。

- **入口**：首頁的「訪客試玩」（`/pages/member_index.html?guest=1`）與登入頁的「訪客試玩」按鈕。註冊、登入流程不變。
- **身分**：`frontend/js/api.js` 的 `auth.startGuest()` 在 localStorage 建立 `role: "guest"`、沒有 token 的身分，名稱如 `Guest-7K2Q`。`auth.isGuest()`、`auth.setGuestGender()` 是對應的工具函式。
- **權限**：`auth.requireLogin({ allowGuest: true })` 放行訪客。目前放行的頁面：會員首頁、SDGs Pecha Kucha（loading／game_s／finish）、Around the World。教師後台仍需真實帳號；訪客開啟會導到登入頁並顯示原因。
- **不記錄**：
  - 3D 遊戲：`telemetry.js` 對訪客不送 `/learning/*`，也不留待送佇列；遊戲內 Learning Log 照常顯示。
  - 卡牌遊戲：不送 `/game/pk-result`。
  - SDGs Pecha Kucha：不呼叫 `/game/start|part|end`；結果頁只顯示瀏覽器裡的這次成績，不列入排行。
  - 測試時監看所有網路請求，訪客完整流程中的寫入請求為零。
- **3D 角色**：訪客沒有帳號性別，會員首頁的訪客提示列可選男生或女生，3D 遊戲讀 `session.user.gender`。
- **後端唯一改動**：`GET /game/content`（唯讀題目）不再需要 token，讓訪客拿到真實題庫。寫入 API 都仍需帳號。

## 2. 開放與上鎖規則

> **2026-10-17 稍後更新（以此為準）**：使用者改成以主題為單位。全開放（所有難度）：4-1、4-2、5-1、5-2、9-1、13-1；整個上鎖：9-2、9-3、13-2，卡片半透明、不能點。設定在 `unlocks.js` 的 `locked`。題庫選單同樣套用：sdg_level 2、3（= 9-2、9-3）上鎖，其餘全開。同時統一所有主題標題為主題本身的名稱（`unlocks.js` 的 `TOPICS`），5-2、13-2 原本沒有標題，由 Claude 依講稿內容命名為 Gender Equality in Sports、Climate Adaptation and Water in Taiwan。下面是更早的版本，留作紀錄。


使用者的決定：SDG 4、5 所有難度開放；其他 SDG 只開放第 1 個難度（A2），其餘上鎖；SDGs Pecha Kucha 與 Pecha Kucha Card Game 都套用。

- 規則與名稱集中在 **`frontend/js/unlocks.js`**（`window.CARDLEARN_UNLOCKS`）。要開放或上鎖，只改 `openAll` 與 `firstLevel`。
- **取代**了公司端 10-15 在 `pecha_kucha_builder.html` 寫的 `PK_OPEN_TOPICS = ["4-1","5-1","9-1","13-1"]`（以主題上鎖），改為依上面的規則以難度上鎖。因此 4-2、5-2 現在全開；9-2、9-3、13-2 的 A2 也開放了。
- 3D 遊戲檔案館站（`embed=harbor`）不受上鎖限制，選 B1、B2 也能玩。
- 上鎖的組合從網址或 sessionStorage 直接進入時也會被擋：卡牌遊戲回到主題選單；game_s 導回會員首頁。

## 3. 難度與 SDG 命名統一

使用者要求「SDGs Pecha Kucha 選擇難度介面需要統一命名規範」。

- 題庫資料庫的 `sdg_level` 1、2、3 其實是 SDG 9 的三個 AI 主題。選單顯示改為 SDG 9-1、9-2、9-3，**資料庫與既有成績不動**（對照表在 `unlocks.js` 的 `DB_TOPIC`）。
- SDG 卡片格式：`SDG 4` 標籤＋英文名稱＋中文名稱，依 SDG 編號排序（4、5、9-1、9-2、9-3、13），顏色用聯合國官方 SDG 色，與卡牌遊戲一致。
- 難度依 CEFR 排序並統一標示：A1 入門、A2 基礎、B1 進階、B2 高階（與卡牌遊戲相同）。資料庫裡的排序（A2、A1、B1）不再影響畫面。

## 4. 測試

本機 `python scripts/serve-frontend.py 8766`，以 Playwright（本機 Chrome）跑兩個腳本：

- 訪客：首頁進入、選角色、玩卡牌遊戲、完成 SDGs Pecha Kucha 6 段到結果頁、3D 遊戲讀到女生角色、教師後台被擋、登入頁訪客按鈕可用，並全程監看網路請求。
- 上鎖與命名：選單卡片與難度、點上鎖難度無效、game_s 擋下上鎖組合、卡牌遊戲選單與直接連結、3D 嵌入 B1 照常可玩。

兩個腳本都沒有頁面錯誤。腳本放在 Claude 的暫存區，沒有提交；需要的話可以加進 `scripts/playtest/`。

## 5. 未決

- 訪客是否要有使用次數或時間限制：使用者沒有提，目前沒有。
- 題庫資料庫的 SDG 1、2、3 編號是否要正式改成 9 的子主題：需要改資料與教師上傳格式，未動。
