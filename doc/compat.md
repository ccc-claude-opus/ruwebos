# 讓更多 Cloudflare 應用能安裝（規劃）

目前安裝的應用能用的 Cloudflare 服務是 D1、KV、R2、Durable Objects、Vectorize 與排程（cron）；Workers AI、Queues、Email 等還不能用，需要先建置（npm）的專案也要先處理（見 [cloudflare-apps.md](cloudflare-apps.md)）。這份文件規劃怎麼放寬。

## 現況：兩種不同的原因

| 服務 | rucloud 本身 | 安裝的應用 | 為什麼不能用 |
|---|---|---|---|
| Queues | 支援 | 不行 | 佇列在 rucloud 裡是**全機共用**的名字，一個應用可以讀寫別人的佇列 |
| Analytics Engine | 支援 | 不行 | dataset 全機共用，同上 |
| Workflows | 支援 | 不行 | 名稱全機共用，同上 |
| Workers AI | 支援（轉給 OpenAI 相容的後端，例如 Ollama） | 不行 | 用的是系統的 AI 後端與金鑰（可能要花錢） |
| Hyperdrive | 支援 | 不行 | 連到外部 PostgreSQL，讀的是伺服器的連線設定 |
| Vectorize | 支援 | **可以** | 每個應用自己一份 |
| Email（寄信 `send_email`） | 不支援 | 不行 | rucloud 沒有實作 |
| Email Routing（收信） | 不支援 | 不行 | 要有公開的網域與 MX 記錄，本機收不到信 |
| Images、Browser Rendering、Containers | 不支援 | 不行 | rucloud 沒有實作 |
| 需要 npm 建置的專案 | — | 不行 | 安裝程式在 Worker 裡，不能跑 npm 與建置工具 |
| 沒有 `ruwebos-app.json` 的專案 | — | 不行 | 安裝程式需要它（授權、權限） |

所以大致分成：**rucloud 已經支援、只是還沒做「每個應用各自一份」的隔離**（Queues、Analytics Engine、Workflows），**要使用者同意才能給的**（Workers AI、Hyperdrive、寄信），**rucloud 還沒有的**（Email Routing、Images、Browser Rendering、Containers），以及**安裝流程本身**（建置、描述檔）。

## 規劃

### 第 1 步：安裝流程（小、效益大）

| 項目 | 做法 |
|---|---|
| 沒有 `ruwebos-app.json` 也能裝 | 安裝程式從 `wrangler.jsonc`（名稱）、`package.json`（名稱、版本、說明、授權）與 `LICENSE` 檔（比對常見授權的全文）產生描述；認不出授權時請使用者在同意畫面確認。權限從 wrangler 設定推得（例如用到外部網路的才問 `network`） |
| 已經建置好的套件 | 安裝 GitHub 儲存庫時，先找最新 Release 裡的 `*.ruwebos.tar.gz`；作者用 `wrangler deploy --dry-run --outdir` 打包的建置結果（已經把 node_modules 打包進去）也接受 |
| 給作者的說明與 GitHub Action | 文件說明怎麼讓應用能裝進 ruwebos（宣告套件、描述檔、只用支援的服務），附一個 GitHub Action 範本：每次發佈時自動建置、打包、附在 Release 上 |

### 第 2 步：rucloud 的隔離與權限

| 項目 | 做法 | 會多出來能裝的（候選清單裡的例子） |
|---|---|---|
| Queues、Analytics Engine、Workflows 各自一份 | rucloud 把安裝的應用的佇列、dataset、workflow 名稱加上應用名稱前綴，只能存取自己的；移除時一起清掉 | microfeed（Queues）、CloudPaste（Workflows）、Counterscale（Analytics Engine） |
| Hyperdrive 隨 `network` 權限 | 連線字串由使用者在安裝時填（不是讀伺服器的設定） | FeedLog 這類要外部 PostgreSQL 的 |

### 第 3 步：建置與寄信

| 項目 | 做法 |
|---|---|
| 在主機上打包 | `ruwebos pack <GitHub 網址>`：在開發機上 clone、`npm ci`、建置、打包成套件，再用安裝程式的「上傳套件」安裝 |
| 安裝程式自己抓 Worker 的相依套件 | 依 `package-lock.json` 下載 npm 套件並比對 integrity，**不執行**任何安裝腳本；只適用於不需要前端建置的專案 |
| 寄信（`send_email`）成為權限 | rucloud 實作 `send_email` 綁定，透過使用者在「設定」裡填的 SMTP 寄出（例如自己的信箱帳號）；收件人限制照 Cloudflare 的規則 |
| Images | rucloud 用 Rust 的影像函式庫實作常用的縮放、格式轉換 |

### 之後（較大或需要外部條件）

* **Workers AI**（暫不做，2026-11-19 決定）：做法會是成為權限 `ai`，使用者同意後才有 `env.AI`，AI 後端在「設定」裡選（本機模型或使用者自己的 API 金鑰），每個應用有用量統計與上限。會多出來能裝的：Inkstone、FlareMo、Sink（AI 產生短網址）。

* **在系統裡建置**：在虛擬機裡用獨立的使用者或容器跑 `npm ci --ignore-scripts` 與建置；建置程式會執行第三方程式碼，要先想清楚隔離。
* **收信（Email Routing）**：ruwebos 放在有公開網域的伺服器上，或透過 Cloudflare Email Routing 轉送進來。
* **Browser Rendering**（在虛擬機裡跑 headless Chromium）、**Containers**（容器執行環境）：需要的資源大，等有明確需要的應用再做。

## 決定（2026-11-19）

1. 照第 1、2、3 步的順序。
2. Workers AI 先不做（列在「之後」）。
3. 寄信列入第 3 步（透過使用者在「設定」填的 SMTP 帳號）。
