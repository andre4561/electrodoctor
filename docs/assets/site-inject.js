// SPDX-License-Identifier: AGPL-3.0-or-later
// Вставляет assets/site-inject.html на каждую страницу (скрипты пересоздаются, чтобы выполнились).
(function () {
  if (window.__edSiteInject) return;
  window.__edSiteInject = true;
  var me = document.currentScript || document.querySelector('script[src*="site-inject.js"]');
  var url = me && me.src ? me.src.replace(/site-inject\.js(\?.*)?$/, "site-inject.html") : "/assets/site-inject.html";

  function isBlank(html) {
    var t = String(html || "").replace(/<!--[\s\S]*?-->/g, "").trim();
    return !t;
  }

  function inject(html) {
    if (isBlank(html)) return;
    var box = document.createElement("div");
    box.innerHTML = html;
    var nodes = Array.prototype.slice.call(box.childNodes);
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      if (node.nodeType === 3 && !String(node.textContent || "").trim()) continue;
      if (node.nodeType === 8) continue; // комментарий
      if (node.nodeName === "SCRIPT") {
        var s = document.createElement("script");
        for (var j = 0; j < node.attributes.length; j++) {
          var a = node.attributes[j];
          s.setAttribute(a.name, a.value);
        }
        if (node.textContent) s.text = node.textContent;
        document.head.appendChild(s);
      } else if (node.nodeType === 1) {
        document.head.appendChild(node);
      }
    }
  }

  fetch(url, { cache: "no-store" })
    .then(function (r) { return r.ok ? r.text() : ""; })
    .then(inject)
    .catch(function () { /* нет файла — ничего */ });
})();
