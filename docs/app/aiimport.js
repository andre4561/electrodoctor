import * as Labs from "./labs.js";
export const FORMAT = "electrodoctor-labs";
export const OTHER_CODE = "LABS_OTHER"; // сюда попадает всё, чему нет своего поля
const importable = (f) => f.type === "number" || f.type === "select";
export function labFields(steps) {
    const labs = steps.find(s => s.id === "labs");
    return labs ? labs.sections.flatMap(s => s.fields).filter(importable) : [];
}
// ---------- промпт ----------
export function buildPrompt(steps) {
    const labs = steps.find(s => s.id === "labs");
    const groups = (labs ? labs.sections : []).filter(sec => sec.fields.some(importable)).map(sec => {
        const lines = sec.fields.filter(importable).map(f => {
            if (f.type === "select")
                return `${f.code} — ${f.label}; одно из значений: ${(f.options || []).map(o => `«${o[0]}»`).join(", ")}`;
            return `${f.code} — ${f.label}${f.unit ? `, ${f.unit}` : ""}`;
        });
        return `${sec.title}:\n${lines.join("\n")}`;
    });
    return `Ты помогаешь перенести результаты медицинских анализов с фотографий или PDF в программу «Электродоктор».

Я пришлю фото бланков анализов. Найди на них все показатели и верни ТОЛЬКО JSON — без пояснений, без markdown, без текста до и после.

Формат ответа:
{
  "format": "${FORMAT}",
  "version": 1,
  "date": "ГГГГ-ММ-ДД — дата сдачи анализов, или null, если её не видно",
  "lab": "название лаборатории или null",
  "results": [
    { "code": "HGB", "name": "Гемоглобин", "value": 118, "unit": "г/л", "ref": "120–150", "uncertain": false }
  ]
}

Правила:
1. Для каждого показателя подбери код из списка ниже. Если подходящего кода нет — поставь "code": null и заполни "name" так, как написано на бланке.
2. "value" — число с точкой в качестве разделителя (5.2, а не 5,2). Для показателей с вариантами ответа — ровно одно из перечисленных значений. Если на бланке «<0.1», «>1000» или текст — запиши его строкой как есть.
3. "unit" — единица измерения с бланка. Если она отличается от указанной в списке и ты уверенно знаешь коэффициент пересчёта, пересчитай значение в единицы из списка и укажи их; если не уверен — оставь как на бланке.
4. "ref" — референсный интервал (норма) с бланка, если он есть, иначе null.
5. Ничего не придумывай и не достраивай. Если цифра читается плохо — всё равно запиши, но поставь "uncertain": true.
6. Не включай в ответ ФИО, дату рождения, номера документов, адреса и другие личные данные.
7. Если анализов несколько и даты у них разные, укажи самую позднюю дату в "date".

Список показателей (код — название, единица):

${groups.join("\n\n")}
`;
}
// ---------- разбор ответа ----------
// ИИ иногда оборачивает JSON в \`\`\`json … \`\`\` или добавляет текст — вырезаем первый объект или массив.
function extractJSON(text) {
    const t = text.trim().replace(/^﻿/, "");
    try {
        return JSON.parse(t);
    }
    catch (e) { /* ищем внутри */ }
    const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) {
        try {
            return JSON.parse(fence[1]);
        }
        catch (e) { /* дальше */ }
    }
    const start = t.search(/[[{]/), end = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
    if (start >= 0 && end > start)
        return JSON.parse(t.slice(start, end + 1));
    throw new Error("в тексте не найден JSON");
}
const str = (v) => (v == null ? "" : String(v)).trim();
export function parse(text) {
    let data;
    try {
        data = extractJSON(text);
    }
    catch (e) {
        throw new Error("Не получилось прочитать ответ ИИ: " + ((e instanceof Error && e.message) || e) + ". Вставьте ответ целиком.");
    }
    const obj = (Array.isArray(data) ? { results: data } : data);
    if (!obj || typeof obj !== "object" || !Array.isArray(obj.results))
        throw new Error("В ответе нет списка results. Попросите ИИ ответить строго в формате из промпта.");
    const results = obj.results.filter((r) => !!r && typeof r === "object").map(r => ({
        code: str(r.code).toUpperCase() || undefined,
        name: str(r.name) || undefined,
        value: r.value,
        unit: str(r.unit) || undefined,
        ref: str(r.ref) || undefined,
        uncertain: r.uncertain === true
    })).filter(r => str(r.value) !== "");
    if (!results.length)
        throw new Error("В ответе нет ни одного значения.");
    const date = str(obj.date) === "null" ? "" : str(obj.date);
    const lab = str(obj.lab) === "null" ? "" : str(obj.lab);
    return { date, lab, results };
}
// Единицы сравниваем без пробелов, регистра и разницы в записи степени: ×10⁹/л = x10^9/л = 10*9/л
const SUP = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9" };
export const normUnit = (u) => u.toLowerCase().replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, c => SUP[c]).replace(/\s+/g, "")
    .replace(/[x*х]/g, "×").replace(/\^/g, "").replace(/×?10(\d+)/g, "e$1").replace(/[μµ]/g, "мк").replace(/^×/, "");
