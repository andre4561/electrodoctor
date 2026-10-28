// SPDX-License-Identifier: AGPL-3.0-or-later
// Электродоктор — кнопка «Наверх» в правом нижнем углу.
// Появляется, когда страницу прокрутили вниз; подключается одной строкой на любой странице:
//   <script src="…/assets/totop.js" defer></script>
(function () {
  if (document.getElementById("ed-totop")) return;
  var css = "" +
    "#ed-totop{position:fixed;right:20px;bottom:20px;z-index:1000;width:46px;height:46px;border-radius:50%;" +
    "border:1px solid rgba(127,127,127,.35);background:#2563c9;color:#fff;cursor:pointer;display:flex;" +
    "align-items:center;justify-content:center;box-shadow:0 4px 14px rgba(0,0,0,.18);opacity:0;" +
    "transform:translateY(12px);pointer-events:none;transition:opacity .2s,transform .2s,filter .15s}" +
    "#ed-totop.on{opacity:.92;transform:none;pointer-events:auto}" +
    "#ed-totop:hover{opacity:1;filter:brightness(1.1)}" +
    "#ed-totop:focus-visible{outline:3px solid rgba(37,99,201,.45);outline-offset:3px}" +
    "@media (prefers-color-scheme:dark){#ed-totop{background:#6aa0ff;color:#0d1117}}" +
    "@media (max-width:640px){#ed-totop{right:14px;bottom:14px;width:42px;height:42px}}" +
    "@media (prefers-reduced-motion:reduce){#ed-totop{transition:none}}" +
    "@media print{#ed-totop{display:none}}";
  var style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  var b = document.createElement("button");
  b.id = "ed-totop";
  b.type = "button";
  b.title = "Наверх";
  b.setAttribute("aria-label", "Наверх");
  b.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
  b.addEventListener("click", function () {
    var smooth = !(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    window.scrollTo({ top: 0, behavior: smooth ? "smooth" : "auto" });
  });
  function add() { document.body.appendChild(b); update(); }
  function update() { b.classList.toggle("on", window.scrollY > 400); }
  window.addEventListener("scroll", update, { passive: true });
  if (document.body) add(); else document.addEventListener("DOMContentLoaded", add);
})();
