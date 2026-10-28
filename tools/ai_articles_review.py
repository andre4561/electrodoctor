# SPDX-License-Identifier: AGPL-3.0-or-later
# Вычитка полных статей-черновиков другой моделью: ищет фактические ошибки и предлагает точную замену.
# Результат — tools/out/review/<КОД>.json: [{ "quote": "точная цитата", "problem": "что не так", "fix": "как правильно", "kind": "fact|term|language" }].
# Править статьи по этим замечаниям — отдельный шаг (решает человек или Claude, см. tools/ai_articles_fix.py).
# Запуск:  python tools/ai_articles_review.py [--model yandexgpt-5.1] [--limit N]
import argparse, glob, json, os, re, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ai_signs import ROOT
from ai_articles import ask, ART

OUT = os.path.join(ROOT, "tools", "out", "review")
SYS = """Ты — строгий рецензент-врач клинической лабораторной диагностики. Тебе дают статью об анализе, написанную другим ИИ.
Найди в ней фактические ошибки: неверные механизмы, перепутанные болезни и органы (например, гипер- и гипо-), неверные нормы и единицы, искажённые названия методов и терминов.
Грубые языковые ошибки тоже отмечай, но только если они искажают смысл.
Отвечай ТОЛЬКО JSON-объектом {"issues": [ { "quote": "точная цитата из статьи, 3–20 слов, символ в символ", "problem": "что не так, коротко", "fix": "исправленный вариант этого же фрагмента", "kind": "fact" | "term" | "language" } ]}.
Не больше 12 замечаний, самые важные первыми. Не придирайся к стилю. Если ошибок нет — {"issues": []}."""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="yandexgpt-5.1")
    ap.add_argument("--limit", type=int, default=0)
    a = ap.parse_args()
    cfg = json.load(open(os.path.join(ROOT, "secrets", "yandex.json"), encoding="utf-8-sig"))
    os.makedirs(OUT, exist_ok=True)
    todo = []
    for f in sorted(glob.glob(os.path.join(ART, "*.md"))):
        head = open(f, encoding="utf-8").read(2500)
        m = re.search(r"^code:\s*(\w+)", head, re.M)
        if m and "length: полная" in head and "черновик ИИ" in head and not os.path.exists(os.path.join(OUT, m.group(1) + ".json")):
            todo.append((m.group(1), f))
    if a.limit: todo = todo[:a.limit]
    print(f"todo={len(todo)}", flush=True)
    for i, (code, f) in enumerate(todo, 1):
        text = open(f, encoding="utf-8").read()
        body = text.split("\n---", 1)[-1]
        t0 = time.time()
        try:
            out, usage = ask(cfg, a.model, SYS, body[:20000], 4000)
            s = re.sub(r"^```(?:json)?\s*|\s*```$", "", out.strip()); j = json.loads(s[s.find("{"):s.rfind("}") + 1])
            issues = [x for x in j.get("issues", []) if x.get("quote") and x.get("fix")]
            for x in issues: x["found"] = x["quote"] in body
            json.dump({"file": os.path.basename(f), "model": a.model, "issues": issues}, open(os.path.join(OUT, code + ".json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
            print(f"{i}/{len(todo)} OK {code} {time.time() - t0:.0f}s issues={len(issues)} found={sum(x['found'] for x in issues)}", flush=True)
        except Exception as e:
            print(f"{i}/{len(todo)} ERROR {code} {type(e).__name__}: {str(e)[:200]}", flush=True)
    print("done", flush=True)


if __name__ == "__main__":
    main()
