# SPDX-License-Identifier: AGPL-3.0-or-later
# Сборка справочника анализов docs/data/labs.json:
#   1) анализы бланка (src/app/fields.ts, вкладка «Анализы») — они уже в кабинете;
#   2) анализы, которых в бланке нет, из разбора ИИ (tools/out/catalog/chunk-*.json, см. labs_catalog_ai.py).
# У каждого — статья, если она есть в docs/articles/lab-tests/ (по названию и синонимам).
# Заодно: в черновиках признаков (docs/data/signs.json) у «нет в анкете» проставляется код справочника,
# а не-анализы (ЭКГ, опросники…) выписываются в tools/out/not_lab.md.
# Запуск:  python tools/labs_catalog_build.py
import collections, glob, json, os, re, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
ART = os.path.join(ROOT, "docs", "articles", "lab-tests")
# Коды, которые ИИ придумал заново, хотя анализ уже есть в бланке под другим кодом
REMAP = {"HIV_TEST": "HIV", "HIV_AB": "HIV", "HIV_1_2_AB": "HIV", "HIV_AG_AB_COMBO": "HIV", "ANTI_TTG_IGA": "TTG_IGA", "HIV_AG_AB": "HIV", "HCV_ANTIBODY": "ANTI_HCV", "ANTI_HCV_AB": "ANTI_HCV", "HBS_AG": "HBSAG",
         "PREGNANCY_TEST": "HCG", "BETA_HCG": "HCG", "ANTI_NUCLEAR_ANTIBODIES": "ANA", "ANF": "ANA", "VITAMIN_D": "VITD", "25_OH_D": "VITD",
         "TROPONIN_I": "TROPONIN", "HS_TROPONIN": "TROPONIN", "HS_TROPONIN_I": "TROPONIN", "TROPONIN_T": "TROPONIN",
         "NTPROBNP": "NT_PROBNP", "NT_PRO_BNP": "NT_PROBNP", "CKMB": "CK_MB", "CK_MB_MASS": "CK_MB", "FECAL_OCCULT_BLOOD": "STOOL_OCCULT",
         "FOBT": "STOOL_OCCULT", "FIT": "STOOL_OCCULT", "H_PYLORI_IGG": "HPYLORI", "SYPHILIS_SEROLOGY": "SYPHILIS", "RPR": "SYPHILIS", "SYPHILIS_SER": "SYPHILIS", "SYPHILIS_RPR_VDRL": "SYPHILIS", "SYPHILIS_TEST": "SYPHILIS", "SYPHILIS_SERUM": "SYPHILIS",
         "CORTISOL_SERUM": "CORTISOL", "PTH_INTACT": "PTH", "LP_A": "LPA", "LIPOPROTEIN_A": "LPA", "HOMA_IR": "HOMA", "C_PEPTIDE": "CPEP"}
norm = lambda s: re.sub(r"[^a-zа-яё0-9]+", "", (s or "").lower().replace("ё", "е"))


def form_fields():
    src = open(os.path.join(ROOT, "src", "app", "fields.ts"), encoding="utf-8").read().replace("\r\n", "\n")
    labs = src[src.index('id: "labs"'):]
    nxt = labs.find("\n  {\n    id:", 1)
    labs = labs[:nxt] if nxt > 0 else labs
    out, group = {}, ""
    for line in labs.split("\n"):
        m = re.search(r'title: "([^"]+)", fold: true', line)
        if m: group = m.group(1)
        m = re.search(r'code: "(\w+)", label: "([^"]+)", type: "(\w+)"(.*)', line)
        if not m or m.group(3) in ("aiimport", "files", "table"):
            continue
        code, label, typ, rest = m.groups()
        unit = (re.search(r'unit: "([^"]*)"', rest) or [None, ""])[1]
        opts = rest
        t = "number" if typ == "number" else "qual" if re.search(r"обнаружен|положит|нет\"|рост", opts) else "text"
        out[code] = {"name": label, "aliases": [], "type": t, "unit": unit, "tier": "basic", "group": group, "inForm": True}
    return out


