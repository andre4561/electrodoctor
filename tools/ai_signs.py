# SPDX-License-Identifier: AGPL-3.0-or-later
# Черновик признаков диагнозов: ИИ читает статью о диагнозе и выписывает анализы, осмотр и исследования
# с важностью 0–10. Результат — по файлу на диагноз в tools/out/signs/<модель>/, потом его собирает
# tools/ai_signs_merge.py в docs/data/signs.json (с пометкой «черновик ИИ»), а человек проверяет в Настройках.
#
# Ключ Яндекса: secrets/yandex.json  { "folder_id": "...", "api_key": "..." }  (в GitHub не попадает)
# Запуск:
#   python tools/ai_signs.py --model deepseek-v4.1-flash --names "Стенокардия" "Миокардит"
#   python tools/ai_signs.py --model deepseek-v4.1-flash --section cardio --limit 50
#   python tools/ai_signs.py --model deepseek-v4.1-flash --all --limit 100      (следующие 100 необработанных)
# Уже обработанные статьи пропускаются: запуск можно прерывать и продолжать.
import argparse, json, os, re, sys, time, urllib.error, urllib.request

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
ART = os.path.join(ROOT, "docs", "articles", "diagnoses")
OUT = os.path.join(ROOT, "tools", "out", "signs")
URL = "https://llm.api.cloud.yandex.net/v1/chat/completions"
MAX_ART = 24000          # символов статьи в запросе


def catalog():
    """Числовые анализы вкладки «Анализы» (src/app/fields.ts) и нормы из docs/data/norms.json."""
    src = open(os.path.join(ROOT, "src", "app", "fields.ts"), encoding="utf-8").read().replace("\r\n", "\n")
    labs = src[src.index('id: "labs"'):]
    nxt = labs.find("\n  {\n    id:", 1)
    labs = labs[:nxt] if nxt > 0 else labs
    norms = json.load(open(os.path.join(ROOT, "docs", "data", "norms.json"), encoding="utf-8"))["items"]
    out = {}
    for code, label, typ, rest in re.findall(r'code: "(\w+)", label: "([^"]+)", type: "(\w+)"([^\n]*)', labs):
        if typ != "number":
            continue
        unit = (re.search(r'unit: "([^"]*)"', rest) or [None, ""])[1]
        n = norms.get(code)
        out[code] = f"{label}" + (f", {unit}" if unit else "") + (f", норма около {n['norm']}" if n else "")
    return out


SYSTEM = """Ты — врач-методист. По статье о заболевании составь список признаков, по которым врач заподозрит это заболевание.
Отвечай ТОЛЬКО одним JSON-объектом, без пояснений и без markdown.

Формат:
{
  "prior": число — примерная распространённость заболевания среди взрослых, обратившихся к врачу, в процентах (например 2 или 0.1), или null,
  "labs": [ { "code": "КОД", "dir": "up" | "down" | "any", "w": 0-10, "normal": "lower" | "none", "kind": "sign" | "risk", "src": "article" | "knowledge", "why": "коротко, почему" } ],
  "nolist": [ { "name": "анализ, которого нет в списке", "dir": "up" | "down" | "any", "w": 0-10, "why": "коротко" } ],
  "exam": [ { "name": "признак осмотра или жалоба", "w": 0-10, "note": "коротко" } ],
  "instr": [ { "name": "инструментальное исследование и его находка (ЭКГ, УЗИ, МРТ, КТ, рентген…)", "w": 0-10, "note": "коротко" } ]
}

Правила:
1. В "labs" — только анализы из списка ниже, по их коду. Других кодов не придумывай. Важный анализ, которого нет в списке (например, тропонин, BNP, КФК-МВ), запиши в "nolist" — не в "instr".
2. "dir": up — значение выше нормы указывает на заболевание, down — ниже нормы, any — любое отклонение.
3. Важность "w": 9–10 — почти подтверждает заболевание; 6–8 — сильный признак; 3–5 — умеренный, встречается и при других болезнях; 1–2 — слабый, косвенный.
4. "kind": "sign" — анализ меняется из-за самого заболевания или его последствий: тропонин при инфаркте, лейкоциты и СРБ при воспалении, D-димер при тромбозе. "risk" — показатель лишь повышает вероятность заболевать в будущем и сам болезнью не вызван: холестерин, глюкоза, HbA1c при инфаркте. Для "risk" важность не выше 3.
5. "normal": "lower" — если нормальное значение анализа заметно говорит ПРОТИВ этого заболевания, то есть анализом это заболевание исключают. Обязательно проверь каждый анализ с важностью 7 и выше: исключает ли его нормальное значение болезнь? Примеры "lower": нормальный D-димер при подозрении на тромбоэмболию или тромбоз глубоких вен; нормальный тропонин при инфаркте; нормальный NT-proBNP при сердечной недостаточности; нормальный ферритин при железодефицитной анемии. Для факторов риска ("risk") "lower" не ставь. Иначе "none".
6. Опирайся прежде всего на статью ("src": "article"). Общепринятые медицинские знания — только для явных, хорошо известных признаков ("src": "knowledge").
7. Не больше 12 анализов, 10 признаков осмотра и 8 исследований. Если у заболевания нет характерных анализов — оставь "labs" пустым.
8. Пиши по-русски."""


