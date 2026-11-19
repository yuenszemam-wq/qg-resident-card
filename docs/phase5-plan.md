# Phase 5：居民資料同步＋統一管理後台｜設計及 migration 計劃

狀態：**已實作，等待設定 Secrets 後合併部署**（2026-11-19）。資源批准：D1、R2、Google 服務帳戶已獲批准；管理權限按指示改用密碼（不用 Cloudflare Access）。

## 1. 現況檢查（2026-11-19）

| 項目 | 結果 |
|---|---|
| main | `1ab60f9`（PR #20 每日更表已合併） |
| 開放中 PR | 無 |
| Cloudflare Worker | `qg-resident-card`，只有靜態資源（repo 內無 `wrangler` 設定，由 Workers Builds 連 `main` 部署），沒有 D1／R2／KV 綁定 |
| 可重用 D1／R2 | 帳戶內現有 D1（ai-wardrobe、ribbon-money、kitchen-stock 等）及 R2（ai-wardrobe-images 等）全部屬其他項目，**不適合共用**（權限、備份、刪除範圍會互相牽連） |
| 本機資料 | 製作記錄：IndexedDB `qg-weekly`、`qg-daily` 及 `ui/workflow.js`；版面微調：`localStorage`（shadow/layout.js、calendar） |
| 文案 | `index.html` 內 `promoText()` 寫死；影子精靈用 customText |
| Google Sheets | 工作表「表格回應 1」B1＝更表名稱、C1＝IG帳號，約 130 列；另有「分成」工作表 |

⚠️ **私隱提示**：該 Google Sheets 目前設定為「知道連結的任何人均可檢視」，即包括「分成」工作表在內的全部內容，任何持有連結的人都可讀取。按要求本計劃**不會**改動分享設定，但建議擁有人自行評估。

## 2. 架構

```
瀏覽器（公開製作器 /、管理後台 /admin）
        │
Cloudflare Worker qg-resident-card（新增 worker/index.js，靜態資源維持 assets）
  ├─ GET  /api/public/*      公開，只回傳白名單欄位，Cache-Control 短快取
  ├─ *    /api/admin/*       Cloudflare Access + Worker 內 JWT 驗證 + 電郵白名單
  ├─ D1   qg-resident-card-db（新）
  ├─ R2   qg-resident-card-media（新，私人 bucket，經 Worker 讀取）
  └─ Google Sheets API（唯讀，只請求 '表格回應 1'!B2:C）
```

- 靜態資源繼續由 `assets` 提供；Worker 只處理 `/api/*` 及 `/admin`（`run_worker_first: ["/api/*", "/admin*"]`），現有製作器載入方式不變。
- 不使用 Cron。名冊在請求時檢查 5 分鐘快取（D1 `sync_state`），過期才向 Google 取，失敗時回傳最後成功的名單並標示「離線快取」。

## 3. 管理權限（已按指示改用管理密碼）

1. 管理密碼存於 Cloudflare Secret：`ADMIN_PASSWORD`（密碼原文，最簡單）或 `ADMIN_PASSWORD_HASH`（PBKDF2-SHA256 雜湊）。repo、前端、D1 都沒有密碼。`wrangler.jsonc` 設有 `keep_vars: true`，部署時不會清走後台設定的變數。
2. 登入成功發出隨機 session token（HttpOnly、Secure、SameSite=Strict、只限 `/api/admin`），D1 只存 token 的 SHA-256，12 小時到期，可登出。
3. 同一 IP 15 分鐘內錯 5 次即鎖定；管理 API 每個 session 每 5 分鐘最多 300 次；上載每分鐘最多 30 次。
4. 所有 `/api/admin/*` 寫入請求必須同源（Origin）並帶 `X-QG-Admin: 1`（防 CSRF）；`/admin/` 頁面本身是公開靜態檔，不代表任何權限。
5. 更改密碼：在 Cloudflare 更新 `ADMIN_PASSWORD`（或用 `npm run hash-password` 產生新雜湊再更新 `ADMIN_PASSWORD_HASH`）（舊 session 仍有效至到期，如需即時失效可清空 `admin_sessions`）。

## 4. Google Sheets 唯讀同步

