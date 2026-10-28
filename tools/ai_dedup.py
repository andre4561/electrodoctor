# SPDX-License-Identifier: AGPL-3.0-or-later
# Решение по кандидатам в дубли (tools/out/dedup/candidates.json, см. dedup_candidates.py):
# для каждой группы модель говорит, какие коды — один и тот же анализ (объединить в основной), а какие — разные.
# Это только предложение: в labs.json/signs.json ничего не пишется. Проверяет Claude, применяет отдельный скрипт.
# Результат — tools/out/dedup/ai/<id>.json
# Запуск:  python tools/ai_dedup.py [--model yandexgpt-5.1] [--ids 1 2 3] [--limit N] [--redo] [--cand candidates2.json --out ai2]
import argparse, json, os, re, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ai_signs import ROOT
from ai_articles import ask

DIR = os.path.join(ROOT, "tools", "out", "dedup")
OUT = os.path.join(DIR, "ai")
SYS = """Ты — врач клинической лабораторной диагностики. Тебе дают группу записей из каталога анализов, которые похожи по названию.
Реши для каждой записи: это тот же самый анализ, что и другая запись группы (дубль), или отдельный анализ.

Дубль — только если совпадает ВСЁ: измеряемый показатель, биоматериал (кровь, моча, кал, ликвор…), принцип метода (антитела ≠ антиген ≠ ПЦР ≠ посев ≠ генетика) и тип результата.
НЕ дубли, а разные анализы:
- один показатель в разных материалах (лейкоциты в крови / в моче / в ликворе);
- разные фракции или формы (билирубин общий / прямой; IgG / IgM; общий / свободный; тау / p-tau);
- панель из нескольких анализов и отдельный анализ из неё («ПЦР на SARS-CoV-2 и грипп» ≠ «ПЦР на SARS-CoV-2»);
- разные гормоны, белки, гены, возбудители, даже если записи стоят рядом;
- экспресс-тест на антиген и ПЦР на того же возбудителя.
Разные единицы измерения сами по себе не мешают объединению, если показатель тот же.
Если сомневаешься — считай записи разными и ставь уверенность low. Не выдумывай: решай только по тому, что знаешь точно.

Основной код в объединении: запись «в анкете» (inForm) — если есть; иначе та, на которую ссылается больше диагнозов.

Отвечай ТОЛЬКО JSON-объектом:
{"items": [{"code": "КОД", "verdict": "main" | "merge" | "separate", "into": "КОД основной записи или null", "reason": "до 15 слов"}],
 "confidence": "high" | "medium" | "low"}
verdict: main — основная запись объединения; merge — дубль, вливается в "into" (это обязательно код с verdict main из этой же группы); separate — отдельный анализ.
В ответе должны быть ВСЕ коды группы ровно по одному разу."""


def describe(g):
    rows = []
    for x in g["items"]:
        rows.append({k: x[k] for k in ("code", "name", "unit", "type", "material", "group", "inForm", "diagnoses") if x.get(k) not in ("", None)}
                    | {"aliases": x["aliases"][:8]})
    return json.dumps({"group": g["id"], "items": rows}, ensure_ascii=False, indent=1)


def check(g, j):
    codes = [x["code"] for x in g["items"]]
    got = {i.get("code"): i for i in j.get("items", [])}
    errs = []
    if sorted(got) != sorted(codes):
        errs.append("набор кодов не совпадает")
    mains = {c for c, i in got.items() if i.get("verdict") == "main"}
    for c, i in got.items():
        v = i.get("verdict")
        if v not in ("main", "merge", "separate"):
            errs.append(f"{c}: verdict={v}")
        if v == "merge" and i.get("into") not in mains:
            errs.append(f"{c}: into={i.get('into')} не основной")
    for m in mains:
        if not any(i.get("into") == m and i.get("verdict") == "merge" for i in got.values()):
            errs.append(f"{m}: main без дублей")
    return errs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="yandexgpt-5.1")
    ap.add_argument("--ids", type=int, nargs="*")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--redo", action="store_true")
    ap.add_argument("--cand", default="candidates.json")
    ap.add_argument("--out", default="ai")
    a = ap.parse_args()
    cfg = json.load(open(os.path.join(ROOT, "secrets", "yandex.json"), encoding="utf-8-sig"))
    groups = json.load(open(os.path.join(DIR, a.cand), encoding="utf-8"))["groups"]
    OUT = os.path.join(DIR, a.out)
    os.makedirs(OUT, exist_ok=True)
    todo = [g for g in groups if (not a.ids or g["id"] in a.ids)
            and (a.redo or not os.path.exists(os.path.join(OUT, f"{g['id']}.json")))]
    if a.limit:
        todo = todo[:a.limit]
    print(f"todo={len(todo)} model={a.model}", flush=True)
    tok = 0
    for n, g in enumerate(todo, 1):
        t0 = time.time()
        try:
            out, usage = ask(cfg, a.model, SYS, describe(g), 1500)
            tok += int(usage.get("total_tokens", 0) or 0)
            s = re.sub(r"^```(?:json)?\s*|\s*```$", "", out.strip())
            j = json.loads(s[s.find("{"):s.rfind("}") + 1])
            errs = check(g, j)
            json.dump({"id": g["id"], "model": a.model, "result": j, "errors": errs, "raw": None if not errs else out},
                      open(os.path.join(OUT, f"{g['id']}.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
            merges = sum(1 for i in j.get("items", []) if i.get("verdict") == "merge")
            print(f"{n}/{len(todo)} {'OK ' if not errs else 'BAD'} #{g['id']} {time.time() - t0:.0f}s merge={merges} conf={j.get('confidence')} {'; '.join(errs)}", flush=True)
        except Exception as e:
            print(f"{n}/{len(todo)} ERROR #{g['id']} {type(e).__name__}: {str(e)[:200]}", flush=True)
    print(f"done tokens={tok}", flush=True)


if __name__ == "__main__":
    main()
