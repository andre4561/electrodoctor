# SPDX-License-Identifier: AGPL-3.0-or-later
# Сравнение черновиков признаков от разных моделей: tools/out/compare.html
# Запуск:  python tools/ai_signs_compare.py tools/out/pilot20.txt gpt-oss-120b deepseek-v4.1-flash yandexgpt-5.1
import html, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ai_signs import catalog, ROOT

E = html.escape
names = [x.strip() for x in open(sys.argv[1], encoding="utf-8-sig") if x.strip()]
models = sys.argv[2:]
cat = {c: d.split(",")[0] for c, d in catalog().items()}
ARROW = {"up": "↑", "down": "↓", "any": "↕"}
data = {m: {} for m in models}
for m in models:
    for n in names:
        p = os.path.join(ROOT, "tools", "out", "signs", m, n + ".json")
        if os.path.exists(p):
            data[m][n] = json.load(open(p, encoding="utf-8"))

def stats(m):
    xs = list(data[m].values())
    if not xs: return {}
    s = lambda f: sum(f(x) for x in xs)
    return {"n": len(xs), "sec": s(lambda x: x["seconds"]) / len(xs), "tok": s(lambda x: x["usage"].get("total_tokens", 0)) / len(xs),
            "labs": s(lambda x: len(x["signs"]["labs"])) / len(xs), "risk": s(lambda x: sum(1 for l in x["signs"]["labs"] if l.get("kind") == "risk")),
            "lower": s(lambda x: sum(1 for l in x["signs"]["labs"] if l.get("normal") == "lower")), "nolist": s(lambda x: len(x["signs"].get("nolist", []))) / len(xs),
            "prior": sum(1 for x in xs if x["signs"].get("prior") is not None)}

def lab(l):
    tags = []
    if l.get("kind") == "risk": tags.append('<span class="t risk">риск</span>')
    if l.get("normal") == "lower": tags.append('<span class="t low" title="если в норме — снижает вероятность">норма ↓вер.</span>')
    if l.get("src") == "knowledge": tags.append('<span class="t kn" title="не из статьи, из общих знаний">не из статьи</span>')
    return '<li title="%s"><span class="w w%d">%d</span><span class="nm">%s</span><span class="dir">%s</span>%s</li>' % (
        E(l.get("why", "")), l["w"], l["w"], E(cat.get(l["code"], l["code"])), ARROW[l["dir"]], "".join(tags))


def nlitem(x):
    return E(x["name"]) + (" (%s)" % x["w"] if x.get("w") is not None else "")


def txitem(x):
    return '<li><span class="w0">%s</span>%s</li>' % (x.get("w", ""), E(x["name"]))


def col(m, n):
    d = data[m].get(n)
    if not d:
        return '<div class="col"><h4>%s</h4><p class="none">нет ответа: модель прислала испорченный JSON</p></div>' % E(m)
    s = d["signs"]
    labs = sorted(s["labs"], key=lambda l: -l["w"])
    nl = s.get("nolist", [])
    pr = s.get("prior")
    h = '<div class="col"><h4>%s<span class="meta">%.0f с · расп. %s</span></h4>' % (E(m), d["seconds"], (str(pr) + "%") if pr is not None else "—")
    h += ('<ul class="labs">%s</ul>' % "".join(lab(l) for l in labs)) if labs else '<p class="none">анализов нет</p>'
    if nl:
        h += '<p class="nl"><b>Нет в анкете:</b> %s</p>' % ", ".join(nlitem(x) for x in nl)
    h += '<details><summary>осмотр %d · исследования %d</summary><p class="sub">Осмотр и жалобы</p><ul class="tx">%s</ul><p class="sub">Инструментальные</p><ul class="tx">%s</ul></details></div>' % (
        len(s["exam"]), len(s["instr"]), "".join(txitem(x) for x in s["exam"]), "".join(txitem(x) for x in s["instr"]))
    return h


st = {m: stats(m) for m in models}
def srow(m):
    x = st[m]
    return "<tr><th>%s</th><td>%d</td><td>%.0f с</td><td>%s</td><td>%.1f</td><td>%d</td><td>%d</td><td>%.1f</td><td>%d</td></tr>" % (
        E(m), x.get("n", 0), x.get("sec", 0), format(int(x.get("tok", 0)), ",").replace(",", " "), x.get("labs", 0), x.get("risk", 0), x.get("lower", 0), x.get("nolist", 0), x.get("prior", 0))


summary = "".join(srow(m) for m in models)
cards = "".join('<section class="dx" id="d%d"><h3>%s</h3><div class="cols">%s</div></section>' % (i, E(n), "".join(col(m, n) for m in models)) for i, n in enumerate(names))
tpl = open(os.path.join(ROOT, "tools", "ai_signs_compare.html"), encoding="utf-8").read()
lead = os.environ.get("LEAD") or ("%d статей, каждую прочитали %d модели. Наведите на анализ, чтобы увидеть, почему модель его выбрала. Это черновик для сверки, а не медицинские рекомендации." % (len(names), len(models)))
out = tpl.replace("{{LEAD}}", E(lead)).replace("{{SUMMARY}}", summary).replace("{{CARDS}}", cards).replace("{{N}}", str(len(names))).replace("{{M}}", str(len(models)))
open(os.path.join(ROOT, "tools", "out", "compare.html"), "w", encoding="utf-8").write(out)
print("ok", {m: st[m].get("n") for m in models})