def articles():
    """Статьи об анализах: имя файла → набор нормализованных названий (заголовок, имя файла, синонимы, части в скобках)."""
    res = {}
    for f in glob.glob(os.path.join(ART, "*.md")):
        name = os.path.basename(f)[:-3]
        if name == "index":
            continue
        t = open(f, encoding="utf-8").read()
        if re.search(r"^redirect_to:", t[:600], re.M):   # страница-ссылка на другую статью
            continue
        keys = {name, re.sub(r"\s*\(.*?\)", "", name)}
        keys |= set(re.findall(r"\(([^)]+)\)", name))
        keys |= {x.strip() for x in re.split(r"\s+[-–—]\s+", name)}
        m = re.search(r"^aliases:\s*\n((?:\s+- .*\n?)+)", t, re.M)
        if m: keys |= {x.strip() for x in re.findall(r"- (.*)", m.group(1))}
        m = re.search(r"^Title:\s*(.+)$", t, re.M)
        if m: keys.add(m.group(1).strip())
        res[name] = {norm(k) for k in keys if len(norm(k)) >= 3}
    return res


def main():
    items = form_fields()
    new21 = {"TROPONIN", "NT_PROBNP", "BNP", "CK", "CK_MB", "MYOGLOBIN", "LPA", "APOB", "APOA1", "HCY", "LDH", "LACTATE",
             "LIPASE", "AMYLASE_P", "CYSC", "CPEP", "HOMA", "ACTH", "PCT", "C3", "C4"}
    for c in new21:
        if c in items: items[c]["tier"] = "special"
    # статьи бланка — из src/app/articles.ts
    at = open(os.path.join(ROOT, "src", "app", "articles.ts"), encoding="utf-8").read()
    for c, a in re.findall(r'^\s+(\w+): "([^"]+)",', at, re.M):
        if c in items: items[c]["article"] = a
    # разбор ИИ
    signs_path = os.path.join(ROOT, "docs", "data", "signs.json")
    signs = json.load(open(signs_path, encoding="utf-8"))
    mentions, where = collections.Counter(), collections.defaultdict(set)
    for dx, v in signs["items"].items():
        for x in v.get("nolist", []):
            k = x["name"].strip().rstrip(".")[:120]; mentions[k] += 1; where[k].add(dx)
    src2code, not_lab, agg = {}, collections.Counter(), {}
    for f in sorted(glob.glob(os.path.join(ROOT, "tools", "out", "catalog", "chunk-*.json"))):
        for x in json.load(open(f, encoding="utf-8"))["items"]:
            s = (x.get("src") or "").strip()
            if x.get("kind") == "not_lab" or not x.get("code"):
                not_lab[x.get("name") or s] += mentions.get(s, 1); continue
            code = re.sub(r"[^A-Z0-9_]", "_", str(x.get("existing") or x["code"]).upper()).strip("_")
            code = REMAP.get(code, code)
            src2code[s] = code
            a = agg.setdefault(code, {"names": collections.Counter(), "aliases": set(), "type": collections.Counter(), "unit": collections.Counter(), "tier": collections.Counter(), "dx": set()})
            n = mentions.get(s, 1)
            a["names"][x.get("name") or s] += n
            a["aliases"] |= {s, *[str(y) for y in (x.get("aliases") or [])]}
            a["type"][x.get("type") or "text"] += n
            if x.get("unit"): a["unit"][x["unit"]] += n
            a["tier"][x.get("tier") or "rare"] += n
            a["dx"] |= where.get(s, set())
    for code, a in agg.items():
        if code in items:            # тот же анализ, что в бланке: только синонимы
            it = items[code]
            it["aliases"] = sorted({*it["aliases"], *a["aliases"]} - {it["name"]})
            it["refs"] = len(a["dx"])
            continue
        name = a["names"].most_common(1)[0][0]
        items[code] = {"name": name, "aliases": sorted(a["aliases"] - {name}), "type": a["type"].most_common(1)[0][0],
                       "unit": a["unit"].most_common(1)[0][0] if a["unit"] else "", "tier": a["tier"].most_common(1)[0][0],
                       "inForm": False, "refs": len(a["dx"]), "source": "разбор ИИ: gpt-oss-120b"}
    # дубли: ИИ в разных порциях давал одному анализу разные коды — склеиваем по названию и синонимам
    #  (в бланк ничего не вливаем по синонимам: «Эритроциты» крови и мочи — разные анализы)
    by_name = {}
    for code, it in items.items():
        by_name.setdefault(norm(it["name"]), []).append(code)
    merged = {}
    for code in list(items):
        it = items.get(code)
        if not it or it["inForm"]: continue
        keys = [norm(it["name"]), *[norm(x) for x in it["aliases"]]]
        cands = [c for k in keys if k for c in by_name.get(k, []) if c != code and c in items and c not in merged]
        if not cands: continue
        tgt = sorted(cands, key=lambda c: (not items[c]["inForm"], -items[c].get("refs", 0), c))[0]
        if items[tgt]["inForm"] and norm(items[tgt]["name"]) != norm(it["name"]): continue   # в бланк — только при точном совпадении названия
        T = items[tgt]
        T["aliases"] = sorted({*T["aliases"], it["name"], *it["aliases"]} - {T["name"]})
        T["refs"] = T.get("refs", 0) + it.get("refs", 0)
        merged[code] = tgt; del items[code]
    for s, c in list(src2code.items()):
        while c in merged: c = merged[c]
        src2code[s] = c
    # уровень по данным: редкий, но нужный многим диагнозам — специализированный
    for it in items.values():
        if it["tier"] == "rare" and it.get("refs", 0) >= 5: it["tier"] = "special"
    # статьи, написанные по шаблону, знают свой код (code: в шапке)
    for f in glob.glob(os.path.join(ART, "*.md")):
        m = re.search(r"^code:\s*(\w+)", open(f, encoding="utf-8").read(3000), re.M)
        if m and m.group(1) in items and not items[m.group(1)].get("article"):
            items[m.group(1)]["article"] = os.path.basename(f)[:-3]
    # единицы — как у проверенной нормы (docs/data/norms.json), чтобы значение вводилось в тех же единицах
    nitems = json.load(open(os.path.join(ROOT, "docs", "data", "norms.json"), encoding="utf-8"))["items"]
    for code, it in items.items():
        if code in nitems and not it["inForm"]: it["unit"] = nitems[code].get("unit", it["unit"])
    # статьи для тех, у кого их нет
    arts = articles()
    used = {it.get("article") for it in items.values() if it.get("article")}
    for code, it in items.items():
        if it.get("article"): continue
        keys = {norm(it["name"]), *[norm(x) for x in it["aliases"]]} - {""}
        hit = [a for a, ks in arts.items() if keys & ks]
        if len(hit) == 1: it["article"] = hit[0]
    # нет в анкете → код справочника
    for v in signs["items"].values():
        for x in v.get("nolist", []):
            c = src2code.get(x["name"].strip().rstrip(".")[:120])
            if c: x["code"] = c
    with open(signs_path, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(signs, fh, ensure_ascii=False, indent=1); fh.write("\n")
    from lab_names import NAMES   # исправленные названия; старое — в синонимы
    for code, nm in NAMES.items():
        it = items.get(code)
        if it and it["name"] != nm:
            it["aliases"] = sorted(set(it["aliases"]) | {it["name"]} - {nm}); it["name"] = nm
    tiers = collections.Counter(it["tier"] for it in items.values())
    data = {"format": "electrodoctor-labs", "version": 1,
            "about": "Справочник анализов. items: КОД → { name, aliases — синонимы, type: number | qual (положительно/отрицательно) | text, unit, tier: basic — основной, special — специализированный, rare — редкий/новый, group — группа бланка, inForm — есть в бланке, article — статья в docs/articles/lab-tests/ (без .md), refs — у скольких диагнозов в признаках, source }. Нормы числовых анализов — в docs/data/norms.json. Собирается скриптом tools/labs_catalog_build.py.",
            "items": dict(sorted(items.items(), key=lambda kv: ({"basic": 0, "special": 1, "rare": 2}[kv[1]["tier"]] if kv[1]["tier"] in ("basic", "special", "rare") else 3, -kv[1].get("refs", 0), kv[0])))}
    with open(os.path.join(ROOT, "docs", "data", "labs.json"), "w", encoding="utf-8", newline="\n") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=1); fh.write("\n")
    with open(os.path.join(ROOT, "tools", "out", "not_lab.md"), "w", encoding="utf-8") as fh:
        fh.write("# Не анализы: исследования, опросники, пробы\n\nИИ назвал их в «нет в анкете», но это не лабораторные анализы. Кандидаты для блоков «Осмотр» и «Инструментальные исследования».\n\n")
        fh.write("\n".join(f"- {k} — {n}" for k, n in not_lab.most_common()) + "\n")
    print(f"всего {len(items)}: {dict(tiers)}; в бланке {sum(1 for i in items.values() if i['inForm'])}; со статьёй {sum(1 for i in items.values() if i.get('article'))}; не анализы {len(not_lab)}; кодов из разбора {len(agg)}; склеено дублей {len(merged)}")


if __name__ == "__main__":
    main()
