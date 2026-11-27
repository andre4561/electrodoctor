# SPDX-License-Identifier: AGPL-3.0-or-later
# Разовая синхронизация: sections из docs/data/diagnoses.json → YAML-шапка статей.
# В шапке появляется явное поле sections: (id разделов специальностей).
# После этого tools/diagnoses_sections.py берёт sections из статьи в первую очередь.
#
# Запуск:  python tools/dx_sections_sync.py
# Затем:   python tools/diagnoses_sections.py   # проверить, что JSON не разъехался
import json, os, re, sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
DIR = os.path.join(ROOT, "docs/articles/diagnoses")
DX = os.path.join(ROOT, "docs/data/diagnoses.json")

VALID = {
    "cardio", "pulmo", "gastro", "endo", "neuro", "psych", "nephro", "gyn", "andro",
    "hemat", "rheum", "ortho", "derma", "ophth", "ent", "dent", "infect", "immuno",
    "onco", "genetic", "other",
}


def upsert_sections(text: str, secs: list[str]) -> str:
    block = "sections:\n" + "".join(f"  - {s}\n" for s in secs)
    m = re.match(r"---\r?\n(.*?)\r?\n---(\r?\n?)", text, re.S)
    if not m:
        return f"---\n{block}---\n\n" + text
    fm = m.group(1)
    rest = text[m.end():]
    # убрать старый блок sections (список или [a, b])
    fm = re.sub(r"^sections:\s*\r?\n(?:[ \t]+- .*\r?\n?)*", "", fm, flags=re.M)
    fm = re.sub(r"^sections:\s*\[[^\]]*\]\s*\r?\n?", "", fm, flags=re.M)
    fm = fm.rstrip() + "\n" + block.rstrip("\n")
    return f"---\n{fm}\n---{m.group(2)}" + rest


def main():
    data = json.load(open(DX, encoding="utf-8"))
    items = data.get("items") or {}
    ok = changed = missing = 0
    for name, it in sorted(items.items()):
        path = os.path.join(DIR, name + ".md")
        if not os.path.isfile(path):
            missing += 1
            print("нет статьи:", name, file=sys.stderr)
            continue
        secs = [s for s in (it.get("sections") or []) if s in VALID]
        if not secs:
            secs = ["other"]
        raw = open(path, encoding="utf-8").read()
        new = upsert_sections(raw, secs)
        if new != raw:
            open(path, "w", encoding="utf-8", newline="\n").write(new)
            changed += 1
        ok += 1
    print(f"статей: {ok}, обновлено шапок: {changed}, без файла: {missing}")


if __name__ == "__main__":
    main()
