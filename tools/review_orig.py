# SPDX-License-Identifier: AGPL-3.0-or-later
# Применить правки вычитки к исходной статье (написанной до ИИ-черновиков) и отметить «вычитано Claude».
# Вход — тот же формат, что у review_apply.py. Сохраняет окончания строк файла (CRLF/LF).
# Попутно чинит склеенные заголовки вида «### **A**#### **B**».
# Запуск:  python tools/review_orig.py tools/out/orig_batch1.json
import json, os, re, sys
ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
ART = os.path.join(ROOT, "docs", "articles", "lab-tests")
STATUS = "status: исходная статья проекта, вычитано Claude, специалистом не проверено"
BANNER = "> **Исходная статья проекта** — вычитана Claude, но специалистом не проверена."
def tidy(t):
    """Чинит артефакты конвертации: вложенные списки, продублированные строками с отступом."""
    L = t.split("\n"); out = []
    for i, l in enumerate(L):
        m = re.match(r"^\d+\. (.+?)\s*$", l)
        if m and any(re.match(r"^\s+[-*] " + re.escape(m.group(1)) + r"\s*$", x) for x in L[max(0, i - 14):i]): continue
        m = re.match(r"^(?: {4,}|\t+| \t)(\S.*?)\s*$", l)
        if m:
            c = m.group(1)
            if any(x.strip() in ("- " + c, "* " + c) for x in L[i + 1:i + 16]): continue
            out.append("- " + c); continue
        m = re.match(r"^- (\*\*[^*]{2,90}:\*\*)\s*$", l)
        if m: out.append(m.group(1)); continue
        m = re.match(r"^ {1,3}(\S[^|]{1,90}:)\s*$", l)
        if m: out.append("**" + m.group(1).strip("* ") + "**"); continue
        out.append(l)
    res, k, inol, colon = [], 0, False, False
    for l in out:
        m = re.match(r"^(\d+)\. (.*)$", l)
        if m:
            k += 1; inol = True; colon = m.group(2).rstrip().endswith((":", ":**")); res.append(f"{k}. {m.group(2)}"); continue
        if inol and colon and re.match(r"^[-*] ", l):
            if res and res[-1] == "": res.pop()
            res.append("   " + l); continue
        if inol and re.match(r"^ {1,3}[-*] ", l):
            res.append("   " + l.lstrip()); continue
        if l.strip() and not l.startswith(" "):
            k = 0; inol = False
        res.append(l)
    return re.sub(r"\n{3,}", "\n\n", "\n".join(res))

for item in json.load(open(sys.argv[1], encoding="utf-8")):
    p = os.path.join(ART, item["file"] + ".md")
    raw = open(p, encoding="utf-8", newline="").read()
    crlf = "\r\n" in raw
    t = raw.replace("\r\n", "\n")
    for old, new in item.get("edits", []):
        n = t.count(old)
        if n == 0 and new in t: continue
        if n != 1: raise SystemExit(f"{item['file']}: фрагмент встречается {n} раз: {old[:60]}")
        t = t.replace(old, new)
    t = re.sub(r"([^\s#])(#{2,4} )", r"\1\n\n\2", t)
    t = tidy(t)
    t = re.sub(r"(?m)^((?:\s*[-*]|\s*\d+\.) [^\n]*)\n(\*\*[^\n]*\*\*:?\s*$|\*\*[^\n]*:\*\*)", r"\1\n\n\2", t)
    if "\nstatus:" not in t.split("\n---\n", 1)[0]:
        t = re.sub(r"^(---\n.*?)\n---\n", lambda m: m.group(1) + "\n" + STATUS + "\n---\n\n" + BANNER + "\n", t, count=1, flags=re.S)
    if crlf: t = t.replace("\n", "\r\n")
    open(p, "w", encoding="utf-8", newline="").write(t)
    print("ok", item["file"], len(item.get("edits", [])))
