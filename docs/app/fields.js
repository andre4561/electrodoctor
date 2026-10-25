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
                ] }
        ]
    },
    {
        id: "labs", title: "Анализы",
        sections: [
            { title: "Основные", fields: [
                    { code: "HGB", label: "Гемоглобин", type: "number", unit: "г/л", step: "any" },
                    { code: "FERRITIN", label: "Ферритин", type: "number", unit: "нг/мл", step: "any" },
                    { code: "MCV", label: "Средний объём эритроцита", type: "number", unit: "фл", step: "any" }
                ] },
            { title: "Другие анализы", fields: [
                    { code: "LABS_OTHER", label: "Другие анализы", type: "table", columns: [
                            { key: "name", label: "Показатель", type: "text" },
                            { key: "value", label: "Значение", type: "text" },
                            { key: "unit", label: "Ед.", type: "text" },
                            { key: "date", label: "День", type: "text", placeholder: "day0" }
                        ] }
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
    { id: "step5", title: "5", sections: [] },
    { id: "step6", title: "6", sections: [] }
];
