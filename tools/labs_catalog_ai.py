# SPDX-License-Identifier: AGPL-3.0-or-later
# Шаг 1 справочника анализов: ИИ разбирает названия анализов, которых нет в анкете (из черновиков признаков),
# склеивает синонимы, подбирает код, единицы, тип и уровень. Результат — tools/out/catalog/chunk-NNN.json,
# дальше их сводит tools/labs_catalog_build.py.
# Запуск:  python tools/labs_catalog_ai.py --model gpt-oss-120b [--chunk 70]
import argparse, collections, json, os, re, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ai_signs import ROOT, URL, catalog   # тот же ключ и адрес, что у черновиков признаков
import urllib.request, urllib.error
from ai_signs import PAUSE, MAX_PAUSES

OUT = os.path.join(ROOT, "tools", "out", "catalog")

SYSTEM = """Ты — врач клинической лабораторной диагностики. Тебе дают список названий исследований, которые встретились в описаниях болезней.
Для каждого названия верни одну запись. Отвечай ТОЛЬКО JSON-объектом {"items": [...]}, без пояснений и markdown.

Запись:
{ "src": "исходное название ровно как дано",
  "kind": "lab" | "not_lab",
  "code": "КОД латиницей в верхнем регистре через _ (например ANTI_TPO, BLOOD_CULTURE, HLA_B27)",
  "name": "каноническое русское название анализа",
  "aliases": ["другие названия и сокращения, в том числе английские"],
  "type": "number" | "qual" | "text",
  "unit": "единицы для number, иначе пусто",
  "tier": "basic" | "special" | "rare",
  "existing": "код из списка уже имеющихся анализов, если это тот же анализ, иначе null" }

Правила:
1. "not_lab" — если это не лабораторный анализ: инструментальное исследование (ЭКГ, УЗИ, МРТ, денситометрия DEXA), опросник (PHQ-9), кожная проба, осмотр. Для not_lab остальные поля можно оставить пустыми, кроме name.
2. Одинаковые анализы под разными названиями (тропонин, hs-тропонин I, troponin) — один и тот же code.
3. Если анализ уже есть в списке имеющихся — укажи его код в "existing" и тот же код в "code".
4. "type": number — результат числом; qual — положительно/отрицательно (есть/нет, обнаружено/не обнаружено, рост/нет роста); text — описательный результат (генотип, кариотип, вид микроорганизма).
5. "tier": basic — делают в любой поликлинике; special — назначают при подозрении на конкретные болезни, делают в крупных лабораториях; rare — редкие, новые, исследовательские, генетические панели.
6. Пиши по-русски, коды — латиницей."""


def ask(cfg, model, names, existing, fix=None):
    ex = "\n".join(f"{c} — {d.split(',')[0]}" for c, d in existing.items())
    lst = "\n".join(f"- {n}" for n in names)
    msgs = [{"role": "system", "content": SYSTEM},
            {"role": "user", "content": f"Уже имеющиеся анализы (код — название):\n{ex}\n\nРазбери эти названия:\n{lst}"}]
    if fix is not None:
        msgs += [{"role": "assistant", "content": fix}, {"role": "user", "content": "Это не корректный JSON. Пришли тот же ответ одним корректным JSON-объектом."}]
    body = {"model": f"gpt://{cfg['folder_id']}/{model}/latest", "temperature": 0.1, "max_tokens": 12000, "messages": msgs}
    for attempt in range(MAX_PAUSES + 1):
        req = urllib.request.Request(URL, data=json.dumps(body).encode("utf-8"), method="POST", headers={
            "Authorization": "Api-Key " + cfg["api_key"], "OpenAI-Project": cfg["folder_id"], "x-folder-id": cfg["folder_id"], "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=600) as r:
                j = json.loads(r.read().decode("utf-8"))
            return j["choices"][0]["message"].get("content") or "", j.get("usage", {})
        except urllib.error.HTTPError as e:
            if e.code not in (429, 500, 502, 503, 504) or attempt == MAX_PAUSES:
                raise
            print(f"PAUSE HTTP {e.code}", flush=True); time.sleep(PAUSE)
        except (urllib.error.URLError, TimeoutError, ConnectionError, OSError) as e:
            if attempt == MAX_PAUSES:
                raise
            print(f"PAUSE {type(e).__name__}", flush=True); time.sleep(PAUSE)


def parse(text):
    s = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip())
    a, b = s.find("{"), s.rfind("}")
    return json.loads(s[a:b + 1])["items"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="gpt-oss-120b")
    ap.add_argument("--chunk", type=int, default=70)
    a = ap.parse_args()
    cfg = json.load(open(os.path.join(ROOT, "secrets", "yandex.json"), encoding="utf-8-sig"))
    signs = json.load(open(os.path.join(ROOT, "docs", "data", "signs.json"), encoding="utf-8"))["items"]
    names = collections.Counter()
    for v in signs.values():
        for x in v.get("nolist", []):
            names[x["name"].strip().rstrip(".")[:120]] += 1
    names = [n for n, _ in names.most_common()]
    existing = catalog()
    os.makedirs(OUT, exist_ok=True)
    chunks = [names[i:i + a.chunk] for i in range(0, len(names), a.chunk)]
    print(f"names={len(names)} chunks={len(chunks)}", flush=True)
    for i, ch in enumerate(chunks, 1):
        path = os.path.join(OUT, f"chunk-{i:03d}.json")
        if os.path.exists(path):
            continue
        t0 = time.time()
        try:
            text, usage = ask(cfg, a.model, ch, existing)
            try:
                items = parse(text)
            except ValueError:
                text, usage2 = ask(cfg, a.model, ch, existing, fix=text)
                items = parse(text)
            got = {x.get("src") for x in items}
            json.dump({"names": ch, "items": items, "usage": usage, "missing": [n for n in ch if n not in got]},
                      open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
            print(f"{i}/{len(chunks)} OK {time.time() - t0:.0f}s items={len(items)} of {len(ch)} tok={usage.get('total_tokens', '?')}", flush=True)
        except Exception as e:
            print(f"{i}/{len(chunks)} ERROR {type(e).__name__}: {str(e)[:200]}", flush=True)


if __name__ == "__main__":
    main()
