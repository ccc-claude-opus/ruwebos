# 讓更多 Cloudflare 應用能安裝（規劃）

安裝的應用原本能用的 Cloudflare 服務是 D1、KV、R2、Durable Objects、Vectorize 與排程（cron）；Workers AI、Queues、Email 等不能用（Queues 與 Workflows 已在第 2 步開放），需要先建置（npm）的專案也要先處理（見 [cloudflare-apps.md](cloudflare-apps.md)）。這份文件規劃怎麼放寬。

## 規劃時的現況：兩種不同的原因

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

## 私人裝置上的意義

ruwebos 是**一個人用的私人裝置**，應用只在本機（`localhost`）上，外面的人連不進來。很多 Cloudflare 服務是為「放在網路上給很多人用的網站」設計的，所以先看每一項在私人裝置上值不值得做：

| 功能 | 在私人裝置上 | 理由 | 規劃 |
|---|---|---|---|
| 沒有描述檔也能裝、處理 npm 建置 | **必要** | 不做的話，大部分現成應用都裝不起來 | 第 1、3 步 |
| Queues | 有用 | 應用內部的背景工作（轉檔、清理），和是否公開無關 | 第 2 步 |
| Workflows | 有用 | 同上，多步驟的背景工作 | 第 2 步 |
| Images | 有用 | 縮圖、轉格式，相簿這類應用用得到 | 第 3 步 |
| 寄信（`send_email`） | 用處有限 | 可以寄通知給自己，但要另外設定 SMTP 帳號 | 第 3 步的最後 |
| Workers AI | 有用，但有成本 | 例如摘要筆記；要有本機模型或付費金鑰 | 最後 |
| Analytics Engine | 幾乎沒意義 | 主要用來統計網站訪客（例如 Counterscale），私人裝置的訪客只有自己 | 不做 |
| Hyperdrive | 很少需要 | 連外部的 PostgreSQL，是多人 SaaS 的架構 | 不做 |
| 收信（Email Routing） | 沒意義 | 要有公開網域與 MX 記錄，私人裝置收不到外面寄來的信 | 不做（除非對外公開，見下） |
| Browser Rendering | 很少需要 | 爬網頁、產生 PDF，需求小，又要多跑一個瀏覽器 | 不做 |
| Containers | 不需要 | 很耗資源，私人裝置（尤其樹莓派）負擔不起；候選應用多半是給程式開發代理用的 | 不做 |

### 給「別人」用的應用

候選清單裡有不少應用的用途是讓外面的人連進來：短網址、狀態頁、表單收集（FormZero）、留言系統（Garrul）、電子報（LetterDrop）、分享檔案給別人的 Pastebin。裝在只有本機能連的私人裝置上，它們的核心功能不成立。要讓它們有意義，ruwebos 得能**對外公開某些應用**（例如透過 Cloudflare Tunnel 這類通道，或部署到有公開網域的伺服器）。這牽涉到安全（裝置會暴露在網路上），**先不做，列為待討論的題目**。

## 規劃

### 第 1 步：安裝流程（小、效益大）——2026-11-19 完成

已做：沒有描述檔也能裝（描述與授權自動產生、認不出的授權由使用者填、不支援的服務在安裝前就說明）；GitHub 儲存庫優先用最新 Release 的 `*.ruwebos.tar.gz`；安裝程式可以上傳套件檔；打包工具 `tools/ruwebos-package.mjs`（Worker 引用 npm 套件時用專案自己的 wrangler 打包）與 GitHub Action 範本；給作者的說明 [publish.md](publish.md)。還沒驗證的：GitHub Action 本身（要在 GitHub 上跑），以及用 wrangler 打包有 npm 相依套件的專案（這台機器沒有 wrangler）。

| 項目 | 做法 |
|---|---|
| 沒有 `ruwebos-app.json` 也能裝 | 安裝程式從 `wrangler.jsonc`（名稱）、`package.json`（名稱、版本、說明、授權）與 `LICENSE` 檔（比對常見授權的全文）產生描述；認不出授權時請使用者在同意畫面確認。權限從 wrangler 設定推得（例如用到外部網路的才問 `network`） |
| 已經建置好的套件 | 安裝 GitHub 儲存庫時，先找最新 Release 裡的 `*.ruwebos.tar.gz`；作者用 `wrangler deploy --dry-run --outdir` 打包的建置結果（已經把 node_modules 打包進去）也接受 |
| 給作者的說明與 GitHub Action | 文件說明怎麼讓應用能裝進 ruwebos（宣告套件、描述檔、只用支援的服務），附一個 GitHub Action 範本：每次發佈時自動建置、打包、附在 Release 上 |

### 第 2 步：Queues 與 Workflows 各自一份（rucloud）——2026-11-19 完成

已做：rucloud 把安裝的應用的佇列名稱加上應用名稱前綴（`<應用>:<佇列>`，包括 dead letter queue 與 R2 事件通知），Worker 只能送到自己有生產者綁定的佇列；workflow 本來就是每個應用一份（`<state>/<應用>/workflows.sqlite`），安裝的應用也會跑 workflow；移除應用並刪除資料時，佇列裡的訊息一起清掉。安裝程式不再拒絕用到 Queues、Workflows 的專案。`[dynamic]` 的應用仍然不能用。會多出來能裝的例子：microfeed（Queues）、CloudPaste（Workflows）。

### 第 3 步：建置、Images 與寄信——2026-11-19 完成

還沒驗證的：真的 SMTP 服務（測試用的是假的 SMTP 伺服器）、在虛擬機裡的整套流程。

