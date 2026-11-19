# 讓你的應用能裝進 ruwebos（給應用作者）

能發佈到 Cloudflare Workers 的網站應用，大多可以不改程式就裝進 ruwebos。這份說明怎麼讓安裝更順利。安裝程式本身的設計見 [install.md](install.md)。

## 1. 只用 ruwebos 支援的服務

安裝的應用能用 **D1、KV、R2、Durable Objects、Vectorize、排程（cron）、Queues 與 Workflows**，以及靜態檔案（`assets`）。用到 Workers AI、Email、Browser Rendering、Containers、Images、Analytics Engine、Hyperdrive 或 service bindings 的應用，安裝程式會直接說明哪一項不支援。之後會放寬的部分見 [compat.md](compat.md)。

應用在 ruwebos 裡是**私人裝置上的本機應用**（`http://<id>.localhost:8700/`），外面的人連不進來；它要能在只有一個使用者、沒有公開網域的情況下運作。

## 2. 三種讓人安裝的方式

| 方式 | 你要做的 | 適合 |
|---|---|---|
| **GitHub Release 附上套件**（建議） | 把 [tools/github-action/ruwebos-release.yml](../tools/github-action/ruwebos-release.yml) 複製到專案的 `.github/workflows/`；每次發佈 Release 時，它會 `npm ci`、建置、打包成 `<id>.ruwebos.tar.gz` 附在 Release 上 | 所有專案，特別是需要 npm 建置的（React、Vite、TypeScript 相依套件） |
| **GitHub 儲存庫本身** | 不用做什麼；使用者在安裝程式貼上儲存庫網址，安裝程式下載原始碼 | 不需要建置、Worker 沒有引用 npm 套件的專案 |
| **網頁宣告套件** | 在網站的網頁裡加 `<link rel="ruwebos-app" href="/app.ruwebos.tar.gz">`；用 ruwebos 的 rubrowser 開時網址列旁會出現「安裝」 | 有自己網站的應用 |

使用者給 GitHub 儲存庫的網址時，安裝程式會**先找最新 Release 裡的 `*.ruwebos.tar.gz`**，沒有才下載原始碼。

也可以自己打包（需要 Node.js 22.15 以上；有 npm 相依套件時先 `npm ci`）：

```bash
node ruwebos/tools/ruwebos-package.mjs 你的專案 --out dist
```

使用者可以在安裝程式用「上傳套件檔」安裝這個檔案。

## 3. 描述檔 `ruwebos-app.json`（建議）

沒有描述檔也能安裝：安裝程式從 `wrangler.jsonc`、`package.json`（名稱、版本、說明、授權）與授權檔自動產生描述，但這樣的應用要求的權限只有「連網際網路」，而且預設不勾。放一個描述檔可以：

* 寫清楚名稱、圖示、顏色與授權；
* 宣告需要的權限（`files:read`、`files:write`、`system:info`、`network`），讓使用者在安裝時就能同意；
* 宣告要安裝程式產生的密鑰（例如簽 session 用的 `AUTH_SECRET`）；
* 用 `d1_init` 指定初始的資料表（或用 `migrations/`）。

欄位見 [install.md 的「應用套件」](install.md#應用套件)；範例 [apps/installer/samples/hello-files](../apps/installer/samples/hello-files)。

## 4. 授權

**必須有授權**：`package.json` 的 `license`（SPDX 名稱），或專案最上層的授權檔（`LICENSE`、`COPYING`…）。安裝程式認得 MIT、Apache-2.0、BSD、ISC、0BSD、MPL-2.0、GPL、LGPL、AGPL、Unlicense 的全文；認不出時請使用者看過授權檔後填上，完全沒有授權資訊的專案不能安裝。

## 5. 權限與系統應用的 API

使用者同意後，應用透過 `env.FILES`、`env.SYSTEM` 等使用系統應用的資料；沒有權限時這些綁定不存在，或回 403。需要時可以把使用者帶到安裝程式的權限頁要求。詳細見 [install.md 的「權限」](install.md#權限)。

## 6. 測試

用 [rucloud](https://github.com/ccc-claude-opus/rucloud) 在自己的電腦上跑（`rucloud dev`），它和 ruwebos 用的是同一套執行環境。
