// SPDX-License-Identifier: AGPL-3.0-or-later
// Электродоктор — шапка на страницах статей, как на главной и в кабинете:
// Главная · Информация · Настройки · Клиенты.
// Подключение: <script src="…/assets/sitenav.js" defer></script>
(function () {
  if (document.getElementById("ed-sitenav")) return;
  var me = document.currentScript || document.querySelector('script[src*="assets/sitenav.js"]');
  var base = me ? me.src.replace(/assets\/sitenav\.js.*$/, "") : "/";

  var css = "" +
    "#ed-sitenav{--n-bg:#fff;--n-ink:#1b1f24;--n-line:#e2e5ea;--n-acc:#2563c9;--n-soft:#e6eefb;" +
    "background:var(--n-bg);border-bottom:1px solid var(--n-line);font:15px/1.5 -apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif}" +
    "#ed-sitenav.dark{--n-bg:#1b2028;--n-ink:#e8ebef;--n-line:#2c333d;--n-acc:#6aa0ff;--n-soft:#1d2a40}" +
    "#ed-sitenav .n-in{max-width:1012px;margin:0 auto;padding:10px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}" +
    "#ed-sitenav .n-brand{font-weight:700;font-size:17px;color:var(--n-ink);text-decoration:none}" +
    "#ed-sitenav nav{display:flex;gap:8px;flex-wrap:wrap}" +
    "#ed-sitenav .n-btn{display:inline-block;text-decoration:none;border:1px solid var(--n-line);background:var(--n-bg);color:var(--n-ink);" +
    "padding:7px 14px;border-radius:8px;font-size:14px;line-height:1.4;cursor:pointer;font-family:inherit}" +
    "#ed-sitenav .n-btn:hover{border-color:var(--n-acc);color:var(--n-acc)}" +
    "#ed-sitenav .n-btn.on{border-color:var(--n-acc);background:var(--n-soft);color:var(--n-acc);font-weight:600}" +
    "@media (max-width:560px){#ed-sitenav nav{gap:6px}#ed-sitenav .n-btn{padding:6px 10px}}";
  var st = document.createElement("style");
  st.textContent = css;
  document.head.appendChild(st);

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

    var first = document.querySelector(".markdown-body > h1:first-child, .pv-top");
    if (first && (first.classList.contains("pv-top") || (first.children.length === 1 && first.firstElementChild.tagName === "A" && !first.textContent.trim().match(/\s/)))) first.style.display = "none";
  }
  if (document.body) build(); else document.addEventListener("DOMContentLoaded", build);
})();
