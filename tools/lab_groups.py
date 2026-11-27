# SPDX-License-Identifier: AGPL-3.0-or-later
# Раздел каталога анализов по материалу («откуда берётся») и подгруппы крови.
# Подставляет group у записей без группы; «Кровь — прочее» раскладывает по подгруппам бланка.
# Вызов: из labs_catalog_build.py или отдельно  python tools/lab_groups.py
import json, os, re
from collections import Counter

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
LABS = os.path.join(ROOT, "docs", "data", "labs.json")

# Материалы (префиксы Настройки → Нормы и веса / setlabs.SECS)
URINE = "Моча — прочее"
STOOL = "Кал — прочее"
SWAB = "Мазки — прочее"
CSF = "Ликвор — прочее"
FLUID = "Другие жидкости — прочее"
TISSUE = "Ткань — прочее"
BREATH = "Выдыхаемый воздух — прочее"
OTHER = "Прочее — прочее"

# Подгруппы крови — как в src/app/fields.ts (бланк)
BLOOD_CBC = "Кровь — общий анализ"
BLOOD_BIO = "Кровь — биохимия"
BLOOD_CARDIO = "Кровь — сердце и сосуды"
BLOOD_COAG = "Кровь — коагулограмма"
BLOOD_ENDO = "Кровь — щитовидная железа, витамины, прочее"
BLOOD_SEX = "Кровь — половые гормоны"
BLOOD_MICRO = "Кровь — микроэлементы"
BLOOD_CULTURE = "Кровь — посевы"
BLOOD_PCR = "Кровь — ПЦР и молекулярное"
BLOOD_AG = "Кровь — антигены"
BLOOD_IMMUNO = "Кровь — иммунология"
BLOOD_ABS = "Кровь — антитела"
BLOOD_ONCO = "Кровь — онкомаркеры"
BLOOD_ALLERGY = "Кровь — аллергология"
BLOOD_OTHER = "Кровь — прочее"


def blob(code, it):
    parts = [code, it.get("name") or "", *(it.get("aliases") or [])]
    t = " ".join(parts).lower().replace("ё", "е")
    return t.replace("‑", "-").replace("–", "-").replace("—", "-").replace("−", "-")


def guess_material(code, it):
    """Материал по явной пометке; без пометки — кровь."""
    t = blob(code, it)
    if re.search(r"\b(feno|выдых|выдыхаем|в выдыхаемом|воздух выдых)", t):
        return BREATH
    if re.search(r"(ликвор|спинномозг|\bcsf\b|цсвж)", t):
        return CSF
    if re.search(r"(в кале|кала\b|копрограм|фекал|стул|\bstool\b|fecal|кал\b|эластаз)", t) and not re.search(r"тканев", t):
        return STOOL
    if re.search(r"(в моче|мочи\b|мочев|суточн\w* моч|\burine\b|урин)", t):
        return URINE
    if re.search(r"(плеврал|синовиал|асцит|амниот|перикард|в выпоте|выпот\b)", t):
        return FLUID
    if re.search(r"(слюн|мазок|мазк|зев\b|носоглот|назофарин|вагин|уретр|цервик|влагалищ|"
                 r"отделяем|мокрот|sputum|ранево|гноя|гной\b|секрет простат|эякулят|сперм)", t):
        return SWAB
    if re.search(r"(биопс|биопт|гистолог|цитолог|имунногист|иммуногист|\bfish\b|ткан(и|ь|ев)|"
                 r"из ткани|в ткани|парафин|костн\w* мозг\w* с посевом|пцр кожи)", t):
        return TISSUE
    if re.search(r"(пот\b|потовая|ногт|волос|кожный соскоб|соскоб с кожи)", t):
        return OTHER
    return None  # кровь (в т.ч. без слова «кровь» в названии)


