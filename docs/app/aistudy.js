export const FORMAT = "electrodoctor-studies";
export const KINDS = [
    ["us", "УЗИ"],
    ["mri", "МРТ"],
    ["ct", "КТ"],
    ["xray", "Рентген"],
    ["ecg", "ЭКГ"],
    ["endo", "Эндоскопия"],
    ["other", "Другое"],
];
function extractJSON(text) {
    const t = text.trim().replace(/^\uFEFF/, "");
    try {
        return JSON.parse(t);
    }
    catch { /* ищем */ }
    const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) {
        try {
            return JSON.parse(fence[1]);
        }
        catch { /* дальше */ }
    }
    const start = t.search(/[[{]/), end = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
    if (start >= 0 && end > start)
        return JSON.parse(t.slice(start, end + 1));
    throw new Error("в тексте не найден JSON");
}
const str = (v) => (v == null ? "" : String(v)).trim();
const KIND_ALIAS = {
    us: "us", узи: "us", ultrasound: "us", "ультразвук": "us",
    mri: "mri", мрт: "mri", "магнитн": "mri",
    ct: "ct", кт: "ct", "компьютерн": "ct",
    xray: "xray", рентген: "xray", "рентгенограф": "xray", roentgen: "xray",
    ecg: "ecg", экг: "ecg", эхокг: "other", ekg: "ecg",
    endo: "endo", эндоскоп: "endo", фгдс: "endo", колоноскоп: "endo",
    other: "other", другое: "other", прочее: "other",
};
export function normKind(raw) {
    const s = str(raw).toLowerCase();
    if (!s || s === "null")
        return "";
    if (KINDS.some(([k]) => k === s))
        return s;
    for (const [alias, code] of Object.entries(KIND_ALIAS)) {
        if (s === alias || s.includes(alias))
            return code;
    }
    return "other";
}
export function buildPrompt() {
    const kinds = KINDS.map(([k, t]) => `«${k}» (${t})`).join(", ");
    return `Ты помогаешь перенести заключения медицинских исследований (УЗИ, МРТ, КТ, рентген, ЭКГ, эндоскопия и т.п.) с фотографий или PDF в программу «Электродоктор».

Я пришлю фото или PDF бланков / заключений. Найди на них исследования и верни ТОЛЬКО JSON — без пояснений, без markdown, без текста до и после.

Формат ответа:
{
  "format": "${FORMAT}",
  "version": 1,
  "studies": [
    {
      "date": "ГГГГ-ММ-ДД или null",
      "kind": "один из: us | mri | ct | xray | ecg | endo | other | null",
      "title": "краткое название исследования, как на бланке",
      "text": "полный текст заключения / описания (без ФИО и паспортных данных)",
      "uncertain": false
    }
  ]
}

Правила:
1. На одном бланке может быть одно или несколько исследований — каждое отдельным элементом в "studies".
2. "kind" — только код из списка: ${kinds}. Если неясно — "other" или null.
3. "title" — коротко (например «УЗИ щитовидной железы», «МРТ головного мозга»).
4. "text" — связный текст заключения как на бланке (можно слегка нормализовать переносы строк). Не сокращай важные находки.
5. Ничего не придумывай. Если дата или фрагмент читаются плохо — всё равно запиши, но поставь "uncertain": true.
6. Не включай ФИО, дату рождения, номера документов, адреса и другие личные данные.
7. Если исследований несколько с разными датами — у каждого своя "date".
`;
}
export function parse(text) {
    let data;
    try {
        data = extractJSON(text);
    }
    catch (e) {
        throw new Error("Не получилось прочитать ответ ИИ: " + ((e instanceof Error && e.message) || e) + ". Вставьте ответ целиком.");
    }
    const obj = (Array.isArray(data) ? { studies: data } : data);
    if (!obj || typeof obj !== "object")
        throw new Error("Ответ ИИ не объект JSON.");
    const rawList = Array.isArray(obj.studies) ? obj.studies
        : Array.isArray(obj.results) ? obj.results
            : null;
    if (!rawList)
        throw new Error("В ответе нет списка studies. Попросите ИИ ответить строго в формате из промпта.");
    const studies = [];
    for (const row of rawList) {
        if (!row || typeof row !== "object")
            continue;
        const r = row;
        const title = str(r.title) || str(r.name);
        const body = str(r.text) || str(r.conclusion) || str(r.body);
        if (!title && !body)
            continue;
        const uncertain = r.uncertain === true;
        const date = str(r.date) === "null" ? "" : str(r.date);
        studies.push({
            date,
            kind: normKind(str(r.kind)),
            title: title || "Исследование",
            text: body,
            uncertain,
            apply: !uncertain,
            note: uncertain ? "ИИ не уверен в распознавании" : "",
        });
    }
    if (!studies.length)
        throw new Error("В ответе нет ни одного исследования с текстом или названием.");
    return { studies };
}
/** Черновики → записи Study для карточки клиента. */
export function toStudies(drafts, now = new Date().toISOString()) {
    return drafts.filter(d => d.apply).map((d, i) => ({
        id: "s" + Date.now().toString(36) + i.toString(36) + Math.random().toString(36).slice(2, 5),
        date: d.date || now.slice(0, 10),
        kind: d.kind || "",
        title: d.title,
        text: d.text,
        savedAt: now,
    }));
}
