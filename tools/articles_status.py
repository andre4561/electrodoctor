# SPDX-License-Identifier: AGPL-3.0-or-later
# Сводка статей об анализах по происхождению и проверке → ARTICLES_STATUS.md в корне проекта.
# Запуск:  python tools/articles_status.py   (перезапускать после каждой вычитки — список обновится сам)
import os, re, collections
ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
ART = os.path.join(ROOT, "docs", "articles", "lab-tests")
groups = collections.OrderedDict([
    ("orig", ("Исходные статьи проекта (написаны до ИИ-черновиков) — ещё не проверялись", [])),
    ("orig_rev", ("Исходные статьи проекта, вычитаны Claude — специалистом не проверены", [])),
    ("ai_new", ("Черновики ИИ — ещё не вычитаны", [])),
    ("ai_rev", ("Черновики ИИ, вычитаны Claude — специалистом не проверены", [])),
    ("claude", ("Написаны Claude — специалистом не проверены", [])),
    ("other", ("Прочее", [])),
])
for f in sorted(os.listdir(ART)):
    if not f.endswith(".md") or f == "index.md": continue
    head = open(os.path.join(ART, f), encoding="utf-8").read(1500)
    if re.search(r"^redirect_to:", head, re.M): continue
    st = re.search(r"^status:\s*(.+)$", head, re.M)
    code = re.search(r"^code:\s*(\S+)", head, re.M)
    s = st.group(1).strip() if st else ""
    k = ("orig" if not s else "orig_rev" if s.startswith("исходная") else "claude" if s.startswith("написано Claude") else
         "ai_rev" if "вычитано Claude" in s else "ai_new" if "не проверено" in s else "other")
    m = re.search(r"\(([^)]+)\)", s)
    groups[k][1].append((f[:-3], code.group(1) if code else "", m.group(1) if m else ""))
out = ["# Статьи об анализах: кто написал и кто проверил", "",
       "Файл собирается скриптом `tools/articles_status.py` — не править вручную.", "",
       "| Группа | Статей |", "|---|---|"]
out += [f"| {t} | {len(v)} |" for t, v in groups.values()]
for t, v in groups.values():
    if not v: continue
    out += ["", f"## {t} — {len(v)}", ""]
    out += [f"- {n}" + (f" (`{c}`)" if c else "") + (f" — {m}" if m and m not in ("aliceai-llm",) else "") for n, c, m in v]
open(os.path.join(ROOT, "ARTICLES_STATUS.md"), "w", encoding="utf-8", newline="\n").write("\n".join(out) + "\n")
print({k: len(v[1]) for k, v in groups.items()})
