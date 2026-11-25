// SPDX-License-Identifier: AGPL-3.0-or-later
// Электродоктор — справочник пунктов осмотра (группы по системам, без дублей).
// У пункта — признаки и вложенные группы (например ШКГ); значение — в карточке клиента.
// Тексты описаний — docs/articles/exams/ и docs/data/exam-descs.json.
import type { Field } from "./types.js";

export interface ExamGroup {
  id: string;
  title: string;
  desc: string;
}

/** Тип ответа признака в карточке: шкала, число или свободный текст. */
export type ExamReply = "scale" | "number" | "text";

/** Устарело: 1 = ползунок; теперь reply: "scale". */
export type ExamScale = 1;

/** Признак внутри пункта или вложенной группы. */
export interface ExamLine {
  id: string;
  label: string;
  /** Свои правки и импорт .md; у встроенных тело обычно из exam-descs.json. */
  desc?: string;
  /** Имя статьи в docs/articles/exams/ без .md. */
  article?: string;
  /** Как вводить значение в карточке. По умолчанию — шкала. */
  reply?: ExamReply;
  /** Устарело: 1 = reply "scale". */
  scale?: ExamScale;
  /** Края шкалы (если не вынесены в первую строку desc). */
  from?: string;
  to?: string;
}

/** Вложенная группа признаков внутри пункта (аккордеон). */
export interface ExamNest {
  kind: "group";
  id: string;
  name: string;
  lines: ExamLine[];
}

/** Элемент пункта: признак или вложенная группа. */
export type ExamEntry = ExamLine | ExamNest;

export function isNest(e: ExamEntry): e is ExamNest {
  return !!e && typeof e === "object" && (e as ExamNest).kind === "group";
}

export interface ExamItem {
  id: string;
  name: string;
  group: string;
  help?: string;
  entries: ExamEntry[];
  lines?: ExamLine[];
  tags?: string[];
  own?: boolean;
}

export const LINE_SEP = "__";

export function lineCode(examId: string, lineId: string): string {
  return examId + LINE_SEP + lineId;
}

export function parseLineCode(code: string): { examId: string; lineId: string } | null {
  const i = code.indexOf(LINE_SEP);
  if (i <= 0) return null;
  return { examId: code.slice(0, i), lineId: code.slice(i + LINE_SEP.length) };
}

