// ruwebos apps: progressive enhancement (served as /_ui/enhance.js by every app).
// Pages work as plain links and forms; when this script runs, same-origin links and forms are sent with
// fetch() and the new page's <body> is swapped in, so the page does not flash or lose its place.
// Anything unexpected falls back to a normal navigation. Opt out with data-reload on a link or form.
(function () {
  // the viewer's time zone, for dates rendered on the server
  try {
    var tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && document.cookie.indexOf('tz=' + encodeURIComponent(tz)) < 0) {
      document.cookie = 'tz=' + encodeURIComponent(tz) + '; path=/; max-age=31536000; samesite=lax';
      if (document.body && document.body.getAttribute('data-tz-reload') !== null) location.reload();
    }
  } catch (e) {}

  if (!window.fetch || !window.history || !history.pushState) return;

  function sameOrigin(href) {
    try {
      return new URL(href, location.href).origin === location.origin;
    } catch (e) {
      return false;
    }
  }

  function swap(text, url, push) {
    var b = /<body[^>]*>([\s\S]*)<\/body>/i.exec(text);
    if (!b) throw new Error('no body');
    // scripts set into innerHTML do not run: load pages that have their own script normally
    // (url is already the GET page after a post/redirect/get, so nothing is sent twice)
    if (/<script[\s>]/i.test(b[1])) {
      location.href = url;
      return false;
    }
    var t = /<title>([\s\S]*?)<\/title>/i.exec(text);
    var tag = /<body([^>]*)>/i.exec(text);
    var style = tag && /style="([^"]*)"/.exec(tag[1]);
    if (style) document.body.setAttribute('style', style[1]);
    document.body.innerHTML = b[1];
    if (t) document.title = t[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    if (push === 'push' && url !== location.href) history.pushState({}, '', url);
    else if (push === 'replace') history.replaceState({}, '', url);
    var focus = document.querySelector('[autofocus]');
    if (focus) focus.focus();
  }

  function go(url, opts, push, fallback) {
    document.documentElement.setAttribute('aria-busy', 'true');
    return fetch(url, opts)
      .then(function (r) {
        var type = r.headers.get('content-type') || '';
        if (type.indexOf('text/html') < 0) throw new Error('not html');
        return r.text().then(function (text) {
          var before = location.href, x = window.scrollX, y = window.scrollY;
          if (swap(text, r.url || url, push) === false) return;
          // a new page starts at the top; the same page (e.g. after ticking a box) keeps its place
          if (push !== 'none' && location.href !== before) window.scrollTo(0, 0);
          else window.scrollTo(x, y);
        });
      })
      .catch(fallback)
      .then(function () {
        document.documentElement.removeAttribute('aria-busy');
      });
  }

  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest ? e.target.closest('a[href]') : null;
    if (!a || a.target || a.hasAttribute('download') || a.hasAttribute('data-reload')) return;
    var href = a.href;
    if (!sameOrigin(href) || href.indexOf('#') >= 0 && href.split('#')[0] === location.href.split('#')[0]) return;
    e.preventDefault();
    go(href, { headers: { accept: 'text/html' } }, 'push', function () {
      location.href = href;
    });
  });

  document.addEventListener('submit', function (e) {
    var f = e.target;
    if (e.defaultPrevented || f.hasAttribute('data-reload') || f.target) return;
    if ((f.enctype || '').indexOf('multipart') >= 0) return; // file uploads: let the browser do it
    var confirmText = f.getAttribute('data-confirm');
    if (confirmText && !window.confirm(confirmText)) {
      e.preventDefault();
      return;
    }
    var action = f.getAttribute('action') || location.href;
    if (!sameOrigin(action)) return;
    var method = (f.getAttribute('method') || 'get').toUpperCase();
    var data = new URLSearchParams();
    var els = f.elements;
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (!el.name || el.disabled) continue;
      if ((el.type === 'checkbox' || el.type === 'radio') && !el.checked) continue;
      if (el.type === 'submit' || el.type === 'button') continue;
      if (el.tagName === 'SELECT' && el.multiple) {
        for (var j = 0; j < el.options.length; j++) if (el.options[j].selected) data.append(el.name, el.options[j].value);
        continue;
      }
      data.append(el.name, el.value);
    }
    var btn = e.submitter;
    if (btn && btn.name) data.append(btn.name, btn.value);
    e.preventDefault();
    var url = new URL(action, location.href);
    var opts = { headers: { accept: 'text/html' } };
    if (method === 'GET') {
      url.search = data.toString();
    } else {
      opts.method = 'POST';
      opts.headers['content-type'] = 'application/x-www-form-urlencoded;charset=UTF-8';
      opts.body = data.toString();
    }
    go(url.href, opts, 'push', function () {
      f.setAttribute('data-reload', '');
      f.submit();
    });
  });

  window.addEventListener('popstate', function () {
    go(location.href, { headers: { accept: 'text/html' } }, 'none', function () {
      location.reload();
    });
  });
})();
