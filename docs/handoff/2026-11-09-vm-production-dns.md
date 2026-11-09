# 正式站搬到實驗室 VM、DNS、雲端備援（2026-11-09）

從 2026-11-09 16:30 起，**www.cathylanguagehub.com 由實驗室 VM 提供**。雲端（Vercel 前端 + Railway 後端）保留為備援，隨時可以切回去。

## 1. 一張圖看懂

```
學生／老師的瀏覽器
   │  www.cathylanguagehub.com  →  GoDaddy DNS 查地址
   ▼
140.115.82.165（實驗室 VM hcsi-web，Ubuntu）
   └─ stack-npm-1（Nginx Proxy Manager，80/443，https 憑證）
        └─ cardlearn-app（FastAPI + 網頁，4 個處理程序）
              ├─ cardlearn-db-1（PostgreSQL 16）    資料：~/cardlearn/data/pg
              ├─ cardlearn-redis-1（流量限制）
              └─ 錄音檔                               資料：~/cardlearn/data/audio

備援：Vercel（網頁）→ Railway（web-production-ee62.up.railway.app，自己的 PostgreSQL）
```

## 2. GoDaddy DNS 設定（cathylanguagehub.com）

| 類型 | 名稱 | 值 | TTL | 用途 |
|---|---|---|---|---|
| A | `@` | `140.115.82.165` | 600 秒 | 網域本身 → VM（會自動轉到 www） |
| A | `www` | `140.115.82.165` | 600 秒 | 網站 → VM |
| NS / SOA | `@` | ns23/ns24.domaincontrol.com | — | GoDaddy 自己管，**不要動** |
| MX、TXT | `send`、`dc-…_spfm.send`、`resend._domainkey` | Amazon SES / Resend | — | 寄信（驗證信、帳號通知），**不要動** |
| CNAME | `_domainconnect` | GoDaddy | — | GoDaddy 自己用，**不要動** |

白話：**A／CNAME 決定網站去哪台機器；MX／TXT 管寄信；NS／SOA 是 GoDaddy 的。** TTL 600 秒 = 別人查到地址後記 10 分鐘，所以改 DNS 最多約 10 分鐘生效。

GoDaddy DNS 頁面：`https://dcc.godaddy.com/control/dnsmanagement?domainName=cathylanguagehub.com`（Chrome「Cathy」設定檔已登入）。

## 3. 切回雲端備援（VM 壞掉時）

1. GoDaddy DNS：
   - `A @` 改回 `76.76.21.21`
   - 刪掉 `A www`，新增 `CNAME www` → `cname.vercel-dns.com`
2. 等 10 分鐘。Vercel 會自動重新簽 https 憑證（幾分鐘）。網域一直掛在 Vercel 專案上，不用到 Vercel 改任何東西。
3. 確認：`https://www.cathylanguagehub.com/static/config.js` 內容是 `web-production-ee62.up.railway.app` 就是雲端版。

**資料：VM 每晚 04:10 把整個資料庫複製到 Railway**（`~/cardlearn/sync-railway.sh`，會取代 Railway 上的資料）。所以切到雲端時，帳號、名單、學習紀錄是**前一晚**的版本；錄音檔只在 VM，雲端只有「誰錄了哪一段」的清單，聽不到聲音。切回 VM 前，雲端期間新產生的紀錄要另外處理（不會自動回到 VM）。Railway 資料庫上限 500 MB，不含錄音一學期 300 人約 200 MB，放得下。

同步前的雲端原始資料（10 月的測試紀錄）完整備份在 VM `~/backup/cardlearn/railway-before-sync-2026-11-09.sql.gz`。

切回 VM：把上面兩筆改回 `140.115.82.165` 即可。

2026-11-09 驗證過：用 Vercel 的 IP 開 www 回 200、https 憑證有效、Railway `/health` 200、CORS 允許 www。

## 4. VM 上的檔案（`hcsi@140.115.82.165`，ssh 金鑰 `~/.ssh/hcsi_vm`）

| 路徑 | 內容 |
|---|---|
| `~/cardlearn/docker-compose.yml` | db + redis + app（本 repo `deploy/vm/` 有一份） |
| `~/cardlearn/.env` | 祕密（PG 密碼、SECRET_KEY、初始管理員），權限 600，**不在 repo** |
| `~/cardlearn/app/` | GitHub `main` 的工作目錄 |
| `~/cardlearn/deploy.sh` | 每小時 :15 拉 `main`，有更新就重建 app（cron） |
| `~/cardlearn/backup.sh` | 每天 03:30 備份資料庫到 `~/backup/cardlearn`（留 7 天），週日備份錄音（留 4 份）（cron） |
| `~/cardlearn/sync-railway.sh` | 把 VM 資料庫複製到 Railway（雲端備援）；紀錄在 `~/backup/cardlearn/sync-railway.log`。Railway 連線字串在 `~/cardlearn/.env-railway`（權限 600，**不在 repo**）。Railway 是 PostgreSQL 18，所以用 postgres:18 的工具 |
| `~/cardlearn/renew-cert.sh` | 續約 https 憑證並重載 nginx（**cron 尚未安裝**，見 §6） |
| `~/stack/npm/data/nginx/custom/http.conf` | 網域轉到 cardlearn-app、/games/ 對應、https（root 權限，用 sudo 改；repo `deploy/vm/npm-http.conf`） |

推 `main` 之後 VM 最晚 1 小時自動更新；要立刻更新：`ssh … '~/cardlearn/deploy.sh --build'`。Railway / Vercel 也會照常自動部署，所以備援的程式永遠是最新版。

## 5. 容量與壓測

- VM：4 核、7.8 GB 記憶體、77 GB 硬碟（剩 69 GB）。
- 2026-11-09 壓測：300 位模擬學生從外網同時玩完一局（登入、配對、送成績、上傳 20 秒錄音），**300/300 成功、0 錯誤**；尖峰 CPU 約 4 成、記憶體約 300 MB。腳本在對話的 scratchpad（`loadtest.py`），壓測帳號與紀錄已清除。
- 流量限制改成以帳號計算（全班共用學校 IP 不會被擋）：登入後每帳號 120 次／分；未登入每 IP 3000 次／分；登入每 IP 1000 次／5 分、每帳號 10 次／5 分。

## 6. 待辦

1. 安裝兩個排程（等使用者同意）：`40 4 * * 1 /home/hcsi/cardlearn/renew-cert.sh`（憑證 2027-02-07 到期）、`10 4 * * * /home/hcsi/cardlearn/sync-railway.sh`（11/09 已手動同步一次）。
2. Railway 資料庫密碼曾貼在對話中：到 Railway 重設後，更新 VM 的 `~/cardlearn/.env-railway`。
3. 修課名單匯入 VM（老師後台 › 班級 › 課程與名單）。

## 7. 帳號（密碼不寫在這裡）

VM 與雲端各有：管理員 asd0389wsx0216@gmail.com、管理員 yliaog@gmail.com（Cathy）、助教 asd0389wsx0216+ta@gmail.com（老師身分）、測試學生 asd0389wsx0216+student@gmail.com。自行註冊預設關閉，學生帳號由名單匯入產生。推 GitHub 正式倉庫要用 `iwatchyouwatchme` 帳號（`machencompeq` 沒有寫入權限）。
