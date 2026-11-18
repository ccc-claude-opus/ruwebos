# 觸控與虛擬鍵盤（規劃，待確認）

目標：同一套 ruwebos 在有觸控螢幕的裝置（例如樹莓派加觸控螢幕）上可以只用手指操作；沒有實體鍵盤時，點輸入框會從畫面下方升起虛擬鍵盤。沒有觸控的裝置照舊，不會看到任何差別。

## 已決定（2026-11-19）

1. **同一套系統自動判斷**，不分成有觸控、沒觸控兩個版本。
2. **第一步只做英數與符號鍵盤**；注音輸入（選字、詞庫與它的授權）之後另外規劃。

## 自動判斷

* rubrowser 收到第一個觸控事件後，就知道這台裝置有觸控。
* 用**手指**點輸入框時才升起虛擬鍵盤；用滑鼠點不會。
* 按下實體鍵盤的任何鍵，虛擬鍵盤就收起來，直到下一次用手指點輸入框。像平板接上藍牙鍵盤時那樣。
* 可以強制：rubrowser 的 `--keyboard auto|always|never`（預設 `auto`），ruwebos 的啟動器也有同名選項。`always` 讓沒有觸控螢幕的電腦也能用虛擬鍵盤，方便測試與示範。

## 觸控（rubrowser）

照 W3C 的 Touch Events 與 Pointer Events 做，網頁不需要為 rubrowser 另外處理：

| 手勢 | 結果 | 網頁收到的事件 |
|---|---|---|
| 點一下 | 和滑鼠點擊一樣：連結、按鈕、輸入框取得焦點 | `touchstart`、`touchend`；`pointerdown`、`pointerup`（`pointerType: "touch"`）；最後是相容的 `mousedown`、`mouseup`、`click` |
| 拖動 | 捲動手指下面的頁面或可捲動的區塊；放開後依速度繼續滑一段（慣性） | `touchmove`、`pointermove`；網頁取消 `touchmove` 或設了 `touch-action: none`（例如地圖、棋盤、畫布）時不捲動，交給網頁 |
| 長按（約 0.5 秒） | 右鍵選單（複製、在新分頁開啟連結…），或選取文字 | `contextmenu` |
| 多指 | 網頁收到每個觸控點（`touches`），例如地圖的兩指縮放由網頁自己處理 | `touchstart`／`touchmove`／`touchend` 帶多個 `Touch` |

瀏覽器本身的兩指縮放（放大整個網頁）需要 rubrowser 先有頁面縮放的功能，放到第二步。

rubrowser 的工具列（分頁、上一頁、網址列）也能用手指操作；按鈕的觸控範圍至少 44×44 px。

## 虛擬鍵盤（rubrowser）

* 屬於 rubrowser 的介面（和網址列一樣），所以外部網站（例如 Google 的搜尋框）也能用。
* 鍵盤升起時，網頁的可視區域變矮，並把有焦點的輸入框捲到看得到的地方；網頁會收到 `resize`。
* 按鍵送出的事件和實體鍵盤一樣：`keydown`、`keypress`、`beforeinput`、`input`、`keyup`；網址列也能用。

### 版面

| 頁面 | 內容 |
|---|---|
| 字母 | QWERTY、Shift（點兩下鎖定大寫）、退格、空白、Enter、切到數字、收起鍵盤 |
| 數字與符號 | `1`～`0`、常用標點與符號、第二頁更多符號 |
| 數字鍵盤 | 輸入框是 `type=number`、`inputmode=numeric`／`decimal` 時，直接顯示大的數字鍵 |
| 電話 | `type=tel`、`inputmode=tel`：數字鍵加 `+ * #` |
| 網址、Email | `type=url`／`email`（以及網址列）：字母鍵盤多 `/`、`.com`、`@` |

* Enter 鍵的字依 HTML 的 `enterkeyhint`（`go`、`search`、`send`、`next`、`done`）顯示「前往」「搜尋」「傳送」「下一個」「完成」。
* 長按字母可以打出帶重音的字母（é、ü…）：這一步不做，列為之後。
* 預留切換輸入法的鍵，給第二步的注音。

## 怎麼測試

* 這台 Mac 沒有觸控螢幕：rubrowser 的除錯輸入（`RUBROWSER_INPUT`）加上觸控的步驟（`touch-down`、`touch-move`、`touch-up`），以及 `--keyboard always` 截圖，自動測試觸控、捲動、長按與鍵盤。
* 單元測試：事件的順序與內容（Touch Events、Pointer Events、相容的滑鼠事件）、`touch-action`、輸入框的種類對應到的鍵盤。
* 真正的觸控螢幕要實機（樹莓派加觸控螢幕，用 Linux 的 Wayland 或 X11）：rubrowser 用的 winit 在 Linux 上會收到觸控事件。macOS 的觸控板不算觸控螢幕。

## 要做的事

| # | 項目 | 在哪裡 |
|---|---|---|
| 1 | 觸控輸入：點擊、拖動捲動（含慣性）、長按、多指；Touch Events、Pointer Events、相容的滑鼠事件、`touch-action` | rubrowser |
| 2 | 工具列的觸控 | rubrowser |
| 3 | 虛擬鍵盤：版面、送出按鍵事件、Shift／大寫鎖定、依 `type`／`inputmode`／`enterkeyhint` 切換 | rubrowser |
| 4 | 自動判斷與 `--keyboard auto\|always\|never` | rubrowser、ruwebos 的啟動器 |
| 5 | 測試：除錯輸入的觸控步驟、單元測試、截圖 | rubrowser |
| 6 | 文件：rubrowser 的 README、ruwebos 的 doc | 兩個 repo |

## 之後（第二步）

* 注音輸入：按鍵排列、選字列、詞庫（例如新酷音 libchewing 的詞庫，LGPL，要確認放進系統的方式）、選字記憶。
* 瀏覽器的兩指縮放（頁面縮放）。
* 長按字母打重音字母、表情符號。
