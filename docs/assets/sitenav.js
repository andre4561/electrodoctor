// SPDX-License-Identifier: AGPL-3.0-or-later
// Электродоктор — шапка на страницах статей, как на главной и в кабинете:
// Главная · Информация · Настройки · Клиенты.
// Стили — в assets/articles.css (Настройки → Прочее).
// Подключение: <script src="…/assets/sitenav.js" defer></script>
(function () {
  if (document.getElementById("ed-sitenav")) return;
  var me = document.currentScript || document.querySelector('script[src*="assets/sitenav.js"]');
  var base = me ? me.src.replace(/assets\/sitenav\.js.*$/, "") : "/";

  function build() {
    var bar = document.createElement("header");
    bar.id = "ed-sitenav";
    var links =
      '<a class="n-btn" href="' + base + '">Главная</a>' +
      '<a class="n-btn on" href="' + base + 'articles/" aria-current="page">Информация</a>' +
      '<a class="n-btn" href="' + base + 'app/#/settings">Настройки</a>' +
      '<a class="n-btn" href="' + base + 'app/#/clients">Клиенты</a>';
    bar.innerHTML = '<div class="n-in"><a class="n-brand" href="' + base + '">Электродоктор</a><nav aria-label="Разделы сайта">' + links + "</nav></div>";
    document.body.insertBefore(bar, document.body.firstChild);

    var bg = getComputedStyle(document.body).backgroundColor.match(/\d+/g);
    if (bg && bg.length >= 3 && (+bg[0] * 0.299 + +bg[1] * 0.587 + +bg[2] * 0.114) < 110) bar.classList.add("dark");

    // старый chrome темы GitHub Pages, если вдруг остался
    var first = document.querySelector(".markdown-body > h1:first-child, .pv-top");
    if (first && (first.classList.contains("pv-top") || (first.children.length === 1 && first.firstElementChild && first.firstElementChild.tagName === "A" && !first.textContent.trim().match(/\s/)))) first.style.display = "none";
  }
  if (document.body) build(); else document.addEventListener("DOMContentLoaded", build);
})();
