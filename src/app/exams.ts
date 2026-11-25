// SPDX-License-Identifier: AGPL-3.0-or-later
// Электродоктор — справочник пунктов осмотра (группы по системам, без дублей).
// У пункта — строки «на что обратить внимание»; значение заполняется в карточке клиента.
// Тип ответа (да/нет, шкала…) больше не используется.
import type { Field } from "./types.js";

export interface ExamGroup {
  id: string;
  title: string;
  desc: string;
}

/** Тип шкалы признака: 1 — ползунок 0…100. Позже появятся другие. */
export type ExamScale = 1;

/** Одна строка внутри пункта: признак + описание; значение — в анкете. */
export interface ExamLine {
  id: string;
  label: string;
  /** Описание: при scale=1 первая строка — края «здоров — срочно в больницу», дальше текст. */
  desc?: string;
  /** 1 = ползунок 0…100; края берутся из первой строки desc. */
  scale?: ExamScale;
  /** Устарело: края шкалы; читаем, если в desc ещё нет первой строки. */
  from?: string;
  to?: string;
}

export interface ExamItem {
  id: string;
  name: string;
  group: string;
  help?: string;           // устарело: описание теперь у каждой строки (desc)
  lines: ExamLine[];
  tags?: string[];
  own?: boolean;
}

/** Разделитель кода поля в анкете: examId__lineId */
export const LINE_SEP = "__";

export function lineCode(examId: string, lineId: string): string {
  return examId + LINE_SEP + lineId;
}

export function parseLineCode(code: string): { examId: string; lineId: string } | null {
  const i = code.indexOf(LINE_SEP);
  if (i <= 0) return null;
  return { examId: code.slice(0, i), lineId: code.slice(i + LINE_SEP.length) };
}

/** Группы по системам / зонам — канонический индекс без привязки к врачам. */
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

/** Разбор первой строки desc: «здоров — срочно в больницу». */
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

/** Текст описания без строки краёв шкалы (если она есть). */
export function descBody(desc?: string): string {
  if (!desc) return "";
  if (!parseScaleEnds(desc)) return desc.trim();
  const i = desc.search(/\r?\n/);
  return i < 0 ? "" : desc.slice(i).replace(/^\r?\n/, "").trim();
}

/** Края шкалы: из первой строки desc, иначе из устаревших from/to. */
export function scaleEnds(line: ExamLine): { from: string; to: string } | null {
  const fromDesc = parseScaleEnds(line.desc);
  if (fromDesc) return fromDesc;
  const from = (line.from || "").trim();
  const to = (line.to || "").trim();
  return from && to ? { from, to } : null;
}

/** Включён ли ползунок (галочка «1» или старые from+to). */
export function usesSlider(line: ExamLine): boolean {
  if (line.scale === 1) return true;
  return !!(line.from && line.to);
}

/** Описание для редактора: если края только в from/to — поднимаем в первую строку. */
export function editorDesc(line: ExamLine): string {
  const body = line.desc || "";
  if (parseScaleEnds(body)) return body;
  const from = (line.from || "").trim();
  const to = (line.to || "").trim();
  if (!from || !to) return body;
  const rest = body.trim();
  return rest ? `${from} — ${to}\n${rest}` : `${from} — ${to}`;
}

function L(id: string, label: string, scale: ExamScale | 0, desc: string): ExamLine {
  const line: ExamLine = { id, label, desc };
  if (scale === 1) line.scale = 1;
  return line;
}

function E(id: string, group: string, name: string, lines: ExamLine[] = []): ExamItem {
  return { id, group, name, lines };
}

