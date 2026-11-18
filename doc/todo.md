# 待辦與已知問題

試用時發現、還沒解決的問題。修好後移到對應的文件（例如 [batch2.md](batch2.md) 的「試用時發現的問題」）。

## 網站與應用

| 項目 | 狀況 | 已知的原因或線索 | 下一步 |
|---|---|---|---|
| friendbook 發文失敗 | 使用者在 VM 裡登入（帳號 ccc）後發文不成功 | 在本機另起一份，以同樣的主機名 `friendbook.localhost`、登入、發純文字與多行 Markdown 都成功；VM 裡的 `app.js` 與 repo 相同 | 請使用者提供失敗時發文框下方的訊息；看 VM 裡 rucloud 的 log |
| Google 搜尋結果頁空白 | 首頁可以打字、按 Enter 送出，結果頁空白 | 結果頁先跑一段 JS 驗證，沒通過就以 `<noscript>` 的 meta refresh 導向「請啟用 JavaScript」 | 提升整體 JS 相容性；**不繞過**驗證 |
| YouTube 只有灰色骨架 | 沒有影片、沒有文字 | `webcomponents-sd.js`（web components polyfill）第 102 行 `cannot convert 'null' or 'undefined' to object`；`spf.js` 的 `not a callable function` | 查 polyfill 用到的 `Object.getOwnPropertyDescriptor` 等；shadow DOM 的繪製 |
| Gmail 空白 | `mail.google.com` 轉到 Google 登入頁後空白 | Google 登入對非主流瀏覽器另有限制 | 短期不列為目標 |
| 棋藝軒標題與副標重疊 | 主標「經典棋類與桌遊對戰平台」疊在副標上 | 排版（行高或定位） | 找出對應的 CSS 做最小重現 |
| Open-Meteo 預報主機連不上 | 天氣頁顯示「連線逾時」 | 這裡的網路對 `api.open-meteo.com` 的 TLS 握手逾時 | 換網路再試 |

## rubrowser 尚缺的標準功能

* 跨來源請求（CORS）：腳本對其他來源的 `fetch`／`XMLHttpRequest` 目前一律擋下。
* 以元素 id 當全域變數（HTML 的 named access on Window）。
* 觸控事件（Touch Events／Pointer Events 的 `pointerType: "touch"`）：放到平板上之前需要。
* WebSocket 交握時帶 cookie。
* shadow DOM 的繪製、真正執行的 Web Worker、WebGL、canvas 的陰影與濾鏡、輸入法（IME）。
* `<textarea>` 沒有套用頁面指定的字型（Google 搜尋框顯示成等寬字）。

## ruwebos

* 「檔案」裡的虛擬資料夾（在檔案總管看到相簿、音樂）。
* 縮圖依 EXIF 方向轉正。
* 軟體安裝：見 [install.md](install.md)（規劃中）。
