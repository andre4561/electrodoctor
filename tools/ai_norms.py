# SPDX-License-Identifier: AGPL-3.0-or-later
# Предложения норм для числовых анализов справочника, у которых нормы нет (docs/data/norms.json).
# ИИ предлагает → tools/out/norms_proposed.json; в norms.json попадает только после проверки (tools/norms_apply.py).
# Запуск:  python tools/ai_norms.py [--model gpt-oss-120b] [--chunk 30]
import argparse, json, os, re, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ai_signs import ROOT
from ai_articles import ask

SYS = """Ты — врач клинической лабораторной диагностики. Для каждого анализа из списка предложи норму для взрослых.
Отвечай ТОЛЬКО JSON-объектом {"items": [ { "code": "КОД как дан", "unit": "единицы по-русски, как в российских лабораториях (г/л, ммоль/л, мкмоль/л, Ед/л, нг/мл, пг/мл, %, ×10⁹/л…)",
  "low": число или null, "high": число или null, "note": "коротко: различия по полу, возрасту, методу, если важны", "confidence": "high" | "medium" | "low" } ] }
low и high — типичный референсный интервал взрослых в указанных единицах. Если есть только верхняя граница — low = null. Если нормы нет (анализ описательный, интервал сильно зависит от метода) — low и high = null и объясни в note.
Не выдумывай: если не уверен — confidence "low"."""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="gpt-oss-120b")
    ap.add_argument("--chunk", type=int, default=30)
    a = ap.parse_args()
    cfg = json.load(open(os.path.join(ROOT, "secrets", "yandex.json"), encoding="utf-8-sig"))
    labs = json.load(open(os.path.join(ROOT, "docs", "data", "labs.json"), encoding="utf-8"))["items"]
    norms = json.load(open(os.path.join(ROOT, "docs", "data", "norms.json"), encoding="utf-8"))["items"]
    out_path = os.path.join(ROOT, "tools", "out", "norms_proposed.json")
    done = json.load(open(out_path, encoding="utf-8")) if os.path.exists(out_path) else {}
    todo = [c for c, l in labs.items() if l["type"] == "number" and c not in norms and c not in done]
    print(f"todo={len(todo)}", flush=True)
    for i in range(0, len(todo), a.chunk):
        ch = todo[i:i + a.chunk]
        user = "\n".join(f"{c} — {labs[c]['name']}" + (f" (единицы в справочнике: {labs[c]['unit']})" if labs[c].get("unit") else "") for c in ch)
        try:
            text, usage = ask(cfg, a.model, SYS, user, 6000)
            s = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip()); j = json.loads(s[s.find("{"):s.rfind("}") + 1])
            for x in j.get("items", []):
                if x.get("code") in ch: done[x["code"]] = {k: x.get(k) for k in ("unit", "low", "high", "note", "confidence")}
            json.dump(done, open(out_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
            print(f"{i // a.chunk + 1} OK {len(j.get('items', []))}/{len(ch)} tok={usage.get('total_tokens', '?')}", flush=True)
        except Exception as e:
            print(f"{i // a.chunk + 1} ERROR {type(e).__name__}: {str(e)[:200]}", flush=True)
    print("done", len(done), flush=True)


if __name__ == "__main__":
    main()
