# SPDX-License-Identifier: AGPL-3.0-or-later
# Статьи анализов с исправленным названием (tools/lab_names.py): обновить Title, переименовать файл, старое название — в синонимы.
# Старый файл уходит в tools/out/renamed_old/ (в git остаётся в истории).
# Запуск после tools/labs_catalog_build.py, затем снова labs_catalog_build.py, section_pages.py, articles_home.py.
import os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lab_names import NAMES
import json
_dm = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dedup_map.json")
DEDUP = json.load(open(_dm, encoding="utf-8"))["map"] if os.path.exists(_dm) else {}
ART = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "docs", "articles", "lab-tests")
bad = '<>:"/\\|?*'
for f in sorted(os.listdir(ART)):
    if not f.endswith(".md"): continue
    p = os.path.join(ART, f); t = open(p, encoding="utf-8").read()
    m = re.search(r"^code:\s*(\w+)", t[:3000], re.M)
    c = m.group(1) if m else None
    while c in DEDUP and DEDUP[c] != c: c = DEDUP[c]   # статья кода-дубля — статья основного кода
    if c not in NAMES: continue
    nm = NAMES[c]
    old = re.search(r"^Title:\s*(.+)$", t, re.M).group(1).strip()
    if old != nm:
        t = t.replace(f"Title: {old}", f"Title: {nm}", 1)
        q = '"' + old.replace('"', '\\"') + '"'
        if "\naliases:\n" in t: t = t.replace("\naliases:\n", f"\naliases:\n  - {q}\n", 1)
        else: t = t.replace("\n---\n", f"\naliases:\n  - {q}\n---\n", 1)
    new = "".join("-" if c in bad else c for c in nm).strip() + ".md"
    if new != f and not os.path.exists(os.path.join(ART, new)):
        open(os.path.join(ART, new), "w", encoding="utf-8", newline="\n").write(t)
        old_dir = os.path.join(ART, "..", "..", "..", "tools", "out", "renamed_old"); os.makedirs(old_dir, exist_ok=True)
        os.replace(p, os.path.join(old_dir, f))
        print("переименовано:", f, "→", new)
    else:
        open(p, "w", encoding="utf-8", newline="\n").write(t); print("заголовок:", f)
