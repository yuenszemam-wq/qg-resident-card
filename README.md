# Queen's Garden 限定居民卡製作

選相片、填名字、IG 和日期，就可以下載限定居民卡的 PNG 圖片或 5 秒 MP4 影片。下載圖片後會彈出宣傳文案，可一鍵複製。「文字微調」可分別調整名字、IG、日期的字距及左右／上下位置，預覽、圖片和影片都會套用。網頁是 `index.html`（素材圖已內嵌）加 `fonts/` 資料夾的本地字體。

## 部署（Cloudflare Pages）

- Framework preset：None
- Build command：留空
- Build output directory：`/`

## 更新

在 GitHub 把 `index.html` 換成新版本，Cloudflare 會自動重新部署。

## 備註

- 「限定居民」和「Queen's Garden」用的是 Canva 原圖。
- 名字用 Zen Kurenaido（Google Fonts，SIL OFL）再加粗，對照 Canva 原稿選出，缺字時退回 Chiron GoRound TC。Ma Shan Zheng 等簡體毛筆字缺「漿」「鈴」等繁體字，所以沒有採用。
- IG 和日期用 Kalam 手寫字（`fonts/` 內的本地 WOFF2，授權見 `fonts/README.md`）。
- 沒有使用或轉發任何 Canva 字體。
- 影片用瀏覽器內建錄影功能即時錄製：iPhone Safari 會輸出 MP4，部分瀏覽器只能輸出 WebM。
