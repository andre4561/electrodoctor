// SPDX-License-Identifier: AGPL-3.0-or-later
// Электродоктор — описание этапов анкеты клиента.
// Чтобы добавить поле, допишите строку в нужный этап. Типы полей:
//   text, textarea, date, select (options), number (unit, min, max, step),
//   yesno (1 / 0 / не спрашивали), scale (0..max), table (columns) — повторяющиеся строки,
//   files — загрузка фото и файлов (хранятся в браузере и в выбранной папке).
// Раздел с fold: true показывается раскрывающимся блоком (id раздела — для запоминания).
// Если code совпадает с кодом из data/parameters.csv, значение попадёт в расчёт
// и в экспорт CSV в формате examples/*.csv.
import type { Step } from "./types.js";

export const STEPS: Step[] = [
  {
    id: "general", title: "Общее",
    sections: [
      { title: "Клиент", fields: [
        { code: "NAME", label: "Имя или псевдоним", type: "text", required: true,
          hint: "Лучше псевдоним или инициалы — данные хранятся только на этом компьютере" },
        { code: "SEX", label: "Пол", type: "select", options: [["F", "женский"], ["M", "мужской"]] },
        { code: "AGE", label: "Возраст", type: "number", unit: "лет", min: 0, max: 120, step: 1 },
        { code: "VISIT_REASON", label: "Повод обращения", type: "textarea" }
      ]},
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
      ]},
      { title: "Заметки", fields: [
        { code: "NOTES", label: "Заметки", type: "textarea" }
      ]}
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
      ]},
      { title: "Жизненные показатели", fields: [
        { code: "BP_SYS", label: "Давление систолическое", type: "number", unit: "мм рт. ст.", min: 50, max: 300, step: 1 },
        { code: "BP_DIA", label: "Давление диастолическое", type: "number", unit: "мм рт. ст.", min: 30, max: 200, step: 1 },
        { code: "PULSE", label: "Пульс", type: "number", unit: "уд/мин", min: 20, max: 250, step: 1 },
        { code: "TEMP", label: "Температура", type: "number", unit: "°C", min: 30, max: 45, step: 0.1 },
        { code: "SPO2", label: "Сатурация", type: "number", unit: "%", min: 50, max: 100, step: 1 }
      ]},
      { title: "Осмотр", fields: [
        { code: "EDEMA_LEGS", label: "Отёки ног", type: "scale", max: 3 }
      ]}
    ]
  },
  {
    id: "labs", title: "Анализы",
    sections: [
      { title: "Фото и файлы анализов", fields: [
        { code: "LAB_FILES", label: "Фото и файлы анализов", type: "files",
          hint: "Распознавание пока не подключено: файлы сохраняются, значения вносятся вручную" }
      ]},
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
      ]},
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
        { code: "MG", label: "Магний", type: "number", unit: "ммоль/л", step: "any" }
      ]},
      { id: "blood_other", title: "Кровь — прочее: гормоны, витамины", fold: true, fields: [
        { code: "TSH", label: "ТТГ", type: "number", unit: "мЕд/л", step: "any" },
        { code: "FT4", label: "Т4 свободный", type: "number", unit: "пмоль/л", step: "any" },
        { code: "FT3", label: "Т3 свободный", type: "number", unit: "пмоль/л", step: "any" },
        { code: "VITD", label: "Витамин D (25-OH)", type: "number", unit: "нг/мл", step: "any" },
        { code: "B12", label: "Витамин B12", type: "number", unit: "пг/мл", step: "any" },
        { code: "FOLATE", label: "Фолиевая кислота", type: "number", unit: "нг/мл", step: "any" },
        { code: "INSULIN", label: "Инсулин", type: "number", unit: "мкЕд/мл", step: "any" },
        { code: "CORTISOL", label: "Кортизол", type: "number", unit: "нмоль/л", step: "any" },
        { code: "LABS_OTHER", label: "Другие показатели", type: "table", columns: [
          { key: "name", label: "Показатель", type: "text" },
          { key: "value", label: "Значение", type: "text" },
          { key: "unit", label: "Ед.", type: "text" },
          { key: "date", label: "День", type: "text", placeholder: "day0" }
        ]}
      ]},
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
      ]}
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
      ]},
      { title: "Беседа", fields: [
        { code: "PSY_NOTES", label: "Заметки психолога", type: "textarea" }
      ]}
    ]
  },
  {
    id: "genetics", title: "Генетика",
    sections: [
      { title: "Генетические исследования", fields: [
        { code: "GEN_TESTS", label: "Результаты", type: "table", columns: [
          { key: "test", label: "Ген / маркер", type: "text", placeholder: "MTHFR C677T" },
          { key: "result", label: "Результат (генотип)", type: "text" },
          { key: "meaning", label: "Значение", type: "text" },
          { key: "lab", label: "Лаборатория", type: "text" }
        ]}
      ]},
      { title: "Заметки", fields: [
        { code: "GEN_NOTES", label: "Заметки по генетике", type: "textarea" }
      ]}
    ]
  },
  { id: "step6", title: "6", sections: [] }
];
