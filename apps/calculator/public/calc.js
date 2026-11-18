// 計算機介面：按鍵、鍵盤、即時計算與本機歷史紀錄。
(function () {
  'use strict';

  var HISTORY_KEY = 'calc-history';
  var MAX_HISTORY = 50;
  var history = loadHistory();

  function byId(id) {
    return document.getElementById(id);
  }

  function loadHistory() {
    try {
      var stored = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
      if (!Array.isArray(stored)) return [];
      return stored.filter(function (item) {
        return item && typeof item.expr === 'string' && typeof item.result === 'string';
      }).slice(0, MAX_HISTORY);
    } catch (error) {
      return [];
    }
  }

  function saveHistory() {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch (error) {
      // 私密瀏覽或儲存空間不足時，計算功能仍可正常使用。
    }
  }

  function currentAngle() {
    var select = byId('angle-select');
    return select && select.value === 'rad' ? 'rad' : 'deg';
  }

  function updateAngleButtons() {
    var angle = currentAngle();
    var buttons = document.querySelectorAll('[data-angle]');
    for (var i = 0; i < buttons.length; i++) {
      var button = buttons[i];
      if (button.getAttribute('data-angle') === angle) button.classList.add('on');
      else button.classList.remove('on');
    }
  }

  function updateDisplay() {
    var input = byId('expr');
    var expression = byId('display-expression');
    var result = byId('display-result');
    var error = byId('display-error');
    if (!input || !expression || !result || !error) return;

    var text = input.value;
    var displayText = text || '0';
    if (expression.textContent !== displayText) expression.textContent = displayText;
    if (error.textContent !== '') error.textContent = '';
    if (!text.trim()) {
      if (result.textContent !== '0') result.textContent = '0';
      return;
    }

    try {
      var formatted = globalThis.CalcCore.format(globalThis.CalcCore.evaluate(text, { angle: currentAngle() }));
      if (result.textContent !== formatted) result.textContent = formatted;
    } catch (caught) {
      if (result.textContent !== '—') result.textContent = '—';
      var message = caught.message || '計算式格式不正確。';
      if (error.textContent !== message) error.textContent = message;
    }
  }

  function renderHistory() {
    var list = byId('history-list');
    var empty = byId('history-empty');
    if (!list) return;
    var signature = JSON.stringify(history);
    if (list.getAttribute('data-signature') === signature) return;
    list.setAttribute('data-signature', signature);
    while (list.firstChild) list.removeChild(list.firstChild);

    for (var i = 0; i < history.length; i++) {
      var item = history[i];
      var li = document.createElement('li');
      var link = document.createElement('a');
      var text = document.createElement('span');
      var expression = document.createElement('strong');
      var result = document.createElement('span');

      link.className = 'main';
      link.href = '/?expr=' + encodeURIComponent(item.expr);
      link.setAttribute('data-reload', '');
      link.setAttribute('data-history-index', String(i));
      text.className = 'grow';
      expression.textContent = item.expr;
      result.className = 'sub';
      result.textContent = '= ' + item.result;
      text.appendChild(expression);
      text.appendChild(result);
      link.appendChild(text);
      li.appendChild(link);
      list.appendChild(li);
    }
    if (empty) empty.hidden = history.length > 0;
  }

  function insertText(text, cursorOffset) {
    var input = byId('expr');
    if (!input) return;
    var start = input.selectionStart === null ? input.value.length : input.selectionStart;
    var end = input.selectionEnd === null ? start : input.selectionEnd;
    input.value = input.value.slice(0, start) + text + input.value.slice(end);
    var cursor = start + (cursorOffset === undefined ? text.length : cursorOffset);
    input.focus();
    input.setSelectionRange(cursor, cursor);
    updateDisplay();
  }

  function insertClosingParenthesis() {
    var input = byId('expr');
    if (!input) return;
    var value = input.value;
    var open = 0;
    var close = 0;
    for (var i = 0; i < value.length; i++) {
      if (value.charAt(i) === '(') open++;
      if (value.charAt(i) === ')') close++;
    }
    if (open > close) insertText(')');
  }

  function backspace() {
    var input = byId('expr');
    if (!input) return;
    var start = input.selectionStart === null ? input.value.length : input.selectionStart;
    var end = input.selectionEnd === null ? start : input.selectionEnd;
    if (start === end && start > 0) start--;
    input.value = input.value.slice(0, start) + input.value.slice(end);
    var cursor = start;
    input.focus();
    input.setSelectionRange(cursor, cursor);
    updateDisplay();
  }

  function commit() {
    var input = byId('expr');
    if (!input || !input.value.trim()) {
      updateDisplay();
      return;
    }
    var value;
    try {
      value = globalThis.CalcCore.format(globalThis.CalcCore.evaluate(input.value, { angle: currentAngle() }));
    } catch (error) {
      updateDisplay();
      return;
    }
    history = history.filter(function (item) {
      return item.expr !== input.value;
    });
    history.unshift({ expr: input.value, result: value, angle: currentAngle() });
    if (history.length > MAX_HISTORY) history = history.slice(0, MAX_HISTORY);
    saveHistory();
    renderHistory();
    updateDisplay();
  }

  function closest(event, selector) {
    var target = event.target;
    return target && target.closest ? target.closest(selector) : null;
  }

  document.addEventListener('click', function (event) {
    var historyLink = closest(event, '[data-history-index]');
    if (historyLink) {
      var index = Number(historyLink.getAttribute('data-history-index'));
      var item = history[index];
      if (!item) return;
      event.preventDefault();
      var input = byId('expr');
      var select = byId('angle-select');
      if (input) {
        input.value = item.expr;
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      }
      if (select && (item.angle === 'deg' || item.angle === 'rad')) select.value = item.angle;
      updateAngleButtons();
      updateDisplay();
      return;
    }

    var angleButton = closest(event, '[data-angle]');
    if (angleButton) {
      var select = byId('angle-select');
      var angle = angleButton.getAttribute('data-angle');
      if (select && (angle === 'deg' || angle === 'rad')) select.value = angle;
      updateAngleButtons();
      updateDisplay();
      return;
    }

    var button = closest(event, '[data-k]');
    if (!button) return;
    var key = button.getAttribute('data-k');
    if (key === 'AC') {
      var input = byId('expr');
      if (input) {
        input.value = '';
        input.focus();
      }
      updateDisplay();
    } else if (key === '⌫') {
      backspace();
    } else if (key === ')') {
      insertClosingParenthesis();
    } else if (key === '=') {
      commit();
    } else if (key === 'sin' || key === 'cos' || key === 'tan' || key === 'ln' || key === 'log' || key === '√') {
      var text = key + '()';
      insertText(text, text.length - 1);
    } else if (key === '×') {
      insertText('*');
    } else if (key === '÷') {
      insertText('/');
    } else if (key === '−') {
      insertText('-');
    } else {
      insertText(key);
    }
  });

  document.addEventListener('input', function (event) {
    if (event.target && event.target.id === 'expr') updateDisplay();
  });

  document.addEventListener('change', function (event) {
    if (event.target && event.target.id === 'angle-select') {
      updateAngleButtons();
      updateDisplay();
    }
  });

  document.addEventListener('keydown', function (event) {
    var input = byId('expr');
    if (!input) return;
    var target = event.target;
    if (target && target !== input && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;

    var key = event.key;
    if (/^[0-9.]$/.test(key)) {
      event.preventDefault();
      insertText(key);
    } else if ('+-*/^%!()'.indexOf(key) >= 0) {
      event.preventDefault();
      insertText(key);
    } else if (key === '×') {
      event.preventDefault();
      insertText('*');
    } else if (key === '÷') {
      event.preventDefault();
      insertText('/');
    } else if (key === 'Enter') {
      event.preventDefault();
      commit();
    } else if (key === 'Backspace') {
      event.preventDefault();
      backspace();
    } else if (key === 'Escape') {
      event.preventDefault();
      input.value = '';
      input.focus();
      updateDisplay();
    }
  });

  updateAngleButtons();
  updateDisplay();
  renderHistory();

  if (window.MutationObserver) {
    var pending = false;
    var observer = new MutationObserver(function () {
      if (pending) return;
      pending = true;
      window.setTimeout(function () {
        pending = false;
        renderHistory();
        updateAngleButtons();
      }, 0);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
})();
