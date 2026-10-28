# SPDX-License-Identifier: AGPL-3.0-or-later
# Предложения по неудачным названиям анализов каталога (docs/data/labs.json): кривой порядок слов, английские названия,
# «протеин» вместо «белок», опечатки, лишние подробности. Только предложения — в каталог ничего не пишется;
# после проверки (Claude) принятые названия переносятся в tools/lab_names.py.
# Пропускаются анализы анкеты (у них короткие подписи в бланке) и уже исправленные в lab_names.py.
# Результат — tools/out/names/batch-NNN.json
# Запуск:  python tools/ai_lab_names.py [--model yandexgpt-5.1] [--batch 40] [--limit N]
import argparse, json, os, re, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ai_signs import ROOT
from ai_articles import ask
from lab_names import NAMES

OUT = os.path.join(ROOT, "tools", "out", "names")
SYS = """Ты — врач клинической лабораторной диагностики и редактор. Тебе дают список анализов из каталога: код, название, синонимы, единицы.
Найди названия, которые плохо звучат по-русски или неточны, и предложи исправленное. Как называют анализ в российских лабораториях:
- нормальный порядок слов («Насыщение трансферрина», а не «Трансферрин насыщение»);
- по-русски, а принятое латинское сокращение — в скобках: «Антитела к аквапорину-4 (AQP4-IgG)»; чисто английское название — перевести;
- «белок», а не «протеин»; без опечаток и смеси алфавитов внутри слова;
- материал указывать, если это не кровь: «… в моче», «… в ликворе»;
- коротко, до 70 знаков; без слов «тест на …» и «анализ …», если без них понятно;
- смысл не менять: не добавлять и не убирать показатели, метод, материал, фракцию.
Если название нормальное — не включай его в ответ. Не выдумывай: если не уверен, как правильно, — пропусти.
Отвечай ТОЛЬКО JSON-объектом: {"items": [{"code": "КОД", "name": "исправленное название", "why": "до 8 слов"}]}"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="yandexgpt-5.1")
    ap.add_argument("--batch", type=int, default=40)
    ap.add_argument("--limit", type=int, default=0)
    a = ap.parse_args()
    cfg = json.load(open(os.path.join(ROOT, "secrets", "yandex.json"), encoding="utf-8-sig"))
    labs = json.load(open(os.path.join(ROOT, "docs", "data", "labs.json"), encoding="utf-8"))["items"]
    todo = [c for c, it in labs.items() if not it.get("inForm") and c not in NAMES]
    batches = [todo[i:i + a.batch] for i in range(0, len(todo), a.batch)]
    if a.limit:
        batches = batches[:a.limit]
    os.makedirs(OUT, exist_ok=True)
    print(f"codes={len(todo)} batches={len(batches)} model={a.model}", flush=True)
    tok = 0
    for n, b in enumerate(batches, 1):
        path = os.path.join(OUT, f"batch-{n:03d}.json")
        if os.path.exists(path):
            continue
        rows = [{"code": c, "name": labs[c]["name"], "aliases": labs[c].get("aliases", [])[:5], "unit": labs[c].get("unit", "")} for c in b]
        t0 = time.time()
        try:
            out, usage = ask(cfg, a.model, SYS, json.dumps(rows, ensure_ascii=False), 4000)
            tok += int(usage.get("total_tokens", 0) or 0)
            s = re.sub(r"^```(?:json)?\s*|\s*```$", "", out.strip())
            j = json.loads(s[s.find("{"):s.rfind("}") + 1])
            items = [x for x in j.get("items", []) if x.get("code") in b and x.get("name") and x["name"].strip() != labs[x["code"]]["name"]]
            for x in items:
                x["old"] = labs[x["code"]]["name"]
            json.dump({"batch": n, "model": a.model, "items": items}, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
            print(f"{n}/{len(batches)} OK {time.time() - t0:.0f}s proposals={len(items)}", flush=True)
        except Exception as e:
            print(f"{n}/{len(batches)} ERROR {type(e).__name__}: {str(e)[:200]}", flush=True)
    print(f"done tokens={tok}", flush=True)


if __name__ == "__main__":
    main()
