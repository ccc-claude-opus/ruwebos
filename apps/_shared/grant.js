// 安裝的應用透過 service binding 呼叫系統應用時，rucloud 把安裝程式給的 props（{ app, perms }）放在 ctx.props。
// 由設定決定、呼叫端偽造不了；從瀏覽器或系統自己的應用來的請求沒有 props（ctx.props 是 {}）。
// 系統應用給安裝的應用的 API 都在 /api/v1/ 底下；安裝的應用不能用其他路徑（網頁、表單動作）。
import { json } from './lib.js';

/** 呼叫的安裝應用 { app, perms }；不是安裝的應用時是 null。 */
export function caller(ctx) {
  const p = ctx?.props;
  return p && typeof p.app === 'string' ? { app: p.app, perms: Array.isArray(p.perms) ? p.perms.map(String) : [] } : null;
}

/** 沒有權限時的回應（403，安裝的應用可以據此請使用者到安裝程式給權限）。 */
export const denied = (perm) =>
  json({ error: 'permission', perm, message: `這個應用沒有「${perm}」權限`, grant: `http://installer.localhost/grant?perm=${encodeURIComponent(perm)}` }, 403);

/**
 * 安裝的應用的請求：只能用 /api/v1/，並且要有 perms 裡的其中一個權限。回傳 null 表示可以繼續，否則是拒絕的回應。
 * 不是安裝的應用（ctx.props 沒有 app）時一律放行。
 */
export function check(ctx, url, ...perms) {
  const c = caller(ctx);
  if (!c) return null;
  if (!url.pathname.startsWith('/api/v1/')) return json({ error: 'not_found', message: '安裝的應用只能用 /api/v1/' }, 404);
  if (perms.length && !perms.some((p) => c.perms.includes(p))) return denied(perms[0]);
  return null;
}
