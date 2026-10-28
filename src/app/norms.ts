// SPDX-License-Identifier: AGPL-3.0-or-later
// Электродоктор — нормы анализов одним числом и кривые критичности.
//
// ИСХОДНЫЕ данные лежат в файле docs/data/norms.json (формат electrodoctor-norms, описание — в поле about):
// норма, типичный интервал, пометка, источник и кривая критичности каждого показателя.
// Кабинет читает файл при запуске. Свои изменения человека хранятся в настройках (settings.ts)
// и только перекрывают исходное; у клиента может быть ещё и своя норма.
import { getData } from "./setstore.js";
import { defaultCurve, evaluate, type Curve } from "./curve.js";

export interface Norm { v: number; range: string; note?: string; name?: string; unit?: string; source?: string; curve?: Curve; adjust?: Rule[] }

export const NORMS_URL = "../data/norms.json";
export const NORMS: Record<string, Norm> = {};
export let normsRaw = "";        // файл как есть — для «Скачать исходные»
export let normsError = "";
export async function loadNorms(): Promise<void> {
  try {
    const res = await fetch(NORMS_URL, { cache: "no-cache" });
    if (!res.ok) throw new Error("ответ " + res.status);
    normsRaw = await res.text();
    const j = JSON.parse(normsRaw);
    if (j.format !== "electrodoctor-norms" || !j.items) throw new Error("это не файл норм");
    for (const [code, it] of Object.entries<any>(j.items)) {
      if (typeof it.norm !== "number") continue;
      NORMS[code] = { v: it.norm, range: String(it.range || ""), note: it.note, name: it.name, unit: it.unit, source: it.source,
        curve: it.curve && Array.isArray(it.curve.pts) && it.curve.pts.length >= 2 ? it.curve : undefined,
        adjust: Array.isArray(it.adjust) ? it.adjust : undefined };
    }
    normsError = "";
  } catch (e) {
    normsError = "Не загрузились исходные нормы (" + NORMS_URL + "): " + ((e instanceof Error && e.message) || e);
    console.error(normsError);
  }
}

export const hasNorm = (code: string) => !!NORMS[code];
// Норма по умолчанию для всех: своя из настроек «Веса» или встроенная
export function defaultNorm(code: string): number | undefined {
  const s = getData(); const o = s && s.norms && s.norms[code];
  return typeof o === "number" && isFinite(o) ? o : NORMS[code] ? NORMS[code].v : undefined;
}
// Кривая критичности: своя из настроек или исходная по интервалу нормы
export function baseCurve(code: string): Curve | undefined {
  const n = NORMS[code]; if (!n) return undefined;
  return n.curve ? { L: n.curve.L, R: n.curve.R, linear: !!n.curve.linear, pts: n.curve.pts.map(p => [p[0], p[1]] as [number, number]) } : defaultCurve(n.v, n.range);
}
const toNum = (value: unknown) => typeof value === "number" ? value : value === "" || value == null ? NaN : Number(String(value).replace(",", "."));

