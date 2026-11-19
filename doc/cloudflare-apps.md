# 可以安裝的 Cloudflare 開源應用（候選清單）

2026-11-19 整理。這些是網路上現成、在 Cloudflare Workers 上跑的開源應用，可能適合用[安裝程式](install.md)裝進 ruwebos。**都還沒實際安裝或驗證**；用到的 Cloudflare 服務與授權取自下面的來源清單，裝之前要逐一到 repo 確認。

## 篩選條件

ruwebos 安裝的應用（rucloud 的 `[install]`）只能用 **D1、KV、R2、Durable Objects、排程（cron）**，所以排除：

* 用到 Queues、Workers AI、Analytics Engine、Workflows、Vectorize、Containers、Email Routing、Hyperdrive、Browser Rendering 的；
* 沒有標授權，或不是開源授權的（BUSL、FSL、PolyForm、source-available）；
* 依賴外部 PostgreSQL 的；
* 對「本機自用」沒意義的（例如要用自己的網域收信）。

## 候選清單

| 類別 | 應用 | 做什麼 | 用到 | 授權 |
|---|---|---|---|---|
| 檔案 | [R2 Explorer](https://github.com/G4brym/R2-Explorer) | 像雲端硬碟的檔案管理介面 | R2 | MIT |
| 檔案 | [Davflare](https://github.com/fanchenggang/Davflare) | 雲端硬碟，支援 WebDAV（電腦可以直接掛載） | R2 | MIT |
| 檔案 | [Pastebin Worker](https://github.com/SharzyL/pastebin-worker) | 貼文字、分享檔案，附命令列工具 | R2、KV、cron | MIT |
| 檔案 | [BinThere](https://github.com/nxfu/binthere) | 看過一次或 24 小時後就銷毀的加密貼文 | KV、DO | MIT |
| 檔案 | [Bookshelf](https://github.com/murerkinn/bookshelf) | 電子書書櫃 | R2 | MIT |
| 檔案 | [ShotSync](https://github.com/Defiabell/shotsync) | 在不同裝置之間傳圖片和文字 | R2 | MIT |
| 影音 | [CiviVideo](https://github.com/bitoceango/civideo) | 無廣告的兒童影片播放器，有家長控制 | D1、R2 | MIT |
| 密碼 | [NodeWarden](https://github.com/shuaiplus/nodewarden) | Bitwarden 相容的密碼庫伺服器，可用官方 App | D1、R2、KV、DO、cron | LGPL-3.0 |
| 安全 | [2FA](https://github.com/wuzf/2fa) | 兩步驟驗證碼管理，類似 Authy | KV、cron | MIT |
| 筆記 | [EdgeEver](https://github.com/tianma-if/edgeever) | 類似 Evernote 的筆記 | D1、R2 | AGPL-3.0 |
| 筆記 | [cloudmark](https://github.com/wesleyel/cloudmark) | 書籤收藏，類似 Pocket | D1 | AGPL-3.0 |
| 筆記 | [YAOS](https://github.com/kavinsood/yaos) | Obsidian 筆記即時同步 | R2、DO | 0BSD |
| 筆記 | [logseq-selfhost](https://github.com/yshalsager/logseq-selfhost) | Logseq 同步與發佈 | D1、R2、DO | AGPL-3.0 |
| 工作 | [Seeder](https://github.com/danielsyauqi/Seeder) | 專案管理、看板 | D1、R2 | MIT |
| 工作 | [Projektor](https://github.com/TAJD/projektor) | Wiki 加問題追蹤 | D1、R2、KV、DO、cron | MIT |
| 工作 | [FormZero](https://github.com/BohdanPetryshyn/formzero) | 表單收集，類似 Formspree | D1 | MIT |
| 協作 | [tldraw sync](https://github.com/tldraw/tldraw-sync-cloudflare) | 多人即時白板 | R2、DO | MIT |
| 聊天 | [NodeCrypt](https://github.com/shuaiplus/nodecrypt) | 端對端加密的網頁聊天 | DO | ISC |
| 聊天 | [EdgeChat](https://github.com/aozorae/Edgechat) | 類似 Slack 的團隊聊天 | D1、R2、KV、DO、cron | GPL-3.0 |
| 部落格 | [EmDash](https://github.com/emdash-cms/emdash) | WordPress 替代品 | D1、R2、cron | MIT |
| 監控 | [UptimeFlare](https://github.com/lyc8503/UptimeFlare) | 網站上線監控與狀態頁（要給「連網際網路」權限） | D1 | Apache-2.0 |
| 監控 | [atalaya](https://github.com/dcarrillo/atalaya) | 上線監控與狀態頁（同上） | D1、DO、cron | Apache-2.0 |
| 開發 | [durable-git](https://github.com/littledivy/durable-git) | Git 伺服器 | R2、DO | MIT |
| 範例 | [Cloudflare 官方範本](https://github.com/cloudflare/templates) | 待辦清單、聊天室、D1 範例等入門應用 | 依範本 | 依範本 |

## 排除的例子

| 原因 | 例子 |
|---|---|
| 用到 Workers AI 或 Analytics Engine | Sink（短網址）、Counterscale（流量分析）、Inkstone、FlareMo |
| 要用自己的網域收信（Email Routing） | Cloud Mail、Cloudflare Temp Email、Agentic Inbox 等郵件類 |
| 用到 Queues 或 Workflows（2026-11-19 起可以用，見 [compat.md](compat.md) 第 2 步；還要確認其他條件） | microfeed、CloudPaste、git-on-cloudflare |
| 授權不明或不是開源 | Memos Worker、r2-webdav、Timeseal（BUSL）、Kody（FSL） |

## 要裝之前得先補的

1. ~~**這些專案都沒有 `ruwebos-app.json`。**~~ 已解決（2026-11-19）：沒有描述檔也能裝，見 [compat.md](compat.md) 的第 1 步。原本的說明： 安裝程式要能安裝一般的 wrangler 專案：從 `wrangler.jsonc`、`package.json` 與 `LICENSE` 自動產生描述，授權認不出來時請使用者確認。
2. **多數專案要先 `npm install` 再建置**（部分解決：作者可以用 GitHub Action 在 Release 附上建置好的套件，見 [publish.md](publish.md)；其他的要在主機上用 `tools/ruwebos-package.mjs` 打包後上傳）（React、Vite、TypeScript 的相依套件）。安裝程式在 Worker 裡不能跑 npm。可行的作法：在主機上先建置好再打包；或在 ruwebos 裡加一個建置步驟。前者比較單純。不需要建置的少數專案，補完第 1 項就能裝。
3. 逐一確認：實際用到的綁定（有些「選用」的 Workers AI、Email 可以關掉）、授權檔、在 rucloud 上能不能跑。

怎麼放寬這些限制（隔離、權限、建置）見 [compat.md](compat.md)。

## 來源

* [theoephraim/awesome-cloudflare-selfhosted](https://github.com/theoephraim/awesome-cloudflare-selfhosted)：GitHub 上的清單（MIT）
* Bitdoze，[28 Self-Hosted Apps That Run Entirely on Cloudflare Workers](https://www.bitdoze.com/self-hosted-apps-cloudflare-workers/)
