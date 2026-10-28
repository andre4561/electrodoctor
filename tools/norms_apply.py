# SPDX-License-Identifier: AGPL-3.0-or-later
# Перенос проверенных норм из tools/out/norms_proposed.json (предложения ИИ) в docs/data/norms.json.
# Проверку делал Claude: правила и правки ниже; отчёт — tools/out/norms_review.md.
#   • confidence "low" — не берём;
#   • только нижняя граница («чем больше, тем лучше», например СКФ ≥ 90) — пока не берём: кривая так не умеет;
#   • REJECT — неверно или нормы как таковой нет (лекарства и яды, «терапевтический диапазон», показатели зависят от набора);
#   • FIX — исправления;
#   • единицы переводятся на русские; в справочнике (labs.json) у анализа ставятся те же единицы, что у нормы.
# Норма одним числом — как у остальных: середина интервала «a–b», половина верхней границы для «до X».
import json, os, re

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
REJECT = {
    "HEXA_ACTIVITY": "единицы зависят от метода (обычно доля гексозаминидазы A от общей, %)",
    "ARYL_SULFATASE_A": "единицы и нормы сильно зависят от метода",
    "HEPCIDIN": "норма сильно зависит от метода (ИИ дал 30–120 нг/мл, у многих методов 1–55)",
    "TRIPTASE": "дубль TRYPTASE с неверным интервалом (15–110 Ед/л)",
    "URINE_METANEPHRINES": "неверные единицы и порог (< 0,2 мкг/сут)",
    "SALICYLATES_BLOOD": "лекарство: нормы нет, терапевтический уровень указан неверно",
    "PARACETAMOL_LEVEL": "лекарство: нормы нет (у здорового — не обнаруживается)",
    "PARACETAMOL_PLASMA": "лекарство: нормы нет",
    "ANTI_XA": "это терапевтический диапазон при лечении, а не норма",
    "SMN_COPY_NUMBER": "генетический тест; норма SMN1 — 2 копии, а не 1–2",
    "AFP_MATERNAL": "у беременных АФП оценивают в МоМ по сроку, единой нормы нет",
    "AFP_NEONATAL": "у новорождённых АФП очень высокий и быстро падает, «< 20 нг/мл» неверно",
    "DENGUE_IGG": "порог зависит от набора; результат — положительно/отрицательно",
    "DENGUE_IGM": "порог зависит от набора",
    "COCCIDIOIDES_IGG": "порог зависит от набора", "COCCIDIOIDES_IGM": "порог зависит от набора",
    "ASPERGILLUS_IGG": "порог зависит от набора",
    "RUBELLA_IGG": "это порог иммунитета, а не норма", "RUBELLA_IGM": "порог зависит от набора; в названии ошибка (паротит)",
    "URINE_CITRATE": "нужна суточная экскреция, а не концентрация",
    "TELOMERE_LENGTH": "нет стандартизованной нормы",
    "METANEPHRINES": "сумма метанефрина и норметанефрина — неверно; нормы раздельные",
    "METANEFRIN": "дубль, нормы метанефрина и норметанефрина раздельные",
    "CTX": "интервал занижен в 10 раз",
    "THIAMINE": "единицы и интервал не сходятся (70–180 — это нмоль/л тиаминдифосфата в цельной крови)",
}
FIX = {   # code: (unit, low, high, note)
    "IGG4": ("г/л", 0.08, 1.4, "у взрослых; в мг/дл это 8–140"),
    "CALCITONIN": ("пг/мл", None, 10, "мужчины до 8–10, женщины до 5 пг/мл; ИИ предложил 0,5 нг/мл — в 50 раз выше"),
    "METANEPHRINES_24H": ("мкг/сут", None, 350, "метанефрин; норметанефрин — до 600 мкг/сут"),
    "HCV_RNA": ("МЕ/мл", None, 15, "ниже предела обнаружения — вирус не найден"),
    "HAV_RNA": ("МЕ/мл", None, 10, "ниже предела обнаружения"),
    "HBV_DNA": ("МЕ/мл", None, 20, "ниже предела обнаружения"),
    "CERULOPLASMIN": ("мг/дл", 20, 60, "у взрослых (0,2–0,6 г/л); ниже 20 мг/дл — повод исключить болезнь Вильсона; ИИ предложил 200–400 мг/дл — в 10 раз выше"),
    "RENIN": ("нг/мл/ч", 0.2, 3.3, "активность ренина плазмы: лёжа 0,2–1,6, стоя 0,7–3,3; прямая концентрация ренина — в мкМЕ/мл (≈3–40), это другие единицы"),
    "METANEPHRINES_PLASMA": ("нмоль/л", None, 0.5, "свободный метанефрин; норметанефрин — до ~1 нмоль/л; в пг/мл это до 90 и до 180; ИИ указал мкг/л — в 5 раз выше"),
    "PLASMA_FREE_METANEPHRINES": ("нмоль/л", None, 0.5, "свободный метанефрин; норметанефрин — до ~1 нмоль/л"),
    "PLASMA_METANEPHRINES": ("нмоль/л", None, 0.5, "свободный метанефрин; норметанефрин — до ~1 нмоль/л"),
    "PROTOPORPHYRIN": ("мкг/дл", None, 35, "в цельной крови; растёт при дефиците железа и отравлении свинцом; ИИ предложил 0,2–0,8 — в 40 раз ниже"),
    "LYSOZYME": ("мкг/мл", 3, 10, "сыворотка; повышен при саркоидозе, моноцитарных лейкозах; ИИ предложил 15–30"),
    "CORTISOL_PLASMA_NIGHT": ("мкг/дл", None, 1.8, "в полночь во сне; выше 1,8 — повод исключить синдром Кушинга (в бодрствовании порог 7,5)"),
    "FREE_LIGHT_CHAINS": ("мг/л", 3.3, 19.4, "свободные κ 3,3–19,4 мг/л; λ 5,7–26,3 мг/л; соотношение κ/λ 0,26–1,65"),
    "COPEPTIN": ("пмоль/л", 1, 14, "базальный уровень у здоровых; ИИ предложил 4–43"),
    "CSF_SERUM_AB_INDEX": ("", None, 1.5, "индекс антител по Рейберу; ≥ 1,5 — синтез антител в ЦНС; ИИ предложил 0,7"),
    "DIALYSATE_WBC": ("клеток/мкл", None, 100, "перитонеальный диализат; > 100/мкл и > 50 % нейтрофилов — перитонит"),
    "ETHYLGLUCURONIDE": ("нг/мл", None, 100, "порог положительного результата 100–500 нг/мл в зависимости от задачи; ИИ предложил 20 мкг/л"),
    "VWF_AG": ("%", 50, 150, "то же, что 50–150 МЕ/дл; ИИ указал МЕ/мл — в 100 раз выше"),
    "ASPERGILLUS_SPECIFIC_IGE": ("кЕд/л", None, 0.35, "класс 0; специфический IgE измеряют в кЕд/л (kUA/L)"),
    "SPECIFIC_IGE_VENOM": ("кЕд/л", None, 0.35, "класс 0; специфический IgE измеряют в кЕд/л (kUA/L)"),
    "MOLECULAR_ALLERGO_DIAG": ("кЕд/л", None, 0.35, "для ImmunoCAP; в ISAC — ISU-E, порог 0,3"),
    "BONE_ALP": ("мкг/л", 5, 20, "масса костной ЩФ; при определении активности ~12–43 Ед/л"),
    "CORTISOL_SALIVA_NIGHT": ("мкг/дл", None, 0.15, "слюна в 23–24 ч; ~4 нмоль/л; ИИ предложил 0,5 мкг/дл"),
    "ARR": ("", None, 30, "альдостерон (нг/дл) / активность ренина (нг/мл/ч); порог зависит от единиц"),
}
UNITS = {"u/l": "Ед/л", "u/л": "Ед/л", "ед/л": "Ед/л", "iu/ml": "МЕ/мл", "iu/мл": "МЕ/мл", "iu/дл": "МЕ/дл", "u/ml": "Ед/мл", "u/мл": "Ед/мл",
         "pg/ml": "пг/мл", "ng/ml": "нг/мл", "µg/dl": "мкг/дл", "µg/l": "мкг/л", "nmol/l": "нмоль/л", "pmol/l": "пмоль/л", "mg/dl": "мг/дл",
         "mmol/l": "ммоль/л", "g/l": "г/л", "cells/µl": "клеток/мкл", "cells/ml": "клеток/мл", "µg/24 h": "мкг/сут", "µmol/24h": "мкмоль/сут",
         "мг/24ч": "мг/сут", "мг/24 ч": "мг/сут", "мкг/24ч": "мкг/сут", "мкг/24 ч": "мкг/сут", "ммhg": "мм рт. ст.", "ммн₂o": "мм вод. ст.",
         "ммh₂o": "мм вод. ст.", "мau/мл": "мЕД/мл", "copies/ml": "копий/мл", "db/m": "дБ/м", "u/g hb": "Ед/г Hb", "bethesda units": "ед. Бетесда",
         "cfu/g": "КОЕ/г", "ratio": "", "отношение": "", "нг/мдл": "", "мкме/мл": "МЕ/мл", "кл/мкл": "клеток/мкл", "u/dl": "Ед/дл", "u/г hb": "Ед/г Hb", "µg/ml": "мкг/мл", "mg/l": "мг/л"}
