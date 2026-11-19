// 沒有 ruwebos-app.json 的一般 wrangler 專案：從 wrangler 設定、package.json 與授權檔產生描述。
// 授權依序取 package.json 的 license（SPDX）、授權檔的全文比對；都認不出來時由使用者在同意畫面確認，
// 沒有任何授權資訊的專案不能安裝。

const dec = new TextDecoder();

// 授權檔的全文 → SPDX 名稱（依常見授權的特徵句，前面的先比）
const LICENSES = [
  ['AGPL-3.0', [/GNU AFFERO GENERAL PUBLIC LICENSE/i, /Version 3/i]],
  ['LGPL-3.0', [/GNU LESSER GENERAL PUBLIC LICENSE/i, /Version 3/i]],
  ['LGPL-2.1', [/GNU LESSER GENERAL PUBLIC LICENSE/i, /Version 2\.1/i]],
  ['GPL-3.0', [/GNU GENERAL PUBLIC LICENSE/i, /Version 3/i]],
  ['GPL-2.0', [/GNU GENERAL PUBLIC LICENSE/i, /Version 2/i]],
  ['MPL-2.0', [/Mozilla Public License,? Version 2\.0/i]],
  ['Apache-2.0', [/Apache License/i, /Version 2\.0/i]],
  ['Unlicense', [/This is free and unencumbered software released into the public domain/i]],
  ['BSD-3-Clause', [/Redistribution and use in source and binary forms/i, /Neither the name/i]],
  ['BSD-2-Clause', [/Redistribution and use in source and binary forms/i]],
  ['MIT', [/Permission is hereby granted, free of charge, to any person obtaining a copy/i]],
  ['ISC', [/Permission to use, copy, modify, and\/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice/i]],
  ['0BSD', [/Permission to use, copy, modify, and\/or distribute this software for any purpose with or without fee is hereby granted\./i]],
];

export const LICENSE_FILES = /^(LICEN[CS]E|COPYING|UNLICENSE)(\.(md|txt|rst))?$/i;

/** 授權檔的內容 → SPDX 名稱，認不出時 null。 */
export function licenseOf(text) {
  const t = String(text).replace(/\s+/g, ' ');
  for (const [id, needles] of LICENSES) if (needles.every((re) => re.test(t))) return id;
  return null;
}

const SPDX = /^[A-Za-z0-9.+\-() ]+$/;
const NOT_FREE = /^(unlicensed|none|proprietary|see license in .*)$/i;

/** 名稱 → 合法的應用 id（小寫英數與 -）。 */
export function idOf(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/^@[^/]+\//, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);
}

/**
 * 產生描述（ruwebos-app.json 的內容）：wranglerCfg 是解析過的 wrangler 設定（toml 時為 null），
 * files 是 [{ path, data }]。回傳 { manifest, licenseText }；manifest.license 為 '' 表示要使用者確認。
 */
export function generateManifest(wranglerCfg, wranglerName, files) {
  const get = (p) => files.find((f) => f.path === p);
  let pkg = {};
  try {
    if (get('package.json')) pkg = JSON.parse(dec.decode(get('package.json').data));
  } catch {
    pkg = {};
  }
  const licenseFile = files.find((f) => !f.path.includes('/') && LICENSE_FILES.test(f.path));
  const licenseText = licenseFile ? dec.decode(licenseFile.data).slice(0, 20000) : '';
  const fromPkg = typeof pkg.license === 'string' && SPDX.test(pkg.license) && !NOT_FREE.test(pkg.license) ? pkg.license.trim() : '';
  const license = fromPkg || (licenseText ? licenseOf(licenseText) || '' : '');
  if (!license && !licenseText) throw new Error('這個專案沒有授權資訊（沒有 LICENSE 檔，package.json 也沒有 license），不能安裝');
  const name = wranglerCfg?.name || wranglerName || pkg.name || 'app';
  const id = idOf(name);
  if (!id) throw new Error('從專案的名稱產生不出應用的 id');
  // 只有一個 D1、沒有 migrations、最上層有 schema.sql：當成它的初始資料表
  const d1 = wranglerCfg?.d1_databases || [];
  const hasMigrations = files.some((f) => /^migrations\//.test(f.path) || d1.some((d) => d.migrations_dir && f.path.startsWith(d.migrations_dir.replace(/^\.\//, ''))));
  const d1Init = d1.length === 1 && !hasMigrations && get('schema.sql') ? { [d1[0].binding]: 'schema.sql' } : {};
  const repo = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url || '';
  const url = (v) => (/^https?:\/\//.test(v) ? v.replace(/^git\+/, '').replace(/\.git$/, '') : '');
  return {
    manifest: {
      id,
      name: String(pkg.displayName || name).slice(0, 40),
      version: /^\d+(\.\d+){0,2}([-+][0-9A-Za-z.-]+)?$/.test(pkg.version || '') ? pkg.version : '0.0.0',
      description: String(pkg.description || '').slice(0, 200),
      license,
      author: String(typeof pkg.author === 'string' ? pkg.author : pkg.author?.name || '').slice(0, 100),
      homepage: url(String(pkg.homepage || '')),
      source: url(String(repo).replace(/^git\+/, '')),
      // 一般的 Workers 應用常會連到外部；要不要給由使用者決定（同意畫面預設不勾）
      permissions: ['network', ...(wranglerCfg?.send_email?.length ? ['email:send'] : [])],
      d1_init: d1Init,
      generated: true,
    },
    licenseText,
  };
}

/** 安裝的應用不能用的綁定（rucloud 的 [install]）：給清楚的錯誤，而不是上傳後才失敗。 */
export function unsupportedBindings(cfg) {
  if (!cfg) return [];
  const names = {
    services: 'service bindings',
    ai: 'Workers AI',
    analytics_engine_datasets: 'Analytics Engine',
    hyperdrive: 'Hyperdrive',
    browser: 'Browser Rendering',
    containers: 'Containers',
  };
  return Object.entries(names)
    .filter(([k]) => {
      const v = cfg[k];
      if (Array.isArray(v)) return v.length > 0;
      if (v && typeof v === 'object') return Object.values(v).some((x) => (Array.isArray(x) ? x.length : x));
      return !!v;
    })
    .map(([, label]) => label);
}
