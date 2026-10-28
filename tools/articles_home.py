# Главная страница статей (docs/articles/index.md): карточки разделов.
# Запуск: python tools/articles_home.py docs/articles
import os, sys

base = sys.argv[1]  # docs/articles

S = 'fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"'
ICONS = {
    # stethoscope
    'diagnoses': '<path d="M6 3v6a4 4 0 0 0 8 0V3"/><path d="M10 13v3a4 4 0 0 0 8 0v-2"/><circle cx="18" cy="12" r="2"/><path d="M5 3h2M13 3h2"/>',
    # test tube
    'lab-tests': '<path d="M9 3h6M10 3v13a2 2 0 0 0 4 0V3"/><path d="M10 10h4"/><path d="M5 21h14"/>',
    # capsule
    'supplements': '<rect x="3" y="8.5" width="18" height="7" rx="3.5" transform="rotate(-45 12 12)"/><path d="M9.5 9.5l5 5"/>',
    # peptide chain
    'peptides': '<circle cx="5" cy="7" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="7" r="2"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/><path d="M6.6 8.3l3.8 2.6M13.6 10.9l3.8-2.6M10.8 13.6l-2.6 2.8M13.2 13.6l2.6 2.8"/>',
    # bacterium
    'probiotics': '<rect x="5" y="8" width="14" height="8" rx="4"/><circle cx="10" cy="12" r="1"/><circle cx="14" cy="11" r=".8"/><path d="M5 12H2M19 12h3M8 8L6.5 5M16 8l1.5-3M8 16l-1.5 3M16 16l1.5 3"/>',
    # pill
    'drugs': '<circle cx="12" cy="12" r="8"/><path d="M6.5 17.5l11-11"/>',
    # book
    'general': '<path d="M4 5a2 2 0 0 1 2-2h13v15H6a2 2 0 0 0-2 2z"/><path d="M4 20a2 2 0 0 0 2 2h13v-4"/><path d="M8 7h7M8 10h5"/>',
    # waves / rays
    'therapy': '<circle cx="12" cy="12" r="3"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/>',
    # lotus
    'practices': '<path d="M12 18c-3-2-4-5-4-8 2 1 4 3 4 8z"/><path d="M12 18c3-2 4-5 4-8-2 1-4 3-4 8z"/><path d="M12 18c0-4 0-8 0-12-1.5 2-2 5-2 7"/><path d="M12 6c1.5 2 2 5 2 7"/><path d="M12 18c-4 0-7-2-9-5 3 0 6 1 9 5zM12 18c4 0 7-2 9-5-3 0-6 1-9 5z"/>',
    # graduation cap
    'education': '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c3 2 9 2 12 0v-5"/><path d="M22 9v6"/>',
}

SECTIONS = [
    ('diagnoses', 'Диагнозы', 'Болезни: причины, диагностика, лечение'),
    ('lab-tests', 'Анализы', 'Показатели крови и других тестов'),
    ('supplements', 'БАДы', 'Витамины, минералы, растения'),
    ('peptides', 'Пептиды', 'Регуляторные и исследуемые пептиды'),
    ('probiotics', 'Пробиотики', 'Штаммы бактерий и дрожжей'),
    ('drugs', 'Лекарства', 'Препараты и их действие'),
    ('general', 'Общие статьи', 'Клетка, метаболизм, долголетие'),
    ('therapy', 'Терапия', 'Физические и клеточные методы'),
    ('practices', 'Философия и практики', 'Дыхание, питание, энергия'),
    ('education', 'Образование', 'Обзоры групп заболеваний'),
]

def count(folder):
    d = os.path.join(base, folder)
    return sum(1 for f in os.listdir(d) if f.endswith('.md') and f != 'index.md' and 'redirect_to:' not in open(os.path.join(d, f), encoding='utf-8').read(600))

def plural(n):
    if n % 10 == 1 and n % 100 != 11: return 'статья'
    if 2 <= n % 10 <= 4 and not 12 <= n % 100 <= 14: return 'статьи'
    return 'статей'

cards, total = [], 0
for folder, name, desc in SECTIONS:
    if not os.path.isdir(os.path.join(base, folder)):
        continue
    n = count(folder); total += n
    cards.append(
        f'<a class="ed-card" href="{folder}/">'
        f'<svg class="ed-ico" viewBox="0 0 24 24" width="40" height="40" aria-hidden="true" {S}>{ICONS[folder]}</svg>'
        f'<span class="ed-name">{name}</span>'
        f'<span class="ed-desc">{desc}</span>'
        f'<span class="ed-count">{n} {plural(n)}</span></a>'
    )

page = f'''---
title: Статьи — Электродоктор
---

# Статьи

<p class="ed-lead">{total} {plural(total)} в {len(cards)} разделах. Выберите раздел, чтобы открыть список статей.</p>

<style>
.ed-lead {{ opacity: .75; }}
.ed-grid {{ display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin: 20px 0 32px; }}
@media (max-width: 860px) {{ .ed-grid {{ grid-template-columns: repeat(3, minmax(0, 1fr)); }} }}
@media (max-width: 640px) {{ .ed-grid {{ grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }} }}
.ed-card {{ display: flex; flex-direction: column; gap: 6px; padding: 18px 16px 16px; min-height: 170px;
  border: 1px solid rgba(127,127,127,.28); border-radius: 12px; background: rgba(127,127,127,.05);
  color: inherit !important; text-decoration: none !important; transition: border-color .15s, background .15s, transform .15s; }}
.ed-card:hover, .ed-card:focus-visible {{ border-color: #2f6fd6; background: rgba(47,111,214,.08); transform: translateY(-2px); }}
.ed-ico {{ color: #2f6fd6; margin-bottom: 6px; }}
.ed-name {{ font-weight: 600; font-size: 1.05em; line-height: 1.25; }}
.ed-desc {{ font-size: .85em; opacity: .7; line-height: 1.35; flex: 1; }}
.ed-count {{ font-size: .85em; font-variant-numeric: tabular-nums; opacity: .85; }}
@media (prefers-color-scheme: dark) {{ .ed-ico {{ color: #6aa0ff; }} }}
</style>

<div class="ed-grid">
{chr(10).join(cards)}
</div>
'''
open(os.path.join(base, 'index.md'), 'w', encoding='utf-8').write(page)
print(total, len(cards))
