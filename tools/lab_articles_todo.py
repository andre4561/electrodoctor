# SPDX-License-Identifier: AGPL-3.0-or-later
# Список анализов, для которых ещё нет статьи: docs/articles/lab-tests-todo.md
# Берёт показатели вкладки «Анализы» из src/app/fields.ts и сопоставление из src/app/articles.ts.
# Запуск после добавления статей:  python tools/lab_articles_todo.py
import json, os, re

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
SKIP_TYPES = {"aiimport", "files", "table", "textarea"}          # служебные поля, не анализы

def main():
    fields = open(os.path.join(ROOT, "src/app/fields.ts"), encoding="utf-8").read().replace("\r\n", "\n")
    arts = open(os.path.join(ROOT, "src/app/articles.ts"), encoding="utf-8").read()
    have = set(re.findall(r'^\s+(\w+): "', arts, re.M))
    # статьи, найденные справочником анализов (docs/data/labs.json: поле article) — тоже считаются
    try:
        labs = json.load(open(os.path.join(ROOT, "docs/data/labs.json"), encoding="utf-8"))["items"]
        have |= {c for c, l in labs.items() if l.get("article")}
    except FileNotFoundError:
        pass
    labs = fields[fields.index('id: "labs"'):]
    nxt = labs.find('\n  {\n    id:', 1)
    labs = labs[:nxt] if nxt > 0 else labs
    groups, total = [], 0
    for m in re.finditer(r'\{ (?:id: "\w+", )?title: "([^"]*)"[^\n]*fields: \[(.*?)\n      \]\}', labs, re.S):
        title, body = m.group(1), m.group(2)
        rows = [(c, l) for c, l, t in re.findall(r'code: "(\w+)", label: "([^"]+)", type: "(\w+)"', body)
                if t not in SKIP_TYPES and c not in have]
        if title and rows:
            groups.append((title, rows)); total += len(rows)
    out = ["---", "title: Нужно написать статьи об анализах", "---", "", "# Нужно написать статьи об анализах", "",
           "Эти показатели есть на вкладке «Анализы» в кабинете, но статьи о них пока нет — поэтому их названия не ссылки.",
           "Когда статья появится в `docs/articles/lab-tests/`, добавьте строку «КОД: \"имя файла без .md\"» в `src/app/articles.ts`",
           "и обновите этот список: `python tools/lab_articles_todo.py`.", "",
           f"Всего без статьи: **{total}**.", ""]
    for title, rows in groups:
        out += [f"## {title}", ""] + [f"- [ ] {l} (`{c}`)" for c, l in rows] + [""]
    path = os.path.join(ROOT, "docs/articles/lab-tests-todo.md")
    open(path, "w", encoding="utf-8", newline="\n").write("\n".join(out))
    print(f"{path}: {total} показателей без статьи")

if __name__ == "__main__":
    main()
