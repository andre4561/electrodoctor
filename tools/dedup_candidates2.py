# SPDX-License-Identifier: AGPL-3.0-or-later
# Второй проход поиска дублей (после tools/dedup_apply.py): связи слабее, чем в dedup_candidates.py, поэтому —
# только пары одного материала и типа результата, без цепочек длиннее 4 кодов, и без пар, уже решённых в первом проходе.
#   P — названия частично совпадают (Жаккар >= 0.5);
#   S — значимые слова одного названия целиком входят в другое (минимум 2 слова);
#   C — общая редкая аббревиатура (не более чем у 4 анализов).
# Результат: tools/out/dedup/candidates2.json (формат как у первого прохода — для ai_dedup.py --cand candidates2.json)
# Запуск:  python tools/dedup_candidates2.py
import collections, json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR = os.path.join(ROOT, "tools", "out", "dedup")
labs = json.load(open(os.path.join(ROOT, "docs", "data", "labs.json"), encoding="utf-8"))["items"]
signs = json.load(open(os.path.join(ROOT, "docs", "data", "signs.json"), encoding="utf-8"))["items"]
used = collections.Counter(l["code"] for s in signs.values() for l in s.get("labs", []))
STOP = set("""анализ анализа тест теста тесты определение определения исследование уровень уровня концентрация
содержание в во на к и или с по из для при общий общая общее количественный качественный крови кровь сыворотке
сыворотки плазме плазмы test level serum blood total""".split())


def norm(s):
    s = s.lower().replace("ё", "е")
    s = s.translate(str.maketrans("₀₁₂₃₄₅₆₇₈₉", "0123456789"))
    s = re.sub(r"[\u2010-\u2015\u2212-]", " ", s)
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
    for key, mat in (("моч", "моча"), ("кал", "кал"), ("ликвор", "ликвор"), ("спинномозг", "ликвор"), ("мокрот", "мокрота"),
                     ("слюн", "слюна"), ("синовиал", "синовиальная"), ("плевр", "плевральная"), ("асцит", "асцитическая")):
        if key in norm(g) or re.search(r"\b" + key, n):
            return mat
    return ""


# пары, уже решённые в первом проходе (группы из candidates.json)
done = set()
for g in json.load(open(os.path.join(DIR, "candidates.json"), encoding="utf-8"))["groups"]:
    cs = [x["code"] for x in g["items"]]
    done |= {(a, b) for a in cs for b in cs}

codes = list(labs)
W = {c: words(labs[c]["name"]) for c in codes}
MAT = {c: material(c) for c in codes}
pairs = collections.defaultdict(set)


def ok(a, b):
    return (a != b and (a, b) not in done and MAT[a] == MAT[b] and labs[a].get("type") == labs[b].get("type")
            and unit_ok(a, b) and not (labs[a].get("inForm") and labs[b].get("inForm")))


inv = collections.defaultdict(set)
for c, ws in W.items():
    for w in ws:
        inv[w].add(c)
for a in codes:
    cand = set()
    for w in W[a]:
        if len(inv[w]) <= 40:
            cand |= inv[w]
    for b in cand:
        if b <= a or not ok(a, b) or not W[a] or not W[b]:
            continue
        inter, uni = W[a] & W[b], W[a] | W[b]
        if len(inter) / len(uni) >= 0.5:
            pairs[(a, b)].add("P")
        if (W[a] <= W[b] and len(W[a]) >= 2) or (W[b] <= W[a] and len(W[b]) >= 2):
            pairs[(a, b)].add("S")
ABBR = collections.defaultdict(set)
for c, v in labs.items():
    for s in [v["name"]] + list(v.get("aliases", [])):
        for t in re.findall(r"\b[a-z][a-z0-9]{1,7}\b", norm(s)):
            if t not in {"test", "level", "serum", "blood", "total", "free", "ratio", "and", "or", "of", "in", "the", "pcr", "igg", "igm", "iga", "dna", "rna", "ab", "ag"}:
                ABBR[t].add(c)
for t, cs in ABBR.items():
    if 2 <= len(cs) <= 4:
        cs = sorted(cs)
        for i, a in enumerate(cs):
            for b in cs[i + 1:]:
                if ok(a, b):
                    pairs[(a, b)].add("C:" + t)

# связные компоненты, но не больше 4 кодов: крупные разбиваем обратно на пары
par = {c: c for c in codes}
def find(x):
    while par[x] != x:
        par[x] = par[par[x]]; x = par[x]
    return x
for a, b in pairs:
    par[find(a)] = find(b)
comp = collections.defaultdict(list)
for a, b in pairs:
    comp[find(a)].append((a, b))
groups = []
for ps in comp.values():
    members = sorted({x for p in ps for x in p})
    if len(members) <= 4:
        groups.append((members, ps))
    else:
        groups += [(sorted(p), [p]) for p in ps]
groups.sort(key=lambda g: (-len(g[0]), g[0]))
res = []
for i, (g, ps) in enumerate(groups, 1):
    res.append({"id": i, "items": [{"code": c, "name": labs[c]["name"], "aliases": labs[c].get("aliases", [])[:12], "unit": labs[c].get("unit", ""),
                                    "type": labs[c].get("type", ""), "material": MAT[c], "group": labs[c].get("group", ""), "tier": labs[c].get("tier", ""),
                                    "inForm": labs[c].get("inForm", False), "diagnoses": used[c], "article": labs[c].get("article", "")} for c in g],
                "links": [{"a": a, "b": b, "why": sorted(pairs[(a, b)])} for a, b in ps]})
json.dump({"groups": res}, open(os.path.join(DIR, "candidates2.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"pairs={len(pairs)} groups={len(res)} codes={sum(len(g['items']) for g in res)} sizes={dict(collections.Counter(len(g['items']) for g in res))}")
print("by signal:", dict(collections.Counter(w[0] for ws in pairs.values() for w in ws)))
