"""Страницы разделов статей: поиск с мгновенными результатами, две строки алфавита
(латиница и кириллица) и список статей по буквам.
Запуск: python tools/section_pages.py docs/articles  — пересоздаёт index.md во всех папках разделов.
"""
import html, json, os, re, sys
from urllib.parse import quote

base = sys.argv[1]
NAMES = {
    'diagnoses': 'Диагнозы', 'lab-tests': 'Анализы', 'supplements': 'БАДы', 'peptides': 'Пептиды',
    'probiotics': 'Пробиотики', 'drugs': 'Лекарства', 'general': 'Общие статьи', 'therapy': 'Терапия',
    'practices': 'Философия и практики', 'education': 'Образование',
}
LAT = [chr(c) for c in range(ord('A'), ord('Z') + 1)]
CYR = list('АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЭЮЯ')

def meta(path):
    t = open(path, encoding='utf-8').read()
    m = re.match(r'---\r?\n(.*?)\r?\n---', t, re.S)
    fm = m.group(1) if m else ''
    tm = re.search(r'^Title:\s*(.+)$', fm, re.M)
    title = tm.group(1).strip().strip('"') if tm else os.path.basename(path)[:-3]
    aliases, cur = [], None
    for line in fm.splitlines():
        if re.match(r'^\S', line):
            cur = line.split(':', 1)[0].strip()
        elif cur == 'aliases' and line.strip().startswith('- '):
            aliases.append(line.strip()[2:].strip().strip('"'))
    return title.replace('\\"', '"'), [a.replace('\\"', '"') for a in aliases]

def letter(title):
    c = title[:1].upper()
    if c == 'Ё': c = 'Е'
    if c in LAT or c in CYR: return c
    return '#'

def key(t): return t.lower().replace('ё', 'е')

def plural(n):
    if n % 10 == 1 and n % 100 != 11: return 'статья'
    if 2 <= n % 10 <= 4 and not 12 <= n % 100 <= 14: return 'статьи'
    return 'статей'

STYLE = """<style>
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
</style>"""

SCRIPT = """<script>
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
</script>"""

for folder, name in NAMES.items():
    d = os.path.join(base, folder)
    if not os.path.isdir(d):
        continue
    items = []
    for f in os.listdir(d):
        if not f.endswith('.md') or f == 'index.md':
            continue
        if re.search(r'^redirect_to:', open(os.path.join(d, f), encoding='utf-8').read(600), re.M): continue   # страница-ссылка
        title, aliases = meta(os.path.join(d, f))
        items.append((title, aliases, quote(f[:-3] + '.html', safe='/')))
    items.sort(key=lambda x: key(x[0]))
    groups = {}
    for it in items:
        groups.setdefault(letter(it[0]), []).append(it)
    order = [c for c in ['#'] + LAT + CYR if c in groups]
    gid = lambda c: 'l-' + ('num' if c == '#' else quote(c))

    def row(letters):
        return '<div class="ed-abc">' + ''.join(
            f'<a href="#{gid(c)}">{c}</a>' if c in groups else f'<span>{c}</span>' for c in letters) + '</div>'

    parts = []
    for c in order:
        lis = []
        for title, aliases, url in groups[c]:
            k = ' '.join([title] + aliases)
            extra = f' <small>{html.escape(", ".join(aliases))}</small>' if aliases else ''
            lis.append(f'<li data-k="{html.escape(k)}"><a href="{url}">{html.escape(title)}</a>{extra}</li>')
        parts.append(f'<div class="ed-group"><h3 id="{gid(c)}">{c}<a class="ed-top" href="#ed-q">↑ наверх</a></h3>\n<ul>\n' + '\n'.join(lis) + '\n</ul></div>')

    abc_rows = []
    if any(c in groups for c in LAT): abc_rows.append(row(LAT))
    if any(c in groups for c in CYR): abc_rows.append(row(CYR))
    if '#' in groups: abc_rows.insert(0, row(['#']))

    page = f"""---
title: {name} — Электродоктор
---

# {name}

[← Все статьи](../) · {len(items)} {plural(len(items))}

{STYLE}

<div class="ed-search"><input id="ed-q" type="search" placeholder="Поиск по названию или синониму" aria-label="Поиск статьи" autocomplete="off"><div class="ed-found" id="ed-found"></div></div>

<div id="ed-abc">
{chr(10).join(abc_rows)}
</div>

<div class="ed-list" id="ed-list">
{chr(10).join(parts)}
</div>

{SCRIPT}
"""
    open(os.path.join(d, 'index.md'), 'w', encoding='utf-8').write(page)
    print(folder, len(items), ''.join(order))
