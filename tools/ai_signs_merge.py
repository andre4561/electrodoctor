# SPDX-License-Identifier: AGPL-3.0-or-later
# Собрать черновики признаков (tools/out/signs/<модель>/*.json) в docs/data/signs.json.
# Уже записанные диагнозы не трогаются, если не указать --overwrite.
# Заодно — список анализов, которых нет в анкете, но которые ИИ счёл важными: tools/out/nolist.md
# Запуск:  python tools/ai_signs_merge.py --model gpt-oss-120b [--overwrite] [--names ...]
import argparse, collections, json, os

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
SIGNS = os.path.join(ROOT, "docs", "data", "signs.json")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True)
    ap.add_argument("--overwrite", action="store_true")
    ap.add_argument("--names", nargs="*")
    a = ap.parse_args()
    src_dir = os.path.join(ROOT, "tools", "out", "signs", a.model)
    data = json.load(open(SIGNS, encoding="utf-8"))
    items = data.setdefault("items", {})
    added = kept = 0
    for f in sorted(os.listdir(src_dir)):
        if not f.endswith(".json"):
            continue
        name = f[:-5]
        if a.names and name not in a.names:
            continue
        if name in items and not a.overwrite:
            kept += 1; continue
        items[name] = json.load(open(os.path.join(src_dir, f), encoding="utf-8"))["signs"]
        added += 1
    data["items"] = dict(sorted(items.items()))
    with open(SIGNS, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=1); fh.write("\n")
    # анализы, которых нет в анкете: сколько раз ИИ их назвал и у каких диагнозов
    cnt, where = collections.Counter(), collections.defaultdict(list)
    for name, s in data["items"].items():
        for x in s.get("nolist", []):
            k = x["name"].strip().rstrip(".")
            cnt[k] += 1; where[k].append(name)
    lines = ["# Анализы, которых нет в анкете", "", "ИИ счёл их важными для диагнозов, но в кабинете на вкладке «Анализы» таких полей нет.", ""]
    lines += [f"- **{k}** — {n}: {', '.join(where[k][:8])}{' …' if len(where[k]) > 8 else ''}" for k, n in cnt.most_common()]
    open(os.path.join(ROOT, "tools", "out", "nolist.md"), "w", encoding="utf-8").write("\n".join(lines) + "\n")
    print(f"added={added} kept={kept} total={len(data['items'])} nolist={len(cnt)}")


if __name__ == "__main__":
    main()
