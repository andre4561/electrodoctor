# SPDX-License-Identifier: AGPL-3.0-or-later
# Сводка «Нужны анализы, которых нет в анкете» (nolist в signs.json):
# что уже есть в каталоге / бланке, чего ещё нет → docs/articles/nolist-gap.md
# Запуск:  python tools/nolist_gap.py
import collections, json, os, re

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
SIGNS = os.path.join(ROOT, "docs", "data", "signs.json")
LABS = os.path.join(ROOT, "docs", "data", "labs.json")
OUT = os.path.join(ROOT, "docs", "articles", "nolist-gap.md")


def main():
    signs = json.load(open(SIGNS, encoding="utf-8"))["items"]
    labs = json.load(open(LABS, encoding="utf-8"))["items"]
    form = {c for c, l in labs.items() if l.get("inForm")}
    art = {c for c, l in labs.items() if l.get("article")}

    by = {}
    for dx, v in signs.items():
        for x in v.get("nolist") or []:
            name = (x.get("name") or "").strip()
            code = (x.get("code") or "").strip().upper() or None
            key = code or ("name:" + name.lower())
            a = by.setdefault(key, {
                "name": name, "code": code, "names": collections.Counter(),
                "dx": set(), "w": [],
            })
            if name:
                a["names"][name] += 1
                if a["names"][name] >= a["names"].get(a["name"], 0):
                    a["name"] = name
            if code:
                a["code"] = code
            a["dx"].add(dx)
            if x.get("w") is not None:
                a["w"].append(int(x["w"]))

    # Не лабораторные анализы (инструментальные, опросники) — в статьи lab-tests обычно не идут
    NOT_LAB = re.compile(
        r"(экг|ээг|узи|мрт|\bкт\b|рентген|фгдс|колоноскоп|гастроскоп|бронхоскоп|"
        r"денситометр|dexa|\bdxa\b|сцинтиграф|пэт|pet-?ct|ангиограф|"
        r"биопс(?!ия кости с посевом)|гистолог|цитолог|"
        r"энмг|электромиограф|электронейро|"
        r"урофлоу|спирометр|пульсоксим|фено|\bfeno\b|"
        r"phq|gad-?\d|audit|mmse|moca|опросник|шкала |"
        r"патч-?тест|кожная проба|проба манту|"
        r"колоноскоп|эзофаго|холтер|суточн\w* монитор)",
        re.I,
    )

    in_form, in_cat, missing_lab, missing_other = [], [], [], []
    for a in by.values():
        code = a["code"]
        a["refs"] = len(a["dx"])
        a["w_avg"] = round(sum(a["w"]) / len(a["w"]), 1) if a["w"] else None
        a["aliases"] = sorted(n for n in a["names"] if n and n != a["name"])[:8]
        if code and code in labs:
            a["lab_name"] = labs[code]["name"]
            a["has_article"] = code in art or bool(labs[code].get("article"))
            if code in form:
                in_form.append(a)
            else:
                in_cat.append(a)
        else:
            blob = " ".join([a["name"], code or "", *a["aliases"]])
            (missing_other if NOT_LAB.search(blob) else missing_lab).append(a)

    key_refs = lambda a: (-a["refs"], -(a["w_avg"] or 0), a["name"].lower())
    in_form.sort(key=key_refs)
    in_cat.sort(key=key_refs)
    missing_lab.sort(key=key_refs)
    missing_other.sort(key=key_refs)
    missing = missing_lab + missing_other

    lines = [
        "---",
        "title: Анализы из nolist — чего ещё нет в каталоге",
        "---",
        "",
        "# Анализы из «Нужны анализы, которых нет в анкете»",
        "",
        "Источник: блок `nolist` в `docs/data/signs.json` (признаки диагнозов).",
        "Сверка с каталогом `docs/data/labs.json` и бланком анкеты (`inForm`).",
        "",
        "Обновить этот файл: `python tools/nolist_gap.py`.",
        "",
        f"- Уникальных упоминаний в `nolist`: **{len(by)}**",
        f"- Уже в бланке анкеты (`inForm`): **{len(in_form)}** — можно переносить из `nolist` в `labs` у диагнозов",
        f"- Есть в справочнике, но не в бланке: **{len(in_cat)}** — доступны через «выбрать из справочника» / Настройки → Анализы",
        f"- **Нет в каталоге (похоже на анализы): {len(missing_lab)}** — завести в каталог и написать статьи",
        f"- Нет в каталоге (скорее не анализы: УЗИ/МРТ/опросники…): **{len(missing_other)}** — не в `lab-tests`, а в осмотр / инструментальные",
        "",
        "## Нет в каталоге — похоже на лабораторные анализы",
        "",
        "По этому списку: коды в каталоге + статьи в `docs/articles/lab-tests/`.",
        "Сортировка: сколько диагнозов ссылается, затем средняя важность `w`.",
        "",
        "| Диагнозов | w̄ | Код | Название |",
        "| ---: | ---: | --- | --- |",
    ]
    for a in missing_lab:
        code = a["code"] or "—"
        w = a["w_avg"] if a["w_avg"] is not None else "—"
        lines.append(f"| {a['refs']} | {w} | `{code}` | {a['name']} |")

    lines += [
        "",
        f"Всего: **{len(missing_lab)}**.",
        "",
        "## Нет в каталоге — скорее не лабораторные анализы",
        "",
        "Инструментальные исследования, опросники, пробы. Кандидаты в блоки «Осмотр» / «Инструментальные», не в статьи анализов.",
        "",
        "| Диагнозов | w̄ | Код | Название |",
        "| ---: | ---: | --- | --- |",
    ]
    for a in missing_other:
        code = a["code"] or "—"
        w = a["w_avg"] if a["w_avg"] is not None else "—"
        lines.append(f"| {a['refs']} | {w} | `{code}` | {a['name']} |")

    lines += [
        "",
        f"Всего: **{len(missing_other)}**.",
        "",
        "## Есть в справочнике, но не в бланке анкеты",
        "",
        "Уже можно выбрать у клиента из каталога. Статья — если в каталоге нет `article`.",
        "",
        "| Диагнозов | w̄ | Код | В каталоге как | Статья |",
        "| ---: | ---: | --- | --- | --- |",
    ]
    for a in in_cat:
        w = a["w_avg"] if a["w_avg"] is not None else "—"
        art = "да" if a.get("has_article") else "нет"
        lines.append(f"| {a['refs']} | {w} | `{a['code']}` | {a['lab_name']} | {art} |")

    no_art = [a for a in in_cat if not a.get("has_article")]
    lines += [
        "",
        f"Из них без статьи: **{len(no_art)}**.",
        "",
        "## Уже в бланке анкеты (кандидат на перенос из nolist → labs)",
        "",
        "| Диагнозов | Код | Название в бланке |",
        "| ---: | --- | --- |",
    ]
    for a in in_form:
        lines.append(f"| {a['refs']} | `{a['code']}` | {a['lab_name']} |")

    lines.append("")
    open(OUT, "w", encoding="utf-8", newline="\n").write("\n".join(lines))
    print(f"{OUT}: unique={len(by)} form={len(in_form)} catalog={len(in_cat)} "
          f"missing_lab={len(missing_lab)} missing_other={len(missing_other)}")


if __name__ == "__main__":
    main()
