// 音樂的播放器：播完自動下一首、上一首／下一首、隨機、重複；點清單裡的歌直接切換，不重新載入頁面。
(function () {
  var audio = document.getElementById('player');
  var queue = document.getElementById('queue');
  if (!audio || !queue) return;
  var items = Array.prototype.slice.call(queue.querySelectorAll('li[data-id]'));
  var cur = 0;
  for (var i = 0; i < items.length; i++) if (items[i].className.indexOf('now') >= 0) cur = i;
  var shuffle = document.getElementById('shuffle');
  var repeat = document.getElementById('repeat');

  function show(i) {
    var li = items[i];
    items.forEach(function (x) { x.className = x === li ? 'now' : ''; });
    document.getElementById('np-title').textContent = li.getAttribute('data-title');
    document.getElementById('np-sub').textContent = li.getAttribute('data-sub');
    var img = document.querySelector('#np .cover');
    var src = li.getAttribute('data-cover');
    if (img && img.tagName === 'IMG' && src) img.src = src;
    document.title = li.getAttribute('data-title') + ' · 音樂';
  }
  function play(i) {
    if (i < 0 || i >= items.length) return;
    cur = i;
    audio.src = '/a/' + items[i].getAttribute('data-id');
    show(i);
    var p = audio.play();
    if (p && p.catch) p.catch(function () {});
  }
  function next() {
    if (shuffle && shuffle.checked && items.length > 1) {
      var n = cur;
      while (n === cur) n = Math.floor(Math.random() * items.length);
      play(n);
    } else if (cur + 1 < items.length) play(cur + 1);
    else if (repeat && repeat.checked) play(0);
  }
  audio.addEventListener('ended', next);
  document.getElementById('next').addEventListener('click', next);
  document.getElementById('prev').addEventListener('click', function () {
    if (audio.currentTime > 3) audio.currentTime = 0;
    else play(Math.max(0, cur - 1));
  });
  queue.addEventListener('click', function (e) {
    var a = e.target.closest ? e.target.closest('a') : null;
    if (!a) return;
    var li = a.closest('li');
    var i = items.indexOf(li);
    if (i < 0) return;
    e.preventDefault();
    play(i);
  });
})();
