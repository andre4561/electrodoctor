// SPDX-License-Identifier: AGPL-3.0-or-later
// Электродоктор — ядро расчёта на TypeScript.
// Та же логика, что в эталонной реализации engine/electrodoctor.py;
// совпадение результатов проверяет tests/parity.test.js.

export type ParamType = "continuous" | "binary" | "ordinal";
export type Direction = "down" | "up" | "normal";

export interface Parameter {
  code: string;
  name: string;
  unit: string;
  type: ParamType;
  x0: number | null;      // идеал
  w: number | null;       // ширина зоны нормы (в ln)
  scale: number | null;   // отклонение (в ln) за зоной нормы, равное силе 1
  a_low: number | null;
  a_high: number | null;
  max: number | null;     // максимум шкалы для binary / ordinal
  note: string;
}

export interface Diagnosis { name: string; prior: number }

export interface Link {
  diagnosis: string;
  param: string;
  expected: "down" | "up";
  weight: number;
  penalty: number;
  source: string;
}

export interface Reference {
  parameters: Record<string, Parameter>;
  diagnoses: Record<string, Diagnosis>;
  links: Link[];
  directions: Record<string, string[]>;
}

export interface ReferenceCSV { parameters: string; diagnoses: string; links: string; directions: string }

export interface Deviation {
  code: string;
  value: number;
  d: number | null;       // ln(x / x0), только для continuous
  strength: number;       // сила отклонения
  direction: Direction;
  k: number;              // критичность (парабола от логарифма)
}

export interface Contribution { param: string; link: Link; dev: Deviation; value: number }

export interface DiagnosisResult {
  code: string;
  name: string;
  prior: number;
  contributions: Contribution[];
  missing: string[];      // не спрашивали — кандидаты «что уточнить»
  score: number;
  probability: number;
}

export interface Evaluation {
  deviations: Record<string, Deviation>;
  redFlags: Deviation[];
  ranked: DiagnosisResult[];
}

export type Patient = Record<string, number | string | null | undefined>;

export const THRESHOLD = 0.10;   // порог выдачи диагноза
export const RED_FLAG_K = 1.0;   // критичность, начиная с которой показатель срочный

export function parseCSV(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  const head = (rows.shift() || []).map(h => h.trim());
  return rows.map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] || "").trim()])));
}

const num = (s: string | undefined): number | null => (s === "" || s == null ? null : Number(s));

export function buildReference(csv: ReferenceCSV): Reference {
  const parameters: Record<string, Parameter> = {};
  for (const r of parseCSV(csv.parameters)) {
    parameters[r.code] = {
      code: r.code, name: r.name, unit: r.unit, type: r.type as ParamType,
      x0: num(r.x0), w: num(r.w), scale: num(r.scale),
      a_low: num(r.a_low), a_high: num(r.a_high), max: num(r.max), note: r.note || ""
    };
  }
  const diagnoses: Record<string, Diagnosis> = {};
  for (const r of parseCSV(csv.diagnoses)) diagnoses[r.code] = { name: r.name, prior: Number(r.prior) };
  const links: Link[] = parseCSV(csv.links).map(r => ({
    diagnosis: r.diagnosis, param: r.param, expected: r.expected as Link["expected"],
    weight: Number(r.weight), penalty: Number(r.penalty), source: r.source || ""
  }));
  const directions: Record<string, string[]> = {};
  for (const r of parseCSV(csv.directions)) (directions[r.diagnosis] = directions[r.diagnosis] || []).push(r.direction);
  return { parameters, diagnoses, links, directions };
}

// Шаг 1: нормализация показателя
export function normalize(p: Parameter, value: number): Deviation {
  if (p.type === "continuous") {
    const d = Math.log(value / (p.x0 as number));
    const strength = Math.max(0, Math.abs(d) - (p.w as number)) / (p.scale as number);
    const direction: Direction = strength === 0 ? "normal" : (d < 0 ? "down" : "up");
    const a = (d < 0 ? p.a_low : p.a_high) as number;
    return { code: p.code, value, d, strength, direction, k: a * strength * strength };
  }
  // binary / ordinal: сила = доля от максимума шкалы
  const strength = value / (p.max as number);
  return { code: p.code, value, d: null, strength, direction: value > 0 ? "up" : "normal", k: 0 };
}

// Шаг 2: вклад пары «диагноз–показатель»
export function contribution(link: Link, dev: Deviation): number {
  if (dev.direction === "normal") return link.penalty;
  const sign = dev.direction === link.expected ? 1 : -1;
  return sign * link.weight * dev.strength;
}

const isNumber = (v: Patient[string]): v is number | string =>
  v !== null && v !== undefined && v !== "" && !Number.isNaN(Number(v));

// Шаг 3: вероятности диагнозов
export function evaluate(patient: Patient, ref: Reference, opts?: { redFlagK?: number }): Evaluation {
  const redK = (opts && opts.redFlagK) || RED_FLAG_K;
  const deviations: Record<string, Deviation> = {};
  for (const [code, v] of Object.entries(patient)) {
    if (ref.parameters[code] && isNumber(v)) deviations[code] = normalize(ref.parameters[code], Number(v));
  }
  const redFlags = Object.values(deviations).filter(d => d.k >= redK);
  const results: Record<string, DiagnosisResult> = {};
  for (const [code, d] of Object.entries(ref.diagnoses)) {
    results[code] = { code, name: d.name, prior: d.prior, contributions: [], missing: [], score: 0, probability: 0 };
  }
  for (const link of ref.links) {
    const res = results[link.diagnosis];
    if (!res) continue;
    const dev = deviations[link.param];
    if (!dev) res.missing.push(link.param);
    else res.contributions.push({ param: link.param, link, dev, value: contribution(link, dev) });
  }
  for (const r of Object.values(results)) {
    r.score = Math.log(r.prior / (1 - r.prior)) + r.contributions.reduce((s, c) => s + c.value, 0);
    r.probability = 1 / (1 + Math.exp(-r.score));
  }
  const ranked = Object.values(results).sort((a, b) => b.probability - a.probability);
  return { deviations, redFlags, ranked };
}
