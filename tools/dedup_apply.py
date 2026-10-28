# SPDX-License-Identifier: AGPL-3.0-or-later
# Применение проверенных решений по дублям (tools/out/dedup/final.json):
#   1) tools/dedup_map.json — «код-дубль → основной код»; его читает labs_catalog_build.py (вместе с REMAP),
#      поэтому при любой пересборке каталога дубли не возвращаются, а упоминания в признаках перепривязываются;
#   2) статьи кодов-дублей удаляются (git rm — вернуть можно из истории), если на них нет ссылок;
#   3) пересборка docs/data/labs.json.
# Запуск:  python tools/dedup_apply.py [--final final2.json] --dry   (только показать)
#          python tools/dedup_apply.py [--final final2.json]
# Карта копится: новые решения добавляются к уже применённым, цепочки «дубль → бывший основной → новый основной» сворачиваются.
import argparse, json, os, re, subprocess, sys, urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ART = os.path.join(ROOT, "docs", "articles", "lab-tests")
MAP = os.path.join(ROOT, "tools", "dedup_map.json")
BUILD = os.path.join(ROOT, "tools", "labs_catalog_build.py")

OLD_REMAP_USE = "            code = REMAP.get(code, code)\n"
NEW_REMAP_USE = "            while code in REMAP and REMAP[code] != code: code = REMAP[code]\n"
HOOK_AFTER = 'norm = lambda s: re.sub(r"[^a-zа-яё0-9]+", "", (s or "").lower().replace("ё", "е"))\n'
HOOK = ('# Проверенные решения по дублям (tools/dedup_apply.py): «код-дубль → основной код»\n'
        'if os.path.exists(os.path.join(ROOT, "tools", "dedup_map.json")):\n'
        '    REMAP.update(json.load(open(os.path.join(ROOT, "tools", "dedup_map.json"), encoding="utf-8"))["map"])\n')


def links_to(name, texts):
    pats = {name + ".md", name + ".html", urllib.parse.quote(name) + ".html", urllib.parse.quote(name) + ".md", f'"{name}"'}
    return [f for f, t in texts if any(p in t for p in pats)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry", action="store_true")
    ap.add_argument("--final", default="final.json")
    a = ap.parse_args()
    final = json.load(open(os.path.join(ROOT, "tools", "out", "dedup", a.final), encoding="utf-8"))
    labs = json.load(open(os.path.join(ROOT, "docs", "data", "labs.json"), encoding="utf-8"))["items"]
    mp = {d: m["main"] for m in final["merges"] for d in m["merge"]}
    for d, m in mp.items():
        assert d in labs and m in labs and m not in mp, (d, m)
        assert not labs[d].get("inForm"), f"{d}: код анкеты нельзя вливать"
    full = json.load(open(MAP, encoding="utf-8"))["map"] if os.path.exists(MAP) else {}
    full.update(mp)
    def last(c):
        seen = set()
        while c in full and c not in seen:
            seen.add(c); c = full[c]
        return c
    full = {d: last(d) for d in full}
    assert all(m not in full for m in full.values()), "цикл в карте дублей"

    # тексты, где могут быть ссылки на статьи
    texts = []
    for base in ("docs", "src"):
        for dp, dn, fn in os.walk(os.path.join(ROOT, base)):
            dn[:] = [x for x in dn if x != "node_modules"]
            for f in fn:
                p = os.path.join(dp, f)
                if f.endswith((".md", ".html", ".js", ".ts")) and not (dp == ART and f == "index.md"):
                    texts.append((p, open(p, encoding="utf-8", errors="ignore").read()))
    keep_arts = {it.get("article") for c, it in labs.items() if c not in mp}
    delete, kept = [], []
    for d, m in sorted(mp.items()):
        art = labs[d].get("article")
        if not art:
            continue
        path = os.path.join(ART, art + ".md")
        refs = [os.path.relpath(f, ROOT) for f in links_to(art, texts) if os.path.normcase(f) != os.path.normcase(path)]
        if art in keep_arts:
            kept.append((d, art, "эту статью использует другой код"))
        elif refs:
            kept.append((d, art, "на неё есть ссылки: " + ", ".join(refs[:3])))
        elif os.path.exists(path):
            delete.append((d, m, art))
    print(f"дублей {len(mp)}; статей к удалению {len(delete)}; оставлено {len(kept)}")
    for d, m, art in delete:
        print(f"  удалить: {art}  ({d} → {m}: {labs[m].get('article')})")
    for d, art, why in kept:
        print(f"  оставить: {art} ({d}) — {why}")
    if a.dry:
        return

    json.dump({"about": "Коды-дубли каталога анализов → основной код. Проверено Claude по предложениям yandexgpt-5.1; см. tools/dedup_apply.py.",
               "map": dict(sorted(full.items()))}, open(MAP, "w", encoding="utf-8", newline="\n"), ensure_ascii=False, indent=1)
    src = open(BUILD, encoding="utf-8").read()
    if HOOK not in src:
        assert src.count(HOOK_AFTER) == 1 and src.count(OLD_REMAP_USE) == 1, "labs_catalog_build.py изменился — правка не применена"
        src = src.replace(HOOK_AFTER, HOOK_AFTER + HOOK).replace(OLD_REMAP_USE, NEW_REMAP_USE)
        open(BUILD, "w", encoding="utf-8", newline="\n").write(src)
        print("labs_catalog_build.py: подключён dedup_map.json")
    for d, m, art in delete:
        subprocess.run(["git", "rm", "-q", "--", os.path.relpath(os.path.join(ART, art + ".md"), ROOT)], cwd=ROOT, check=True)
    print(f"удалено статей: {len(delete)}")
    r = subprocess.run([sys.executable, BUILD], cwd=ROOT)
    sys.exit(r.returncode)


if __name__ == "__main__":
    main()