def article(name):
    t = open(os.path.join(ART, name + ".md"), encoding="utf-8").read()
    t = re.sub(r"^---\r?\n.*?\r?\n---\r?\n", "", t, flags=re.S)
    return t.strip()[:MAX_ART]


def ask(cfg, model, cat, name, fix=None):
    lst = "\n".join(f"{c} — {d}" for c, d in cat.items())
    msgs = [{"role": "system", "content": SYSTEM},
            {"role": "user", "content": f"Список анализов (код — название, единицы, норма):\n{lst}\n\nЗаболевание: {name}\n\nСтатья:\n{article(name)}"}]
    if fix is not None:
        msgs += [{"role": "assistant", "content": fix},
                 {"role": "user", "content": "Это не корректный JSON. Пришли тот же ответ одним корректным JSON-объектом, без пояснений. Кавычки внутри строк не используй."}]
    body = {"model": f"gpt://{cfg['folder_id']}/{model}/latest", "temperature": 0.2, "max_tokens": 4000, "messages": msgs}
    req = urllib.request.Request(URL, data=json.dumps(body).encode("utf-8"), method="POST", headers={
        "Authorization": "Api-Key " + cfg["api_key"], "OpenAI-Project": cfg["folder_id"], "x-folder-id": cfg["folder_id"],
        "Content-Type": "application/json"})
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=300) as r:
        j = json.loads(r.read().decode("utf-8"))
    return j["choices"][0]["message"].get("content") or "", j.get("usage", {}), time.time() - t0


PAUSE = 1800            # Яндекс не отвечает или упёрся в лимит — пауза 30 минут и повтор
MAX_PAUSES = 6          # столько пауз подряд — и останавливаемся


def ask_patient(cfg, model, cat, name, log, fix=None):
    """Как ask(), но при лимитах (429), ошибках сервера и обрывах связи ждёт PAUSE и пробует снова."""
    for attempt in range(MAX_PAUSES + 1):
        try:
            return ask(cfg, model, cat, name, fix)
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", "replace")[:200]
            if e.code not in (429, 500, 502, 503, 504) or attempt == MAX_PAUSES:
                raise
            why = f"HTTP {e.code} {body}"
        except (urllib.error.URLError, TimeoutError, ConnectionError, OSError) as e:
            if attempt == MAX_PAUSES:
                raise
            why = f"{type(e).__name__}: {str(e)[:200]}"
        msg = time.strftime("%H:%M:%S ") + f"{name} — Яндекс не отвечает ({why}); пауза {PAUSE // 60} мин, попытка {attempt + 2}"
        log.write(msg + "\n"); log.flush(); print("PAUSE " + why[:120], flush=True)
        time.sleep(PAUSE)


