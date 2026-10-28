# SPDX-License-Identifier: AGPL-3.0-or-later
# Разделы диагнозов по врачебным специальностям: docs/data/diagnoses.json
# Статья попадает в раздел по своим тегам (поле tags в начале .md-файла); одна статья может быть в нескольких разделах.
# «Дети», «Пожилые», «Неотложно» — не разделы, а пометки у диагноза.
# Если тегов не хватает, раздел задаётся вручную в OVERRIDES.
# Запуск после добавления статей:  python tools/diagnoses_sections.py
import json, os, re

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
DIR = os.path.join(ROOT, "docs/articles/diagnoses")
OUT = os.path.join(ROOT, "docs/data/diagnoses.json")

# id, название, подпись, теги
SECTIONS = [
    ("cardio", "Кардиология", "Сердце и сосуды", ['Сердце', 'Сосуды']),
    ("pulmo", "Пульмонология", "Лёгкие и дыхание", ['Лёгкие']),
    ("gastro", "Гастроэнтерология", "Желудок, кишечник, печень", ['ЖКТ', 'Кишечник', 'Печень', 'Пищевод', 'Желчный_пузырь_и_желчные_пути']),
    ("endo", "Эндокринология", "Гормоны, диабет, обмен веществ", ['Гормональная_система', 'Диабет', 'Щитовидная_железа', 'Надпочечники', 'Метаболизм', 'Витамины_и_минералы', 'Водно-электролитный_баланс']),
    ("neuro", "Неврология", "Нервная система и мозг", ['Нервная_система', 'Мозг', 'Сон', 'Речь_и_коммуникация', 'Боль']),
    ("psych", "Психиатрия и психотерапия", "Психика и зависимости", ['Психическое_здоровье', 'Зависимости']),
    ("nephro", "Нефрология и урология", "Почки и мочевые пути", ['Почки', 'Мочевыделительная_система', 'Мочевой_пузырь']),
    ("gyn", "Гинекология и акушерство", "Женское здоровье, беременность", ['Матка', 'Яичники', 'Беременность_и_роды', 'Молочные_железы']),
    ("andro", "Андрология", "Мужское и сексуальное здоровье", ['Сексуальное_здоровье', 'Предстательная_железа']),
    ("hemat", "Гематология", "Кровь и лимфа", ['Кровь', 'Костный_мозг', 'Лимфатическая_система']),
    ("rheum", "Ревматология", "Суставы и соединительная ткань", ['Суставы', 'Соединительная_ткань']),
    ("ortho", "Травматология и ортопедия", "Кости, мышцы, травмы", ['Травмы', 'Кости', 'Опорно-двигательная_система', 'Мышцы']),
    ("derma", "Дерматология", "Кожа, волосы, ногти", ['Кожа']),
    ("ophth", "Офтальмология", "Глаза и зрение", ['Глаза_и_зрение']),
    ("ent", "Оториноларингология", "Ухо, горло, нос", ['Уши_и_слух', 'Горло_и_гортань', 'Нос_и_пазухи', 'ЛОР-органы']),
    ("dent", "Стоматология", "Зубы и полость рта", ['Рот']),
    ("infect", "Инфекционные болезни", "Инфекции и прививки", ['Инфекции', 'Вакцинация']),
    ("immuno", "Аллергология и иммунология", "Иммунитет и аллергия", ['Иммунная_система']),
    ("onco", "Онкология", "Опухоли", ['Онкология', 'Рак']),
    ("genetic", "Генетика", "Врождённые и наследственные", ['Врожденные_нарушения', 'ДНК']),
]
# id, название, теги
FLAGS = [
    ("child", "Дети", ['Детское_здоровье']),
    ("elderly", "Пожилые", ['Здоровье_пожилых']),
    ("urgent", "Неотложно", ['Неотложная_помощь', 'Отравления']),
]
# Ручные разделы для статей, которым теги не помогают (имя файла без .md → разделы)
OVERRIDES = {
    "Бактериальный вагиноз": ["gyn", "infect"],
    "Вульводиния": ["gyn"],
    "Эндометриоз": ["gyn"],
    "Гидроцеле": ["andro", "nephro"],
    "Перекрут яичка": ["andro", "nephro"],
}
OTHER = ("other", "Другое", "Без специальности")


def front(text):
    m = re.match(r"---\r?\n(.*?)\r?\n---", text, re.S)
    if not m:
        return "", []
    fm = m.group(1)
    title = (re.search(r"^Title:\s*(.+)$", fm, re.M) or re.search(r"^title:\s*(.+)$", fm, re.M))
    tg = re.search(r"^tags:\s*\r?\n((?:[ \t]+- .*\r?\n?)+)", fm, re.M)
    tags = [t.strip() for t in re.findall(r"- (.*)", tg.group(1))] if tg else []
    return (title.group(1).strip() if title else ""), tags


def main():
    items, counts = {}, {}
    for f in sorted(os.listdir(DIR)):
        if not f.endswith(".md") or f == "index.md":
            continue
        name = f[:-3]
        title, tags = front(open(os.path.join(DIR, f), encoding="utf-8").read())
        secs = OVERRIDES.get(name) or [s[0] for s in SECTIONS if set(s[3]) & set(tags)] or [OTHER[0]]
        flags = [fl[0] for fl in FLAGS if set(fl[2]) & set(tags)]
        items[name] = {"title": title or name, "sections": secs}
        if flags:
            items[name]["flags"] = flags
        for s in secs:
            counts[s] = counts.get(s, 0) + 1
    sections = [{"id": i, "title": t, "desc": d, "tags": tg} for i, t, d, tg in SECTIONS]
    if counts.get(OTHER[0]):
        sections.append({"id": OTHER[0], "title": OTHER[1], "desc": OTHER[2], "tags": []})
    data = {
        "format": "electrodoctor-diagnoses", "version": 1,
        "about": "Разделы диагнозов по специальностям врачей. items: имя статьи в docs/articles/diagnoses/ (без .md) → разделы и пометки. Собирается скриптом tools/diagnoses_sections.py по тегам статей.",
        "sections": sections,
        "flags": [{"id": i, "title": t, "tags": tg} for i, t, tg in FLAGS],
        "items": items,
    }
    with open(OUT, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=1)
        fh.write("\n")
    print(f"{len(items)} диагнозов; " + ", ".join(f"{s['title']} {counts.get(s['id'], 0)}" for s in sections))


if __name__ == "__main__":
    main()