// ---------- уровни: настройки → правило по параметрам клиента → своё у клиента ----------
// Контекст клиента: его анкета (пол, возраст…), свои нормы и кривые
export interface Ctx { values?: Record<string, unknown>; norms?: Record<string, number>; curves?: Record<string, Curve> }
// Правило в norms.json: items.CODE.adjust = [{ when: { SEX: "F", ageFrom: 18, ageTo: 60, child: false }, norm?, curve?, label?, source? }]
export interface Rule { when?: { SEX?: string; ageFrom?: number; ageTo?: number; child?: boolean }; norm?: number; curve?: Curve; label?: string; source?: string }
function ruleFor(code: string, ctx?: Ctx): Rule | undefined {
  const n = NORMS[code]; const list = n && n.adjust;
  if (!list || !ctx || !ctx.values) return undefined;
  const sex = String(ctx.values.SEX || ""), age = toNum(ctx.values.AGE);
  return list.find(r => {
    const w = r.when || {};
    if (w.SEX && w.SEX !== sex) return false;
    if (w.ageFrom != null && !(isFinite(age) && age >= w.ageFrom)) return false;
    if (w.ageTo != null && !(isFinite(age) && age < w.ageTo)) return false;
    if (w.child != null && !(isFinite(age) && (age < 18) === w.child)) return false;
    return true;
  });
}
const validCurve = (c: any): c is Curve => !!c && Array.isArray(c.pts) && c.pts.length >= 2 && typeof c.L === "number" && typeof c.R === "number";
export type Layer = "settings" | "rule" | "own";
export interface Resolved { norm?: number; curve?: Curve; normFrom: Layer; curveFrom: Layer; rule?: Rule; general: { norm?: number; curve?: Curve } }
// Что берётся у клиента и откуда. general — то, что было бы без своей правки клиента (для «Вернуть общую»)
export function resolve(code: string, ctx?: Ctx): Resolved {
  const r = ruleFor(code, ctx);
  const sNorm = defaultNorm(code), sCurve = settingsCurve(code);
  const gNorm = r && typeof r.norm === "number" ? r.norm : sNorm;
  const gCurve = r && validCurve(r.curve) ? r.curve : sCurve;
  const oN = ctx && ctx.norms && ctx.norms[code], oC = ctx && ctx.curves && ctx.curves[code];
  const ownN = typeof oN === "number" && isFinite(oN), ownC = validCurve(oC);
  return {
    norm: ownN ? oN : gNorm, curve: ownC ? oC : gCurve,
    normFrom: ownN ? "own" : r && typeof r.norm === "number" ? "rule" : "settings",
    curveFrom: ownC ? "own" : r && validCurve(r.curve) ? "rule" : "settings",
    rule: r, general: { norm: gNorm, curve: gCurve },
  };
}
export const normFor = (code: string, ctx?: Ctx) => resolve(code, ctx).norm;
function settingsCurve(code: string): Curve | undefined {
  const s = getData(); const c = s && s.curves && s.curves[code];
  return validCurve(c) ? c : baseCurve(code);
}
// Кривая для всех клиентов (настройки или исходная); с контекстом — для клиента
export function curveFor(code: string, ctx?: Ctx): Curve | undefined { return ctx ? resolve(code, ctx).curve : settingsCurve(code); }

// Отклонение в процентах от нормы клиента (норма 0 — процент не считается)
export function devPct(code: string, value: unknown, ctx?: Ctx): number | null {
  const nv = normFor(code, ctx), v = toNum(value);
  if (nv === undefined || nv === 0 || !isFinite(v)) return null;
  return (v - nv) / nv * 100;
}
// Критичность 0–100 по кривой показателя
export function criticality(code: string, value: unknown, ctx?: Ctx): { text: string; cls: string; tip: string; k?: number } {
  const p = devPct(code, value, ctx), c = curveFor(code, ctx);
  if (p === null || !c) {
    const nv = normFor(code, ctx);
    return { text: "—", cls: "empty", tip: nv === 0 && isFinite(toNum(value)) ? "норма 0 — отклонение в процентах не считается" : "критичность 0–100 по кривой показателя" };
  }
  const k = Math.round(evaluate(c, p));
  const cls = k <= 10 ? "k0" : k <= 35 ? "k1" : k <= 65 ? "k2" : k < 90 ? "k3" : "k4";
  return { text: String(k), cls, k, tip: `критичность ${k} из 100 при отклонении ${p > 0 ? "+" : ""}${Math.round(p)}%` };
}
export const parseNum = (s: string): number => { const t = s.trim().replace(/\s+/g, "").replace(",", "."); return t === "" ? NaN : Number(t); };
export const fmtNum = (n: number) => String(n).replace(".", ",");
const fmt = (n: number) => String(n).replace(".", ",");
const decimals = (n: number) => { const s = String(n); const i = s.indexOf("."); return i < 0 ? 0 : s.length - i - 1; };
const q = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

