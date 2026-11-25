export function isNest(e) {
    return !!e && typeof e === "object" && e.kind === "group";
}
export const LINE_SEP = "__";
export function lineCode(examId, lineId) {
    return examId + LINE_SEP + lineId;
}
export function parseLineCode(code) {
    const i = code.indexOf(LINE_SEP);
    if (i <= 0)
        return null;
    return { examId: code.slice(0, i), lineId: code.slice(i + LINE_SEP.length) };
}
export const GROUPS = [
    { id: "general", title: "Общий вид и жизненные показатели", desc: "Состояние, сознание, телосложение, базовые замеры" },
    { id: "skin", title: "Кожа и слизистые", desc: "Цвет, влажность, сыпь, желтуха, цианоз" },
    { id: "lymph", title: "Лимфоузлы", desc: "Увеличение, болезненность, локализация" },
    { id: "head", title: "Голова, ЛОР, глаза, шея", desc: "Зев, миндалины, глаза, щитовидная железа" },
    { id: "resp", title: "Дыхательная система", desc: "ЧДД, аускультация, хрипы, одышка" },
    { id: "cardio", title: "Сердечно-сосудистая", desc: "Тоны, шумы, ритм, отёки, пульс на периферии" },
    { id: "abdomen", title: "Живот и ЖКТ", desc: "Пальпация, печень, селезёнка, перистальтика" },
    { id: "urine", title: "Мочевыделительная", desc: "Поколачивание, отёки лица" },
    { id: "neuro", title: "Неврологический скрининг", desc: "Сознание, менингеальные знаки, сила, Ромберг" },
    { id: "msk", title: "Опорно-двигательная", desc: "Суставы, объём движений, деформация" },
    { id: "other", title: "Локальный статус и прочее", desc: "Свободное описание и пользовательские пункты" },
];
export function parseScaleEnds(desc) {
    if (!desc)
        return null;
    const first = desc.split(/\r?\n/, 1)[0].trim();
    if (!first)
        return null;
    const m = first.match(/^(.+?)\s*[—–−-]\s*(.+)$/);
    if (!m)
        return null;
    const from = m[1].trim();
    const to = m[2].trim();
    return from && to ? { from, to } : null;
}
export function descBody(desc) {
    if (!desc)
        return "";
    if (!parseScaleEnds(desc))
        return desc.trim();
    const i = desc.search(/\r?\n/);
    return i < 0 ? "" : desc.slice(i).replace(/^\r?\n/, "").trim();
}
export function scaleEnds(line) {
    const fromDesc = parseScaleEnds(line.desc);
    if (fromDesc)
        return fromDesc;
    const from = (line.from || "").trim();
    const to = (line.to || "").trim();
    return from && to ? { from, to } : null;
}
export function replyOf(line) {
    if (line.reply === "number" || line.reply === "text" || line.reply === "scale")
        return line.reply;
    if (line.scale === 1 || (line.from && line.to))
        return "scale";
    return "scale";
}
export function replyLabel(line) {
    const r = replyOf(line);
    return r === "number" ? "поле" : r === "text" ? "текст" : "шкала";
}
export function usesSlider(line) {
    return replyOf(line) === "scale";
}
export function usesNumber(line) {
    return replyOf(line) === "number";
}
export function usesText(line) {
    return replyOf(line) === "text";
}
export function editorDesc(line) {
    const body = line.desc || "";
    if (parseScaleEnds(body))
        return body;
    const from = (line.from || "").trim();
    const to = (line.to || "").trim();
    if (!from || !to)
        return body;
    const rest = body.trim();
    return rest ? `${from} — ${to}\n${rest}` : `${from} — ${to}`;
}
export function resolvedDesc(examId, line) {
    if ((line.desc || "").trim())
        return editorDesc(line);
    const packed = descs[lineCode(examId, line.id)];
    const body = (packed?.body || "").trim();
    if (usesSlider(line)) {
        const ends = scaleEnds(line);
        if (ends && body)
            return `${ends.from} — ${ends.to}\n${body}`;
        if (ends)
            return `${ends.from} — ${ends.to}`;
    }
    return body;
}
export function articleHref(line) {
    const name = (line.article || "").trim();
    if (!name)
        return undefined;
    return "../articles/exams/" + encodeURIComponent(name) + ".html";
}
export const DESCS_URL = "../data/exam-descs.json";
let descs = {};
export let descsError = "";
export async function loadDescs() {
    try {
        const res = await fetch(DESCS_URL, { cache: "no-cache" });
        if (!res.ok)
            throw new Error("ответ " + res.status);
        const j = await res.json();
        if (j.format !== "electrodoctor-exam-descs" || !j.items)
            throw new Error("это не файл описаний осмотра");
        descs = j.items;
        descsError = "";
    }
    catch (e) {
        descs = {};
        descsError = "Не загрузились описания осмотра (" + DESCS_URL + "): " + ((e instanceof Error && e.message) || e);
        console.error(descsError);
    }
}
function L(id, label, reply, article, from, to) {
    const r = reply === 1 || reply === "scale" ? "scale"
        : reply === "number" ? "number" : reply === "text" ? "text" : "scale";
    const line = { id, label, reply: r, article };
    if (from && to) {
        line.from = from;
        line.to = to;
    }
    return line;
}
function G(id, name, lines) {
    return { kind: "group", id, name, lines };
}
function E(id, group, name, entries = []) {
    return { id, group, name, entries };
}
export function copyEntries(entries) {
    return entries.map(e => isNest(e)
        ? { kind: "group", id: e.id, name: e.name, lines: e.lines.map(l => ({ ...l })) }
        : { ...e });
}
export function flatSigns(it) {
    const out = [];
    for (const e of it.entries || []) {
        if (isNest(e))
            out.push(...e.lines);
        else
            out.push(e);
    }
    return out;
}
/** Встроенный набор. Тексты — docs/articles/exams/ и docs/data/exam-descs.json. */
export const BUILTIN = [
    E("gen_state", "general", "Общее состояние", [
        L("severity", "Тяжесть состояния", "scale", "Тяжесть состояния", "здоров", "срочно в больницу"),
        L("position", "Положение", "scale", "Положение", "сам активен", "не двигается"),
        L("contact", "Контактность", "scale", "Контактность", "полный контакт", "нет контакта"),
        L("face", "Выражение лица", "scale", "Выражение лица", "спокойное", "крайне тяжёлое"),
        L("weakness", "Слабость", "scale", "Слабость", "нет слабости", "полная адинамия"),
    ]),
    E("gen_consciousness", "general", "Сознание", [
        L("level", "Уровень сознания", "scale", "Уровень сознания", "ясное", "кома"),
        L("orientation", "Ориентация", "scale", "Ориентация", "ориентирован полностью", "дезориентирован"),
        L("to_voice", "Реакция на обращение", "scale", "Реакция на обращение", "сразу отвечает", "не реагирует на речь"),
        L("to_pain", "Реакция на боль", "scale", "Реакция на боль", "целенаправленная", "нет реакции"),
        G("gcs", "ШКГ", [
            L("gcs_eye", "Открывание глаз", "scale", "Открывание глаз", "сам открывает", "не открывает"),
            L("gcs_verbal", "Речевой ответ", "scale", "Речевой ответ", "ориентирован", "нет звуков"),
            L("gcs_motor", "Двигательный ответ", "scale", "Двигательный ответ", "выполняет команду", "нет движений"),
        ]),
    ]),
    E("gen_build", "general", "Телосложение и питание", [
        L("note", "Телосложение и питание", "text", "Телосложение и питание"),
    ]),
    E("gen_rr", "general", "Частота дыхания", [
        L("rate", "ЧДД", "number", "ЧДД"),
    ]),
    E("skin_color", "skin", "Цвет кожи", [
        L("note", "Цвет кожи", "text", "Цвет кожи"),
    ]),
    E("skin_moisture", "skin", "Влажность кожи", [
        L("level", "Влажность кожи", "scale", "Влажность кожи", "сухая", "резко влажная"),
    ]),
    E("skin_rash", "skin", "Сыпь", [
        L("note", "Сыпь", "text", "Сыпь"),
    ]),
    E("skin_jaundice", "skin", "Желтуха", [
        L("level", "Желтуха", "scale", "Желтуха", "нет", "резко выраженная"),
    ]),
    E("skin_cyanosis", "skin", "Цианоз", [
        L("level", "Цианоз", "scale", "Цианоз", "нет", "резко выраженный"),
    ]),
    E("lymph_enlarged", "lymph", "Увеличение лимфоузлов", [
        L("note", "Увеличение лимфоузлов", "text", "Увеличение лимфоузлов"),
    ]),
    E("lymph_note", "lymph", "Лимфоузлы: описание", [
        L("note", "Лимфоузлы: описание", "text", "Лимфоузлы — описание"),
    ]),
    E("head_pharynx", "head", "Зев и миндалины", [
        L("note", "Зев и миндалины", "text", "Зев и миндалины"),
    ]),
    E("head_eyes", "head", "Глаза и склеры", [
        L("note", "Глаза и склеры", "text", "Глаза и склеры"),
    ]),
    E("head_thyroid", "head", "Щитовидная железа", [
        L("note", "Щитовидная железа", "text", "Щитовидная железа"),
    ]),
    E("resp_dyspnea", "resp", "Одышка в покое", [
        L("level", "Одышка в покое", "scale", "Одышка в покое", "нет", "резко выраженная"),
    ]),
    E("resp_auscultation", "resp", "Аускультация лёгких", [
        L("note", "Аускультация лёгких", "text", "Аускультация лёгких"),
    ]),
    E("resp_rales", "resp", "Хрипы", [
        L("note", "Хрипы", "text", "Хрипы"),
    ]),
    E("resp_percussion", "resp", "Перкуссия грудной клетки", [
        L("note", "Перкуссия грудной клетки", "text", "Перкуссия грудной клетки"),
    ]),
    E("cardio_sounds", "cardio", "Тоны сердца", [
        L("note", "Тоны сердца", "text", "Тоны сердца"),
    ]),
    E("cardio_murmur", "cardio", "Шумы сердца", [
        L("note", "Шумы сердца", "text", "Шумы сердца"),
    ]),
    E("cardio_rhythm", "cardio", "Ритм", [
        L("note", "Ритм", "text", "Ритм"),
    ]),
    E("cardio_edema_legs", "cardio", "Отёки ног", [
        L("level", "Отёки ног", "scale", "Отёки ног", "нет", "резко выраженные"),
    ]),
    E("cardio_peripheral", "cardio", "Пульс на периферии", [
        L("level", "Пульс на периферии", "scale", "Пульс на периферии", "хорошее наполнение", "нитевидный / нет"),
    ]),
    E("abd_soft", "abdomen", "Живот", [
        L("level", "Живот", "scale", "Живот", "мягкий", "доскообразный"),
    ]),
    E("abd_tenderness", "abdomen", "Болезненность живота", [
        L("level", "Болезненность живота", "scale", "Болезненность живота", "нет", "резкая"),
    ]),
    E("abd_liver", "abdomen", "Печень", [
        L("note", "Печень", "text", "Печень"),
    ]),
    E("abd_spleen", "abdomen", "Селезёнка", [
        L("note", "Селезёнка", "text", "Селезёнка"),
    ]),
    E("abd_bowel", "abdomen", "Перистальтика", [
        L("note", "Перистальтика", "text", "Перистальтика"),
    ]),
    E("urine_tapping", "urine", "Поколачивание по пояснице", [
        L("level", "Поколачивание по пояснице", "scale", "Поколачивание по пояснице", "безболезненно", "резко положительно"),
    ]),
    E("urine_face_edema", "urine", "Отёки лица", [
        L("level", "Отёки лица", "scale", "Отёки лица", "нет", "резко выраженные"),
    ]),
    E("neuro_meningeal", "neuro", "Менингеальные знаки", [
        L("level", "Менингеальные знаки", "scale", "Менингеальные знаки", "нет", "резко положительные"),
    ]),
    E("neuro_strength", "neuro", "Сила в конечностях", [
        L("note", "Сила в конечностях", "text", "Сила в конечностях"),
    ]),
    E("neuro_romberg", "neuro", "Проба Ромберга", [
        L("note", "Проба Ромберга", "text", "Проба Ромберга"),
    ]),
    E("neuro_pupils", "neuro", "Зрачки", [
        L("note", "Зрачки", "text", "Зрачки"),
    ]),
    E("msk_joints", "msk", "Суставы", [
        L("note", "Суставы", "text", "Суставы"),
    ]),
    E("msk_rom", "msk", "Объём движений", [
        L("level", "Объём движений", "scale", "Объём движений", "полный", "резко ограничен"),
    ]),
    E("msk_deformity", "msk", "Деформация / осанка", [
        L("note", "Деформация / осанка", "text", "Деформация — осанка"),
    ]),
    E("other_local", "other", "Локальный статус", [
        L("note", "Локальный статус", "text", "Локальный статус"),
    ]),
    E("other_note", "other", "Прочие находки осмотра", [
        L("note", "Прочие находки осмотра", "text", "Прочие находки осмотра"),
    ]),
];
const byId = new Map(BUILTIN.map(x => [x.id, x]));
let own = {};
export function applyOwn(src) {
    own = {};
    if (!src)
        return;
    for (const [id, raw] of Object.entries(src)) {
        if (!raw || typeof raw !== "object")
            continue;
        own[id] = { ...raw, id: raw.id || id };
    }
}
function normLine(r) {
    const id = String(r.id || "").trim();
    const label = String(r.label || "").trim();
    if (!id || !label)
        return null;
    const from = r.from != null ? String(r.from).trim() : "";
    const to = r.to != null ? String(r.to).trim() : "";
    let desc = r.desc != null ? String(r.desc).trim() : "";
    const article = r.article != null ? String(r.article).trim() : "";
    const scaleRaw = r.scale != null ? Number(r.scale) : NaN;
    const replyRaw = r.reply != null ? String(r.reply) : "";
    const line = { id, label };
    if (from && to) {
        line.from = from;
        line.to = to;
    }
    if (desc)
        line.desc = desc;
    if (article)
        line.article = article;
    if (replyRaw === "number" || replyRaw === "text" || replyRaw === "scale")
        line.reply = replyRaw;
    else if (scaleRaw === 1 || (from && to))
        line.reply = "scale";
    else
        line.reply = "scale";
    return line;
}
function normLines(raw, fallback) {
    if (!Array.isArray(raw))
        return fallback.map(l => ({ ...l }));
    const out = [];
    for (const row of raw) {
        if (!row || typeof row !== "object")
            continue;
        const line = normLine(row);
        if (line)
            out.push(line);
    }
    return out;
}
function normEntries(raw, fallback) {
    if (!Array.isArray(raw))
        return copyEntries(fallback);
    const out = [];
    for (const row of raw) {
        if (!row || typeof row !== "object")
            continue;
        const r = row;
        if (r.kind === "group") {
            const id = String(r.id || "").trim();
            const name = String(r.name || "").trim();
            if (!id || !name)
                continue;
            out.push({ kind: "group", id, name, lines: normLines(r.lines, []) });
            continue;
        }
        if (r.label != null && r.kind !== "group") {
            const line = normLine(r);
            if (line)
                out.push(line);
        }
    }
    return out;
}
function entriesOf(src, fallback) {
    if (!src)
        return copyEntries(fallback);
    if (src.entries !== undefined)
        return normEntries(src.entries, []);
    if (src.lines !== undefined)
        return normLines(src.lines, []).map(l => ({ ...l }));
    return copyEntries(fallback);
}
function lineToField(examId, line) {
    const code = lineCode(examId, line.id);
    const full = resolvedDesc(examId, line);
    const hint = (usesSlider(line) ? descBody(full) : full.trim()) || undefined;
    if (usesSlider(line)) {
        const ends = scaleEnds(line) || { from: "0", to: "100" };
        return { code, label: line.label, type: "slider", min: 0, max: 100, scaleFrom: ends.from, scaleTo: ends.to, hint };
    }
    if (usesNumber(line)) {
        return { code, label: line.label, type: "number", step: "any", hint };
    }
    if (usesText(line)) {
        return { code, label: line.label, type: "textarea", hint };
    }
    return { code, label: line.label, type: "text", hint };
}
function mergeOne(id, base, o) {
    if (o.deleted)
        return null;
    if (!base && !o.name)
        return null;
    const name = (o.name != null && String(o.name).trim()) ? String(o.name).trim() : (base ? base.name : id);
    const group = (o.group != null && String(o.group)) || (base ? base.group : "other");
    const entries = entriesOf(o, base ? base.entries : []);
    const item = {
        id,
        name,
        group: GROUPS.some(g => g.id === group) ? group : "other",
        entries,
        own: true,
    };
    if (o.tags || (base && base.tags))
        item.tags = o.tags || base.tags;
    return item;
}
export function all() {
    const ids = new Set([...byId.keys(), ...Object.keys(own)]);
    const out = [];
    for (const id of ids) {
        const base = byId.get(id);
        const o = own[id];
        if (o) {
            const m = mergeOne(id, base, o);
            if (m)
                out.push(m);
        }
        else if (base) {
            out.push({ ...base, entries: copyEntries(base.entries), own: false });
        }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name, "ru"));
}
export function inGroup(groupId) {
    return all().filter(x => x.group === groupId)
        .sort((a, b) => a.name.localeCompare(b.name, "ru"));
}
export function get(id) {
    return all().find(x => x.id === id);
}
export function groupOf(id) {
    return GROUPS.find(g => g.id === id);
}
export function newOwnId() {
    return "own_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
export function newLineId() {
    return "ln_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}
export function newNestId() {
    return "grp_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}
export function toFields(it) {
    return flatSigns(it).map(line => lineToField(it.id, line));
}
export function topFields(it) {
    return (it.entries || []).filter((e) => !isNest(e)).map(line => lineToField(it.id, line));
}
export function nestFields(it) {
    return (it.entries || []).filter(isNest).map(nest => ({
        nest,
        fields: nest.lines.map(line => lineToField(it.id, line)),
    }));
}
export function allFields() {
    return all().flatMap(toFields);
}
export function fieldByLineCode(code) {
    const p = parseLineCode(code);
    if (!p)
        return null;
    const it = get(p.examId);
    if (!it)
        return null;
    const line = flatSigns(it).find(l => l.id === p.lineId);
    if (!line)
        return null;
    return lineToField(it.id, line);
}
export function isExamLineCode(code) {
    const p = parseLineCode(code);
    if (!p)
        return false;
    const it = get(p.examId);
    return !!(it && flatSigns(it).some(l => l.id === p.lineId));
}
export function findLine(it, lineId) {
    return flatSigns(it).find(l => l.id === lineId);
}