/** Встроенный набор. Шкала 0…100 пока только у «Общее состояние»; остальные — по мере правки. */
export const BUILTIN: ExamItem[] = [
  E("gen_state", "general", "Общее состояние", [
    L("severity", "Тяжесть состояния", 1,
      "здоров — срочно в больницу\nОбщее впечатление: насколько человек сам справляется и нужна ли срочная помощь."),
    L("position", "Положение", 1,
      "сам активен — не двигается\nМожет ли сам сесть, встать, лечь; или лежит / сидит только вынужденно."),
    L("contact", "Контактность", 1,
      "полный контакт — нет контакта\nОтвечает ли на вопросы, удерживает ли внимание, понимает ли обращение."),
    L("face", "Выражение лица", 1,
      "спокойное — крайне тяжёлое\nСпокойное, страдальческое, маскообразное, испуганное — что видно по лицу."),
    L("weakness", "Слабость", 1,
      "нет слабости — полная адинамия\nНасколько выраженная слабость: от обычной бодрости до полной адинамии."),
  ]),
  E("gen_consciousness", "general", "Сознание"),
  E("gen_build", "general", "Телосложение и питание"),
  E("gen_rr", "general", "Частота дыхания"),

  E("skin_color", "skin", "Цвет кожи"),
  E("skin_moisture", "skin", "Влажность кожи"),
  E("skin_rash", "skin", "Сыпь"),
  E("skin_jaundice", "skin", "Желтуха"),
  E("skin_cyanosis", "skin", "Цианоз"),

  E("lymph_enlarged", "lymph", "Увеличение лимфоузлов"),
  E("lymph_note", "lymph", "Лимфоузлы: описание"),

  E("head_pharynx", "head", "Зев и миндалины"),
  E("head_eyes", "head", "Глаза и склеры"),
  E("head_thyroid", "head", "Щитовидная железа"),

  E("resp_dyspnea", "resp", "Одышка в покое"),
  E("resp_auscultation", "resp", "Аускультация лёгких"),
  E("resp_rales", "resp", "Хрипы"),
  E("resp_percussion", "resp", "Перкуссия грудной клетки"),

  E("cardio_sounds", "cardio", "Тоны сердца"),
  E("cardio_murmur", "cardio", "Шумы сердца"),
  E("cardio_rhythm", "cardio", "Ритм"),
  E("cardio_edema_legs", "cardio", "Отёки ног"),
  E("cardio_peripheral", "cardio", "Пульс на периферии"),

  E("abd_soft", "abdomen", "Живот"),
  E("abd_tenderness", "abdomen", "Болезненность живота"),
  E("abd_liver", "abdomen", "Печень"),
  E("abd_spleen", "abdomen", "Селезёнка"),
  E("abd_bowel", "abdomen", "Перистальтика"),

  E("urine_tapping", "urine", "Поколачивание по пояснице"),
  E("urine_face_edema", "urine", "Отёки лица"),

  E("neuro_meningeal", "neuro", "Менингеальные знаки"),
  E("neuro_strength", "neuro", "Сила в конечностях"),
  E("neuro_romberg", "neuro", "Проба Ромберга"),
  E("neuro_pupils", "neuro", "Зрачки"),

  E("msk_joints", "msk", "Суставы"),
  E("msk_rom", "msk", "Объём движений"),
  E("msk_deformity", "msk", "Деформация / осанка"),

  E("other_local", "other", "Локальный статус"),
  E("other_note", "other", "Прочие находки осмотра"),
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

function normLines(raw: unknown, fallback: ExamLine[]): ExamLine[] {
  if (!Array.isArray(raw)) return fallback.map(l => ({ ...l }));
  const out: ExamLine[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const id = String(r.id || "").trim();
    const label = String(r.label || "").trim();
    if (!id || !label) continue;
    const from = r.from != null ? String(r.from).trim() : "";
    const to = r.to != null ? String(r.to).trim() : "";
    let desc = r.desc != null ? String(r.desc).trim() : "";
    const scaleRaw = r.scale != null ? Number(r.scale) : NaN;
    const line: ExamLine = { id, label };
    // старые сохранённые from/to без строки краёв в desc — поднимаем в desc
    if (from && to && !parseScaleEnds(desc)) {
      desc = desc ? `${from} — ${to}\n${desc}` : `${from} — ${to}`;
    }
    if (desc) line.desc = desc;
    if (scaleRaw === 1 || (from && to)) line.scale = 1;
    out.push(line);
  }
  return out;
}

function lineToField(examId: string, line: ExamLine): Field {
  const code = lineCode(examId, line.id);
  if (usesSlider(line)) {
    const ends = scaleEnds(line) || { from: "0", to: "100" };
    const hint = descBody(line.desc) || undefined;
    return { code, label: line.label, type: "slider", min: 0, max: 100, scaleFrom: ends.from, scaleTo: ends.to, hint };
  }
  const full = (line.desc || "").trim() || undefined;
  return { code, label: line.label, type: "text", hint: full };
}

function mergeOne(id: string, base: ExamItem | undefined, o: Partial<ExamItem> & { id: string; deleted?: boolean }): ExamItem | null {
  if (o.deleted) return null;
  if (!base && !o.name) return null;
  const name = (o.name != null && String(o.name).trim()) ? String(o.name).trim() : (base ? base.name : id);
  const group = (o.group != null && String(o.group)) || (base ? base.group : "other");
  const lines = o.lines !== undefined ? normLines(o.lines, []) : (base ? base.lines.map(l => ({ ...l })) : []);
  const item: ExamItem = {
    id,
    name,
    group: GROUPS.some(g => g.id === group) ? group : "other",
    lines,
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
      out.push({ ...base, lines: base.lines.map(l => ({ ...l })), own: false });
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

/** Строки пункта → поля анкеты (код examId__lineId). */
export function toFields(it: ExamItem): Field[] {
  return it.lines.map(line => lineToField(it.id, line));
}

/** Все поля осмотра для анкеты / истории. */
export function allFields(): Field[] {
  return all().flatMap(toFields);
}

/** Поле по коду строки осмотра, если код вида exam__line. */
export function fieldByLineCode(code: string): Field | null {
  const p = parseLineCode(code);
  if (!p) return null;
  const it = get(p.examId);
  if (!it) return null;
  const line = it.lines.find(l => l.id === p.lineId);
  if (!line) return null;
  return lineToField(it.id, line);
}

export function isExamLineCode(code: string): boolean {
  const p = parseLineCode(code);
  if (!p) return false;
  const it = get(p.examId);
  return !!(it && it.lines.some(l => l.id === p.lineId));
}
