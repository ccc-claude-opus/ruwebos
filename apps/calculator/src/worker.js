// 計算機：一般與科學運算、角度模式，以及瀏覽器本機歷史紀錄。
//   GET /?expr=&angle=deg|rad  顯示並計算運算式
import '../public/calc-core.js';
import { app, page, html, UserError } from '../../_shared/lib.js';

const APP = { name: '計算機', color: '#495057' };
const { evaluate, format } = globalThis.CalcCore;

function calculation(expression, angle) {
  if (!expression.trim()) return { expression: '', result: '0', error: '' };
  try {
    return {
      expression: expression,
      result: format(evaluate(expression, { angle: angle })),
      error: ''
    };
  } catch (error) {
    return { expression: expression, result: '', error: error.message || '計算式格式不正確。' };
  }
}

function calculator(request, url) {
  const expression = url.searchParams.get('expr') || '';
  const angle = url.searchParams.get('angle') || 'deg';
  if (expression.length > 500) throw new UserError('計算式太長，最多 500 個字元。');
  if (angle !== 'deg' && angle !== 'rad') throw new UserError('角度模式必須是度（deg）或弧度（rad）。');
  const value = calculation(expression, angle);

  return page(request, {
    app: APP,
    body: html`
<style>
  .calc-form { margin-bottom: 12px; }
  .calc-display { display: grid; gap: 6px; min-height: 92px; padding: 14px; margin: 0 0 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--card); text-align: right; overflow-wrap: anywhere; }
  .calc-display #display-expression { color: var(--muted); min-height: 1.5em; font-size: 14px; }
  .calc-display #display-result { color: var(--text); font-size: 30px; line-height: 1.2; }
  .calc-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
  .calc-grid button { min-height: 46px; padding: 8px; font-size: 18px; }
  .calc-scientific { grid-template-columns: repeat(5, minmax(0, 1fr)); margin-top: 8px; }
  .calc-scientific button { min-height: 40px; padding: 6px; font-size: 15px; }
  .calc-toggle { margin-top: 12px; }
  .history-entry { width: 100%; }
  @media (max-width: 480px) { .calc-scientific { grid-template-columns: repeat(5, minmax(0, 1fr)); } }
</style>
<section class="card" aria-label="計算機">
  <form class="stack calc-form" method="get" action="/">
    <label>計算式<input id="expr" name="expr" type="text" value="${value.expression}" maxlength="500" autocomplete="off" spellcheck="false" autofocus></label>
    <label>角度模式
      <select id="angle-select" name="angle">
        <option value="deg"${angle === 'deg' ? html` selected` : ''}>DEG（度）</option>
        <option value="rad"${angle === 'rad' ? html` selected` : ''}>RAD（弧度）</option>
      </select>
    </label>
    <button class="primary" type="submit">計算</button>
  </form>

  <output id="display" class="calc-display" aria-live="polite" aria-label="計算結果">
    <span id="display-expression">${value.expression || '0'}</span>
    <strong id="display-result">${value.result || '—'}</strong>
  </output>
  <p id="display-error" class="error" role="alert">${value.error}</p>

  <div class="calc-grid" role="group" aria-label="數字與運算按鍵">
    <button type="button" data-k="AC">AC</button>
    <button type="button" data-k="⌫" aria-label="刪除上一個字元">⌫</button>
    <button type="button" data-k="(">(</button>
    <button type="button" data-k=")">)</button>
    <button type="button" data-k="÷">÷</button>
    <button type="button" data-k="7">7</button>
    <button type="button" data-k="8">8</button>
    <button type="button" data-k="9">9</button>
    <button type="button" data-k="×">×</button>
    <button type="button" data-k="4">4</button>
    <button type="button" data-k="5">5</button>
    <button type="button" data-k="6">6</button>
    <button type="button" data-k="−">−</button>
    <button type="button" data-k="1">1</button>
    <button type="button" data-k="2">2</button>
    <button type="button" data-k="3">3</button>
    <button type="button" data-k="+">+</button>
    <button type="button" data-k="0">0</button>
    <button type="button" data-k=".">.</button>
    <button class="primary" type="button" data-k="=">=</button>
  </div>

  <div class="section">科學函數</div>
  <div class="calc-grid calc-scientific" role="group" aria-label="科學函數按鍵">
    <button type="button" data-k="sin">sin</button>
    <button type="button" data-k="cos">cos</button>
    <button type="button" data-k="tan">tan</button>
    <button type="button" data-k="ln">ln</button>
    <button type="button" data-k="log">log</button>
    <button type="button" data-k="√">√</button>
    <button type="button" data-k="^">^</button>
    <button type="button" data-k="!">!</button>
    <button type="button" data-k="π">π</button>
    <button type="button" data-k="e">e</button>
  </div>

  <div class="row calc-toggle" role="group" aria-label="角度模式切換">
    <button class="chip${angle === 'deg' ? ' on' : ''}" type="button" data-angle="deg">DEG</button>
    <button class="chip${angle === 'rad' ? ' on' : ''}" type="button" data-angle="rad">RAD</button>
  </div>
</section>

<section aria-label="歷史紀錄">
  <h2 class="section">歷史紀錄</h2>
  <ul id="history-list" class="list" aria-live="polite"></ul>
  <p id="history-empty" class="empty">尚無歷史紀錄。</p>
  <noscript><p class="muted small">歷史紀錄只在啟用 JavaScript 時保存於此瀏覽器。</p></noscript>
</section>
<script src="/calc-core.js" defer></script>
<script src="/calc.js" defer></script>`
  });
}

export default app(APP, async (request, env, url) => {
  if (request.method === 'GET' && url.pathname === '/') return calculator(request, url);
  return null;
});
