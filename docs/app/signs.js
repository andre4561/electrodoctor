// SPDX-License-Identifier: AGPL-3.0-or-later
// Электродоктор — признаки диагнозов и вероятность диагноза.
//
// У диагноза — список признаков: анализ, ожидаемое направление (выше/ниже нормы), важность 0–10
// и что делать, если анализ в норме. Исходные признаки — в docs/data/signs.json (их заполняет ИИ по статьям,
// пометка «черновик ИИ»), правки человека хранятся в настройках и перекрывают исходные.
//
// Формула (черновая, будет калиброваться):
//   сила отклонения s — 0…1, двумя способами (переключатель в Настройки → Диагнозы):
//     "crit" — критичность / 100 по кривой показателя;
//     "dev"  — |отклонение от нормы, %| / DEV_FULL, не больше 1; норма — отклонение меньше DEV_NORMAL %.
//   ⚠ КАЛИБРОВКА: сравнить оба способа на живых примерах (см. TODO.md). Кривая критичности описывает опасность,
//     а не диагностический сигнал: в безопасной зоне она даёт 0, и лёгкие отклонения ничего не добавляют.
//   вклад признака: отклонение в ожидаемую сторону → +важность × s × K; в обратную → −важность × s × K;
//     в норме (критичность в безопасной зоне) и «снижает» → −важность × NORMAL_LOWER × K; не сдан — не считается.
//   вероятность = логистическая функция( logit(распространённость) + сумма вкладов ).
import * as Norms from "./norms.js";
import { SAFE_MAX } from "./curve.js";
import * as Labs from "./labs.js";
export const K = 0.5; // перевод «важность × сила» в шаги логарифма шансов: 10 × 1 → +5
export const DEV_FULL = 50; // способ "dev": отклонение на 50% от нормы и больше — полная сила
export const DEV_NORMAL = 10; // способ "dev": отклонение меньше 10% считается нормой
export const NORMAL_LOWER = 0.5; // насколько анализ в норме снижает вероятность (доля от важности)
export const DEFAULT_PRIOR = 2; // распространённость по умолчанию, %
export const SIGNS_URL = "../data/signs.json";
export let FILE_SIGNS = {};
let loading = null;
export function loadSigns() {
    return loading || (loading = fetch(SIGNS_URL, { cache: "no-cache" })
        .then(r => (r.ok ? r.json() : { items: {} }))
        .then(j => { FILE_SIGNS = (j && j.items) || {}; })
        .catch(() => { FILE_SIGNS = {}; loading = null; }));
}
const toNum = (v) => typeof v === "number" ? v : v === "" || v == null ? NaN : Number(String(v).replace(",", "."));
// Все признаки-анализы диагноза: из блока «Анализы» и из «нет в бланке», у которых есть код справочника
export function labSigns(s) {
    const out = [...(s.labs || [])], have = new Set(out.map(l => l.code));
    for (const x of s.nolist || [])
        if (x.code && !have.has(x.code)) {
            out.push({ code: x.code, dir: x.dir || "any", w: x.w ?? 5, ...(x.why ? { why: x.why } : {}) });
            have.add(x.code);
        }
    return out;
}
// Результат «положительно/отрицательно»: по справочнику или по самому значению («обнаружено», «положительно»…)
const isQual = (code, value) => (Labs.LABS[code] && Labs.LABS[code].type === "qual") || (typeof value === "string" && !isFinite(toNum(value)) && Labs.qualSign(value) !== 0);
// Сила и направление отклонения анализа; null — анализ не сдан или по нему нечего считать
export function strength(code, value, ctx, method) {
    if (value === undefined || value === null || value === "")
        return null;
    if (isQual(code, value)) { // положительно — полная сила «вверх», отрицательно — норма
        const q = Labs.qualSign(value);
        return q === 1 ? { s: 1, dir: "up" } : q === -1 ? { s: 0, dir: "normal" } : null;
    }
    if (!isFinite(toNum(value)))
        return null;
    const p = Norms.devPct(code, value, ctx), k = Norms.criticality(code, value, ctx).k;
    if (p === null || k === undefined)
        return null;
    if (method === "dev" ? Math.abs(p) < DEV_NORMAL : k <= SAFE_MAX)
        return { s: 0, dir: "normal" };
    const s = method === "dev" ? Math.min(1, Math.abs(p) / DEV_FULL) : k / 100;
    return { s, dir: p > 0 ? "up" : "down" };
}
// Специфичность анализа: чем у большего числа диагнозов он в признаках, тем меньше он говорит о каждом.
// spec = ln(N / df) / ln(N / SPEC_FULL), от SPEC_MIN до 1; df — у скольких диагнозов анализ в признаках, N — сколько диагнозов с признаками.
// Пример: СРБ есть у 474 из 740 → 0,3; тропонин у 33 → 0,56; ПСА у 5 → 0,91.  ⚠ КАЛИБРОВКА: см. TODO.md.
export const SPEC_FULL = 3, SPEC_MIN = 0.3;
export function specificity(all) {
    const df = {};
    for (const s of all)
        for (const l of labSigns(s))
            df[l.code] = (df[l.code] || 0) + 1;
    const n = Math.max(all.length, SPEC_FULL + 1), top = Math.log(n / SPEC_FULL);
    return code => Math.min(1, Math.max(SPEC_MIN, Math.log(n / Math.max(1, df[code] || 1)) / top));
}
export function evaluate(signs, values, ctx, method, spec) {
    const prior = Math.min(99.9, Math.max(0.01, signs.prior ?? DEFAULT_PRIOR)) / 100;
    let score = Math.log(prior / (1 - prior));
    const contribs = [], missing = [];
    for (const sg of labSigns(signs)) {
        const v = values[sg.code];
        const st = strength(sg.code, v, ctx, method);
        if (!st) {
            if (v === undefined || v === null || v === "")
                missing.push(sg.code);
            continue;
        } // есть значение, но нет нормы — просто пропускаем
        let c = 0;
        if (st.dir === "normal")
            c = sg.normal === "lower" ? -sg.w * NORMAL_LOWER * K : 0;
        else
            c = (sg.dir === "any" || sg.dir === st.dir ? 1 : -1) * sg.w * st.s * K;
        if (spec)
            c *= spec(sg.code);
        score += c;
        contribs.push({ code: sg.code, c, s: st.s, dir: st.dir });
    }
    return { p: 100 / (1 + Math.exp(-score)), contribs, missing };
}
