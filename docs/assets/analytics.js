// SPDX-License-Identifier: AGPL-3.0-or-later
// Яндекс.Метрика на всём сайте. Номер счётчика:
//   1) localStorage electrodoctor.metrika.id — из Настройки → Прочее (этот браузер);
//   2) иначе window.ED_METRIKA_ID из analytics-config.js (для всех посетителей на хостинге).
(function () {
  var LS = "electrodoctor.metrika.id";
  function counterId() {
    try {
      var a = localStorage.getItem(LS);
      if (a && /^\d{5,}$/.test(a)) return a;
    } catch (e) { /* приватный режим */ }
    var b = typeof window.ED_METRIKA_ID === "string" ? window.ED_METRIKA_ID.trim() : "";
    return /^\d{5,}$/.test(b) ? b : "";
  }
  function boot(id) {
    if (!id || window.__edMetrika) return;
    window.__edMetrika = id;
    (function (m, e, t, r, i, k, a) {
      m[i] = m[i] || function () { (m[i].a = m[i].a || []).push(arguments); };
      m[i].l = 1 * new Date();
      for (var j = 0; j < document.scripts.length; j++) if (document.scripts[j].src === r) return;
      k = e.createElement(t); a = e.getElementsByTagName(t)[0];
      k.async = 1; k.src = r; a.parentNode.insertBefore(k, a);
    })(window, document, "script", "https://mc.yandex.ru/metrika/tag.js", "ym");
    window.ym(id, "init", { clickmap: true, trackLinks: true, accurateTrackBounce: true, webvisor: false });
  }
  var id = counterId();
  if (id) boot(id);
  window.addEventListener("hashchange", function () {
    if (window.ym && window.__edMetrika) window.ym(window.__edMetrika, "hit", location.href);
  });
})();