def parse(text, cat):
    """Достаём JSON из ответа и проверяем: коды из списка, важность 0–10."""
    s = text.strip()
    s = re.sub(r"^```(?:json)?\s*|\s*```$", "", s)
    a, b = s.find("{"), s.rfind("}")
    if a < 0 or b < 0:
        raise ValueError("в ответе нет JSON")
    j = json.loads(s[a:b + 1])
    w = lambda x: max(0, min(10, int(round(float(x))))) if isinstance(x, (int, float)) or (isinstance(x, str) and re.match(r"^\d+(\.\d+)?$", x)) else 5
    labs, dropped, seen = [], [], set()
    for x in j.get("labs") or []:
        code = str(x.get("code", "")).strip().upper()
        if code not in cat or code in seen:
            dropped.append(code); continue
        seen.add(code)
        d = x.get("dir") if x.get("dir") in ("up", "down", "any") else "any"
        it = {"code": code, "dir": d, "w": w(x.get("w"))}
        if x.get("normal") == "lower":
            it["normal"] = "lower"
        if x.get("kind") == "risk":
            it["kind"] = "risk"
            it["w"] = min(it["w"], 3)
        if x.get("src") == "knowledge":
            it["src"] = "knowledge"
        if x.get("why"):
            it["why"] = str(x["why"])[:200]
        labs.append(it)
    txt = lambda xs: [{k: v for k, v in {"name": str(x.get("name", ""))[:160], "w": w(x.get("w")) if x.get("w") is not None else None,
                       "note": str(x.get("note") or "")[:200] or None}.items() if v is not None} for x in (xs or []) if x.get("name")]
    pr = j.get("prior")
    prior = float(pr) if isinstance(pr, (int, float)) and 0 < pr < 100 else None
    out = {"labs": labs, "exam": txt(j.get("exam")), "instr": txt(j.get("instr"))}
    nl = [{k: v for k, v in {"name": str(x.get("name", ""))[:120], "dir": x.get("dir") if x.get("dir") in ("up", "down", "any") else None,
           "w": w(x.get("w")) if x.get("w") is not None else None, "why": str(x.get("why") or "")[:200] or None}.items() if v is not None}
          for x in (j.get("nolist") or []) if x.get("name")]
    if nl:
        out["nolist"] = nl
    if prior is not None:
        out["prior"] = round(prior, 3)
    return out, dropped


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True)
    ap.add_argument("--names", nargs="*")
    ap.add_argument("--list", help="файл со списком статей, по одной в строке")
    ap.add_argument("--section")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--retry", action="store_true", help="заново — и уже обработанные")
    a = ap.parse_args()
    cfg = json.load(open(os.path.join(ROOT, "secrets", "yandex.json"), encoding="utf-8-sig"))
    cat = catalog()
    dx = json.load(open(os.path.join(ROOT, "docs", "data", "diagnoses.json"), encoding="utf-8"))["items"]
    if a.list:
        a.names = [x.strip() for x in open(a.list, encoding="utf-8-sig") if x.strip()]
    names = a.names or sorted(n for n, v in dx.items() if a.all or (a.section and a.section in v["sections"]))
    out_dir = os.path.join(OUT, a.model)
    os.makedirs(out_dir, exist_ok=True)
    log = open(os.path.join(out_dir, "_log.txt"), "a", encoding="utf-8")
    todo = [n for n in names if a.retry or not os.path.exists(os.path.join(out_dir, n + ".json"))]
    if a.limit:
        todo = todo[:a.limit]
    print(f"model={a.model} todo={len(todo)} of {len(names)}", flush=True)
    ok = fail = 0
    for i, name in enumerate(todo, 1):
        text = ""
        try:
            text, usage, sec = ask_patient(cfg, a.model, cat, name, log)
            try:
                res, dropped = parse(text, cat)
            except ValueError:
                text2, usage2, sec2 = ask_patient(cfg, a.model, cat, name, log, fix=text)   # одна попытка: попросить исправить JSON
                res, dropped = parse(text2, cat)
                text, sec = text2, sec + sec2
                usage = {k: (usage.get(k) or 0) + (usage2.get(k) or 0) for k in set(usage) | set(usage2)
                         if isinstance(usage.get(k, 0), int) and isinstance(usage2.get(k, 0), int)}
            res["source"] = f"черновик ИИ: {a.model}"
            json.dump({"name": name, "model": a.model, "usage": usage, "seconds": round(sec, 1), "dropped": dropped, "signs": res, "raw": text},
                      open(os.path.join(out_dir, name + ".json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
            ok += 1
            msg = f"{i}/{len(todo)} OK {sec:.0f}s labs={len(res['labs'])} nolist={len(res.get('nolist', []))} exam={len(res['exam'])} instr={len(res['instr'])} dropped={len(dropped)} tok={usage.get('total_tokens', '?')}"
        except urllib.error.HTTPError as e:
            fail += 1
            msg = f"{i}/{len(todo)} HTTP {e.code} {e.read().decode('utf-8', 'replace')[:300]}"
            if e.code == 429:
                time.sleep(20)
        except Exception as e:
            fail += 1
            msg = f"{i}/{len(todo)} ERROR {type(e).__name__}: {str(e)[:300]}"
            if text:   # сырой ответ — чтобы разобраться
                os.makedirs(os.path.join(out_dir, "_errors"), exist_ok=True)
                open(os.path.join(out_dir, "_errors", name + ".txt"), "w", encoding="utf-8").write(text)
        log.write(time.strftime("%H:%M:%S ") + name + " — " + msg + "\n"); log.flush()
        print(msg, flush=True)
    print(f"done ok={ok} fail={fail}", flush=True)


if __name__ == "__main__":
    main()