const toNumber = (v) => {
    if (typeof v === "number" && isFinite(v))
        return v;
    const s = str(v).replace(",", ".");
    return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : null;
};
export function match(parsed, steps) {
    const fields = new Map(labFields(steps).map(f => [f.code, f]));
    const rows = [];
    for (const r of parsed.results) {
        let f = r.code ? fields.get(r.code) || null : null;
        const raw = str(r.value);
        let fromCat = false;
        if (!f) { // нет в бланке — ищем в справочнике: добавится в «Дополнительные анализы»
            const code = Labs.findByName(r.name || "", r.code);
            const cf = code && !fields.has(code) ? Labs.fieldFor(code) : null;
            if (cf) {
                f = cf;
                fromCat = true;
            }
        }
        if (!f) {
            rows.push({ result: r, field: null, value: raw, status: "other", note: r.code ? `кода ${r.code} нет в анкете — пойдёт в «Другие показатели»` : "пойдёт в «Другие показатели»", apply: true });
            continue;
        }
        const catNote = fromCat ? "из справочника — добавится в «Дополнительные анализы»" : "";
        if (f.type === "text") {
            rows.push({ result: r, field: f, value: raw, status: "ok", note: catNote, apply: true });
            continue;
        }
        if (f.type === "select") {
            const q = (f.options || []).some(o => o[0] === "обнаружено") ? Labs.normQual(raw) : null; // «положительно», «+», «detected» → «обнаружено»
            const opt = (f.options || []).find(o => o[0].toLowerCase() === (q || raw).toLowerCase() || o[1].toLowerCase() === raw.toLowerCase());
            if (opt && fromCat) {
                rows.push({ result: r, field: f, value: opt[0], status: r.uncertain ? "uncertain" : "ok", note: catNote, apply: !r.uncertain });
                continue;
            }
            if (opt)
                rows.push({ result: r, field: f, value: opt[0], status: r.uncertain ? "uncertain" : "ok", note: r.uncertain ? "ИИ не уверен в значении" : "", apply: !r.uncertain });
            else
                rows.push({ result: r, field: null, value: raw, status: "option", note: `«${raw}» нет среди вариантов поля «${f.label}» — пойдёт в «Другие показатели»`, apply: true });
            continue;
        }
        const n = toNumber(r.value);
        if (n === null) {
            rows.push({ result: r, field: null, value: raw, status: "other", note: `«${raw}» не число — пойдёт в «Другие показатели»`, apply: true });
            continue;
        }
        if (r.unit && f.unit && normUnit(r.unit) !== normUnit(f.unit)) {
            rows.push({ result: r, field: f, value: n, status: "unit", note: `единицы на бланке «${r.unit}», в анкете «${f.unit}» — проверьте пересчёт`, apply: false });
            continue;
        }
        rows.push({ result: r, field: f, value: n, status: r.uncertain ? "uncertain" : "ok", note: r.uncertain ? "ИИ не уверен в значении" : catNote, apply: !r.uncertain });
    }
    // Повтор одного кода: оставляем отмеченным только последний
    const seen = new Map();
    for (const row of rows)
        if (row.field) {
            const prev = seen.get(row.field.code);
            if (prev) {
                prev.apply = false;
                prev.note = (prev.note ? prev.note + "; " : "") + "показатель встречается дважды — выбран последний";
            }
            seen.set(row.field.code, row);
        }
    return rows;
}
// Строка для таблицы «Другие показатели»
export function otherRow(row, date) {
    const r = row.result;
    return { name: r.name || r.code || "", value: String(row.value), unit: r.unit || "", date: date || "" };
}
