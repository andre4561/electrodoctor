---
title: Философия и практики — Электродоктор
---

# Философия и практики

[← Все статьи](../) · 3 статьи

<style>
.ed-search { position: relative; margin: 16px 0 10px; }
.ed-search input { width: 100%; box-sizing: border-box; font: inherit; font-size: 16px; padding: 10px 14px; border: 1px solid rgba(127,127,127,.4); border-radius: 10px; background: transparent; color: inherit; }
.ed-search input:focus { outline: 2px solid rgba(47,111,214,.35); border-color: #2f6fd6; }
.ed-found { margin: 6px 2px 0; font-size: 14px; opacity: .7; min-height: 1.2em; }
.ed-abc { display: flex; flex-wrap: wrap; gap: 4px; margin: 6px 0; }
.ed-abc a, .ed-abc span { min-width: 28px; padding: 3px 0; text-align: center; border-radius: 6px; font-size: 14px; font-weight: 600; text-decoration: none; }
.ed-abc a { border: 1px solid rgba(127,127,127,.3); }
.ed-abc a:hover { border-color: #2f6fd6; background: rgba(47,111,214,.1); }
.ed-abc span { opacity: .3; border: 1px solid transparent; }
.ed-list h3 { scroll-margin-top: 12px; margin-top: 22px; }
.ed-list ul { margin-top: 6px; }
.ed-list li small { opacity: .6; }
.ed-hide { display: none !important; }
.ed-top { font-size: 13px; margin-left: 8px; font-weight: 400; text-decoration: none; opacity: .6; }
</style>

<div class="ed-search"><input id="ed-q" type="search" placeholder="Поиск по названию или синониму" aria-label="Поиск статьи" autocomplete="off"><div class="ed-found" id="ed-found"></div></div>

<div id="ed-abc">
<div class="ed-abc"><span>А</span><span>Б</span><span>В</span><span>Г</span><span>Д</span><span>Е</span><span>Ж</span><span>З</span><span>И</span><span>Й</span><span>К</span><span>Л</span><span>М</span><span>Н</span><span>О</span><a href="#l-%D0%9F">П</a><span>Р</span><span>С</span><span>Т</span><a href="#l-%D0%A3">У</a><span>Ф</span><span>Х</span><span>Ц</span><a href="#l-%D0%A7">Ч</a><span>Ш</span><span>Щ</span><span>Э</span><span>Ю</span><span>Я</span></div>
</div>

<div class="ed-list" id="ed-list">
<div class="ed-group"><h3 id="l-%D0%9F">П<a class="ed-top" href="#ed-q">↑ наверх</a></h3>
<ul>
<li data-k="Питание, Минимализм вкуса как философия. Минимализм вкуса"><a href="%D0%9F%D0%B8%D1%82%D0%B0%D0%BD%D0%B8%D0%B5%2C%20%D0%9C%D0%B8%D0%BD%D0%B8%D0%BC%D0%B0%D0%BB%D0%B8%D0%B7%D0%BC%20%D0%B2%D0%BA%D1%83%D1%81%D0%B0%20%D0%BA%D0%B0%D0%BA%20%D1%84%D0%B8%D0%BB%D0%BE%D1%81%D0%BE%D1%84%D0%B8%D1%8F.html">Питание, Минимализм вкуса как философия.</a> <small>Минимализм вкуса</small></li>
</ul></div>
<div class="ed-group"><h3 id="l-%D0%A3">У<a class="ed-top" href="#ed-q">↑ наверх</a></h3>
<ul>
<li data-k="Удджайи (Победоносное дыхание) Ujjayi"><a href="%D0%A3%D0%B4%D0%B4%D0%B6%D0%B0%D0%B9%D0%B8%20%28%D0%9F%D0%BE%D0%B1%D0%B5%D0%B4%D0%BE%D0%BD%D0%BE%D1%81%D0%BD%D0%BE%D0%B5%20%D0%B4%D1%8B%D1%85%D0%B0%D0%BD%D0%B8%D0%B5%29.html">Удджайи (Победоносное дыхание)</a> <small>Ujjayi</small></li>
</ul></div>
<div class="ed-group"><h3 id="l-%D0%A7">Ч<a class="ed-top" href="#ed-q">↑ наверх</a></h3>
<ul>
<li data-k="Чакры"><a href="%D0%A7%D0%B0%D0%BA%D1%80%D1%8B.html">Чакры</a></li>
</ul></div>
</div>

<script>
(function () {
  var input = document.getElementById('ed-q'), found = document.getElementById('ed-found');
  var list = document.getElementById('ed-list'), abc = document.getElementById('ed-abc');
  var items = Array.prototype.slice.call(list.querySelectorAll('li'));
  var groups = Array.prototype.slice.call(list.querySelectorAll('.ed-group'));
  var norm = function (s) { return s.toLowerCase().replace(/ё/g, 'е'); };
  items.forEach(function (li) { li._k = norm(li.getAttribute('data-k') || li.textContent); });
  function run() {
    var q = norm(input.value.trim());
    var n = 0;
    items.forEach(function (li) { var ok = !q || li._k.indexOf(q) !== -1; li.classList.toggle('ed-hide', !ok); if (ok) n++; });
    groups.forEach(function (g) { g.classList.toggle('ed-hide', !g.querySelector('li:not(.ed-hide)')); });
    abc.classList.toggle('ed-hide', !!q);
    found.textContent = q ? (n ? 'Найдено: ' + n : 'Ничего не найдено') : '';
  }
  input.addEventListener('input', run);
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { input.value = ''; run(); }
    if (e.key === 'Enter') { var first = list.querySelector('li:not(.ed-hide) a'); if (first && input.value.trim()) first.click(); }
  });
  if (input.value) run();
})();
</script>
