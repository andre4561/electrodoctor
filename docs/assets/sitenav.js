// SPDX-License-Identifier: AGPL-3.0-or-later
// Электродоктор — шапка на страницах статей, как на главной и в кабинете:
// Главная · Клиенты · Настройки · Информация · Помощь · тема.
// Стили — в assets/articles.css (Настройки → Прочее).
// Подключение: <script src="…/assets/sitenav.js" defer></script>
(function () {
  if (document.getElementById("ed-sitenav")) return;
  var me = document.currentScript || document.querySelector('script[src*="assets/sitenav.js"]');
  var base = me ? me.src.replace(/assets\/sitenav\.js.*$/, "") : "/";
  var path = (location.pathname || "").replace(/\\/g, "/");

  function on(href) {
    if (href.indexOf("help") >= 0) return /\/help(\.html)?\/?$/.test(path);
    if (href.indexOf("articles") >= 0) return path.indexOf("/articles") >= 0;
    if (href.indexOf("clients") >= 0) return path.indexOf("/app") >= 0 && location.hash.indexOf("clients") >= 0;
    if (href.indexOf("settings") >= 0) return path.indexOf("/app") >= 0 && location.hash.indexOf("settings") >= 0;
    var rest = path.replace(base.replace(/\/$/, ""), "").replace(/^\/+/, "");
    return !rest || rest === "index.html";
  }

  function link(href, label) {
    var active = on(href);
    return '<a class="n-btn' + (active ? " on" : "") + '" href="' + href + '"' +
      (active ? ' aria-current="page"' : "") + ">" + label + "</a>";
  }

  function build() {
    var bar = document.createElement("header");
    bar.id = "ed-sitenav";
    var themeBtn = window.EDTheme ? window.EDTheme.buttonHtml("n-btn theme-toggle") :
      '<button type="button" class="n-btn theme-toggle" data-theme-toggle title="Тема" aria-label="Тема">◐</button>';
    var links =
      link(base, "Главная") +
      link(base + "app/#/clients", "Клиенты") +
      link(base + "app/#/settings", "Настройки") +
      link(base + "articles/", "Информация") +
      link(base + "help.html", "Помощь") +
      themeBtn;
    bar.innerHTML = '<div class="n-in"><a class="n-brand" href="' + base + '">Электродоктор</a><nav aria-label="Разделы сайта">' + links + "</nav></div>";
    document.body.insertBefore(bar, document.body.firstChild);

    if (window.EDTheme) {
      bar.classList.toggle("dark", window.EDTheme.get() === "dark");
      window.EDTheme.refreshButtons();
    } else {
      var bg = getComputedStyle(document.body).backgroundColor.match(/\d+/g);
      if (bg && bg.length >= 3 && (+bg[0] * 0.299 + +bg[1] * 0.587 + +bg[2] * 0.114) < 110) bar.classList.add("dark");
    }

    var first = document.querySelector(".markdown-body > h1:first-child, .pv-top");
    if (first && (first.classList.contains("pv-top") || (first.children.length === 1 && first.firstElementChild && first.firstElementChild.tagName === "A" && !first.textContent.trim().match(/\s/)))) first.style.display = "none";
  }
  if (document.body) build(); else document.addEventListener("DOMContentLoaded", build);
})();
