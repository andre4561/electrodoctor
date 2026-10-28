export const STEPS = [
    {
        id: "general", title: "Общее",
        sections: [
            { title: "Клиент", fields: [
                    { code: "NAME", label: "Имя или псевдоним", type: "text", required: true,
                        hint: "Лучше псевдоним или инициалы — данные хранятся только на этом компьютере" },
                    { code: "SEX", label: "Пол", type: "select", options: [["F", "женский"], ["M", "мужской"]] },
                    { code: "AGE", label: "Возраст", type: "number", unit: "лет", min: 0, max: 120, step: 1 },
                    { code: "VISIT_REASON", label: "Повод обращения", type: "textarea" }
                ] },
            { title: "Жалобы", fields: [
                    { code: "C_FATIGUE", label: "Слабость, усталость", type: "yesno" },
                    { code: "PAIN_CHEST", label: "Боль в груди", type: "yesno" },
                    { code: "PAIN_CHEST_PRESSING", label: "Боль в груди: давящая", type: "yesno" },
                    { code: "PAIN_CHEST_STABBING", label: "Боль в груди: колющая", type: "yesno" },
                    { code: "PAIN_CHEST_IRRAD_LARM", label: "Боль в груди: отдаёт в левую руку", type: "yesno" },
                    { code: "PAIN_CHEST_EXERTION", label: "Боль в груди: при нагрузке", type: "yesno" },
                    { code: "PAIN_CHEST_RELIEF_REST", label: "Боль в груди: проходит в покое", type: "yesno" },
                    { code: "PAIN_CHEST_NRS", label: "Боль в груди: интенсивность", type: "scale", max: 10 },
                    { code: "COMPLAINTS_OTHER", label: "Другие жалобы", type: "textarea" }
                ] },
            { title: "Заметки", fields: [
                    { code: "NOTES", label: "Заметки", type: "textarea" }
                ] }
        ]
    },
    {
        id: "params", title: "Параметры",
        sections: [
            { title: "Тело", fields: [
                    { code: "HEIGHT", label: "Рост", type: "number", unit: "см", min: 50, max: 250, step: 1 },
                    { code: "WEIGHT", label: "Вес", type: "number", unit: "кг", min: 2, max: 400, step: 0.1 },
                    { code: "BMI", label: "Индекс массы тела", type: "number", unit: "кг/м²", computed: "bmi" },
                    { code: "WAIST", label: "Окружность талии", type: "number", unit: "см", min: 30, max: 250, step: 1 }
                ] },
            { title: "Жизненные показатели", fields: [
                    { code: "BP_SYS", label: "Давление систолическое", type: "number", unit: "мм рт. ст.", min: 50, max: 300, step: 1 },
                    { code: "BP_DIA", label: "Давление диастолическое", type: "number", unit: "мм рт. ст.", min: 30, max: 200, step: 1 },
                    { code: "PULSE", label: "Пульс", type: "number", unit: "уд/мин", min: 20, max: 250, step: 1 },
                    { code: "TEMP", label: "Температура", type: "number", unit: "°C", min: 30, max: 45, step: 0.1 },
                    { code: "SPO2", label: "Сатурация", type: "number", unit: "%", min: 50, max: 100, step: 1 }
                ] },
            { title: "Осмотр", fields: [
                    { code: "EDEMA_LEGS", label: "Отёки ног", type: "scale", max: 3 }
                ] },
            { title: "Генетика", fields: [
                    { code: "GEN_TESTS", label: "Результаты", type: "table", columns: [
                            { key: "test", label: "Ген / маркер", type: "text", placeholder: "MTHFR C677T" },
                            { key: "result", label: "Результат (генотип)", type: "text" },
                            { key: "meaning", label: "Значение", type: "text" },
                            { key: "lab", label: "Лаборатория", type: "text" }
                        ] },
                    { code: "GEN_NOTES", label: "Заметки по генетике", type: "textarea" }
                ] }
        ]
    },
    {
        id: "labs", title: "Анализы",
        sections: [
            { id: "ai", title: "Загрузить анализы через ИИ", fold: true, fields: [
                    { code: "AI_IMPORT", label: "Загрузить анализы через ИИ", type: "aiimport" }
                ] },
            { title: "", fields: [
                    // Загрузка фото на свой сервер пока выключена: распознаёт ИИ, которого выбирает сам человек.
                    { code: "LAB_FILES", label: "Фото и файлы анализов", type: "files", hidden: true,
                        hint: "Распознавание пока не подключено: файлы сохраняются, значения вносятся вручную" }
                ] },
            { id: "blood_cbc", title: "Кровь — общий анализ", fold: true, fields: [
                    { code: "HGB", label: "Гемоглобин", type: "number", unit: "г/л", step: "any" },
                    { code: "RBC", label: "Эритроциты", type: "number", unit: "×10¹²/л", step: "any" },
                    { code: "HCT", label: "Гематокрит", type: "number", unit: "%", step: "any" },
                    { code: "MCV", label: "Средний объём эритроцита (MCV)", type: "number", unit: "фл", step: "any" },
                    { code: "MCH", label: "Среднее содержание гемоглобина в эритроците (MCH)", type: "number", unit: "пг", step: "any" },
                    { code: "MCHC", label: "Средняя концентрация гемоглобина в эритроците (MCHC)", type: "number", unit: "г/л", step: "any" },
                    { code: "RDW", label: "Ширина распределения эритроцитов (RDW)", type: "number", unit: "%", step: "any" },
                    { code: "RETIC", label: "Ретикулоциты", type: "number", unit: "%", step: "any" },
                    { code: "WBC", label: "Лейкоциты", type: "number", unit: "×10⁹/л", step: "any" },
                    { code: "NEUT_PCT", label: "Нейтрофилы", type: "number", unit: "%", step: "any" },
                    { code: "LYMPH_PCT", label: "Лимфоциты", type: "number", unit: "%", step: "any" },
                    { code: "MONO_PCT", label: "Моноциты", type: "number", unit: "%", step: "any" },
                    { code: "EOS_PCT", label: "Эозинофилы", type: "number", unit: "%", step: "any" },
                    { code: "BASO_PCT", label: "Базофилы", type: "number", unit: "%", step: "any" },
                    { code: "PLT", label: "Тромбоциты", type: "number", unit: "×10⁹/л", step: "any" },
                    { code: "ESR", label: "СОЭ", type: "number", unit: "мм/ч", step: "any" }
                ] },
            { id: "blood_bio", title: "Кровь — биохимия", fold: true, fields: [
                    { code: "GLU", label: "Глюкоза", type: "number", unit: "ммоль/л", step: "any" },
                    { code: "HBA1C", label: "Гликированный гемоглобин (HbA1c)", type: "number", unit: "%", step: "any" },
                    { code: "CHOL", label: "Холестерин общий", type: "number", unit: "ммоль/л", step: "any" },
                    { code: "LDL", label: "Холестерин ЛПНП", type: "number", unit: "ммоль/л", step: "any" },
                    { code: "HDL", label: "Холестерин ЛПВП", type: "number", unit: "ммоль/л", step: "any" },
                    { code: "TG", label: "Триглицериды", type: "number", unit: "ммоль/л", step: "any" },
                    { code: "ALT", label: "АЛТ", type: "number", unit: "Ед/л", step: "any" },
                    { code: "AST", label: "АСТ", type: "number", unit: "Ед/л", step: "any" },
                    { code: "GGT", label: "ГГТ", type: "number", unit: "Ед/л", step: "any" },
                    { code: "ALP", label: "Щелочная фосфатаза", type: "number", unit: "Ед/л", step: "any" },
                    { code: "TBIL", label: "Билирубин общий", type: "number", unit: "мкмоль/л", step: "any" },
                    { code: "DBIL", label: "Билирубин прямой", type: "number", unit: "мкмоль/л", step: "any" },
                    { code: "TP", label: "Общий белок", type: "number", unit: "г/л", step: "any" },
                    { code: "ALB", label: "Альбумин", type: "number", unit: "г/л", step: "any" },
                    { code: "CREA", label: "Креатинин", type: "number", unit: "мкмоль/л", step: "any" },
                    { code: "UREA", label: "Мочевина", type: "number", unit: "ммоль/л", step: "any" },
                    { code: "UA", label: "Мочевая кислота", type: "number", unit: "мкмоль/л", step: "any" },
                    { code: "CRP", label: "С-реактивный белок", type: "number", unit: "мг/л", step: "any" },
                    { code: "FE", label: "Железо сывороточное", type: "number", unit: "мкмоль/л", step: "any" },
                    { code: "FERRITIN", label: "Ферритин", type: "number", unit: "нг/мл", step: "any" },
                    { code: "K", label: "Калий", type: "number", unit: "ммоль/л", step: "any" },
                    { code: "NA", label: "Натрий", type: "number", unit: "ммоль/л", step: "any" },
                    { code: "CA", label: "Кальций общий", type: "number", unit: "ммоль/л", step: "any" },
                    { code: "MG", label: "Магний", type: "number", unit: "ммоль/л", step: "any" },
                    { code: "LIPASE", label: "Липаза", type: "number", unit: "Ед/л", step: "any" },
                    { code: "AMYLASE_P", label: "Амилаза панкреатическая", type: "number", unit: "Ед/л", step: "any" },
                    { code: "CYSC", label: "Цистатин C", type: "number", unit: "мг/л", step: "any" }
                ] },
            { id: "blood_cardio", title: "Кровь — сердце и сосуды", fold: true, fields: [
                    { code: "TROPONIN", label: "Тропонин I (высокочувствительный)", type: "number", unit: "нг/л", step: "any" },
                    { code: "NT_PROBNP", label: "NT-proBNP", type: "number", unit: "пг/мл", step: "any" },
                    { code: "BNP", label: "BNP (натрийуретический пептид)", type: "number", unit: "пг/мл", step: "any" },
                    { code: "CK", label: "Креатинкиназа (КФК) общая", type: "number", unit: "Ед/л", step: "any" },
                    { code: "CK_MB", label: "КФК-МВ", type: "number", unit: "Ед/л", step: "any" },
                    { code: "MYOGLOBIN", label: "Миоглобин", type: "number", unit: "нг/мл", step: "any" },
                    { code: "LPA", label: "Липопротеин(a)", type: "number", unit: "мг/дл", step: "any" },
                    { code: "APOB", label: "Аполипопротеин B", type: "number", unit: "г/л", step: "any" },
                    { code: "APOA1", label: "Аполипопротеин A1", type: "number", unit: "г/л", step: "any" },
                    { code: "HCY", label: "Гомоцистеин", type: "number", unit: "мкмоль/л", step: "any" },
                    { code: "LDH", label: "Лактатдегидрогеназа (ЛДГ)", type: "number", unit: "Ед/л", step: "any" },
                    { code: "LACTATE", label: "Лактат", type: "number", unit: "ммоль/л", step: "any" }
                ] },
            { id: "blood_coag", title: "Кровь — коагулограмма", fold: true, fields: [
                    { code: "PT_SEC", label: "Протромбиновое время", type: "number", unit: "с", step: "any" },
                    { code: "PT_QUICK", label: "Протромбин по Квику", type: "number", unit: "%", step: "any" },
                    { code: "INR", label: "МНО", type: "number", unit: "", step: "any" },
                    { code: "APTT", label: "АЧТВ", type: "number", unit: "с", step: "any" },
                    { code: "FIBRINOGEN", label: "Фибриноген", type: "number", unit: "г/л", step: "any" },
                    { code: "TT", label: "Тромбиновое время", type: "number", unit: "с", step: "any" },
                    { code: "DDIMER", label: "D-димер", type: "number", unit: "нг/мл FEU", step: "any" },
                    { code: "ANTITHROMBIN", label: "Антитромбин III", type: "number", unit: "%", step: "any" }
                ] },
            { id: "blood_other", title: "Кровь — щитовидная железа, витамины, прочее", fold: true, fields: [
                    { code: "TSH", label: "ТТГ", type: "number", unit: "мЕд/л", step: "any" },
                    { code: "FT4", label: "Т4 свободный", type: "number", unit: "пмоль/л", step: "any" },
                    { code: "FT3", label: "Т3 свободный", type: "number", unit: "пмоль/л", step: "any" },
                    { code: "VITD", label: "Витамин D (25-OH)", type: "number", unit: "нг/мл", step: "any" },
                    { code: "B12", label: "Витамин B12", type: "number", unit: "пг/мл", step: "any" },
                    { code: "FOLATE", label: "Фолиевая кислота", type: "number", unit: "нг/мл", step: "any" },
                    { code: "INSULIN", label: "Инсулин", type: "number", unit: "мкЕд/мл", step: "any" },
                    { code: "CORTISOL", label: "Кортизол", type: "number", unit: "нмоль/л", step: "any" },
                    { code: "CPEP", label: "С-пептид", type: "number", unit: "нг/мл", step: "any" },
                    { code: "HOMA", label: "Индекс HOMA-IR", type: "number", unit: "", step: "any" },
                    { code: "ACTH", label: "АКТГ", type: "number", unit: "пг/мл", step: "any" },
                    { code: "LABS_OTHER", label: "Другие показатели", type: "table", columns: [
                            { key: "name", label: "Показатель", type: "text" },
                            { key: "value", label: "Значение", type: "text" },
                            { key: "unit", label: "Ед.", type: "text" },
                            { key: "date", label: "День", type: "text", placeholder: "day0" }
                        ] }
                ] },
            { id: "blood_sex", title: "Кровь — половые гормоны", fold: true, fields: [
                    { code: "LH", label: "ЛГ", type: "number", unit: "мЕд/мл", step: "any" },
                    { code: "FSH", label: "ФСГ", type: "number", unit: "мЕд/мл", step: "any" },
                    { code: "PRL", label: "Пролактин", type: "number", unit: "мЕд/л", step: "any" },
                    { code: "E2", label: "Эстрадиол", type: "number", unit: "пмоль/л", step: "any" },
                    { code: "PROG", label: "Прогестерон", type: "number", unit: "нмоль/л", step: "any" },
                    { code: "TESTO", label: "Тестостерон общий", type: "number", unit: "нмоль/л", step: "any" },
                    { code: "TESTO_FREE", label: "Тестостерон свободный", type: "number", unit: "пг/мл", step: "any" },
                    { code: "SHBG", label: "ГСПГ (SHBG)", type: "number", unit: "нмоль/л", step: "any" },
                    { code: "DHEAS", label: "ДГЭА-сульфат", type: "number", unit: "мкмоль/л", step: "any" },
                    { code: "AMH", label: "Антимюллеров гормон", type: "number", unit: "нг/мл", step: "any" },
                    { code: "HCG", label: "ХГЧ", type: "number", unit: "мЕд/мл", step: "any" }
                ] },
            { id: "blood_micro", title: "Кровь — микроэлементы", fold: true, fields: [
                    { code: "CA_ION", label: "Кальций ионизированный", type: "number", unit: "ммоль/л", step: "any" },
                    { code: "P", label: "Фосфор неорганический", type: "number", unit: "ммоль/л", step: "any" },
                    { code: "CL", label: "Хлор", type: "number", unit: "ммоль/л", step: "any" },
                    { code: "ZN", label: "Цинк", type: "number", unit: "мкмоль/л", step: "any" },
                    { code: "CU", label: "Медь", type: "number", unit: "мкмоль/л", step: "any" },
                    { code: "SE", label: "Селен", type: "number", unit: "мкг/л", step: "any" },
                    { code: "IODINE", label: "Йод", type: "number", unit: "мкг/л", step: "any" }
                ] },
            { id: "blood_immuno", title: "Кровь — инфекции и иммунология", fold: true, fields: [
                    { code: "HBSAG", label: "Гепатит B: HBsAg", type: "select", options: [["не обнаружено", "не обнаружено"], ["обнаружено", "обнаружено"], ["сомнительно", "сомнительно"]] },
                    { code: "ANTI_HCV", label: "Гепатит C: антитела (anti-HCV)", type: "select", options: [["не обнаружено", "не обнаружено"], ["обнаружено", "обнаружено"], ["сомнительно", "сомнительно"]] },
                    { code: "HIV", label: "ВИЧ: антиген и антитела", type: "select", options: [["не обнаружено", "не обнаружено"], ["обнаружено", "обнаружено"], ["сомнительно", "сомнительно"]] },
                    { code: "SYPHILIS", label: "Сифилис: антитела к Treponema pallidum", type: "select", options: [["не обнаружено", "не обнаружено"], ["обнаружено", "обнаружено"], ["сомнительно", "сомнительно"]] },
                    { code: "HPYLORI", label: "Helicobacter pylori: антитела IgG", type: "select", options: [["не обнаружено", "не обнаружено"], ["обнаружено", "обнаружено"], ["сомнительно", "сомнительно"]] },
                    { code: "IGA", label: "Иммуноглобулин A", type: "number", unit: "г/л", step: "any" },
                    { code: "IGM", label: "Иммуноглобулин M", type: "number", unit: "г/л", step: "any" },
                    { code: "IGG", label: "Иммуноглобулин G", type: "number", unit: "г/л", step: "any" },
                    { code: "RF", label: "Ревматоидный фактор", type: "number", unit: "МЕ/мл", step: "any" },
                    { code: "ASLO", label: "Антистрептолизин-О (АСЛО)", type: "number", unit: "МЕ/мл", step: "any" },
                    { code: "ANA", label: "Антинуклеарный фактор (АНФ)", type: "select", options: [["не обнаружен", "не обнаружен"], ["обнаружен", "обнаружен"]] },
                    { code: "PCT", label: "Прокальцитонин", type: "number", unit: "нг/мл", step: "any" },
                    { code: "C3", label: "Комплемент C3", type: "number", unit: "г/л", step: "any" },
                    { code: "C4", label: "Комплемент C4", type: "number", unit: "г/л", step: "any" },
                    { code: "INF_OTHER", label: "Другие инфекции и антитела", type: "table", columns: [
                            { key: "name", label: "Исследование", type: "text", placeholder: "ВПГ IgG" },
                            { key: "value", label: "Результат", type: "text" },
                            { key: "unit", label: "Ед.", type: "text" },
                            { key: "date", label: "День", type: "text", placeholder: "day0" }
                        ] }
                ] },
            { id: "blood_onco", title: "Кровь — онкомаркеры", fold: true, fields: [
                    { code: "PSA", label: "ПСА общий", type: "number", unit: "нг/мл", step: "any" },
                    { code: "PSA_FREE", label: "ПСА свободный", type: "number", unit: "нг/мл", step: "any" },
                    { code: "CEA", label: "РЭА", type: "number", unit: "нг/мл", step: "any" },
                    { code: "CA125", label: "CA-125", type: "number", unit: "Ед/мл", step: "any" },
                    { code: "CA153", label: "CA 15-3", type: "number", unit: "Ед/мл", step: "any" },
                    { code: "CA199", label: "CA 19-9", type: "number", unit: "Ед/мл", step: "any" },
                    { code: "AFP", label: "Альфа-фетопротеин (АФП)", type: "number", unit: "МЕ/мл", step: "any" },
                    { code: "HE4", label: "HE4", type: "number", unit: "пмоль/л", step: "any" }
                ] },
            { id: "blood_allergy", title: "Кровь — аллергология", fold: true, fields: [
                    { code: "IGE", label: "IgE общий", type: "number", unit: "МЕ/мл", step: "any" },
                    { code: "ALLERGENS", label: "Специфические IgE (аллергены)", type: "table", columns: [
                            { key: "name", label: "Аллерген", type: "text", placeholder: "берёза" },
                            { key: "value", label: "Значение", type: "text", placeholder: "кЕдА/л" },
                            { key: "class", label: "Класс", type: "text", placeholder: "0–6" }
                        ] }
                ] },
            { id: "urine", title: "Моча — общий анализ", fold: true, fields: [
                    { code: "U_COLOR", label: "Цвет", type: "select", options: [["соломенно-жёлтый", "соломенно-жёлтый"], ["светло-жёлтый", "светло-жёлтый"], ["тёмно-жёлтый", "тёмно-жёлтый"], ["красноватый", "красноватый"], ["другой", "другой"]] },
                    { code: "U_CLARITY", label: "Прозрачность", type: "select", options: [["прозрачная", "прозрачная"], ["слегка мутная", "слегка мутная"], ["мутная", "мутная"]] },
                    { code: "U_SG", label: "Удельный вес (плотность)", type: "number", unit: "", step: "any" },
                    { code: "U_PH", label: "pH", type: "number", unit: "", step: "any" },
                    { code: "U_PROTEIN", label: "Белок", type: "number", unit: "г/л", step: "any" },
                    { code: "U_GLU", label: "Глюкоза", type: "number", unit: "ммоль/л", step: "any" },
                    { code: "U_KET", label: "Кетоновые тела", type: "select", options: [["нет", "нет"], ["следы", "следы"], ["+", "+"], ["++", "++"], ["+++", "+++"]] },
                    { code: "U_BIL", label: "Билирубин", type: "select", options: [["нет", "нет"], ["есть", "есть"]] },
                    { code: "U_WBC", label: "Лейкоциты", type: "number", unit: "в п/зр", step: "any" },
                    { code: "U_RBC", label: "Эритроциты", type: "number", unit: "в п/зр", step: "any" },
                    { code: "U_EPI", label: "Плоский эпителий", type: "number", unit: "в п/зр", step: "any" },
                    { code: "U_CASTS", label: "Цилиндры", type: "select", options: [["нет", "нет"], ["есть", "есть"]] },
                    { code: "U_BACT", label: "Бактерии", type: "select", options: [["нет", "нет"], ["единичные", "единичные"], ["много", "много"]] },
                    { code: "U_MUCUS", label: "Слизь", type: "select", options: [["нет", "нет"], ["немного", "немного"], ["много", "много"]] }
                ] },
            { id: "urine_more", title: "Моча — по Нечипоренко и суточная", fold: true, fields: [
                    { code: "UN_WBC", label: "По Нечипоренко: лейкоциты", type: "number", unit: "в 1 мл", step: "any" },
                    { code: "UN_RBC", label: "По Нечипоренко: эритроциты", type: "number", unit: "в 1 мл", step: "any" },
                    { code: "UN_CASTS", label: "По Нечипоренко: цилиндры", type: "number", unit: "в 1 мл", step: "any" },
                    { code: "U24_VOL", label: "Суточный объём мочи", type: "number", unit: "мл", step: "any" },
                    { code: "U24_PROTEIN", label: "Белок в суточной моче", type: "number", unit: "г/сут", step: "any" },
                    { code: "U24_CREA", label: "Креатинин в суточной моче", type: "number", unit: "ммоль/сут", step: "any" },
                    { code: "U_ALB_CREA", label: "Альбумин/креатинин в моче", type: "number", unit: "мг/ммоль", step: "any" }
                ] },
            { id: "stool", title: "Кал — копрограмма и другие", fold: true, fields: [
                    { code: "STOOL_CONSIST", label: "Консистенция", type: "select", options: [["оформленный", "оформленный"], ["кашицеобразный", "кашицеобразный"], ["жидкий", "жидкий"], ["твёрдый", "твёрдый"]] },
                    { code: "STOOL_COLOR", label: "Цвет", type: "select", options: [["коричневый", "коричневый"], ["светлый", "светлый"], ["тёмный", "тёмный"], ["чёрный", "чёрный"], ["другой", "другой"]] },
                    { code: "STOOL_FIBERS", label: "Мышечные волокна", type: "select", options: [["нет", "нет"], ["немного", "немного"], ["много", "много"]] },
                    { code: "STOOL_FAT", label: "Нейтральный жир", type: "select", options: [["нет", "нет"], ["немного", "немного"], ["много", "много"]] },
                    { code: "STOOL_STARCH", label: "Крахмал", type: "select", options: [["нет", "нет"], ["немного", "немного"], ["много", "много"]] },
                    { code: "STOOL_WBC", label: "Лейкоциты", type: "number", unit: "в п/зр", step: "any" },
                    { code: "STOOL_OCCULT", label: "Скрытая кровь", type: "select", options: [["не обнаружена", "не обнаружена"], ["обнаружена", "обнаружена"]] },
                    { code: "CALPROTECTIN", label: "Кальпротектин", type: "number", unit: "мкг/г", step: "any" },
                    { code: "STOOL_PARASITES", label: "Яйца гельминтов, простейшие", type: "select", options: [["не обнаружены", "не обнаружены"], ["обнаружены", "обнаружены"]] }
                ] }
        ]
    },
    {
        id: "psych", title: "Психолог",
        sections: [
            { title: "Самочувствие", fields: [
                    { code: "PSY_STRESS", label: "Уровень стресса", type: "scale", max: 10 },
                    { code: "PSY_MOOD", label: "Настроение (0 — очень плохое)", type: "scale", max: 10 },
                    { code: "PSY_ANXIETY", label: "Тревога", type: "scale", max: 10 },
                    { code: "PSY_SLEEP", label: "Качество сна (0 — очень плохое)", type: "scale", max: 10 },
                    { code: "PSY_SLEEP_HOURS", label: "Сон в сутки", type: "number", unit: "ч", min: 0, max: 24, step: 0.5 }
                ] },
            { title: "Беседа", fields: [
                    { code: "PSY_NOTES", label: "Заметки психолога", type: "textarea" }
                ] }
        ]
    },
    { id: "diagnoses", title: "Диагнозы", sections: [] },
    { id: "step6", title: "6", sections: [] }
];
