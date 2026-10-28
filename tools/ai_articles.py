# SPDX-License-Identifier: AGPL-3.0-or-later
# Статьи об анализах, которых нет в docs/articles/lab-tests/: ИИ пишет их по шаблону (tools/templates/lab-test-article.md).
#   полные — для анализов бланка и специализированных, на которые ссылаются хотя бы 3 диагноза;
#   краткие (2 абзаца) — для остальных; помечены «краткое описание», к ним потом вернёмся.
# Каждая статья — «черновик ИИ» в шапке и плашкой в начале текста. Готовые статьи сразу кладутся в docs/articles/lab-tests/,
# ответ, не прошедший проверку (нет нужных разделов, слишком коротко), — в tools/out/articles_err/.
# Запуск:  python tools/ai_articles.py --mode full|short [--limit N] [--model gpt-oss-120b]
import argparse, json, os, re, sys, time, urllib.error, urllib.request
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ai_signs import ROOT, URL, PAUSE, MAX_PAUSES

ART = os.path.join(ROOT, "docs", "articles", "lab-tests")
ERR = os.path.join(ROOT, "tools", "out", "articles_err")
LOG = os.path.join(ROOT, "tools", "out", "articles_log.txt")
SECTIONS = ["Идентификация и биохимия", "Физиологическая роль", "Патофизиология", "Референсные значения", "Методы определения",
            "Клинические показания", "Интерференции и ограничения", "Интерпретация и тактика", "Связь с другими маркерами", "Краткий итог"]
SHORT_MARK = "краткое описание"

SYS_FULL = f"""Ты — врач клинической лабораторной диагностики. Напиши справочную статью об анализе для врача и грамотного пациента.
Строго 10 разделов второго уровня, в таком порядке и с такими заголовками:
{chr(10).join('## ' + s for s in SECTIONS)}
Правила: пиши грамотным русским языком, конкретно, без воды; объём 6–10 тысяч знаков. Термины — принятые в российской медицине; проверяй, что каждое утверждение верно (не путай органы, механизмы и названия болезней).
Единицы — русские, как на бланках российских лабораторий: г/л, ммоль/л, мкмоль/л, Ед/л, нг/мл, пг/мл, мМЕ/мл, ×10⁹/л; английские единицы не используй. Нормы — с оговоркой, что интервалы зависят от лаборатории и метода.
Не назначай лечение и дозировки. Не выдумывай: если данных нет или анализ новый и мало изучен — так и напиши. LOINC-коды указывай, только если уверен.
Выводи только текст статьи в markdown, начиная с «## Идентификация и биохимия». Без вступлений и заключений вне разделов."""
SYS_SHORT = """Ты — врач клинической лабораторной диагностики. Напиши краткую справку об анализе: ровно два абзаца, всего 600–1200 знаков.
Первый абзац — что это за анализ и что он показывает, из какого материала. Второй — когда его назначают и что обычно значит отклонение; типичный интервал нормы с единицами, если он известен.
Пиши грамотным русским языком, единицы — русские (ммоль/л, мкмоль/л, Ед/л, нг/мл, мМЕ/мл), без лечения и дозировок, не выдумывай. Выводи только два абзаца текста, без заголовков и списков."""


