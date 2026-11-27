# SPDX-License-Identifier: AGPL-3.0-or-later
# Перенос предложений норм из tools/out/norms_proposed.json в docs/data/norms.json.
# Без ручного ревью: берёт low/high из предложений ИИ (или другого источника), пишет norm/range.
# Уточнение норм позже — автоматизированно по данным лабораторий, не руками.
#
#   python tools/norms_apply.py
#
# Норма одним числом — середина интервала «a–b», половина верхней границы для «до X».
# Только нижняя граница (high = null) пока пропускается: кривая критичности так не умеет.
import json, os, re

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
UNITS = {"u/l": "Ед/л", "u/л": "Ед/л", "ед/л": "Ед/л", "iu/ml": "МЕ/мл", "iu/мл": "МЕ/мл", "iu/дл": "МЕ/дл", "u/ml": "Ед/мл", "u/мл": "Ед/мл",
         "pg/ml": "пг/мл", "ng/ml": "нг/мл", "µg/dl": "мкг/дл", "µg/l": "мкг/л", "nmol/l": "нмоль/л", "pmol/l": "пмоль/л", "mg/dl": "мг/дл",
         "mmol/l": "ммоль/л", "g/l": "г/л", "cells/µl": "клеток/мкл", "cells/ml": "клеток/мл", "µg/24 h": "мкг/сут", "µmol/24h": "мкмоль/сут",
         "мг/24ч": "мг/сут", "мг/24 ч": "мг/сут", "мкг/24ч": "мкг/сут", "мкг/24 ч": "мкг/сут", "ммhg": "мм рт. ст.", "ммн₂o": "мм вод. ст.",
         "ммh₂o": "мм вод. ст.", "мau/мл": "мЕД/мл", "copies/ml": "копий/мл", "db/m": "дБ/м", "u/g hb": "Ед/г Hb", "bethesda units": "ед. Бетесда",
         "cfu/g": "КОЕ/г", "ratio": "", "отношение": "", "нг/мдл": "", "мкме/мл": "МЕ/мл", "кл/мкл": "клеток/мкл", "u/dl": "Ед/дл", "u/г hb": "Ед/г Hb", "µg/ml": "мкг/мл", "mg/l": "мг/л"}
fmt = lambda x: ("%g" % x).replace(".", ",")


def main():
    prop_path = os.path.join(ROOT, "tools", "out", "norms_proposed.json")
    if not os.path.isfile(prop_path):
        print("нет файла", prop_path); return
    prop = json.load(open(prop_path, encoding="utf-8"))
    npath = os.path.join(ROOT, "docs", "data", "norms.json")
    lpath = os.path.join(ROOT, "docs", "data", "labs.json")
    norms, labs = json.load(open(npath, encoding="utf-8")), json.load(open(lpath, encoding="utf-8"))
    ok, skipped = [], []
    for code, p in prop.items():
        l = labs["items"].get(code)
        if not l:
            continue
        low, high = p.get("low"), p.get("high")
        if high is None:
            skipped.append((code, l["name"], "нет верхней границы")); continue
        u = re.sub(r"[\u00a0\u202f\s]+", " ", str(p.get("unit") or "")).strip()
        unit = UNITS.get(u.lower(), u)
        if low in (None, 0):
            rng, norm = f"до {fmt(high)}", high / 2
        else:
            rng, norm = f"{fmt(low)}–{fmt(high)}", (low + high) / 2
        norm = float(("%.3g" % norm))
        norms["items"][code] = {
            "name": l["name"], "unit": unit, "section": l.get("group") or "Справочник анализов",
            "norm": norm, "range": rng,
        }
        if unit:
            l["unit"] = unit
        ok.append((code, l["name"], f"{rng} {unit}".strip()))
    json.dump(norms, open(npath, "w", encoding="utf-8", newline="\n"), ensure_ascii=False, indent=2)
    json.dump(labs, open(lpath, "w", encoding="utf-8", newline="\n"), ensure_ascii=False, indent=1)
    print(f"записано {len(ok)}, пропущено {len(skipped)}")
    for c, n, r in skipped[:20]:
        print(f"  skip {c} {n}: {r}")


if __name__ == "__main__":
    main()
