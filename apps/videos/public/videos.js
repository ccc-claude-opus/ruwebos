// 影片：播放時每 5 秒、暫停時、離開頁面時回報看到哪裡（與長度），下次從那裡繼續。
(function () {
  var v = document.getElementById('player');
  if (!v) return;
  var id = v.getAttribute('data-id');
  var last = -1;
  function save() {
    var t = Math.floor(v.currentTime || 0);
    if (t === last) return;
    last = t;
    var body = 'position=' + t + (isFinite(v.duration) && v.duration > 0 ? '&duration=' + v.duration.toFixed(1) : '');
    try {
      fetch('/v/' + id + '/position', { method: 'POST', keepalive: true, headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' }, body: body }).catch(function () {});
    } catch (e) {}
  }
  setInterval(function () { if (!v.paused) save(); }, 5000);
  v.addEventListener('pause', save);
  v.addEventListener('ended', save);
  // 網址的 #t= 沒有作用的瀏覽器：自己跳到上次的位置，再回報長度
  v.addEventListener('loadedmetadata', function () {
    var start = Number(v.getAttribute('data-start')) || 0;
    if (start > 0 && v.currentTime < 1) v.currentTime = start;
    last = -1;
    save();
  });
  window.addEventListener('pagehide', save);
})();