fmt = lambda x: ("%g" % x).replace(".", ",")


def main():
    prop = json.load(open(os.path.join(ROOT, "tools", "out", "norms_proposed.json"), encoding="utf-8"))
    npath, lpath = os.path.join(ROOT, "docs", "data", "norms.json"), os.path.join(ROOT, "docs", "data", "labs.json")
    norms, labs = json.load(open(npath, encoding="utf-8")), json.load(open(lpath, encoding="utf-8"))
    ok, fixed, rej, skipped = [], [], [], []
    for code, p in prop.items():
        l = labs["items"].get(code)
        if not l: continue
        if code in REJECT:
            if str(norms["items"].get(code, {}).get("source", "")).startswith("предложено ИИ"): del norms["items"][code]
            rej.append((code, l["name"], REJECT[code])); continue
        unit, low, high, note = FIX.get(code, (p.get("unit") or "", p.get("low"), p.get("high"), p.get("note") or ""))
        if code not in FIX and p.get("confidence") == "low": skipped.append((code, l["name"], "ИИ не уверен")); continue
        if high is None: skipped.append((code, l["name"], "только нижняя граница — пока не умеем" if low is not None else "нет интервала")); continue
        u = re.sub(r"[\u00a0\u202f\s]+", " ", unit).strip()
        unit = UNITS.get(u.lower(), u)
        if low in (None, 0): rng, norm = f"до {fmt(high)}", high / 2
        else: rng, norm = f"{fmt(low)}–{fmt(high)}", (low + high) / 2
        norm = float(("%.3g" % norm))
        norms["items"][code] = {"name": l["name"], "unit": unit, "section": "Справочник анализов", "norm": norm, "range": rng,
                                **({"note": note} if note else {}),
                                "source": "предложено ИИ (gpt-oss-120b), проверено Claude" + (" с исправлением" if code in FIX else "") + "; середина интервала; кривая — по интервалу"}
        l["unit"] = unit
        (fixed if code in FIX else ok).append((code, l["name"], f"{rng} {unit}".strip()))
    json.dump(norms, open(npath, "w", encoding="utf-8", newline="\n"), ensure_ascii=False, indent=2)
    json.dump(labs, open(lpath, "w", encoding="utf-8", newline="\n"), ensure_ascii=False, indent=1)
    rep = ["# Проверка норм, предложенных ИИ", "", f"Принято: {len(ok)}, исправлено: {len(fixed)}, отклонено: {len(rej)}, отложено: {len(skipped)}.", "",
           "## Исправлено", ""] + [f"- {n} (`{c}`): {r}" for c, n, r in fixed] + ["", "## Отклонено", ""] + [f"- {n} (`{c}`): {r}" for c, n, r in rej] + \
          ["", "## Отложено", ""] + [f"- {n} (`{c}`): {r}" for c, n, r in skipped] + ["", "## Принято", ""] + [f"- {n} (`{c}`): {r}" for c, n, r in ok]
    open(os.path.join(ROOT, "tools", "out", "norms_review.md"), "w", encoding="utf-8").write("\n".join(rep) + "\n")
    print(f"принято {len(ok)}, исправлено {len(fixed)}, отклонено {len(rej)}, отложено {len(skipped)}")


if __name__ == "__main__":
    main()
