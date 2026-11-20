# Queen's Garden 宣傳製作中心（已搬遷）

宣傳製作中心已於 2026-11-20 併入 **QG 異世界居民報更系統**：

- 製作器（公開）：https://qg-shift-system.queenxsgarden.workers.dev/card/
- 管理中心（報更系統管理員 Google 登入）：https://qg-shift-system.queenxsgarden.workers.dev/card/admin/
- 程式碼：[yuenszemam-wq/qg-shift-system](https://github.com/yuenszemam-wq/qg-shift-system)（`card/`、`src/card/`）

本 repo 只保留舊網址 https://qg-resident-card.yuenszemam.workers.dev/ 的**轉送入口**（`worker/gateway.js`）：
舊網址保持公開，所有頁面及公開 API 以同一網址轉送到新系統的 `/card/`，因此居民瀏覽器內儲存的製作記錄不會遺失；
管理中心會轉到新網址登入。轉送入口只接受 GET／HEAD，不轉送 Cookie。

原 D1 `qg-resident-card-db` 及 R2 `qg-resident-card-media` 已不再使用，保留作備份。
搬遷前的完整程式碼見 git 歷史（commit 44750b0 及以前）。

```
npm ci && npm test
```