def guess_blood_subgroup(code, it):
    """Подгруппа крови по смыслу — существующие группы бланка."""
    t = blob(code, it)

    # Аллергология
    if re.search(r"(аллерг|специфическ\w* ige|ige специфич|specific[_ ]?ige|rast\b|immunoCAP|"
                 r"аллерген|триптаз|tryptase)", t):
        return BLOOD_ALLERGY

    # Антитела (к антигенам и аутоантитела) — отдельно от ПЦР/посевов/уровней Ig
    if re.search(r"(антител|антитела|\banti[-_ ]|аутоантитела|"
                 r"антинуклеар|\bana\b|анца|\banca\b|антифосфолипид|\bapl\b|"
                 r"acpa|цитруллин|анти-?тпо|anti-?tpo|\btrab\b|"
                 r"анти-?ro|анти-?la|anti-?ro|anti-?la|ss-?a|ss-?b|"
                 r"musk|ацетилхолин|антистрептолизин|\bas[lл]о\b|"
                 r"нейтрализац|\bprnt\b|криоглобулин)", t):
        return BLOOD_ABS

    # Коагулограмма
    if re.search(r"(коагул|свертыва|ачтв|аптв|мнои?\b|\binr\b|протромбин|тромбин|"
                 r"фибриноген|d-?димер|d-?dimer|антитромбин|протеин [cs]\b|protein [cs]\b|"
                 r"волчаночн|lupus anticoagulant|vwf|фактор (ii|v|vii|viii|ix|x|xi|xii|xiii)|"
                 r"агрегометр|агрегаци\w* тромбоц)", t):
        return BLOOD_COAG

    # Сердце и сосуды
    if re.search(r"(тропонин|troponin|\bbnp\b|nt-?probnp|про-?внп|кфк|ck-?mb|креатинкиназ|"
                 r"миоглобин|аполипопротеин|апо ?[ab]\b|\blp\(a\)\b|липопротеин\(а\)|"
                 r"гомоцистеин|homocystein|сердц|кардиотропин)", t):
        return BLOOD_CARDIO

    # Половые гормоны
    if re.search(r"(тестостерон|эстрадиол|эстрон|прогестерон|прогестин|\bфсг\b|\bлг\b|\bfsh\b|\blh\b|"
                 r"пролактин|амг\b|антимюллер|дгэа|dheas|ингибин|андростендион|shbg|"
                 r"половой гормон|17-?он-?прогестерон|17ohp|\bхгч\b|\bhcg\b)", t):
        return BLOOD_SEX

    # Щитовидная, витамины, прочая эндокринология (сами гормоны/витамины, не антитела)
    if re.search(r"(щитовид|тирео|ттг|\btsh\b|свободн\w* т[34]|ft[34]\b|"
                 r"тиреоглобулин|кальцитонин|"
                 r"витамин|vitamin|\bb12\b|фолат|фолиев|folate|"
                 r"кортизол|актг|\bacth\b|с-?пептид|инсулин|\bhoma\b|"
                 r"паратирео|птг|\bpth\b|альдостерон|ренин|игф|igf-?1|"
                 r"метанефрин|катехоламин|норадреналин|адреналин|дофамин|"
                 r"рост\w* гормон|\bgh\b|соматотроп|дексаметазон|копептин|copeptin|"
                 r"fgf-?23|fgf-?21|контекстн\w* коллаген|\bctx\b|остеокальцин|пинп|p1np)", t):
        return BLOOD_ENDO

    # Онкомаркеры / опухолевые и молекулярно-онкологические из крови
    if re.search(r"(онкомаркер|tumor marker|\bca[- ]?\d|\bcea\b|рэа\b|\bpsa\b|пcа\b|"
                 r"\bhe4\b|\bafp\b|афп\b|cyfra|хромогранин|\bnse\b|\bscc\b|"
                 r"\bher2\b|\ber/pr\b|эстроген.?рецептор|прогестерон.?рецептор|"
                 r"\bmsi\b|dmmr|белок s100|\bmia\b|"
                 r"brca|braf|alk\b|abl1|ctdna|жидкостн\w* биопс|"
                 r"pd-?l1|ki-?67|cldn18|легк\w* цеп|бенса|bence|"
                 r"β2-?микроглобулин|b2m\b|gdf-?15)", t):
        return BLOOD_ONCO

    # Микроэлементы, металлы
    if re.search(r"(микроэлемент|свинец|\blead\b|ртуть|mercury|мышьяк|arsenic|кадмий|"
                 r"алюминий|литий|\blithium\b|магний|селен|\bse\b|цинк|\bzn\b|"
                 r"медь\b|\bcu\b|йод\b|марганец|кобальт|никель|хром в кров)", t):
        return BLOOD_MICRO

    # Общий анализ / гематология клеточная
    if re.search(r"(гемограм|общий анализ кров|ретикулоцит|гематокрит|\bhct\b|"
                 r"эритроцит|\brbc\b|лейкоцит|\bwbc\b|тромбоцит|\bplt\b|"
                 r"нейтрофил|лимфоцит|моноцит|эозинофил|базофил|"
                 r"mcv|mchc|\bmch\b|\brdw\b|соэ|\besr\b|"
                 r"электрофорез гемоглобин|hemoglobin electroph|"
                 r"карбоксигемоглобин|метгемоглобин|cd4|cd8|"
                 r"гаптоглобин|эритропоэтин|\bepo\b|проба кумбса|coombs)", t):
        return BLOOD_CBC

    # Посевы
    if re.search(r"(посев|\bculture\b|бактериологич|чувствительность к противогриб|"
                 r"чувствительность.*антибиот|антибиотикограмм)", t):
        return BLOOD_CULTURE

    # ПЦР и молекулярная диагностика инфекций
    if re.search(r"(пцр|\bpcr\b|наат|\bnaat\b|вирусн\w* нагруз|рнк\b|днк\b|"
                 r"молекулярн|генотипирован\w* резистент|"
                 r"ebv-?dna|hiv.?rna|\bвпч\b|\bhpv\b)", t):
        return BLOOD_PCR

    # Антигены возбудителей
    if re.search(r"(антиген|hbsag|ns1\b|экспресс-?тест на (антиген|грипп|rsv|маляр|стрептокок))", t):
        return BLOOD_AG

    # Иммунология (уровни Ig, комплемент, HLA, цитокины; без антител к…)
    if re.search(r"(иммунолог|\bigg\b|\bigm\b|\biga\b|иммуноглобулин|"
                 r"комплемент|\bc3\b|\bc4\b|hla[-_ ]|"
                 r"интерферон|интерлейкин|\bil-?\d|иммунофенотип|пнг-?клон|"
                 r"flow cytometr|β-?d-?глюкан|beta-?d-?glucan|"
                 r"серолог|аутоиммун|"
                 r"гепатит|\bhiv\b|вич\b|сифилис|герпес|\bhsv\b|\bcmv\b|\bebv\b|"
                 r"хламид|гонокок|трихомонад|микоплазм|уреаплазм|"
                 r"боррел|бартонель|клещев|токсоплазм|краснух|корь\b|паротит|"
                 r"гриб|aspergill|candida|инфекц)", t):
        return BLOOD_IMMUNO

    # Биохимия (ферменты, субстраты, КЩС, нейромаркеры плазмы)
    if re.search(r"(биохим|амилаз|липаз|алт|аст|ггт|щелочн\w* фосфат|"
                 r"билирубин|креатинин|мочевин|uric|мочев\w* кислот|"
                 r"глюкоз|сахар крови|холестерин|триглицерид|лпнп|лпвп|"
                 r"альбумин|белок общ|электрофорез белка|"
                 r"аммиак|церулоплазмин|альфа-?1-?антитрипсин|a1at|"
                 r"железо|ферритин|трансферрин|насыщен\w* трансферрин|тибк|tibc|гепсидин|"
                 r"лактатдегидроген|\bldh\b|кфк общ|"
                 r"газоз|кщс|артериальн\w* (ph|p)|pco2|po2|кислотно|"
                 r"бикарбонат|кетон|гидроксибутират|\bbhb\b|желчн\w* кислот|"
                 r"метилмалонов|\bmma\b|холинэстераз|"
                 r"ангиотензин|аденозиндезаминаз|\bace\b|\bada\b|"
                 r"нейрофиламент|\bnfl\b|p-?tau|тау-?белок|gfap|uchl-?1|"
                 r"алкогол|наркотик|фосфатидилэтанол|\bpeth\b|"
                 r"ph кров|ph артери|газ кров)", t):
        return BLOOD_BIO

    return BLOOD_OTHER