def ask(cfg, model, system, user, max_tokens):
    body = {"model": f"gpt://{cfg['folder_id']}/{model}/latest", "temperature": 0.3, "max_tokens": max_tokens,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]}
    for attempt in range(MAX_PAUSES + 1):
        req = urllib.request.Request(URL, data=json.dumps(body).encode("utf-8"), method="POST", headers={
            "Authorization": "Api-Key " + cfg["api_key"], "OpenAI-Project": cfg["folder_id"], "x-folder-id": cfg["folder_id"], "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=600) as r:
                j = json.loads(r.read().decode("utf-8"))
            return (j["choices"][0]["message"].get("content") or "").strip(), j.get("usage", {})
        except urllib.error.HTTPError as e:
            if e.code not in (429, 500, 502, 503, 504) or attempt == MAX_PAUSES: raise
            why = f"HTTP {e.code}"
        except (urllib.error.URLError, TimeoutError, ConnectionError, OSError) as e:
            if attempt == MAX_PAUSES: raise
            why = type(e).__name__
        print(f"PAUSE {why}", flush=True); time.sleep(PAUSE)


def safe_name(name):
    n = re.sub(r'[\\/:*?"<>|]+', " ", name).strip().rstrip(".")
    return re.sub(r"\s+", " ", n)[:120]


def yaml_q(s):
    return '"' + str(s).replace("\\", "\\\\").replace('"', '\\"') + '"'


def front(code, l, model, short):
    al = [a for a in l["aliases"] if a and a != l["name"]][:12]
    lines = ["---", f"Title: {l['name']}", "Рубрики: анализ", f"code: {code}", f"tier: {l['tier']}",
             f"status: черновик ИИ ({model}), не проверено", f"length: {SHORT_MARK if short else 'полная'}"]
    if al:
        lines += ["aliases:"] + [f"  - {yaml_q(a)}" for a in al]
    lines.append("---")
    banner = f"> **Черновик ИИ** ({model}) — статья не проверена специалистом."
    if short:
        banner += f" **Краткое описание** — будет дополнено."
    return "\n".join(lines) + "\n\n" + banner + "\n\n"


def check(text, short):
    if short:
        paras = [p for p in re.split(r"\n\s*\n", text) if p.strip()]
        return (len(text) >= 300 and len(paras) >= 2 and not text.lstrip().startswith("#")), f"{len(text)} знаков, абзацев {len(paras)}"
    have = re.findall(r"^## (.+?)\s*$", text, re.M)
    miss = [s for s in SECTIONS if s not in have]
    return (not miss and len(text) >= 3000), (f"нет разделов: {', '.join(miss)}" if miss else f"{len(text)} знаков")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--mode", choices=["full", "short"], required=True)
    ap.add_argument("--model", default="gpt-oss-120b")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--codes", nargs="*", help="только эти коды (для пробы)")
    ap.add_argument("--dest", help="куда класть вместо docs/articles/lab-tests (для пробы)")
    ap.add_argument("--replace", help="переписать статьи этого режима, написанные указанной моделью (например gpt-oss-120b)")
    ap.add_argument("--upgrade", help="переписать КРАТКИЕ статьи этой модели полными (вместе с --mode full)")
    a = ap.parse_args()
    cfg = json.load(open(os.path.join(ROOT, "secrets", "yandex.json"), encoding="utf-8-sig"))
    labs = json.load(open(os.path.join(ROOT, "docs", "data", "labs.json"), encoding="utf-8"))["items"]
    have_codes, by_code, made_by, short_have = set(), {}, {}, set()
    for f in os.listdir(ART):      # статьи, уже написанные этим скриптом (по коду в шапке)
        if f.endswith(".md"):
            head = open(os.path.join(ART, f), encoding="utf-8").read(3000)
            m = re.search(r"^code:\s*(\w+)", head, re.M)
            if m:
                have_codes.add(m.group(1)); by_code[m.group(1)] = f
                s = re.search(r"^status: черновик ИИ \(([^)]+)\), не проверено", head, re.M); made_by[m.group(1)] = s.group(1) if s else ""
                if SHORT_MARK in head[:600]: short_have.add(m.group(1))
    full = lambda l: l["inForm"] or (l["tier"] in ("basic", "special") and l.get("refs", 0) >= 3)
    todo = [c for c, l in labs.items() if not l.get("article") and c not in have_codes and (full(l) if a.mode == "full" else not full(l))]
    if a.replace:
        todo = [c for c, l in labs.items() if c in made_by and made_by[c] == a.replace and (full(l) if a.mode == "full" else not full(l))]
    if a.upgrade:
        rank = {"basic": 0, "special": 1, "rare": 2}
        todo = sorted((c for c in labs if made_by.get(c) == a.upgrade and c in short_have),
                      key=lambda c: (rank.get(labs[c]["tier"], 3), -labs[c].get("refs", 0), c))
    if a.codes: todo = a.codes
    if a.limit: todo = todo[:a.limit]
    art_dir = a.dest or ART
    os.makedirs(art_dir, exist_ok=True)
    os.makedirs(ERR, exist_ok=True)
    log = open(LOG, "a", encoding="utf-8")
    print(f"mode={a.mode} todo={len(todo)}", flush=True)
    short = a.mode == "short"
    for i, code in enumerate(todo, 1):
        l = labs[code]
        user = (f"Анализ: {l['name']}\nДругие названия: {', '.join(l['aliases'][:12]) or '—'}\n"
                f"Тип результата: {'число' if l['type'] == 'number' else 'положительно/отрицательно' if l['type'] == 'qual' else 'описательный'}"
                + (f", единицы {l['unit']}" if l.get('unit') else "") + (f"\nГруппа: {l['group']}" if l.get('group') else ""))
        t0 = time.time()
        try:
            text, usage = ask(cfg, a.model, SYS_SHORT if short else SYS_FULL, user, 3000 if short else 24000)
            text = re.sub(r"^```(?:markdown|md)?\s*|\s*```$", "", text).strip()
            ok, why = check(text, short)
            fname = safe_name(l["name"])
            if (a.replace or a.upgrade) and not a.dest and code in by_code: fname = by_code[code][:-3]          # переписываем тот же файл
            elif not a.dest and os.path.exists(os.path.join(ART, fname + ".md")): fname = safe_name(f"{l['name']} ({code})")
            dest = os.path.join(art_dir if ok else ERR, fname + ".md")
            open(dest, "w", encoding="utf-8", newline="\n").write(front(code, l, a.model, short) + text + "\n")
            msg = f"{i}/{len(todo)} {'OK' if ok else 'CHECK'} {code} {time.time() - t0:.0f}s {why} tok={usage.get('total_tokens', '?')}"
        except Exception as e:
            msg = f"{i}/{len(todo)} ERROR {code} {type(e).__name__}: {str(e)[:200]}"
        print(msg, flush=True); log.write(time.strftime("%H:%M:%S ") + msg + "\n"); log.flush()
    print("done", flush=True)


if __name__ == "__main__":
    main()