| 項目 | 做法 |
|---|---|
| 在主機上打包 | `ruwebos pack <GitHub 網址>`：在開發機上 clone、`npm ci`、建置、打包成套件，再用安裝程式的「上傳套件」安裝 |
| 安裝程式自己抓 Worker 的相依套件（2026-11-19 完成） | 依 `package-lock.json` 下載 npm 套件並比對 integrity，**不執行**任何安裝腳本；只適用於不需要前端建置的專案。rucloud 用 wrangler 的 exports 條件（`workerd`、`worker`、`browser`）載入 |
| Images（2026-11-19 完成） | rucloud 用 Rust 的 image crate 實作 `env.IMAGES`：縮放（各種 fit）、裁切、旋轉、翻轉、模糊、亮度對比、疊圖，輸出 JPEG、PNG、WebP（無損）、GIF；不能輸出 AVIF |
| 寄信（`send_email`）成為權限（這一步的最後；2026-11-19 完成） | rucloud 實作 `send_email` 綁定（`EmailMessage` 與 `{ from, to, subject, text, html }` 兩種寫法），透過使用者在「設定 → 寄信」填的 SMTP 寄出（例如自己的信箱帳號）；和 Cloudflare 一樣只能寄給驗證過的收件地址（設定裡列的），綁定的 `destination_address` 等限制也照做；安裝的應用要有 `email:send` 權限 |

### 之後：先加強安全，再開放在系統裡建置

「在系統裡建置」是讓安裝程式自己跑 `npm ci` 與 `npm run build`，使用者貼上任何 GitHub 網址就能裝。但建置會執行第三方程式碼（專案的 build 指令、建置工具與外掛；`--ignore-scripts` 只擋得掉安裝腳本），而且是在 rucloud 的沙箱**外面**執行。

建置用的隔離只保護建置的那幾分鐘。裝進系統後安不安全，看的是**執行時**的隔離，而它目前有這些限制：

| 限制 | 說明 |
|---|---|
| 伺服器端的沙箱不是作業系統層級的 | rucloud 用 Node 的權限模型限制檔案與子程序，在 JavaScript 層擋對外連線與本機位址。Node 的權限模型是用來防止可信的程式碼出錯的「安全帶」，不保證擋得住惡意程式碼 |
| 瀏覽器端的跨應用表單送出（CSRF） | 每個應用有自己的網域，讀不到別人的資料；但其他應用的網頁可以對系統應用的表單網址送出 POST（例如叫「檔案」刪東西）。2026-11-19 起所有系統應用都擋了（見下面第 1 項） |
| 權限範圍內的行為 | 給了 `files:write` 就能改檔案、給了 `network` 就能把讀得到的資料傳出去；這和手機 App 一樣擋不住，只能讓使用者看清楚、可以收回 |

建置出來的東西和作者自己打包的套件一樣，本來就是不可信的程式碼，所以在系統裡建置不會讓執行時更危險；但開放之後，能裝的應用會變多，執行時的防線就更重要。順序調整成：

1. **補 CSRF**（小，而且是現在就存在的洞；2026-11-19 完成）：所有系統應用的 POST 都用 `crossSite` 檢查，拒絕從其他網站或應用的網頁送來的表單；rubrowser 依 Fetch 標準送 `Origin` 與 `Sec-Fetch-Site`。
2. **作業系統層級的隔離**，建置與執行用同一套設計（設計見 [isolation.md](isolation.md)）：
   * 每個安裝的應用的 Worker 程序用獨立的 Linux 使用者，或放進容器（例如 bubblewrap，LGPL；或 systemd 的沙箱設定）：只看得到自己的資料夾，看不到 `/data` 裡其他應用與系統的資料；
   * 網路用作業系統的隔離：沒有 `network` 權限的應用沒有網路，有的也只能經過一個只放行網際網路位址的代理；
   * 每個應用限制 CPU 與記憶體；
   * 這樣 Node 那一層被繞過時，作業系統那一層還擋著（兩道防線）。Node 的權限模型不夠拿來關建置工具：建置工具常會啟動子程序（例如 esbuild 是一個執行檔）。
3. **在系統裡建置**：在第 2 步的容器裡跑 `npm ci --ignore-scripts` 與建置。只開放一個暫存的建置資料夾，網路只能連 npm 的 registry，限制 CPU、記憶體、磁碟與時間，建置完整個清掉；只把建置結果交給安裝程式，照一般套件檢查、安裝。代價：映像檔要多放 npm，樹莓派上建置一個前端專案可能要好幾分鐘；有些專案用到平台相關的原生程式，不一定能在 arm64 上建置。

### 最後：Workers AI

成為權限 `ai`：使用者同意後才有 `env.AI`；AI 後端在「設定」裡選（主機上的 Ollama 等本機模型，或使用者自己的 API 金鑰）；每個應用有用量統計與上限。會多出來能裝的：Inkstone、FlareMo、Sink（AI 產生短網址）。

### 不做

Analytics Engine、Hyperdrive、收信（Email Routing）、Browser Rendering、Containers：理由見上面的表。對外公開應用之後若要做，再回頭評估收信。

### 待討論

* **對外公開某些應用**：讓短網址、表單、留言、電子報這類「給別人用」的應用有意義；要先想清楚安全與網域。

## 決定（2026-11-19）

1. 照第 1、2、3 步的順序；第 2 步只做 Queues 與 Workflows。
2. Workers AI 放到最後做。
3. 寄信列入第 3 步的最後（透過使用者在「設定」填的 SMTP 帳號）。
4. 在私人裝置上沒有意義或很少需要的不做：Analytics Engine、Hyperdrive、收信、Browser Rendering、Containers。
5. 「對外公開某些應用」列為待討論。

## 決定（2026-11-19，第 3 步之後）

6. 開放「在系統裡建置」之前先加強安全：先補 CSRF，再做作業系統層級的隔離（建置與執行共用），最後才在系統裡建置。
