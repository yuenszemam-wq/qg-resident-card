# 雙帳戶搬遷（進行中，尚未切換）

GitHub 是唯一程式碼來源。2026-11-20 核對的帳戶如下：

| 用途 | Account ID |
| --- | --- |
| 原正式站／個人開發帳戶 | `978af1b48255f53f5bad01111775f5e8` |
| QG 正式營運帳戶 | `dd7c91f8458fd997ec5e349c1a4ec41a` |

另一個同名個人帳戶 `292624391fef5cf95bb5d0772ddf7fc4` 並非原正式站所在帳戶，沒有選作搬遷來源或開發目標。

## 已完成

- 本機私人備份：Git 全分支 bundle（通過 verify）、Wrangler／Actions 設定、原 Worker 內容及部署／binding 設定。
- 原 D1 `e6156c2f-ec9f-4142-8ca4-a79147deebe3` 完整 SQL 已匯出，於全新本機 SQLite 成功還原，integrity_check／foreign_key_check 通過。
- QG 新 D1：`qg-resident-card-prod-db-20261120`，ID `dc4b7076-3c75-436f-8d8d-bb1ee8c3ef3f`。先確認無使用者資料表，才匯入備份。
- 新舊備份的 11 張表結構、筆數及內容 SHA-256 全部一致。首次快照包含 59 位居民、3 個設定版本及 1 筆素材。
- 原 R2 `qg-resident-card-media` 的 1 個物件（404,226 bytes）已備份並複製至 QG 全新 `qg-resident-card-prod-media-20261120`；下載核對 SHA-256／MD5 與來源一致，key、Content-Type、自訂 metadata 及 storage class 保留。物件建立時間會是複製時間。
- 個人帳戶建立了隔離的 `qg-resident-card-dev-media`。
- 原正式站仍是 https://qg-resident-card.yuenszemam.workers.dev/ ，未修改它的路由、資料或 Secrets。

本文件不包含居民、圖片、密碼、Token 或 SQL。備份位置由本機交付報告提供，不進 GitHub／Actions artifacts。

## 尚未完成的前置條件

1. 個人帳戶建立 Development D1 被 Cloudflare 配額拒絕。不得刪除其他 DB 或把原正式 DB 當成開發 DB。需先解決帳戶配額（不自動升級）。
2. 原 `ADMIN_PASSWORD` 及 `GOOGLE_SERVICE_ACCOUNT_JSON` 是不可讀回的 Secrets。需原憑證檔或由擁有人在 QG 候選 Worker 配置；不得以新空資料或假憑證代替完成驗收。
3. GitHub CLI 登入及 Actions environment secrets 尚待配置。
4. 首次備份並非最終切換快照。原站仍可寫入，切換前必須再次備份、同步並核對。

## 部署設定與隔離

- `wrangler.jsonc` 保留原正式站設定，用於既有本機測試。搬遷期間不要以它部署 QG。
- `wrangler.production.jsonc` 明確指定 QG 帳戶及新 D1／R2。候選 Worker 為 `qg-resident-card-prod`。
- 候選站保持 `MIGRATION_LOCKED=true`，所有路徑（包括靜態檔）經 Worker 驗證 `x-qg-migration-key`；未帶正確 `MIGRATION_ACCESS_KEY` 回覆 503。此 key 僅置於本機私人資料夾／Cloudflare Secret。不得放 URL、GitHub、日誌或公共 artifact。
- `node scripts/deployment-config.mjs production` 產生 `.deployment/production.json`。
- 開發資料庫配額解決後，將全新 DB ID 設為 `QG_DEVELOPMENT_D1_ID`，執行 `node scripts/deployment-config.mjs development`。程式拒絕原正式 DB ID 及 QG 正式 DB ID。開發 Google IDs 預設空值，只能用獨立測試服務帳戶及測試文件。
- `.github/workflows/deploy.yml` 將 `main` 對應 production、`develop` 對應 development，先執行 Worker 及 Chromium／WebKit 製作器測試，再部署同一 commit；環境 token 分開存放。
- **`QG_AUTODEPLOY_ENABLED` 預設不開啟**。現有兩個帳戶的 Workers Builds 仍連接 `main`。完成驗收、備份 Builds 設定並停用重複 trigger 後，才可啟用 Actions。不能先合併本 PR 觸發舊 Builds。
- Actions 部署前保存舊部署版本 ID 作回滾參考；不自動執行 D1 migrations，不把正式 SQL／R2 備份放上 Actions。

## 備份驗證

`node scripts/verify-d1-backup.mjs <可信SQL匯出檔> <全新私人資料夾>`

工具拒絕已有目的資料夾，建立全新 SQLite、檢查完整性及外鍵，並記錄各表筆數、schema／資料雜湊。來源及目標各自匯出並驗證後比較 manifests。不能只比較 SQL 檔大小，也不能以 UI 可開啟代替資料一致性檢查。

## 正式切換與回滾

原製作記錄／月曆等含瀏覽器 IndexedDB／localStorage 資料；它們不在 D1／R2。直接改網址會令使用者看不到舊 origin 的記錄。需保留原網址作為經測試的轉送入口，或先實作、驗證瀏覽器端匯出／匯入；目前尚未實作轉送入口。

公共居民 API 的 GET 亦可能觸發 Sheets 同步寫入，不能只封鎖 POST 就宣稱無寫入。安全交接需要涵蓋管理 API、Sheets 背景同步及其他寫入來源；切換前確認舊請求已完成，再做最後 SQL／R2 快照及核對。若目標已有資料，不得重灌同一 DB，使用全新 DB 作最後還原，或經驗證的非破壞性增量同步。

未完成上述項目不得解除 migration lock、啟用正式自動部署或變更原站。

目前尚未切換，回滾即繼續使用未修改的舊正式站。日後切換前保存原 Worker 版本、routes／domains、Builds 設定及最後資料快照；程式碼 rollback 不會還原 D1／R2。新站若已有新增寫入，必須先將其安全回同步，不能直接把流量切回較舊的資料快照。
