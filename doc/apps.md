# 基本應用規劃：檔案、通訊錄、相機、相簿……

目標：讓 ruwebos 有手機與桌機都會用到的基本應用。每個應用都是一個 rucloud 應用（Worker + 靜態檔案），資料存在資料碟，和[階段 1](stage1.md)的預裝應用一樣由 `rucloud serve` 執行、從主畫面開啟。

這份文件先決定**要做哪些應用、分幾批、各需要什麼**；做法的細節在每一批開工時補上。

## 1. 現況盤點

### rucloud 能提供的（夠用）

| 需要 | rucloud 的對應 |
|---|---|
| 結構化資料（聯絡人、行程、備忘錄） | D1（SQLite） |
| 檔案、照片、錄音 | R2（含 range 讀取、multipart） |
| 設定、小資料 | KV |
| 即時同步、鬧鐘排程 | Durable Objects（alarm、WebSocket）、Cron Triggers |
| 應用之間互相呼叫 | Service bindings（`env.PHOTOS.fetch`、RPC） |
| 全文／語意搜尋 | Vectorize、D1 FTS |
| 對外抓資料（天氣） | `fetch`（VM 已能上網） |

### rubrowser 缺的（決定了先後順序）

檢查 rubrowser 原始碼的結果：

| Web 標準 | 現況 | 哪些應用需要 |
|---|---|---|
| 表單、`fetch`、`localStorage`、`<canvas>`、`toBlob` | 有 | 全部 |
| `<input type="file">` 的檔案選擇 | 只畫出外觀，不能選檔 | 檔案上傳、相簿匯入、通訊錄匯入 |
| `File`、`FileReader`、`Blob.arrayBuffer()`、`URL.createObjectURL` | 沒有或只是空殼 | 上傳、預覽 |
| `multipart/form-data`（RFC 7578） | `FormData` 被送成 urlencoded | 上傳 |
| 下載（`Content-Disposition: attachment`、`<a download>`） | 未確認 | 匯出 vCard、iCalendar、檔案 |
| `<audio>`、`<video>` | 有（`media` feature，FFmpeg） | 音樂、影片、錄音播放 |
| WebSocket（RFC 6455） | 沒有 | 訊息、多裝置即時同步 |
| Notifications API | 沒有 | 鬧鐘、行事曆提醒 |
| Media Capture（`getUserMedia`） | 沒有 | 相機、錄音機 |
| Touch / Pointer Events | 部分（pointer） | 手機版面（階段 3） |

所以第一批先做**只靠表單與 `fetch` 就能完整使用**的應用，同時在 rubrowser 補檔案相關的標準；相機、錄音、鬧鐘放在 rubrowser 補齊對應標準之後。

## 2. 要加入的應用

不做：電話與簡訊（ruwebos 沒有行動網路模組）；瀏覽器（rubrowser 本身就是）。

| 批次 | 應用 | 功能 | 資料 | 需要 rubrowser 補的 |
|---|---|---|---|---|
| **1** | **檔案**（檔案總管） | 資料夾瀏覽、新增資料夾、改名、搬移、刪除（先進垃圾桶）、預覽文字、圖片、音訊、影片、依類型與日期排序 | R2（內容）+ D1（目錄樹、垃圾桶） | 上傳要等第 2 批的檔案標準；先能管理、預覽與下載 |
| 1 | **通訊錄** | 聯絡人（多電話、多 email、地址、生日、群組、照片）、搜尋、我的最愛；匯入匯出 vCard（RFC 6350） | D1；照片在 R2 | 匯入要檔案選擇 |
| 1 | **行事曆** | 月／週／日檢視、重複規則（RRULE）、提醒時間；匯入匯出 iCalendar（RFC 5545） | D1 | 提醒要 Notifications |
| 1 | **備忘錄** | Markdown 筆記、資料夾與標籤、全文搜尋、釘選 | D1（FTS5） | — |
| 1 | **待辦** | 清單、期限、完成、重複；和行事曆共用日期 | D1 | — |
| 1 | **計算機** | 一般與工程模式、歷史紀錄 | 只在頁面（`localStorage`） | — |
| 1 | **時鐘** | 世界時鐘、碼錶、計時器；鬧鐘先只能在頁面開著時響 | KV | 背景鬧鐘要 Notifications |
| 1 | **設定** | 已安裝的應用、資料碟用量、系統版本、外觀（深淺色）、時區與語言、授權清單 | 讀 rucloud 管理埠（只在 VM 裡）、KV | — |
| **2** | **相簿** | 照片與影片的格狀檢視、依日期分組、相簿、我的最愛、EXIF（拍攝時間、地點）、縮圖 | R2（原檔與縮圖）+ D1（索引、EXIF） | 檔案選擇、`File`、multipart 上傳 |
| 2 | **音樂** | 曲目、專輯、播放清單、背景播放 | R2（range 讀取）+ D1 | 上傳；`<audio>` 已有 |
| 2 | **影片** | 影片清單、續播位置 | R2 + D1 | 上傳；`<video>` 已有 |
| 2 | **天氣** | 現在與一週預報、多個城市 | KV（快取）；資料來自公開 API（例如 Open-Meteo，CC BY 4.0，需標示來源） | — |
| **3** | **相機** | 拍照、錄影，存進相簿 | 透過 service binding 存到相簿 | `getUserMedia`、`<video>.srcObject`、canvas 擷取 |
| 3 | **錄音機** | 錄音、清單、播放、改名 | R2 + D1 | `getUserMedia`（音訊）、`MediaRecorder` |
| 3 | 時鐘的**背景鬧鐘**、行事曆**提醒** | 到時間由系統通知 | Durable Object alarm → 外殼顯示通知 | Notifications API |
| 之後 | 訊息、郵件、應用商店、全系統搜尋 | 見[規劃](plan.md)階段 3～5 | — | WebSocket、帳號 |