- 只呼叫 `spreadsheets.values.get`，range 固定為 `'表格回應 1'!B2:C`（程式內常數，不接受外部參數）。
- 憑證只放 Cloudflare Secrets（`GOOGLE_SHEETS_API_KEY` 或服務帳戶 JSON），不寫入 repo、HTML、日誌或 API 回應。
- 回應只保留兩欄並 trim；錯誤日誌只記錄 HTTP 狀態，不記錄回應內容。
- 憑證方案見第 9 節待批准事項。

## 5. 居民 ID 配對規則

`resident_id` = 隨機 ULID，首次出現時建立，永不重用、不以列號為 ID。

每次同步：
1. **IG 正規化**（去 `@`、空白、小寫、去 instagram.com 網址前綴）後完全相同且在名冊內唯一 → 配對同一居民，更新名稱。
2. IG 不同但**名稱完全相同且唯一**、而舊 IG 已從名冊消失 → 視為「IG 變更」候選，**不自動合併**，列入「待確認」。
3. 同一 IG 出現多於一列、或名稱及 IG 均缺失 → 列入「待確認」，不建立照片綁定。
4. 全新且無衝突 → 建立新居民（預設分類「常駐」）。
5. 名冊中消失的居民標示 `sync_status='missing'`，**不刪除**、不清除照片。

照片只綁 `resident_id`，任何自動流程都不會把照片移到另一位居民。「待確認」由管理員選擇「合併到現有居民」或「建立新居民」。

## 6. D1 結構（`migrations/0001_init.sql`）

只有 `CREATE TABLE IF NOT EXISTS`／`CREATE INDEX IF NOT EXISTS`，屬新增式，不含 DROP／DELETE／ALTER。

- `residents`：resident_id、sheet_name、ig、ig_norm、default_category、photo_asset_id、sync_status、last_seen_at、updated_at、version
- `resident_match_queue`：待人工確認的配對
- `assets`：R2 物件（照片／字體／素材），kind、r2_key、mime、bytes、width、height、sha256、用途、上一版本 id
- `config_versions`：全站設定 JSON（頁面預設、字體、相框、素材選擇、文案模板），status = draft／published／archived、摘要、發佈者、時間
- `sync_state`：上次成功同步時間、錯誤狀態
- `audit_log`：管理操作（誰、何時、做了甚麼、目標 id；不記錄內容本身）
- `rate_limit`：管理 API 簡單計數

## 7. 設定、版本與優先順序

- 全站設定是一份 JSON（schema 版本號），按製作器分區：`text`（各文字區塊字型、大小、字距、顏色、描邊、陰影、發光、位置、對齊、最小／最大字級）、`layout`（相框、照片初始位置、每日更表 1–6 人獨立版型）、`assets`、`date`、`copy`（模板＋啟用狀態）。
- 編輯 → 儲存草稿（只存 draft）→ 預覽 → 發佈（伺服器驗證 schema、字體／素材 id 存在、數值範圍）→ 舊 published 轉 archived；保留最少 10 個版本，可一鍵還原（還原＝以舊版內容建立新發佈版本）。
- 更新衝突：每次寫入帶 `base_version`，不符回 409。
- 前端優先順序：使用者當次修改 ＞ 最近製作記錄 ＞ 已發佈預設 ＞ 程式內建預設。背景載入的新設定只用於「新開始的製作」，不覆蓋已編輯的欄位。
- 抽取共用 `ui/presets.js` 讀取已發佈設定並套用到各製作器現有的常數（例如 `FONT_DEF`、`DATE`），不重寫 Canvas 繪圖引擎。

## 8. 上傳安全

- 照片：JPEG／PNG／WebP，≤ 8 MB；以 magic bytes 判斷真實格式；在瀏覽器以 Canvas 重新編碼為 WebP（自然移除 EXIF），伺服器再次檢查 magic bytes、尺寸及無 EXIF 區塊。
- 字體：WOFF2／WOFF／TTF／OTF ≤ 5 MB，需填寫授權名稱及來源並勾選確認可 Web 嵌入及圖片輸出；禁止 Canva 專屬字體。
- 素材：PNG／WebP ≤ 10 MB，檢查尺寸及透明通道；舊版保留，Canva 原始拆件不會被自動替換。
- 文案：模板只作純文字 `{{FIELD}}` 替換（`textContent`），未知欄位或空值在預覽及彈窗顯示提示。

