// 安裝的應用可以要求的權限，以及它們在 rucloud 裡變成什麼（PUT /apps/<名稱>/grants）。
// 系統應用的權限是一個 service binding：綁定名稱固定（應用的程式碼用 env.FILES 等），
// props 告訴系統應用是哪個應用、有哪些權限（{ app, perms }），系統應用依此決定能做什麼。

export const PERMS = {
  network: { label: '連線到網際網路', detail: '應用的伺服器端可以連到網際網路上的網站（不能連到這台裝置上的其他應用）', icon: '🌐' },
  'files:read': { label: '讀取「檔案」裡的檔案', detail: '列出資料夾、讀取檔案內容', icon: '📁', service: 'files', binding: 'FILES' },
  'files:write': { label: '在「檔案」裡新增、修改、刪除檔案', detail: '刪除的檔案會先放進垃圾桶', icon: '📝', service: 'files', binding: 'FILES' },
  'email:send': { label: '寄電子郵件給你', detail: '透過「設定」裡的寄信帳號寄出，只能寄到你在那裡列的收件地址（例如提醒、通知）', icon: '✉️' },
  ai: { label: '使用 AI', detail: '透過「設定 → AI」選的服務（本機的模型，或你的 API 金鑰）；應用送出的內容會交給那個服務，每天有用量上限', icon: '✨' },
  'system:info': { label: '讀取系統資訊', detail: '時區、語言、系統版本', icon: 'ℹ️', service: 'settings', binding: 'SYSTEM' },
};

/** 合在一起比各自危險的權限：都給的時候特別提醒。 */
export const COMBOS = [
  { perms: ['files:read', 'network'], warn: '可以讀取你「檔案」裡的檔案，並傳到網際網路上' },
];

/** perms（要求的或已給的）裡成立的危險組合。 */
export const combos = (perms) => COMBOS.filter((c) => c.perms.every((p) => perms.includes(p)));

/** 套件要求的權限檢查：只能是 PERMS 裡的，不重複。 */
export function checkPerms(list) {
  if (list === undefined) return [];
  if (!Array.isArray(list)) throw new Error('permissions 要是陣列');
  const out = [];
  for (const p of list) {
    if (!PERMS[p]) throw new Error(`不認得的權限：${p}（可用的有 ${Object.keys(PERMS).join('、')}）`);
    if (!out.includes(p)) out.push(p);
  }
  return out;
}

/** 使用者同意的權限 → rucloud 的 grants。 */
export function grantsFor(app, granted) {
  const byService = new Map();
  for (const p of granted) {
    const def = PERMS[p];
    if (!def?.service) continue;
    if (!byService.has(def.service)) byService.set(def.service, { binding: def.binding, perms: [] });
    byService.get(def.service).perms.push(p);
  }
  return {
    services: [...byService].map(([service, { binding, perms }]) => ({ binding, service, props: { app, perms } })),
    network: granted.includes('network'),
    email: granted.includes('email:send'),
    ai: granted.includes('ai'),
  };
}
