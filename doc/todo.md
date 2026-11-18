# 待辦與已知問題

試用時發現、還沒解決的問題。修好後移到對應的文件（例如 [batch2.md](batch2.md) 的「試用時發現的問題」）。

## 網站與應用

| 項目 | 狀況 | 已知的原因或線索 | 下一步 |
|---|---|---|---|
| friendbook 發文失敗 | 使用者在 VM 裡登入（帳號 ccc）後發文不成功 | 在本機另起一份，以同樣的主機名 `friendbook.localhost`、登入、發純文字與多行 Markdown 都成功；VM 裡的 `app.js` 與 repo 相同 | 2026-11-18 查 VM 的資料：帳號 ccc 的 2 篇貼文**有存進資料庫**，所以可能是發文後畫面沒更新（動態牆沒重新載入）。請使用者描述發文後看到什麼 |
| Google 搜尋結果頁空白 | 首頁可以打字、按 Enter 送出，結果頁空白 | 結果頁先跑一段 JS 驗證，沒通過就以 `<noscript>` 的 meta refresh 導向「請啟用 JavaScript」 | 提升整體 JS 相容性；**不繞過**驗證 |
| YouTube 只有灰色骨架 | 沒有影片、沒有文字 | `webcomponents-sd.js`（web components polyfill）第 102 行 `cannot convert 'null' or 'undefined' to object`；`spf.js` 的 `not a callable function` | 查 polyfill 用到的 `Object.getOwnPropertyDescriptor` 等；shadow DOM 的繪製 |
| Gmail 空白 | `mail.google.com` 轉到 Google 登入頁後空白 | Google 登入對非主流瀏覽器另有限制 | 短期不列為目標 |
| 棋藝軒的「楚河 漢界」 | 字顯示在棋盤底部，不在河界中間 | 待查（定位或 grid） | 找出對應的 CSS 做最小重現 |
| Open-Meteo 預報主機連不上 | 天氣頁顯示「連線逾時」 | 這裡的網路對 `api.open-meteo.com` 的 TLS 握手逾時 | 換網路再試 |

## rubrowser 尚缺的標準功能

* 跨來源請求（CORS）：腳本對其他來源的 `fetch`／`XMLHttpRequest` 目前一律擋下。
* 以元素 id 當全域變數（HTML 的 named access on Window）。
* WebSocket 交握時帶 cookie。
* shadow DOM 的繪製、真正執行的 Web Worker、WebGL、canvas 的陰影與濾鏡、輸入法（IME）。
* `<textarea>` 沒有套用頁面指定的字型（Google 搜尋框顯示成等寬字）。

## 放上平板之前（rubrowser）

建議的硬體是 Raspberry Pi 5 加官方觸控螢幕，不用 VM，直接安裝，用 kiosk 合成器（例如 `cage`）把 rubrowser 開成全螢幕。這之前 rubrowser 要補：

* **觸控**：目前完全沒有處理觸控事件，手指點擊、滑動捲頁、兩指縮放都還不能用（Touch Events，以及 Pointer Events 的 `pointerType: "touch"`）。
* **螢幕鍵盤**：沒有實體鍵盤時，需要一個顯示在畫面上的鍵盤（文字欄位取得焦點時出現）。

## 安全

* **跨應用的表單送出（CSRF）**：任何網頁（包括外部網站與安裝的應用的網頁）都能在 rubrowser 裡對 `http://files.localhost:8700/delete` 這類系統應用的表單網址送出 POST；系統應用沒有登入，所以分不出是不是使用者自己按的。要做的：rubrowser 依 Fetch 標準在非 GET 的請求送 `Origin`（以及 `Sec-Fetch-Site`），系統應用（`_shared/lib.js` 的 `app()`）拒絕來源不是自己的 POST。
* 安裝的應用的網路限制是在 Worker 的執行環境裡擋（rucloud 的 runtime），不是作業系統層級的隔離。

## ruwebos

* 「檔案」裡的虛擬資料夾（在檔案總管看到相簿、音樂）。
* 縮圖依 EXIF 方向轉正。
* 軟體安裝（[install.md](install.md)）還沒做的：相簿、音樂、通訊錄、行事曆的權限；定期自動檢查更新；`.zip` 套件與 GitHub 以外的 Git 主機。

## 未來改良

* **從 Cloudflare 帳號安裝**：用使用者提供的 Cloudflare API token，把自己帳號裡的 Worker（程式碼、設定、D1／KV 的資料）匯出成套件再安裝到 ruwebos。會碰到使用者的帳號，token 的保存與權限範圍要另外設計（[install.md](install.md) 的決定 4）。