## 9. 需要批准的新資源／權限

| # | 項目 | 費用 | 原因 |
|---|---|---|---|
| 1 | 新 D1：`qg-resident-card-db` | 免費額度內 | 居民 ID、配對、設定版本、文案、日誌 |
| 2 | 新 R2：`qg-resident-card-media`（私人） | 免費額度 10 GB 內；R2 需帳戶已啟用 R2（現已啟用） | 居民照片、字體、素材 |
| 3 | Cloudflare Access 自建應用（只保護 `/admin*`、`/api/admin/*`） | Zero Trust 免費方案（≤ 50 用戶） | 管理權限 |
| 4 | Google 唯讀憑證（二選一，見下） | 免費 | 讀取 B、C 欄 |
| 5 | 在 repo 加入 `wrangler.jsonc` 及 `worker/`，Workers Builds 將改為部署 Worker＋assets | 免費 | 需要伺服器端 API |

Google 憑證選項：
- **A（建議）Google Cloud API Key，只限 Google Sheets API**：因為試算表已經是「知道連結者可檢視」，API Key 即可唯讀讀取，**無須改動試算表分享設定**。缺點：若日後關閉連結分享，同步會停止（系統會保留最後名單），屆時改用 B。
- **B 服務帳戶**：需由試算表擁有人把服務帳戶電郵加入為「檢視者」，屬分享設定變更，按要求須另行批准。

## 10. 實作階段（每階段一個 commit）

1. Worker 骨架、wrangler 設定、D1 migration、公開居民 API、Sheets 同步及配對（含單元測試）
2. Access JWT 驗證、管理 API（居民、分類、照片上傳／還原、配對確認）、速率限制、日誌
3. `/admin` 介面：居民管理
4. 設定版本系統＋頁面預設／字體／相框／日期設定＋`ui/presets.js` 接入四個製作器
5. 宣傳文案模板（遷移現有文案為 v1）、下載後彈窗改用模板
6. 素材管理
7. 公開製作器選擇居民自動填入（只限每日更表；限定宣傳、影子精靈、每週更表照舊手動填寫）
8. Playwright 回歸（Chromium＋WebKit iPhone）、PR、部署驗證

## 11. 部署前設定（Cloudflare → Workers & Pages → qg-resident-card → Settings → Variables and Secrets）

| Secret | 內容 |
|---|---|
| `ADMIN_PASSWORD` | 管理密碼原文（類型選 **Secret**）。或改用 `ADMIN_PASSWORD_HASH`＝`npm run hash-password` 的輸出 |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | 服務帳戶金鑰 JSON 全文；只需 Sheets API 唯讀，**試算表擁有人需把服務帳戶電郵加入為「檢視者」** |

未設定時：公開製作器照常運作（沒有名冊）；管理後台登入顯示「管理密碼尚未設定」。

## 12. 測試

- `npm test`：Worker 單元測試（D1／R2／Google 以替身模擬）
- `npx wrangler d1 migrations apply qg-resident-card-db --local && npx wrangler d1 execute qg-resident-card-db --local --file tests/seed-local.sql`，再 `npm run dev`，然後 `node tests/e2e_admin.mjs chromium`（環境變數 `QG_ADMIN_PASSWORD` 為 `.dev.vars` 對應的密碼）
- CI：`.github/workflows/phase5.yml`（單元測試＋Chromium／WebKit 端對端）、原有 `calendar.yml`

## 13. 已知限制（之後階段）

- 文字預設目前接入：字型、大小、字距、左右、上下（即各製作器現有「文字微調」的同一套數值）。顏色、描邊、陰影、發光、對齊、最小／最大字級仍是各繪圖引擎內建值，未開放修改，以免改壞現有 Canva 對照效果。
- 日期顯示格式未開放修改（保持現有日期邏輯，避免時區偏移）；每日更表預設開放時間可改。
- 照片初始縮放／位置沿用各製作器現有記憶；相框位置可改的只有每日更表 1–6 人版型。
- 上載的自訂字體在製作器下次載入時出現在字體清單。
- 使用者用「全部重設」會回到程式內建值，而不是已發佈預設（重新整理頁面即再套用已發佈預設）。
