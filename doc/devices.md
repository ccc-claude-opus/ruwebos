# 在平板或手機上跑 ruwebos

2026-11 整理。以下是依技術條件判斷的建議，**還沒有在這些裝置上實測**；機型會更新，買之前請查最新的型號。

## ruwebos 需要什麼

ruwebos 的核心是 **arm64 Linux 加上 Node.js**（rucloud 與每個應用的 Worker）。能跑的方式有兩種：

* 裝置上有 Linux：用 `native/install.sh` 直接安裝（[native.md](native.md)）；
* 裝置支援虛擬化：用虛擬機（ruvm 的 `-accel kvm`）。

另外：

* 記憶體建議 **8 GB 以上**：系統本身大約要 1.5～2 GB，十幾個應用各有自己的 Node 程序。
* 要用到作業系統層級的隔離（[isolation.md](isolation.md)），Linux 核心要支援 user namespace，也要能裝 bubblewrap。

## 推薦（由好到差）

| 選擇 | 怎麼跑 | 優點 | 要注意 |
|---|---|---|---|
| **Google Pixel 手機或 Pixel Tablet**（Pixel 8 以後，記憶體 8 GB 以上） | Android 15 以後內建「Linux 終端機」，裡面是一台 Debian 虛擬機（Android Virtualization Framework）；在裡面執行 `native/install.sh`，再用 Android 的 Chrome 開 `localhost:8700` | 量產的手機或平板，有完整的 Debian 核心，隔離應該可以用 | 要在開發人員選項開啟；虛擬機的記憶體與磁碟可能要調大；埠轉送要允許 |
| **樹莓派 5（8 GB 或 16 GB）加官方觸控螢幕**（Touch Display 2） | 裝 Debian 或 Raspberry Pi OS，用 native 方式安裝，瀏覽器用 kiosk 模式開主畫面 | 最符合 ruwebos 的設計（觸控、螢幕鍵盤、開機直接進主畫面），硬體與軟體都由自己掌控 | 外殼與電池要另外處理（市面上有外殼與電池模組） |
| **Windows on ARM 平板**（例如 Snapdragon X 的 Surface Pro） | 在 WSL2 的 Debian 或 Ubuntu（arm64）裡用 native 方式安裝 | 效能最好、記憶體大 | WSL2 裡沒有 KVM，只能用 native 方式；比較像筆電 |
| **一般 Android 手機或平板**（記憶體 8 GB 以上） | Termux 加 proot 的 Debian，再用 native 方式安裝 | 幾乎任何 Android 機器都行 | proot 沒有 user namespace，隔離會自動關掉，只剩 Node 那一層；效能較差 |

## 不推薦

* **iPad、iPhone**：iOS 不讓一般 App 使用虛擬化或 JIT，Node.js 沒有 JIT 會慢到不能用。適合當**顯示端**：ruwebos 跑在家裡的樹莓派或 Mac 上，用 Safari 連過去。
* **Linux 手機**（PinePhone Pro、Librem 5 等）：開放，但處理器弱、記憶體只有 3～4 GB，跑十幾個 Node 程序很吃力。

## 建議

* 想要真正的手機或平板：**Pixel**，走 Android 內建的 Linux 虛擬機。
* 想完全照 ruwebos 的設計：**樹莓派 5 加觸控螢幕**，也就是待辦清單上的「樹莓派實機測試（觸控、kiosk）」。

## 在 Pixel 的 Linux 終端機裡安裝（待實測）

1. 設定 → 系統 → 開發人員選項 → 開啟「Linux 開發環境」，打開「終端機」App，等它下載並啟動 Debian。
2. 在終端機的設定裡把磁碟調大（至少 4 GB），記憶體能調的話給 4 GB 以上。
3. 下載 GitHub Release 的 `ruwebos-native-arm64.tar.gz`，解開後執行 `native/install.sh`（見 [native.md](native.md)）。
4. 啟動 ruwebos，終端機 App 問要不要轉送埠 8700 時允許，然後在 Android 的 Chrome 開 `http://localhost:8700/`。
