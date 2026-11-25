// SPDX-License-Identifier: AGPL-3.0-or-later
// Стили статей: свой CSS из Настройки → Прочее перекрывает articles.css.
//   1) localStorage electrodoctor.articles.css — этот браузер;
//   2) иначе window.ED_ARTICLES_CSS из articles-config.js — для всех на хостинге;
//   3) иначе файл articles.css (ссылка в <head>).
(function () {
  var LS = "electrodoctor.articles.css";
  function customCss() {
    try {
      var a = localStorage.getItem(LS);
      if (a != null && a !== "") return a;
    } catch (e) { /* приватный режим */ }
    var b = typeof window.ED_ARTICLES_CSS === "string" ? window.ED_ARTICLES_CSS : "";
    return b ? b : "";
  }
  var css = customCss();
  if (!css) return;
  var link = document.getElementById("ed-articles-css-link");
  if (link) link.disabled = true;
  var old = document.getElementById("ed-articles-css");
  if (old) old.remove();
  var st = document.createElement("style");
  st.id = "ed-articles-css";
  st.textContent = css;
  document.head.appendChild(st);
})();