已經有的預裝應用照舊保留：地圖（map）、琴鍵實驗室（music，樂理學習，與上面的「音樂」播放器不同）、Markpedia、棋藝軒等。

## 3. 共同的設計

### 放在哪裡

基本應用放在本 repo 的 `apps/<名稱>/`（rucloud repo 的 `apps/` 是範例與展示用）。`image/build.sh` 把兩邊都裝進系統碟，`image/rucloud.toml` 各加一個 `[[app]]`。

### 應用之間的資料

每個應用的資料由 rucloud 隔離（各自的 D1、R2），需要共用時走 **service binding**，像手機的「媒體庫」與「分享」：

```mermaid
flowchart LR
  camera["相機"] -- "存照片" --> photos["相簿<br/>R2 + D1"]
  files["檔案"] -- "瀏覽「相簿」「錄音」虛擬資料夾" --> photos
  files --> recorder["錄音機"]
  contacts["通訊錄"] -- "大頭照" --> photos
  calendar["行事曆"] -- "生日" --> contacts
  todo["待辦"] -- "有期限的事項" --> calendar
```

* 「檔案」是使用者看到的總目錄：自己的 R2 之外，用 service binding 把相簿、錄音機、音樂顯示成虛擬資料夾。
* 每個應用在自己的 `wrangler.jsonc` 宣告需要哪些 binding，外人一看就知道它能碰到誰的資料（之後階段 4 的權限從這裡來）。

### 畫面與相容性

* **伺服器產生 HTML、表單送出為主，JavaScript 補強**：主要操作在沒有 JavaScript 時也能用，rubrowser 缺某個 API 時不會整個應用壞掉，也比較快。
* 共用一份樣式（`apps/_shared/ui.css`：顏色、字級、清單、按鈕、深色模式），建置時複製進每個應用；版面一開始就同時照顧桌機（寬）與手機（390 px 寬）。
* 每個應用附 `manifest.webmanifest`（名稱、圖示、主題色）。主畫面改成**建置時從各應用的 manifest 產生**，不再手寫；階段 3 的「安裝」也從這裡接上。
* 只依 Web 標準實作，不針對 rubrowser 做特例；rubrowser 缺的部分在 rubrowser repo 依規格補。

### 資料可以帶走

* 通訊錄匯出 vCard，行事曆匯出 iCalendar，備忘錄匯出 Markdown，檔案與照片就是原檔。之後可再加 CardDAV（RFC 6352）、CalDAV（RFC 4791），讓其他裝置同步。
* 全部存在資料碟，重開機與更新系統碟都不受影響。

### 帳號

先單一使用者、不登入（只能從本機經 hostfwd 連進來）。階段 4 加帳號時，每個應用的資料表多一個使用者欄位即可，所以資料表一開始就預留 `owner`。

### 授權

應用本身 MIT；只用自己寫的程式碼或授權清楚的函式庫（例如 EXIF 解析自己寫，不夾帶授權不明的圖示）。圖示用文字與 CSS，或授權為 MIT／CC0 的圖示集，並列進 `licenses.md`。

### 測試

每個應用附一個 API 測試（Node 的 `fetch`，在 VM 裡開機後跑），加上 rubrowser 截圖；`./ruwebos` 增加 `--test` 跑全部，記錄每個應用的開啟時間。

## 4. 建議的順序

1. **共同基礎**：`apps/_shared/ui.css`、manifest、主畫面改為自動產生、`--test`。
2. **第 1 批**：檔案（管理、預覽、下載）→ 通訊錄 → 行事曆 → 備忘錄 → 待辦 → 計算機 → 時鐘 → 設定。
3. **同時在 rubrowser 補**：`<input type="file">` 與檔案選擇對話框、`File` / `FileReader` / `Blob.arrayBuffer()`、`URL.createObjectURL`、multipart 送出、下載存檔。完成後檔案與通訊錄的上傳、匯入就能用。
4. **第 2 批**：相簿 → 音樂 → 影片 → 天氣。
5. **rubrowser 補** `getUserMedia`（macOS 用 AVFoundation、Linux 用 V4L2）、`MediaRecorder`、Notifications、WebSocket。
6. **第 3 批**：相機 → 錄音機 → 背景鬧鐘與提醒。

風險：攝影機與麥克風現在由主機上的 rubrowser 直接存取；到階段 2（rubrowser 在 VM 裡）時，ruvm 還需要把主機的攝影機與麥克風傳進 VM（例如 virtio 的影音裝置），這部分到時再規劃。

## 5. 需要您決定的事

| 問題 | 建議 |
|---|---|
| 第 1 批的範圍與順序 | 如上：檔案、通訊錄、行事曆、備忘錄、待辦、計算機、時鐘、設定 |
| 應用放在哪個 repo | ruwebos 的 `apps/`；rucloud 的 `apps/` 保留給範例 |
| 畫面做法 | 伺服器產生 HTML + 表單為主，JavaScript 補強 |
| rubrowser 的檔案標準是否與第 1 批同時開工 | 是，另開 rubrowser 的工作，兩邊不互相等 |
| 天氣用哪個公開資料來源 | Open-Meteo（免金鑰，資料 CC BY 4.0，頁面標示來源） |
