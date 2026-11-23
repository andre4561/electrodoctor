# SPDX-License-Identifier: AGPL-3.0-or-later
# Сборка «согласованных» признаков диагнозов из сверки двух черновиков (tools/signs_compare.py):
#   анализы: принятое (auto.json) + совпавшие по коду и направлению, но спорные по важности или «норма исключает»
#   (берётся меньшая важность, без normal=lower) + решения Claude (claude_review.json) поверх всего;
#   признаки, которые назвала только одна модель, и противоположные направления — не берутся (кроме решённых Claude);
#   распространённость — из сверки (среднее геометрическое), поверх — решения Claude;
#   осмотр, исследования и «нет в анкете» — как были.
# По умолчанию пишет кандидат в tools/out/signs_cmp/signs_candidate.json; --apply — в docs/data/signs.json.
# Запуск:  python tools/signs_consensus.py [--apply]
import argparse, json, os

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
CMP = os.path.join(ROOT, "tools", "out", "signs_cmp")
SIGNS = os.path.join(ROOT, "docs", "data", "signs.json")
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()
    data = json.load(open(SIGNS, encoding="utf-8"))
    auto = json.load(open(os.path.join(CMP, "auto.json"), encoding="utf-8"))
    review = json.load(open(os.path.join(CMP, "review.json"), encoding="utf-8"))
    cl = json.load(open(os.path.join(CMP, "claude_review.json"), encoding="utf-8"))
    soft = {}
    for r in review:
        if r["why"] in ("важность", "исключает ли норма") and r.get("a") and r.get("b"):
            x, y = r["a"], r["b"]
            d = x["dir"] if x["dir"] != "any" else y["dir"]
            w = min(x["w"], y["w"])
            if "risk" in (x.get("kind"), y.get("kind")):
                w = min(w, 3)
            soft.setdefault(r["dx"], {})[r["code"]] = {"code": r["code"], "dir": d, "w": w}
    before = after = changed = 0
    for dx, it in data["items"].items():
        before += len(it.get("labs", []))
        if dx not in auto:            # Яндекс не смог обработать — оставляем как было
            after += len(it.get("labs", []))
            continue
        labs = {x["code"]: dict(x) for x in auto[dx]["labs"]}
        for c, x in soft.get(dx, {}).items():
            labs.setdefault(c, x)
        for c, v in cl["labs"].get(dx, {}).items():
            if v is None:
                labs.pop(c, None)
            else:
                labs[c] = {"code": c, **v}
        new = sorted(labs.values(), key=lambda x: (-x["w"], x["code"]))
        prior = cl["prior"].get(dx, auto[dx].get("prior"))
        if new != it.get("labs") or prior != it.get("prior"):
            changed += 1
        it["labs"] = new
        if prior is not None:
            it["prior"] = prior
        it.pop("source", None)
        it.pop("checked", None)
        after += len(new)
    path = SIGNS if a.apply else os.path.join(CMP, "signs_candidate.json")
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=1); fh.write("\n")
    zero = sum(1 for it in data["items"].values() if not it.get("labs"))
    print(f"диагнозов {len(data['items'])}, изменено {changed}; признаков-анализов было {before}, стало {after}; без анализов {zero}; записано: {os.path.relpath(path, ROOT)}")


if __name__ == "__main__":
    main()
