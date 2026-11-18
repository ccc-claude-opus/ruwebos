// 相簿：替還沒有縮圖的照片在瀏覽器裡做縮圖（canvas，長邊 360 px，JPEG），送回伺服器。
// 失敗就算了：清單照樣用原檔顯示。
(function () {
  var MAX = 360;
  function make(img) {
    var id = img.getAttribute('data-thumb-for');
    if (!id || !img.naturalWidth) return;
    img.removeAttribute('data-thumb-for');
    try {
      var s = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
      var c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.naturalWidth * s));
      c.height = Math.max(1, Math.round(img.naturalHeight * s));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(function (blob) {
        if (!blob) return;
        fetch('/p/' + id + '/thumb', { method: 'POST', headers: { 'content-type': blob.type || 'image/jpeg' }, body: blob }).catch(function () {});
      }, 'image/jpeg', 0.8);
    } catch (e) {}
  }
  var imgs = document.querySelectorAll('img[data-thumb-for]');
  for (var i = 0; i < imgs.length; i++) {
    (function (img) {
      if (img.complete) make(img);
      else img.addEventListener('load', function () { make(img); });
    })(imgs[i]);
  }
})();
