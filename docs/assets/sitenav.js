// SPDX-License-Identifier: AGPL-3.0-or-later
// Электродоктор — шапка сайта на страницах статей, такая же, как в кабинете:
// «Электродоктор» слева, справа Информация · Настройки · Клиенты · Выход.
// Настройки, Клиенты и Выход видны, если в кабинет выполнен вход (как в самом кабинете).
// Подключение: <script src="…/assets/sitenav.js" defer></script>
(function () {
  if (document.getElementById("ed-sitenav")) return;
  var me = document.currentScript || document.querySelector('script[src*="assets/sitenav.js"]');
  var base = me ? me.src.replace(/assets\/sitenav\.js.*$/, "") : "/";       // корень сайта: …/electrodoctor/
  var logged = false;
  try { logged = sessionStorage.getItem("ed.login") === "1"; } catch (e) { /* нет доступа — считаем, что не вошли */ }

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
    var links = '<a class="n-btn on" href="' + base + 'articles/" aria-current="page">Информация</a>';
    if (logged) links += '<a class="n-btn" href="' + base + 'app/#/settings">Настройки</a>' +
      '<a class="n-btn" href="' + base + 'app/#/clients">Клиенты</a>' +
      '<button type="button" class="n-btn" data-logout>Выход</button>';
    else links += '<a class="n-btn" href="' + base + 'app/">Кабинет</a>';
    bar.innerHTML = '<div class="n-in"><a class="n-brand" href="' + base + 'app/">Электродоктор</a><nav aria-label="Разделы сайта">' + links + "</nav></div>";
    var out = bar.querySelector("[data-logout]");
    if (out) out.addEventListener("click", function () {
      try { sessionStorage.removeItem("ed.login"); } catch (e) { /* не страшно */ }
      location.href = base + "app/#/";
    });
    document.body.insertBefore(bar, document.body.firstChild);

    // Тёмная шапка — только если сама страница тёмная (оформление GitHub Pages всегда светлое)
    var bg = getComputedStyle(document.body).backgroundColor.match(/\d+/g);
    if (bg && bg.length >= 3 && (+bg[0] * 0.299 + +bg[1] * 0.587 + +bg[2] * 0.114) < 110) bar.classList.add("dark");

    // Стандартный заголовок-ссылка «electrodoctor» от оформления GitHub Pages больше не нужен
    var first = document.querySelector(".markdown-body > h1:first-child, .pv-top");
    if (first && (first.classList.contains("pv-top") || (first.children.length === 1 && first.firstElementChild.tagName === "A" && !first.textContent.trim().match(/\s/)))) first.style.display = "none";
  }
  if (document.body) build(); else document.addEventListener("DOMContentLoaded", build);
})();