def guess(code, it):
    mat = guess_material(code, it)
    if mat:
        return mat
    return guess_blood_subgroup(code, it)


def refine_blood_other(items):
    """Перекладывает только «Кровь — прочее» в подгруппы."""
    n = Counter()
    for code, it in items.items():
        if it.get("group") != BLOOD_OTHER:
            continue
        g = guess_blood_subgroup(code, it)
        it["group"] = g
        n[g] += 1
    return n


def reclassify_blood(items):
    """Заново раскладывает записи «Кровь — …»; биопсии и т.п. уводит в свой материал."""
    n = Counter()
    for code, it in items.items():
        g0 = it.get("group") or ""
        if not g0.startswith("Кровь"):
            continue
        mat = guess_material(code, it)
        g = mat if mat else guess_blood_subgroup(code, it)
        if g != g0:
            n[f"{g0} → {g}"] += 1
        it["group"] = g
    return n


def apply(items):
    """Пустые group → угадать; затем доразложить кровь (в т.ч. при сборке каталога)."""
    n = Counter()
    for code, it in items.items():
        if it.get("group"):
            continue
        g = guess(code, it)
        it["group"] = g
        n[g] += 1
    refine_blood_other(items)
    reclassify_blood(items)
    return n


def main():
    data = json.load(open(LABS, encoding="utf-8"))
    # apply уже делает refine + reclassify; для уже заполненного каталога — ещё раз reclassify
    n0 = apply(data["items"])
    n2 = reclassify_blood(data["items"])
    with open(LABS, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=1)
        fh.write("\n")
    blood = Counter(it["group"] for it in data["items"].values() if (it.get("group") or "").startswith("Кровь"))
    print("новых без группы:", dict(n0))
    print("перекладки:", sum(n2.values()), "записей")
    print("сейчас группы крови:", dict(blood.most_common()))
    print("ткань:", sum(1 for it in data["items"].values() if (it.get("group") or "").startswith("Ткань")))


if __name__ == "__main__":
    main()
