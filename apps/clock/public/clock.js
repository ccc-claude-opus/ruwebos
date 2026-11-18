// 時鐘：世界時鐘、頁面鬧鐘、碼錶與計時器的漸進增強。
(function () {
  'use strict';

  var worldInterval = null;
  var alarmInterval = null;
  var stopwatchInterval = null;
  var timerInterval = null;
  var stopwatchState = null;
  var timerState = null;
  var alarmState = { triggered: {} };
  var audioContext = null;
  var initQueued = false;

  function pad2(value) {
    return String(value).length < 2 ? '0' + String(value) : String(value);
  }

  // UTC offsets (minutes) rendered by the server as data-offset: the page does not depend on the
  // browser's Intl time-zone data. Zones not on the page fall back to Intl.
  var known = {};
  Array.prototype.forEach.call(document.querySelectorAll('[data-tz][data-offset]'), function (el) {
    known[el.getAttribute('data-tz')] = Number(el.getAttribute('data-offset'));
  });

  function parts(date, tz) {
    if (Object.prototype.hasOwnProperty.call(known, tz)) {
      var d = new Date(date.getTime() + known[tz] * 60000);
      return {
        year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(),
        hour: d.getUTCHours(), minute: d.getUTCMinutes(), second: d.getUTCSeconds(), dow: d.getUTCDay(),
      };
    }
    var formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    var values = {};
    formatter.formatToParts(date).forEach(function (part) {
      values[part.type] = part.value;
    });
    return {
      year: Number(values.year),
      month: Number(values.month),
      day: Number(values.day),
      hour: Number(values.hour),
      minute: Number(values.minute),
      second: Number(values.second),
    };
  }

  function timeInZone(date, tz) {
    var value = parts(date, tz);
    return pad2(value.hour) + ':' + pad2(value.minute);
  }

  function dateInZone(date, tz) {
    var v = parts(date, tz);
    var dow = typeof v.dow === 'number' ? v.dow : new Date(Date.UTC(v.year, v.month - 1, v.day)).getUTCDay();
    return v.year + '年' + v.month + '月' + v.day + '日星期' + '日一二三四五六'.charAt(dow);
  }

  function offsetInZone(date, tz) {
    var value = parts(date, tz);
    var wall = Date.UTC(value.year, value.month - 1, value.day, value.hour, value.minute, value.second);
    var instant = Math.floor(date.getTime() / 1000) * 1000;
    return (wall - instant) / 60000;
  }

  function offsetText(difference) {
    if (!difference) return '相同';
    var sign = difference > 0 ? '+' : '-';
    var minutes = Math.abs(difference);
    var hours = Math.floor(minutes / 60);
    var rest = minutes % 60;
    if (hours && rest) return sign + hours + ' 小時 ' + rest + ' 分鐘';
    if (hours) return sign + hours + ' 小時';
    return sign + rest + ' 分鐘';
  }

  function beep() {
    try {
      var AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      if (!audioContext) audioContext = new AudioContextClass();
      if (audioContext.state === 'suspended' && audioContext.resume) {
        audioContext.resume().catch(function () {});
      }
      var oscillator = audioContext.createOscillator();
      var gain = audioContext.createGain();
      var now = audioContext.currentTime;
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.22, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.65);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start(now);
      oscillator.stop(now + 0.7);
    } catch (e) {}
  }

  function initWorld() {
    var world = document.getElementById('world-clock');
    if (!world) return;
    var viewerTz = world.getAttribute('data-viewer-tz') || 'UTC';

    function update() {
      var now = new Date();
      var viewerOffset = offsetInZone(now, viewerTz);
      var times = world.querySelectorAll('[data-tz]');
      Array.prototype.forEach.call(times, function (time) {
        var tz = time.getAttribute('data-tz');
        time.textContent = timeInZone(now, tz);
        time.setAttribute('datetime', now.toISOString());
        var card = time.parentNode;
        var date = card.querySelector('[data-clock-date]');
        var offset = card.querySelector('[data-clock-offset]');
        if (date) date.textContent = dateInZone(now, tz);
        if (offset) offset.textContent = offsetText(offsetInZone(now, tz) - viewerOffset);
      });
    }

    update();
    worldInterval = setInterval(update, 1000);
  }

  function initAlarms() {
    var banner = document.getElementById('alarm-banner');
    var message = document.getElementById('alarm-message');
    var close = document.getElementById('alarm-close');
    if (!banner || !message || !close) return;
    alarmState.triggered = {};

    close.addEventListener('click', function () {
      banner.hidden = true;
    });

    function check() {
      var now = new Date();
      var hour = pad2(now.getHours());
      var minute = pad2(now.getMinutes());
      var day = now.getDay();
      var items = document.querySelectorAll('[data-alarm-time]');
      Array.prototype.forEach.call(items, function (item) {
        if (item.getAttribute('data-alarm-enabled') !== 'true') return;
        if (item.getAttribute('data-alarm-time') !== hour + ':' + minute) return;
        var days = item.getAttribute('data-alarm-days') || '';
        if (days && days.split(',').indexOf(String(day)) < 0) return;
        var key = now.toDateString() + '|' + hour + ':' + minute + '|' + item.getAttribute('data-alarm-id');
        if (alarmState.triggered[key]) return;
        alarmState.triggered[key] = true;
        var label = item.getAttribute('data-alarm-label') || '鬧鐘';
        message.textContent = '鬧鐘：' + label + '（' + hour + ':' + minute + '）';
        banner.hidden = false;
        beep();
      });
    }

    check();
    alarmInterval = setInterval(check, 1000);
  }

  function formatElapsed(milliseconds) {
    var centiseconds = Math.floor(milliseconds / 10);
    var hundredths = centiseconds % 100;
    var seconds = Math.floor(centiseconds / 100) % 60;
    var minutes = Math.floor(centiseconds / 6000);
    return pad2(minutes) + ':' + pad2(seconds) + '.' + pad2(hundredths);
  }

  function addLap(list, number, value) {
    var item = document.createElement('li');
    var text = document.createElement('span');
    text.className = 'main grow';
    text.textContent = '分圈 ' + number + ' · ' + value;
    item.appendChild(text);
    list.appendChild(item);
  }

  function initStopwatch() {
    var display = document.getElementById('stopwatch-display');
    var start = document.getElementById('stopwatch-start');
    var pause = document.getElementById('stopwatch-pause');
    var reset = document.getElementById('stopwatch-reset');
    var lap = document.getElementById('stopwatch-lap');
    var laps = document.getElementById('stopwatch-laps');
    var note = document.getElementById('stopwatch-note');
    if (!display || !start || !pause || !reset || !lap || !laps) return;
    if (note) note.hidden = true;

    stopwatchState = { elapsed: 0, startedAt: 0, running: false, lapNumber: 0 };

    function elapsed() {
      if (!stopwatchState.running) return stopwatchState.elapsed;
      return stopwatchState.elapsed + performance.now() - stopwatchState.startedAt;
    }

    function update() {
      display.textContent = formatElapsed(elapsed());
      start.disabled = stopwatchState.running;
      pause.disabled = !stopwatchState.running;
    }

    start.addEventListener('click', function () {
      if (stopwatchState.running) return;
      stopwatchState.startedAt = performance.now();
      stopwatchState.running = true;
      update();
    });

    pause.addEventListener('click', function () {
      if (!stopwatchState.running) return;
      stopwatchState.elapsed = elapsed();
      stopwatchState.running = false;
      update();
    });

    reset.addEventListener('click', function () {
      stopwatchState.elapsed = 0;
      stopwatchState.startedAt = 0;
      stopwatchState.running = false;
      stopwatchState.lapNumber = 0;
      while (laps.firstChild) laps.removeChild(laps.firstChild);
      update();
    });

    lap.addEventListener('click', function () {
      var value = elapsed();
      if (!value) return;
      stopwatchState.lapNumber += 1;
      addLap(laps, stopwatchState.lapNumber, formatElapsed(value));
    });

    update();
    stopwatchInterval = setInterval(update, 50);
  }

  function timerDuration() {
    var minutes = document.getElementById('timer-minutes');
    var seconds = document.getElementById('timer-seconds');
    var minuteValue = Number(minutes.value);
    var secondValue = Number(seconds.value);
    if (!Number.isInteger(minuteValue) || !Number.isInteger(secondValue) || minuteValue < 0 || minuteValue > 999 || secondValue < 0 || secondValue > 59) return null;
    return (minuteValue * 60 + secondValue) * 1000;
  }

  function initTimer() {
    var display = document.getElementById('timer-display');
    var start = document.getElementById('timer-start');
    var pause = document.getElementById('timer-pause');
    var reset = document.getElementById('timer-reset');
    var lap = document.getElementById('timer-lap');
    var laps = document.getElementById('timer-laps');
    var note = document.getElementById('timer-note');
    var error = document.getElementById('timer-error');
    var banner = document.getElementById('timer-banner');
    var close = document.getElementById('timer-close');
    if (!display || !start || !pause || !reset || !lap || !laps || !banner || !close) return;
    if (note) note.hidden = true;

    timerState = { remaining: 0, endAt: 0, running: false, lapNumber: 0 };

    function showError(message) {
      if (!error) return;
      error.textContent = message;
      error.hidden = !message;
    }

    function update() {
      if (timerState.running) {
        timerState.remaining = Math.max(0, timerState.endAt - performance.now());
        if (!timerState.remaining) {
          timerState.running = false;
          timerState.endAt = 0;
          display.textContent = '00:00.00';
          start.disabled = false;
          pause.disabled = true;
          banner.hidden = false;
          beep();
          return;
        }
      }
      display.textContent = formatElapsed(timerState.remaining);
      start.disabled = timerState.running;
      pause.disabled = !timerState.running;
    }

    start.addEventListener('click', function () {
      if (timerState.running) return;
      if (!timerState.remaining) {
        var duration = timerDuration();
        if (!duration) {
          showError('請輸入有效的分鐘與秒數。');
          return;
        }
        timerState.remaining = duration;
      }
      showError('');
      timerState.endAt = performance.now() + timerState.remaining;
      timerState.running = true;
      update();
    });

    pause.addEventListener('click', function () {
      if (!timerState.running) return;
      timerState.remaining = Math.max(0, timerState.endAt - performance.now());
      timerState.running = false;
      timerState.endAt = 0;
      update();
    });

    reset.addEventListener('click', function () {
      timerState.remaining = 0;
      timerState.endAt = 0;
      timerState.running = false;
      timerState.lapNumber = 0;
      while (laps.firstChild) laps.removeChild(laps.firstChild);
      showError('');
      display.textContent = '00:00.00';
      start.disabled = false;
      pause.disabled = true;
    });

    lap.addEventListener('click', function () {
      if (!timerState.running && !timerState.remaining) return;
      timerState.lapNumber += 1;
      addLap(laps, timerState.lapNumber, formatElapsed(timerState.remaining));
    });

    close.addEventListener('click', function () {
      banner.hidden = true;
    });

    var presets = document.querySelectorAll('[data-timer-minutes]');
    Array.prototype.forEach.call(presets, function (preset) {
      preset.addEventListener('click', function () {
        var minutes = Number(preset.getAttribute('data-timer-minutes'));
        document.getElementById('timer-minutes').value = String(minutes);
        document.getElementById('timer-seconds').value = '0';
        timerState.remaining = minutes * 60000;
        timerState.endAt = 0;
        timerState.running = false;
        showError('');
        update();
      });
    });

    var inputs = [document.getElementById('timer-minutes'), document.getElementById('timer-seconds')];
    inputs.forEach(function (input) {
      input.addEventListener('input', function () {
        if (!timerState.running) {
          timerState.remaining = 0;
          timerState.endAt = 0;
          display.textContent = '00:00.00';
          showError('');
        }
      });
    });

    update();
    timerInterval = setInterval(update, 50);
  }

  function init() {
    if (worldInterval) clearInterval(worldInterval);
    if (alarmInterval) clearInterval(alarmInterval);
    if (stopwatchInterval) clearInterval(stopwatchInterval);
    if (timerInterval) clearInterval(timerInterval);
    worldInterval = null;
    alarmInterval = null;
    stopwatchInterval = null;
    timerInterval = null;
    initWorld();
    initAlarms();
    initStopwatch();
    initTimer();
  }

  function scheduleInit() {
    if (initQueued) return;
    initQueued = true;
    setTimeout(function () {
      initQueued = false;
      init();
    }, 0);
  }

  if (window.MutationObserver) {
    var observer = new MutationObserver(function (records) {
      for (var i = 0; i < records.length; i++) {
        if (records[i].target === document.body) {
          scheduleInit();
          return;
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  init();
})();