export const GROUPS: ExamGroup[] = [
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

export function parseScaleEnds(desc?: string): { from: string; to: string } | null {
  if (!desc) return null;
  const first = desc.split(/\r?\n/, 1)[0].trim();
  if (!first) return null;
  const m = first.match(/^(.+?)\s*[—–−-]\s*(.+)$/);
  if (!m) return null;
  const from = m[1].trim();
  const to = m[2].trim();
  return from && to ? { from, to } : null;
}

export function descBody(desc?: string): string {
  if (!desc) return "";
  if (!parseScaleEnds(desc)) return desc.trim();
  const i = desc.search(/\r?\n/);
  return i < 0 ? "" : desc.slice(i).replace(/^\r?\n/, "").trim();
}

export function scaleEnds(line: ExamLine): { from: string; to: string } | null {
  const fromDesc = parseScaleEnds(line.desc);
  if (fromDesc) return fromDesc;
  const from = (line.from || "").trim();
  const to = (line.to || "").trim();
  return from && to ? { from, to } : null;
}

export function replyOf(line: ExamLine): ExamReply {
  if (line.reply === "number" || line.reply === "text" || line.reply === "scale") return line.reply;
  if (line.scale === 1 || (line.from && line.to)) return "scale";
  return "scale";
}

export function replyLabel(line: ExamLine): string {
  const r = replyOf(line);
  return r === "number" ? "поле" : r === "text" ? "текст" : "шкала";
}

export function usesSlider(line: ExamLine): boolean {
  return replyOf(line) === "scale";
}

export function usesNumber(line: ExamLine): boolean {
  return replyOf(line) === "number";
}

export function usesText(line: ExamLine): boolean {
  return replyOf(line) === "text";
}

export function editorDesc(line: ExamLine): string {
  const body = line.desc || "";
  if (parseScaleEnds(body)) return body;
  const from = (line.from || "").trim();
  const to = (line.to || "").trim();
  if (!from || !to) return body;
  const rest = body.trim();
  return rest ? `${from} — ${to}\n${rest}` : `${from} — ${to}`;
}

export function resolvedDesc(examId: string, line: ExamLine): string {
  if ((line.desc || "").trim()) return editorDesc(line);
  const packed = descs[lineCode(examId, line.id)];
  const body = (packed?.body || "").trim();
  if (usesSlider(line)) {
    const ends = scaleEnds(line);
    if (ends && body) return `${ends.from} — ${ends.to}\n${body}`;
    if (ends) return `${ends.from} — ${ends.to}`;
  }
  return body;
}

export function articleHref(line: ExamLine): string | undefined {
  const name = (line.article || "").trim();
  if (!name) return undefined;
  return "../articles/exams/" + encodeURIComponent(name) + ".html";
}

export const DESCS_URL = "../data/exam-descs.json";

interface ExamDescPack {
  article?: string;
  body?: string;
  from?: string;
  to?: string;
  reply?: string;
  label?: string;
}

let descs: Record<string, ExamDescPack> = {};
export let descsError = "";

export async function loadDescs(): Promise<void> {
  try {
    const res = await fetch(DESCS_URL, { cache: "no-cache" });
    if (!res.ok) throw new Error("ответ " + res.status);
    const j = await res.json();
    if (j.format !== "electrodoctor-exam-descs" || !j.items) throw new Error("это не файл описаний осмотра");
    descs = j.items as Record<string, ExamDescPack>;
    descsError = "";
  } catch (e) {
    descs = {};
    descsError = "Не загрузились описания осмотра (" + DESCS_URL + "): " + ((e instanceof Error && e.message) || e);
    console.error(descsError);
  }
}

function L(
  id: string,
  label: string,
  reply: ExamReply | ExamScale,
  article: string,
  from?: string,
  to?: string,
): ExamLine {
  const r: ExamReply = reply === 1 || reply === "scale" ? "scale"
    : reply === "number" ? "number" : reply === "text" ? "text" : "scale";
  const line: ExamLine = { id, label, reply: r, article };
  if (from && to) { line.from = from; line.to = to; }
  return line;
}

function G(id: string, name: string, lines: ExamLine[]): ExamNest {
  return { kind: "group", id, name, lines };
}

function E(id: string, group: string, name: string, entries: ExamEntry[] = []): ExamItem {
  return { id, group, name, entries };
}

export function copyEntries(entries: ExamEntry[]): ExamEntry[] {
  return entries.map(e => isNest(e)
    ? { kind: "group" as const, id: e.id, name: e.name, lines: e.lines.map(l => ({ ...l })) }
    : { ...e });
}

export function flatSigns(it: ExamItem): ExamLine[] {
  const out: ExamLine[] = [];
  for (const e of it.entries || []) {
    if (isNest(e)) out.push(...e.lines);
    else out.push(e);
  }
  return out;
}

/** Встроенный набор. Тексты — docs/articles/exams/ и docs/data/exam-descs.json. */
export const BUILTIN: ExamItem[] = [
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

let own: Record<string, Partial<ExamItem> & { id: string }> = {};

export function applyOwn(src?: Record<string, Partial<ExamItem> & { id?: string }> | null): void {
  own = {};
  if (!src) return;
  for (const [id, raw] of Object.entries(src)) {
    if (!raw || typeof raw !== "object") continue;
    own[id] = { ...raw, id: raw.id || id };
  }
}

function normLine(r: Record<string, unknown>): ExamLine | null {
  const id = String(r.id || "").trim();
  const label = String(r.label || "").trim();
  if (!id || !label) return null;
  const from = r.from != null ? String(r.from).trim() : "";
  const to = r.to != null ? String(r.to).trim() : "";
  let desc = r.desc != null ? String(r.desc).trim() : "";
  const article = r.article != null ? String(r.article).trim() : "";
  const scaleRaw = r.scale != null ? Number(r.scale) : NaN;
  const replyRaw = r.reply != null ? String(r.reply) : "";
  const line: ExamLine = { id, label };
  if (from && to) { line.from = from; line.to = to; }
  if (desc) line.desc = desc;
  if (article) line.article = article;
  if (replyRaw === "number" || replyRaw === "text" || replyRaw === "scale") line.reply = replyRaw;
  else if (scaleRaw === 1 || (from && to)) line.reply = "scale";
  else line.reply = "scale";
  return line;
}

function normLines(raw: unknown, fallback: ExamLine[]): ExamLine[] {
  if (!Array.isArray(raw)) return fallback.map(l => ({ ...l }));
  const out: ExamLine[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const line = normLine(row as Record<string, unknown>);
    if (line) out.push(line);
  }
  return out;
}

function normEntries(raw: unknown, fallback: ExamEntry[]): ExamEntry[] {
  if (!Array.isArray(raw)) return copyEntries(fallback);
  const out: ExamEntry[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    if (r.kind === "group") {
      const id = String(r.id || "").trim();
      const name = String(r.name || "").trim();
      if (!id || !name) continue;
      out.push({ kind: "group", id, name, lines: normLines(r.lines, []) });
      continue;
    }
    if (r.label != null && r.kind !== "group") {
      const line = normLine(r);
      if (line) out.push(line);
    }
  }
  return out;
}

function entriesOf(src: { entries?: ExamEntry[]; lines?: ExamLine[] } | undefined, fallback: ExamEntry[]): ExamEntry[] {
  if (!src) return copyEntries(fallback);
  if (src.entries !== undefined) return normEntries(src.entries, []);
  if (src.lines !== undefined) return normLines(src.lines, []).map(l => ({ ...l }));
  return copyEntries(fallback);
}

function lineToField(examId: string, line: ExamLine): Field {
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

function mergeOne(id: string, base: ExamItem | undefined, o: Partial<ExamItem> & { id: string; deleted?: boolean }): ExamItem | null {
  if (o.deleted) return null;
  if (!base && !o.name) return null;
  const name = (o.name != null && String(o.name).trim()) ? String(o.name).trim() : (base ? base.name : id);
  const group = (o.group != null && String(o.group)) || (base ? base.group : "other");
  const entries = entriesOf(o, base ? base.entries : []);
  const item: ExamItem = {
    id,
    name,
    group: GROUPS.some(g => g.id === group) ? group : "other",
    entries,
    own: true,
  };
  if (o.tags || (base && base.tags)) item.tags = o.tags || base!.tags;
  return item;
}

export function all(): ExamItem[] {
  const ids = new Set<string>([...byId.keys(), ...Object.keys(own)]);
  const out: ExamItem[] = [];
  for (const id of ids) {
    const base = byId.get(id);
    const o = own[id];
    if (o) {
      const m = mergeOne(id, base, o);
      if (m) out.push(m);
    } else if (base) {
      out.push({ ...base, entries: copyEntries(base.entries), own: false });
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, "ru"));
}

export function inGroup(groupId: string): ExamItem[] {
  return all().filter(x => x.group === groupId)
    .sort((a, b) => a.name.localeCompare(b.name, "ru"));
}

export function get(id: string): ExamItem | undefined {
  return all().find(x => x.id === id);
}

export function groupOf(id: string): ExamGroup | undefined {
  return GROUPS.find(g => g.id === id);
}

export function newOwnId(): string {
  return "own_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function newLineId(): string {
  return "ln_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

export function newNestId(): string {
  return "grp_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

export function toFields(it: ExamItem): Field[] {
  return flatSigns(it).map(line => lineToField(it.id, line));
}

export function topFields(it: ExamItem): Field[] {
  return (it.entries || []).filter((e): e is ExamLine => !isNest(e)).map(line => lineToField(it.id, line));
}

export function nestFields(it: ExamItem): { nest: ExamNest; fields: Field[] }[] {
  return (it.entries || []).filter(isNest).map(nest => ({
    nest,
    fields: nest.lines.map(line => lineToField(it.id, line)),
  }));
}

export function allFields(): Field[] {
  return all().flatMap(toFields);
}

export function fieldByLineCode(code: string): Field | null {
  const p = parseLineCode(code);
  if (!p) return null;
  const it = get(p.examId);
  if (!it) return null;
  const line = flatSigns(it).find(l => l.id === p.lineId);
  if (!line) return null;
  return lineToField(it.id, line);
}

export function isExamLineCode(code: string): boolean {
  const p = parseLineCode(code);
  if (!p) return false;
  const it = get(p.examId);
  return !!(it && flatSigns(it).some(l => l.id === p.lineId));
}

export function findLine(it: ExamItem, lineId: string): ExamLine | undefined {
  return flatSigns(it).find(l => l.id === lineId);
}
