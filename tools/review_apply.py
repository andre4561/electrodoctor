# SPDX-License-Identifier: AGPL-3.0-or-later
# Применить правки вычитки к статье и отметить её «вычитано Claude».
# Вход — JSON-файл: [{ "file": "Глюкоза", "edits": [[старое, новое], ...] }, ...]; каждое «старое» должно встретиться в статье ровно один раз.
# Запуск:  python tools/review_apply.py tools/out/review_batch1.json
import json, os, sys
ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
ART = os.path.join(ROOT, "docs", "articles", "lab-tests")
for item in json.load(open(sys.argv[1], encoding="utf-8")):
    p = os.path.join(ART, item["file"] + ".md")
    t = open(p, encoding="utf-8").read()
    for old, new in item.get("edits", []):
        n = t.count(old)
        if n == 0 and new in t: continue          # уже применено при прошлом запуске
        if n != 1: raise SystemExit(f"{item['file']}: фрагмент встречается {n} раз: {old[:60]}")
        t = t.replace(old, new)
    if "вычитано Claude" in t[:1500]: pass
    t = t.replace(", не проверено\n", ", вычитано Claude, специалистом не проверено\n", 1)
    t = t.replace("— статья не проверена специалистом.", "— статья вычитана Claude, но специалистом не проверена.", 1)
    open(p, "w", encoding="utf-8", newline="\n").write(t)
    print("ok", item["file"], len(item.get("edits", [])))
