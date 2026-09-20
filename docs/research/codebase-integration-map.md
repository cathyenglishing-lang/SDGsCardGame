# 現有程式碼整合地圖（2026-09-20 稽核，行號為當時 HEAD 4ca1cbd）

## 1. AUTH
- `POST /auth/login` `backend/main.py:1468`，回傳 `{access_token, token_type, user{id,name,email,username,role}}`（`:1503-1513`）。
- `create_jwt()` `:777-782`，payload 只有 `{user_id, exp}`，HS256（`:74`），**TOKEN_EXPIRE_DAYS = 3650**（`:75`）。
- `decode_jwt()` `:785-791` → `get_token_from_authorization()` `:794-802` → `get_current_user()` `:805-818`（每次回 DB 查）。
- `require_teacher()` `:821-825` 允許 teacher/admin；admin-only 檢查 `:2718-2720`、`:2741`。擁有者檢查樣板 `can_access_game_session()` `:828-831`。
- 登入寫 `login_events` `:1490-1501`（best-effort）。`GET /auth/me` `:1518`。
- 前端：localStorage 唯一鑰匙 `SESSION_KEY = "user"` `frontend/js/api.js:2`；形狀由 `normalizeSession()` `:38-59` 決定（頂層與 `user` 物件重複攜帶欄位）。守衛 `auth.requireLogin()` `:93-101`，導向 `/pages/login.html?next=…`；`login.html:607`、`:649` 讀回 next。token 只在 `auth:true` 時附加 `:12-15`。登出 `:103-107`。
- 新頁面三行即可：載 `/static/config.js`、載 `/static/js/api.js`、`auth.requireLogin()`（樣板 `frontend/pages/around_the_world.html:264-267`）。教師頁再 `await api.auth.me()` 檢查 role（`teacher_dashboard.html:1004-1014`）。

## 2. API CLIENT（`frontend/js/api.js`，365 行）
`request()` `:4-36` + `normalizeSession()` `:38` + `auth` `:65-108` + `window.api = {auth, sendOTP, verifyOTP, register, content, game, teacher}` `:110-363` + `window.auth = auth` `:365`。
**沒有 ES module export、沒有 401 自動登出、沒有 retry。** Base URL 讀 `window.CARDLEARN_API_BASE_URL`（`:1`，由 `frontend/config.js` 或建置產生的 `dist/config.js` 提供）。錯誤集中在 `:30-33`，呼叫端一律 try/catch 顯示 `err.message`。
新模組在 `window.api` 下加 `mission:{…}` 命名空間，照 `:182-194` 的寫法。

## 3. STYLE
每頁自帶 `<style>`，**沒有共用 CSS 檔**。多數頁字型是 `Arial, Helvetica, sans-serif`（`index.html:35`、`member_index.html:31`、`pecha_kucha_builder.html:19`）。載 Google Fonts 的只有四頁：`around_the_world.html:9`、`science_365.html:8`、`science_vocab.html:9`、`science_debate.html:12`。
色票：`index.html:12-31`（`--bg-dark:#020617`、`--glass:rgba(255,255,255,.10)`、`--blue:#3b82f6`、`--green:#22c55e`、`--purple:#a855f7`）；`member_index.html:9-24` 再加 `--teal:#2dd4bf --yellow:#fbbf24 --pink:#fb7185 --panel:rgba(9,15,29,.82)`。玻璃：`blur(20px)` topbar（`member_index.html:82`）、`blur(24px)` modal（`:263`）。圓角：卡片 22px（`:183`）、面板 20px（`:80`）、按鈕 12px（`:119`）、pill 999px（`:141`）。按鈕 `:116-134`，卡片 `.game-card` `:175-213`。撲克牌 `pecha_kucha_builder.html:8-15`、`:980-1005`。
**風格母本＝`frontend/pages/member_index.html`**（token 最完整，且新遊戲一定從這頁進入）。
SDG 官方 17 色只在 `loading.html:830-848`；`member_index.html:615-618` 另有簡化色 `{4:#f97316,13:#22c55e,5:#fb7185}`，**兩者不一致，需統一**。

## 4. THREE.JS
只有兩頁真的用：`index.html:2019` 載 `three@0.166.1`、`loading.html:812` 載 `three@0.164.1`（**版本不一致**），皆 ES module + CDN，無 bundler、無 import map。
設定樣板 `index.html:2039-2055`：`Scene + FogExp2`、`PerspectiveCamera(38,1,0.1,100)`、`WebGLRenderer({antialias:true, alpha:true, powerPreference:"high-performance"})`、`setPixelRatio(Math.min(dpr,2))`、`SRGBColorSpace`、`ACESFilmicToneMapping`。動畫迴圈是裸 `requestAnimationFrame`（`index.html:2396-2397`、`loading.html:1859-1860`），**沒有 cancelAnimationFrame / dispose()**。
**完全沒有 glTF loader**；模型是程序化幾何 + canvas 貼圖（`loading.html:891-900`）。`frontend/pages/index.js` 是死檔（裸 `import 'three'`、`three@latest`、全庫無人引用）。

