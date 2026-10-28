# SPDX-License-Identifier: AGPL-3.0-or-later
# Поиск кандидатов в дубли в каталоге анализов (docs/data/labs.json) — без ИИ.
# Связи между кодами:
#   A — совпадает нормализованное название / синоним / имя статьи;
#   B — похожие названия (общие значимые слова, Жаккар >= 0.75) при совместимых единицах;
#   C — общая редкая аббревиатура (TPO, CCP, pCO2…), встречающаяся не более чем у 4 анализов, при совместимых единицах,
#       одинаковом типе результата и заметно пересекающихся названиях (иначе «ЦМВ ПЦР» склеивается с «ЦМВ авидность»).
# Группы = связные компоненты. Решение «объединять или нет» принимает не этот скрипт.
# Результат: tools/out/dedup/candidates.json и candidates.md
# Запуск:  python tools/dedup_candidates.py
import json, os, re, collections

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
labs = json.load(open(os.path.join(ROOT, "docs", "data", "labs.json"), encoding="utf-8"))["items"]
signs = json.load(open(os.path.join(ROOT, "docs", "data", "signs.json"), encoding="utf-8"))["items"]
OUT = os.path.join(ROOT, "tools", "out", "dedup")
os.makedirs(OUT, exist_ok=True)

# сколько диагнозов ссылается на код (по самим признакам, а не по полю refs)
used = collections.Counter()
for dx, s in signs.items():
    for l in s.get("labs", []):
        used[l["code"]] += 1

STOP = set("""анализ анализа тест теста тесты определение определения исследование уровень уровня концентрация
содержание в во на к и или с по из для при общий общая общее количественный качественный крови кровь сыворотке
сыворотки плазме плазмы test level serum blood total""".split())

def norm(s):
    s = s.lower().replace("ё", "е")
    s = s.translate(str.maketrans("₀₁₂₃₄₅₆₇₈₉", "0123456789"))
    s = re.sub(r"[‐-―−‐‑-]", " ", s)
    s = re.sub(r"[^\w ]", " ", s)
    return " ".join(s.split())

def words(s):
    return {w for w in norm(s).split() if w not in STOP and len(w) > 1}

def unit_ok(a, b):
    ua, ub = norm(labs[a].get("unit", "")), norm(labs[b].get("unit", ""))
    return not ua or not ub or ua == ub

def material(c):
    g = labs[c].get("group", "")
    n = norm(labs[c]["name"] + " " + " ".join(labs[c].get("aliases", [])))
    for key, mat in (("моч", "моча"), ("кал", "кал"), ("ликвор", "ликвор"), ("мокрот", "мокрота"), ("слюн", "слюна")):
        if key in norm(g) or re.search(r"\b" + key, n):
            return mat
    return ""

codes = list(labs)
par = {c: c for c in codes}
def find(x):
    while par[x] != x:
        par[x] = par[par[x]]
        x = par[x]
    return x
edges = collections.defaultdict(set)
def link(a, b, why):
    if a == b:
        return
    k = tuple(sorted((a, b)))
    edges[k].add(why)
    par[find(a)] = find(b)

# A — одинаковые названия
key = collections.defaultdict(set)
for c, v in labs.items():
    for s in [v["name"], v.get("article", "")] + list(v.get("aliases", [])):
        n = norm(s)
        if len(n) >= 3 and n != norm(c):
            key[n].add(c)
for n, cs in key.items():
    cs = sorted(cs)
    for x in cs[1:]:
        link(cs[0], x, "A")

# B — похожие названия
W = {c: words(labs[c]["name"]) for c in codes}
inv = collections.defaultdict(set)
for c, ws in W.items():
    for w in ws:
        inv[w].add(c)
for c in codes:
    cand = set()
    for w in W[c]:
        if len(inv[w]) <= 30:
            cand |= inv[w]
    for d in cand:
        if d <= c or not W[c] or not W[d]:
            continue
        j = len(W[c] & W[d]) / len(W[c] | W[d])
        if j >= 0.75 and unit_ok(c, d):
            link(c, d, "B")

# C — общая редкая аббревиатура (латиница/цифры, 2–8 знаков)
ABBR = collections.defaultdict(set)
for c, v in labs.items():
    for s in [v["name"]] + list(v.get("aliases", [])):
        for t in re.findall(r"\b[a-z][a-z0-9]{1,7}\b", norm(s)):
            if t not in {"test", "level", "serum", "blood", "total", "free", "ratio", "and", "or", "of", "in", "the", "pcr"}:
                ABBR[t].add(c)
for t, cs in ABBR.items():
    if 2 <= len(cs) <= 4:
        cs = sorted(cs)
        for i, a in enumerate(cs):
            for b in cs[i + 1:]:
                wa, wb = W[a] - {t}, W[b] - {t}
                jac = len(wa & wb) / len(wa | wb) if wa | wb else 1.0
                if unit_ok(a, b) and labs[a].get("type") == labs[b].get("type") and jac >= 0.34:
                    link(a, b, "C:" + t)

groups = collections.defaultdict(list)
for c in codes:
    groups[find(c)].append(c)
groups = [sorted(g, key=lambda c: (-labs[c].get("inForm", False), -used[c], c)) for g in groups.values() if len(g) > 1]
groups.sort(key=lambda g: (-len(g), g[0]))

res = []
for i, g in enumerate(groups, 1):
    res.append({
        "id": i,
        "items": [{"code": c, "name": labs[c]["name"], "aliases": labs[c].get("aliases", [])[:12],
                   "unit": labs[c].get("unit", ""), "type": labs[c].get("type", ""), "material": material(c),
                   "group": labs[c].get("group", ""), "tier": labs[c].get("tier", ""), "inForm": labs[c].get("inForm", False),
                   "diagnoses": used[c], "article": labs[c].get("article", "")} for c in g],
        "links": [{"a": a, "b": b, "why": sorted(w)} for (a, b), w in sorted(edges.items()) if a in g and b in g],
    })
json.dump({"groups": res}, open(os.path.join(OUT, "candidates.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)

lines = [f"# Кандидаты в дубли: {len(res)} групп, {sum(len(g['items']) for g in res)} кодов", ""]
for g in res:
    lines.append(f"## {g['id']}. " + " · ".join(x["name"] for x in g["items"]))
    for x in g["items"]:
        lines.append(f"- `{x['code']}` {x['name']} — {x['unit'] or '—'}; {x['material'] or 'кровь/?'}; диагнозов {x['diagnoses']}" + ("; в анкете" if x["inForm"] else ""))
    lines.append("")
open(os.path.join(OUT, "candidates.md"), "w", encoding="utf-8", newline="\n").write("\n".join(lines))
sizes = collections.Counter(len(g["items"]) for g in res)
print(f"groups={len(res)} codes={sum(len(g['items']) for g in res)} sizes={dict(sorted(sizes.items()))}")
print("by link type:", dict(collections.Counter(w[0] for ws in edges.values() for w in ws)))
