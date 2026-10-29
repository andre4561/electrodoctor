# SPDX-License-Identifier: AGPL-3.0-or-later
# Сверка двух независимых черновиков признаков (tools/out/signs/<модель А>/ и <модель Б>/) — без ИИ.
# По каждому диагнозу и анализу:
#   принято  — обе модели назвали анализ с тем же направлением и разница важности <= 2: важность — меньшая,
#              normal=lower — только если у обеих; «фактор риска» у любой — важность не выше 3;
#   спорно   — направления противоположны; разница важности >= 3; сильный признак (w >= 5) только у одной модели;
#              одна модель ставит normal=lower при важности >= 7, а другая нет — решает Claude;
#   отброшено — слабый признак (w <= 4) только у одной модели.
# Распространённость (prior): среднее геометрическое; если модели расходятся больше чем в 5 раз — спорно.
# Осмотр и исследования (exam, instr) пока не сверяются: в расчёте участвуют только анализы.
# Результат: tools/out/signs_cmp/auto.json (принятое), review.json (спорное), stats.txt
# Запуск:  python tools/signs_compare.py --a gpt-oss-120b --b yandexgpt-5.1
import argparse, collections, json, math, os

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
SRC = os.path.join(ROOT, "tools", "out", "signs")
OUT = os.path.join(ROOT, "tools", "out", "signs_cmp")


def load(model):
    d = os.path.join(SRC, model)
    res = {}
    for f in os.listdir(d):
        if f.endswith(".json"):
            j = json.load(open(os.path.join(d, f), encoding="utf-8"))
            res[f[:-5]] = j.get("signs") or {}
    return res


def norm_lab(x):
    return {"code": x["code"], "dir": x.get("dir", "any"), "w": max(0, min(10, int(round(float(x.get("w", 0)))))),
            "normal": x.get("normal", "none") or "none", "kind": x.get("kind", "sign") or "sign", "why": x.get("why", "")}


def dir_ok(a, b):
    return a == b or "any" in (a, b)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--a", default="gpt-oss-120b")
    ap.add_argument("--b", default="yandexgpt-5.1")
    a = ap.parse_args()
    A, B = load(a.a), load(a.b)
    names = sorted(set(A) & set(B))
    os.makedirs(OUT, exist_ok=True)
    auto, review, st = {}, [], collections.Counter()
    for n in names:
        la = {x["code"]: norm_lab(x) for x in A[n].get("labs", []) if x.get("code")}
        lb = {x["code"]: norm_lab(x) for x in B[n].get("labs", []) if x.get("code")}
        acc = []
        for c in sorted(set(la) | set(lb)):
            x, y = la.get(c), lb.get(c)
            if x and y:
                if not dir_ok(x["dir"], y["dir"]):
                    review.append({"dx": n, "code": c, "why": "направление", "a": x, "b": y}); st["спорно: направление"] += 1; continue
                if abs(x["w"] - y["w"]) >= 3:
                    review.append({"dx": n, "code": c, "why": "важность", "a": x, "b": y}); st["спорно: важность"] += 1; continue
                lower = [x["normal"] == "lower", y["normal"] == "lower"]
                if any(lower) and not all(lower) and max(x["w"], y["w"]) >= 7:
                    review.append({"dx": n, "code": c, "why": "исключает ли норма", "a": x, "b": y}); st["спорно: normal"] += 1; continue
                w = min(x["w"], y["w"])
                if "risk" in (x["kind"], y["kind"]):
                    w = min(w, 3)
                d = x["dir"] if x["dir"] != "any" else y["dir"]
                item = {"code": c, "dir": d, "w": w}
                if all(lower) and "risk" not in (x["kind"], y["kind"]):
                    item["normal"] = "lower"
                acc.append(item); st["принято"] += 1
            else:
                z, who = (x, a.a) if x else (y, a.b)
                if z["w"] >= 5:
                    review.append({"dx": n, "code": c, "why": "только у " + who, "a": x, "b": y}); st["спорно: одна модель"] += 1
                else:
                    st["отброшено: слабый, одна модель"] += 1
        pa, pb = A[n].get("prior"), B[n].get("prior")
        prior = None
        try:
            pa, pb = (float(pa) if pa not in (None, "") else None), (float(pb) if pb not in (None, "") else None)
        except (TypeError, ValueError):
            pa = pb = None
        if pa and pb and pa > 0 and pb > 0:
            if max(pa, pb) / min(pa, pb) > 5:
                review.append({"dx": n, "code": "PRIOR", "why": "распространённость", "a": pa, "b": pb}); st["спорно: prior"] += 1
            prior = round(math.sqrt(pa * pb), 4)
        else:
            prior = pa or pb
        auto[n] = {"prior": prior, "labs": acc}
    json.dump(auto, open(os.path.join(OUT, "auto.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    json.dump(review, open(os.path.join(OUT, "review.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    strong = sum(1 for r in review if r["code"] != "PRIOR" and max((r["a"] or {}).get("w", 0), (r["b"] or {}).get("w", 0)) >= 7)
    lines = [f"диагнозов в обоих черновиках: {len(names)} (только в {a.a}: {len(set(A) - set(B))}, только в {a.b}: {len(set(B) - set(A))})"]
    lines += [f"{k}: {v}" for k, v in sorted(st.items())]
    lines.append(f"спорных всего: {len(review)}, из них сильных (w >= 7): {strong}")
    open(os.path.join(OUT, "stats.txt"), "w", encoding="utf-8").write("\n".join(lines) + "\n")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