## 5. BACKEND PATTERNS
**沒有 APIRouter**，2975 行全用 `@app.get/post` 直接註冊。`get_db()` `:235-252` 依 `DATABASE_URL` 切 Postgres(psycopg, dict_row)/SQLite(Row, WAL)；SQL 一律 `?`，`prepare_sql()` `:190-193` 在 Postgres 用 regex 換 `%s`；`auto_pk_sql()` `:196-199`；`execute_with_retry()` `:255-265`；`execute_insert_returning()` `:284-291`；`table_columns()` `:268-281`。
建表全在 `init_db()` `:294-585`（`CREATE TABLE IF NOT EXISTS` + 事後 `ALTER TABLE ADD COLUMN` `:461-475`），**在 import 時執行**（`:588`）。
限流：全域 middleware `:138-159`，只涵蓋 `API_RATE_LIMIT_PREFIXES` `:100` = `/auth /content /game /teacher /health`；單點 `enforce_rate_limit(RULE, f"user:{id}")`（樣板 `:1778`），規則在 `backend/rate_limit.py:46-50`。
取得使用者：每個路由自帶 `authorization: str | None = Header(default=None)` 再 `get_current_user()`（樣板 `:1738-1739`）。
新表 + 新路由最小樣板：①`init_db()` 內（建議接在 `pk_results` `:426-443` 之後）加冪等建表 ②Pydantic model 放 `:836-931` ③路由用 `/game` 或 `/mission` 前綴 ④新表名加進 `CONSOLE_TABLES` `:1142-1146`。

## 6. BUILD & DEPLOY
`scripts/build-frontend.mjs`：刪 `dist/`（`:10`）→ 複製 `frontend/` 到 `dist/`（`:12`）→ **再複製一份到 `dist/static/`**（`:13`，這是 `/static/js/api.js` 能用的原因）→ 產生 `dist/config.js` 與 `dist/static/config.js`（`:15-17`）。
`vercel.json:2-4` = `npm run build` / `outputDirectory: dist`；`railway.json:3` 與 `Procfile:1` 跑 uvicorn；`runtime.txt` = python-3.12；`pyproject.toml:7-8` 的 `[tool.vercel]` 讓 Vercel 不誤判後端。
新頁面上線只需：放 `frontend/pages/xxx.html`（自動搬運）＋在 `member_index.html:502-586` 的 `GAMES` 陣列加一筆。後端 `/pages/{page_name}` catch-all `:951-956` 自動供檔。

## 7. 地雷
1. 密碼是**無鹽 SHA-256** `:761-762`（requirements 已裝 bcrypt 卻沒用）；JWT 3650 天、無撤銷；`SECRET_KEY` 有預設 fallback `:73`。
2. localStorage `"user"` 是全站共用鑰匙；`pecha_kucha_builder.html:1371` 自己 parse 不走 api.js。
3. sessionStorage 共用鍵：`current_session_id / current_sdg / current_difficulty / current_script_review / finish_super_skip`（`game_s.html:1406-1419`、`finish.html:577-586`）→ 新遊戲一律加前綴。
4. `prepare_sql()` regex 換 `?`：SQL 字面值含問號會被破壞。
5. 新前綴不在 `API_RATE_LIMIT_PREFIXES` 等於不限流。
6. `dist/` 是產生物禁止手改；**`.vercelignore:9-16` 排除 `docs/`**（放在 docs/ 的原型不會上線）。
7. `init_db()` import 時執行，新語句必須冪等。
8. 新表沒加 `CONSOLE_TABLES` → 管理後台看不到。
9. `science_debate.html:8` 用 Tailwind CDN（全站唯一另一套樣式系統）；`pecha_kucha_builder.html` 內有三段互相覆蓋的 `:root`。
10. `POST /game/pk-result` `:974-984` 允許匿名提交；`pk_results` schema `:426-443` — 兩者都不要動。
11. 無自動化測試，驗證只有 `py_compile` 與 `npm run build`。

## 重用 / 擴充 / 不要動
| 分類 | 標的 |
| --- | --- |
| 重用 | `api.js` 的 `request()`/`auth.requireLogin()`；`config.js` 機制；`member_index.html` 設計 token；`loading.html:830-848` SDG 色票；`backend/main.py:190-291` DB 工具；`:805-831` 權限 |
| 擴充 | `member_index.html:502-586` GAMES；`api.js` 加 `mission` 命名空間；`init_db()` 加 `mission_*` 表；`CONSOLE_TABLES`；限流前綴 |
| 不要動 | `pecha_kucha_builder.html`；`pk_results` 與 `/game/pk-result`、`/teacher/pk-analytics`；登入註冊 OTP；`game_s.html`/`finish.html` 的 sessionStorage 契約；`dist/`；`pages/index.js`（死檔） |