// Отклонение: значение − норма в единицах и в процентах. Меньше нормы — со знаком минус.
export function deviation(code: string, value: unknown, ctx?: Ctx): { text: string; cls: string } {
  const nv = normFor(code, ctx), v = toNum(value);
  if (nv === undefined || !isFinite(v)) return { text: "—", cls: "empty" };
  const d = Math.min(3, Math.max(decimals(v), decimals(nv)));
  const diff = Math.round((v - nv) * 10 ** d) / 10 ** d;
  if (diff === 0) return { text: "0", cls: "zero" };
  const p = nv !== 0 ? Math.round((v - nv) / nv * 100) : null;
  const sign = (x: number) => (x > 0 ? "+" : x < 0 ? "−" : "") + fmt(Math.abs(x));
  return { text: sign(diff) + (p !== null ? " · " + sign(p) + "%" : ""), cls: diff > 0 ? "up" : "down" };
}
export function critHtml(code: string, value: unknown, ctx?: Ctx): string {
  const k = criticality(code, value, ctx);
  return `<span class="crit ${k.cls}" data-crit="${code}" title="${q(k.tip)}">${k.text}</span>`;
}
// Три шарика — откуда норма и кривая: серый — настройки, фиолетовый — правило по параметрам, голубой — своё у клиента.
// Горит тот, откуда взято; фиолетовый кольцом — правило есть, но перекрыто своей правкой.
export function marksHtml(code: string, unit: string, ctx?: Ctx): string {
  const r = resolve(code, ctx);
  const own = r.normFrom === "own" || r.curveFrom === "own";
  const ruleOn = !own && (r.normFrom === "rule" || r.curveFrom === "rule");
  const ruleRing = own && !!r.rule;
  const u = unit ? " " + unit : "";
  const parts: string[] = [];
  if (own) parts.push(`Своё у клиента:${r.normFrom === "own" ? ` норма ${fmt(r.norm!)}${u}` : ""}${r.curveFrom === "own" ? " своя кривая" : ""}. Общая норма — ${r.general.norm !== undefined ? fmt(r.general.norm) + u : "—"}.`);
  if (r.rule) parts.push(`Правило «${r.rule.label || "по параметрам клиента"}»${typeof r.rule.norm === "number" ? `: норма ${fmt(r.rule.norm)}${u}` : ""}${ruleRing ? " — перекрыто своей правкой" : ""}.`);
  if (!own && !r.rule) parts.push("Норма и кривая — из настроек «Нормы и веса».");
  return `<span class="marks" data-marks="${code}" title="${q(parts.join(" "))}"><i class="mk mk-s${!own && !ruleOn ? " on" : ""}"></i><i class="mk mk-r${ruleOn ? " on" : ruleRing ? " ring" : ""}"></i><i class="mk mk-o${own ? " on" : ""}"></i></span>`;
}
export function colsHtml(code: string, unit: string, value: unknown, ctx?: Ctx): string {
  if (!NORMS[code]) return "";
  const dv = deviation(code, value, ctx);
  return `<span class="lab-cols">${normHtml(code, unit, ctx)}<span class="dev ${dv.cls}" data-dev="${code}" title="значение минус норма: в единицах и в процентах">${dv.text}</span>${critHtml(code, value, ctx)}${marksHtml(code, unit, ctx)}</span>`;
}
export function normHtml(code: string, unit = "", ctx?: Ctx): string {
  const n = NORMS[code]; if (!n) return "";
  const r = resolve(code, ctx), own = r.normFrom === "own" || r.curveFrom === "own";
  const tip = `Норма ${fmt(r.norm!)}${unit ? " " + unit : ""}. Типичный интервал ${n.range}.${n.note ? " " + n.note + "." : ""} Нажмите — норма и кривая критичности для этого клиента.`;
  return `<button type="button" class="norm${own ? " own" : ""}" data-norm="${code}" title="${q(tip)}">${fmt(r.norm!)}</button>`;
}
