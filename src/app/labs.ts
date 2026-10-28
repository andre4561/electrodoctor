// SPDX-License-Identifier: AGPL-3.0-or-later
// Электродоктор — справочник анализов (docs/data/labs.json).
// В бланке вкладки «Анализы» — основные анализы (fields.ts). Остальные из справочника добавляются клиенту
// кнопкой «+ Добавить анализ» и хранятся в c.values под своим кодом, как и анализы бланка.
import type { Field } from "./types.js";

export type LabType = "number" | "qual" | "text";
export type Tier = "basic" | "special" | "rare";
export interface Lab { name: string; aliases: string[]; type: LabType; unit: string; tier: Tier; group?: string; inForm: boolean; article?: string; refs?: number; source?: string }

export const LABS_URL = "../data/labs.json";
export const LABS: Record<string, Lab> = {};
let loading: Promise<void> | null = null;
export function loadLabs(): Promise<void> {
  return loading || (loading = fetch(LABS_URL, { cache: "no-cache" })
    .then(r => (r.ok ? r.json() : { items: {} }))
    .then(j => { Object.assign(LABS, (j && j.items) || {}); })
    .catch(e => { console.error("справочник анализов не загрузился", e); loading = null; }));
}
export const has = (code: string) => !!LABS[code];
export const TIER_NAME: Record<Tier, string> = { basic: "основной", special: "специализированный", rare: "редкий" };

// Результат «положительно/отрицательно»: варианты в бланке и распознавание слов с бланков лабораторий
export const QUAL_OPTIONS: [string, string][] = [["не обнаружено", "не обнаружено"], ["обнаружено", "обнаружено"], ["сомнительно", "сомнительно"]];
const NEG = /(^|[^а-яa-z])(не\s*обнаруж|не\s*выявл|отриц|нет\s*роста|рост[а]?\s*нет|negative|not\s*detected|non-?reactive|нет$|^-$|^отр)/i;
const POS = /(обнаруж|выявл|положит|рост|positive|detected|reactive|^\+|^да$|^есть$)/i;
// +1 — положительно, −1 — отрицательно, 0 — сомнительно или непонятно
export function qualSign(v: unknown): 1 | -1 | 0 {
  const s = String(v == null ? "" : v).trim().toLowerCase();
  if (!s || /сомнит|погранич|equivocal|borderline/.test(s)) return 0;
  if (NEG.test(s)) return -1;
  if (POS.test(s)) return 1;
  return 0;
}
export function normQual(v: unknown): string | null {
  const q = qualSign(v);
  return q === 1 ? "обнаружено" : q === -1 ? "не обнаружено" : /сомнит|погранич|equivocal|borderline/i.test(String(v)) ? "сомнительно" : null;
}

// Поле бланка для анализа из справочника — чтобы рисовать и распознавать его так же, как поля fields.ts
export function fieldFor(code: string): Field | null {
  const l = LABS[code]; if (!l) return null;
  if (l.type === "number") return { code, label: l.name, type: "number", unit: l.unit, step: "any" };
  if (l.type === "qual") return { code, label: l.name, type: "select", options: QUAL_OPTIONS };
  return { code, label: l.name, type: "text" };
}

// Поиск по названию, синонимам и коду; основные и частые — выше
const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е").replace(/[^a-zа-я0-9]+/g, "");
export function search(q: string, exclude: (code: string) => boolean, limit = 12): string[] {
  const n = norm(q); if (n.length < 2) return [];
  const tierW: Record<string, number> = { basic: 0, special: 1, rare: 2 };
  const out: { code: string; score: number }[] = [];
  for (const [code, l] of Object.entries(LABS)) {
    if (exclude(code)) continue;
    const names = [l.name, ...l.aliases, code].map(norm);
    let best = 99;
    names.forEach((x, i) => { const p = x.indexOf(n); if (p >= 0) best = Math.min(best, (p === 0 ? 0 : 2) + (i === 0 ? 0 : 1)); });
    if (best < 99) out.push({ code, score: best * 10 + tierW[l.tier] * 3 - Math.min(5, (l.refs || 0) / 4) });
  }
  return out.sort((a, b) => a.score - b.score).slice(0, limit).map(x => x.code);
}
// Код справочника по названию с бланка лаборатории (для распознавания ИИ)
export function findByName(name: string, code?: string): string | null {
  if (code && LABS[code]) return code;
  const n = norm(name || ""); if (n.length < 2) return null;
  for (const [c, l] of Object.entries(LABS)) if (norm(l.name) === n || l.aliases.some(a => norm(a) === n)) return c;
  return null;
}
