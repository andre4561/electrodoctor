// SPDX-License-Identifier: AGPL-3.0-or-later
// Электродоктор — разделы диагнозов по врачебным специальностям (Настройки → Диагнозы).
// Данные — docs/data/diagnoses.json; его собирает tools/diagnoses_sections.py по тегам статей.
// Карточки разделов — в том же стиле, что главная страница статей: иконка, название, подпись, число.

import * as Settings from "./settings.js";
import * as Sg from "./signs.js";
import type * as Norms from "./norms.js";
import { STEPS } from "./fields.js";
import * as Labs from "./labs.js";

export interface DxSection { id: string; title: string; desc: string; tags: string[] }
export interface DxFlag { id: string; title: string; tags: string[] }
export interface DxItem { title: string; sections: string[]; flags?: string[] }
export interface DxData { sections: DxSection[]; flags: DxFlag[]; items: Record<string, DxItem> }

export const DX_URL = "../data/diagnoses.json";
let signsReady = false;
let data: DxData | null = null, loadError = "", loading: Promise<void> | null = null;
export function loadDiagnoses(): Promise<void> {
  return loading || (loading = fetch(DX_URL, { cache: "no-cache" })
    .then(r => { if (!r.ok) throw new Error("ответ " + r.status); return r.json(); })
    .then(j => { if (j.format !== "electrodoctor-diagnoses") throw new Error("это не файл разделов диагнозов"); data = j; })
    .catch(e => { loadError = "Не загрузились разделы диагнозов (" + DX_URL + "): " + ((e && e.message) || e); loading = null; }));
}

const S = 'fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"';
const ICONS: Record<string, string> = {
  cardio: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/><path d="M5.5 12H8l1.5-2.5 3 5 1.5-2.5h4"/>',
  pulmo: '<path d="M12 3v8"/><path d="M12 9.5c-.8 1-1.7 1.5-2.6 1.5M12 9.5c.8 1 1.7 1.5 2.6 1.5"/><path d="M9 6.5C6 6.5 4 11.5 4 16.5c0 2 1 3.5 3 3.5s3-1.2 3-3.2V9c0-1.6-.4-2.5-1-2.5z"/><path d="M15 6.5c3 0 5 5 5 10 0 2-1 3.5-3 3.5s-3-1.2-3-3.2V9c0-1.6.4-2.5 1-2.5z"/>',
  gastro: '<path d="M10 3v4c0 2.2-4 3.2-4 8a6 6 0 0 0 6 6c4 0 7-3 7-7 0-3-2-5-5-5-1.5 0-2.3 1-2.3 2.2"/><path d="M9 3h3"/>',
  endo: '<path d="M12 8c-1-3.2-6-4.2-7 0-1 4.2 2 8 5 8 1.1 0 2-.9 2-2"/><path d="M12 8c1-3.2 6-4.2 7 0 1 4.2-2 8-5 8-1.1 0-2-.9-2-2"/><path d="M12 8v6M12 4v1.5"/>',
  neuro: '<path d="M9 4.2A3 3 0 0 0 6 7a3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 1.2V5.5A2.2 2.2 0 0 0 9 4.2z"/><path d="M15 4.2A3 3 0 0 1 18 7a3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 1.2V5.5a2.2 2.2 0 0 1 3-1.3z"/><path d="M8 10h2M14 14h2"/>',
  psych: '<path d="M6 21v-4a7 7 0 1 1 11.5-5.4L19 15h-2v2a2 2 0 0 1-2 2h-2v2"/><path d="M10 9.5a1.5 1.5 0 0 1 3-.4 1.5 1.5 0 0 1 3 .4c0 1.6-3 3.5-3 3.5s-3-1.9-3-3.5z"/>',
  nephro: '<path d="M10 4C6 4 4 8 4 12s2 8 6 8c2 0 3-1.5 3-3.5S11 14 11 12s2-2.5 2-4.5S12 4 10 4z"/><path d="M13 12h3l3 6"/>',
  gyn: '<circle cx="12" cy="9" r="5"/><path d="M12 14v7M9 18h6"/>',
  andro: '<circle cx="10" cy="14" r="5"/><path d="M13.5 10.5L20 4M15 4h5v5"/>',
  hemat: '<path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z"/><path d="M9.5 14.5A2.5 2.5 0 0 0 12 17"/>',
  rheum: '<path d="M8 3v5.5a4 4 0 0 0 8 0V3"/><path d="M8 21v-4.5a4 4 0 0 1 8 0V21"/><path d="M6 12.5h2M16 12.5h2"/>',
  ortho: '<path d="M8 7l9 10"/><circle cx="6.2" cy="4.8" r="1.9"/><circle cx="4.8" cy="7.8" r="1.9"/><circle cx="19.2" cy="16.2" r="1.9"/><circle cx="17.8" cy="19.2" r="1.9"/>',
  derma: '<path d="M3 8c3-2 6 2 9 0s6-2 9 0"/><path d="M3 13h18M3 18h18"/><path d="M8 13v5M15 13v5"/>',
  ophth: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  ent: '<path d="M7 9a5 5 0 0 1 10 0c0 3-3 4-3 7a3 3 0 0 1-6 0"/><path d="M10 9a2 2 0 0 1 4 0c0 1-1 1.5-1.5 2"/>',
  dent: '<path d="M7 3C5 3 4 5 4 7c0 3 1 5 2 8s1 6 3 6 2-5 3-5 1 5 3 5 2-3 3-6 2-5 2-8c0-2-1-4-3-4s-3 1-5 1-3-1-5-1z"/>',
  infect: '<circle cx="12" cy="12" r="5"/><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.9 2.9M15.5 15.5l2.9 2.9M5.6 18.4l2.9-2.9M15.5 8.5l2.9-2.9"/>',
  immuno: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  onco: '<path d="M12 3a3 3 0 0 0-3 3c0 3 6 9 9 15"/><path d="M12 3a3 3 0 0 1 3 3c0 3-6 9-9 15"/>',
  genetic: '<path d="M7 3c0 5 10 7 10 12 0 3-2 5-2 6"/><path d="M17 3c0 5-10 7-10 12 0 3 2 5 2 6"/><path d="M8.5 7h7M8 17h8M10 12h4"/>',
  other: '<circle cx="12" cy="12" r="9"/><path d="M8 12h.01M12 12h.01M16 12h.01"/>',
};
const icon = (id: string, size = 40) => `<svg class="dx-ico" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" ${S}>${ICONS[id] || ICONS.other}</svg>`;
const esc = (s: unknown) => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" } as Record<string, string>)[c]);
export function plural(n: number): string {
  if (n % 10 === 1 && n % 100 !== 11) return "диагноз";
  if (n % 10 >= 2 && n % 10 <= 4 && !(n % 100 >= 12 && n % 100 <= 14)) return "диагноза";
  return "диагнозов";
}
export const articleUrl = (name: string) => "../articles/diagnoses/" + encodeURIComponent(name) + ".html";

// Настройки → Диагнозы: карточки разделов; #/settings/diagnoses/<раздел> — список диагнозов раздела
export function draw(main: HTMLElement): void {
  if ((!data && !loadError) || !signsReady) { main.innerHTML = `<p class="muted">Загружаю разделы…</p>`; Promise.all([loadDiagnoses(), Sg.loadSigns()]).then(() => { signsReady = true; draw(main); }); return; }
  if (!data) { main.innerHTML = `<div class="card"><p class="err">${esc(loadError)}</p></div>`; return; }
  const sub = decodeURIComponent(location.hash.split("/")[3] || "");
  const sec = data.sections.find(s => s.id === sub);
  if (sec) return drawSection(main, data, sec);
  const all = Object.values(data.items);
  const cnt = (id: string) => all.filter(it => it.sections.includes(id)).length;
  const names = Object.keys(data.items);
  const withSigns = (id: string) => names.filter(n => data!.items[n].sections.includes(id) && signCount(n) > 0).length;
  const m = method();
  const flagCnt = (id: string) => all.filter(it => (it.flags || []).includes(id)).length;
  main.innerHTML = `<div class="set-head"><h2>Диагнозы</h2><span class="muted">${all.length} ${plural(all.length)} в ${data.sections.length} ${data.sections.length % 10 === 1 && data.sections.length % 100 !== 11 ? "разделе" : "разделах"}</span></div>
    <p class="muted dx-lead">Разделы — по специальностям врачей. Диагноз может быть сразу в нескольких разделах.
      Пометки: ${data.flags.map(f => `<span class="dx-flag f-${esc(f.id)}">${esc(f.title)}</span> ${flagCnt(f.id)}`).join(" · ")}.</p>
    <div class="card dx-method">
      <b>Сила отклонения в расчёте вероятности</b>
      <label><input type="radio" name="sm" value="crit"${m === "crit" ? " checked" : ""}> по критичности — кривая показателя (0–100)</label>
      <label><input type="radio" name="sm" value="dev"${m === "dev" ? " checked" : ""}> по проценту отклонения от нормы — меньше ${Sg.DEV_NORMAL}% считается нормой, ${Sg.DEV_FULL}% и больше даёт полную силу</label>
      <p class="muted">⚠ Выбор временный: при калибровке сравнить оба способа на живых примерах (заметка в TODO.md). Критичность описывает опасность и в безопасной зоне даёт 0 — лёгкие отклонения тогда не влияют на вероятность.</p>
    </div>
    <div class="dx-grid">${data.sections.map(s => {
      const n = cnt(s.id), w = withSigns(s.id);
      return `<a class="dx-card" href="#/settings/diagnoses/${esc(s.id)}">${icon(s.id)}<span class="dx-name">${esc(s.title)}</span><span class="dx-desc">${esc(s.desc)}</span><span class="dx-count">${n} ${plural(n)}</span><span class="dx-filled${w ? "" : " none"}">с признаками: ${w}</span></a>`;
    }).join("")}</div>`;
  main.querySelectorAll<HTMLInputElement>("[name=sm]").forEach(r => r.addEventListener("change", () => {
    const st = Settings.load(); st.signMethod = r.value === "dev" ? "dev" : "crit"; Settings.save(st);
  }));
}


// ---------- вероятность диагнозов у клиента (вкладка «Диагнозы» в карточке) ----------
export async function ready(): Promise<string> {
  await Promise.all([loadDiagnoses(), Sg.loadSigns()]); signsReady = true;
  return loadError;
}
export const labName = (code: string) => LAB_NAME[code] || (Labs.LABS[code] && Labs.LABS[code].name) || code;
export const labUnit = (code: string) => LAB_UNIT[code] || (Labs.LABS[code] && Labs.LABS[code].unit) || "";
export const sectionTitle = (id: string) => ((data && data.sections.find(s => s.id === id)) || { title: id }).title;
export const flagTitle = (id: string) => ((data && data.flags.find(f => f.id === id)) || { title: id }).title;
export const currentMethod = (): Sg.Method => method();
export interface Ranked { name: string; item: DxItem; signs: Sg.Signs; score: Sg.DxScore; prior: number }
// Все диагнозы с признаками, посчитанные по анализам клиента; самые вероятные — первыми
// Пол клиента: диагнозы только андрологии не показываем женщинам, только гинекологии — мужчинам.
// ⚠ Временное правило по разделам; точнее — пометить пол у каждого диагноза (см. TODO.md).
function sexFits(item: DxItem, sex: string): boolean {
  const s = item.sections;
  if (sex === "F" && s.length && s.every(x => x === "andro")) return false;
  if (sex === "M" && s.length && s.every(x => x === "gyn")) return false;
  return true;
}
export function rank(values: Record<string, unknown>, ctx: Norms.Ctx): Ranked[] {
  if (!data) return [];
  const m = method(), out: Ranked[] = [], sex = String(values.SEX || "");
  const withSigns = Object.keys(data.items).map(n => ({ n, s: signsFor(n) })).filter(x => x.s && Sg.labSigns(x.s).length) as { n: string; s: Sg.Signs }[];
  const spec = Sg.specificity(withSigns.map(x => x.s));
  for (const { n: name, s } of withSigns) {
    const item = data.items[name]; if (!sexFits(item, sex)) continue;
    out.push({ name, item, signs: s, score: Sg.evaluate(s, values, ctx, m, spec), prior: s.prior ?? Sg.DEFAULT_PRIOR });
  }
  return out.sort((a, b) => (b.score.p - b.prior) - (a.score.p - a.prior));
}

// ---------- признаки диагнозов ----------
type Own = Record<string, Sg.Signs>;
const ownSigns = (): Own => (Settings.load().signs || {}) as Own;
const method = (): Sg.Method => Settings.load().signMethod === "dev" ? "dev" : "crit";
const signsFor = (name: string): Sg.Signs | undefined => ownSigns()[name] || Sg.FILE_SIGNS[name];
const signCount = (name: string) => { const s = signsFor(name); return s ? (s.labs || []).length + (s.exam || []).length + (s.instr || []).length : 0; };
function putOwn(name: string, s: Sg.Signs | null): void {
  const st = Settings.load(); const own = { ...(st.signs || {}) };
  if (s) own[name] = s; else delete own[name];
  st.signs = own; Settings.save(st);
}
// Анализы для выбора — числовые поля вкладки «Анализы», по группам
const LAB_GROUPS = (() => {
  const st = STEPS.find(s => s.id === "labs");
  return st ? st.sections.map(s => ({ title: s.title, fields: s.fields.filter(f => f.type === "number") })).filter(g => g.fields.length) : [];
})();
const LAB_NAME: Record<string, string> = {}, LAB_UNIT: Record<string, string> = {};
for (const g of LAB_GROUPS) for (const f of g.fields) { LAB_NAME[f.code] = f.label; LAB_UNIT[f.code] = f.unit || ""; }
const DIRS: [Sg.Dir, string][] = [["up", "↑ выше нормы"], ["down", "↓ ниже нормы"], ["any", "↕ любое отклонение"]];
function labRow(sg?: Sg.LabSign): string {
  const code = sg ? sg.code : "";
  const known = !code || LAB_NAME[code];
  const meta = sg ? ` data-why="${esc(sg.why || "")}" data-kind="${esc(sg.kind || "")}" data-src="${esc(sg.src || "")}"` : "";
  const note = sg && (sg.why || sg.kind === "risk" || sg.src === "knowledge") ? `<small class="dx-why">${sg.kind === "risk" ? `<span class="dx-tag">фактор риска</span> ` : ""}${sg.src === "knowledge" ? `<span class="dx-tag">не из статьи</span> ` : ""}${esc(sg.why || "")}</small>` : "";
  return `<tr data-sign${meta}><td><select name="code" aria-label="Показатель"><option value="">— выберите анализ —</option>${known ? "" : `<option value="${esc(code)}" selected>${esc(code)} (нет в анкете)</option>`}${LAB_GROUPS.map(g =>
      `<optgroup label="${esc(g.title)}">${g.fields.map(f => `<option value="${esc(f.code)}"${f.code === code ? " selected" : ""}>${esc(f.label)}</option>`).join("")}</optgroup>`).join("")}</select>${note}</td>
    <td><select name="dir" aria-label="Направление">${DIRS.map(([v, l]) => `<option value="${v}"${(sg ? sg.dir : "up") === v ? " selected" : ""}>${l}</option>`).join("")}</select></td>
    <td><input type="number" name="w" min="0" max="10" step="1" value="${sg ? esc(sg.w) : 5}" aria-label="Важность 0–10"></td>
    <td><select name="normal" aria-label="Если в норме"><option value="none"${!sg || sg.normal !== "lower" ? " selected" : ""}>не влияет</option><option value="lower"${sg && sg.normal === "lower" ? " selected" : ""}>снижает вероятность</option></select></td>
    <td><button type="button" class="btn danger" data-dx-act="rm" title="убрать признак" aria-label="убрать признак">×</button></td></tr>`;
}
const textList = (xs: Sg.TextSign[] | undefined, empty: string) => xs && xs.length
  ? `<ul class="dx-text">${xs.map(x => `<li>${esc(x.name)}${x.w != null ? ` <small class="muted">важность ${esc(x.w)}</small>` : ""}${x.note ? ` <small class="muted">— ${esc(x.note)}</small>` : ""}</li>`).join("")}</ul>`
  : `<p class="muted dx-later">${empty}</p>`;
function dxBody(name: string): string {
  const s = signsFor(name) || { labs: [] }, own = !!ownSigns()[name];
  const src = own ? "изменено вручную" : s.source ? s.source : Sg.FILE_SIGNS[name] ? "исходные" : "признаков пока нет";
  return `<div class="dx-form" data-dxform="${esc(name)}">
    <div class="dx-meta">
      <label>Распространённость <input type="number" name="prior" min="0.01" max="99" step="0.1" value="${esc(s.prior ?? "")}" placeholder="${Sg.DEFAULT_PRIOR}"> %</label>
      <label><input type="checkbox" name="checked"${s.checked ? " checked" : ""}> проверено человеком</label>
      <span class="muted">источник: <span data-dxsrc>${esc(src)}</span></span>
    </div>
    <h4>Анализы <small class="muted">важность 0–10: насколько отклонение указывает на этот диагноз</small></h4>
    <div class="tblwrap"><table class="dx-signs"><thead><tr><th>Показатель</th><th>Направление</th><th>Важность</th><th>Если в норме</th><th></th></tr></thead>
      <tbody>${(s.labs || []).map(labRow).join("")}</tbody></table></div>
    <button type="button" class="btn" data-dx-act="add">+ анализ</button>
    ${s.nolist && s.nolist.length ? `<p class="dx-nolist"><b>Нужны анализы, которых нет в анкете:</b> ${s.nolist.map(x => `<span title="${esc(x.why || "")}">${esc(x.name)}${x.w != null ? ` (${esc(x.w)})` : ""}</span>`).join(", ")}</p>` : ""}
    <h4>Осмотр и жалобы</h4>${textList(s.exam, "Появится следующим шагом: давление, пульс, отёки, жалобы — с той же важностью 0–10.")}
    <h4>Инструментальные исследования <small class="muted">ЭКГ, УЗИ, МРТ, рентген…</small></h4>${textList(s.instr, "Пока без значений: в карточке клиента ещё нет полей для таких исследований.")}
    <div class="dx-foot"><span class="set-saved ok" data-dxsaved></span>${own ? `<button type="button" class="btn" data-dx-act="reset">${Sg.FILE_SIGNS[name] ? "Вернуть исходные признаки" : "Очистить признаки"}</button>` : ""}</div>
  </div>`;
}
function dxStatus(name: string): string {
  const s = signsFor(name), own = !!ownSigns()[name];
  const n = signCount(name);
  const tags = [own ? `<span class="dx-tag own">своё</span>` : "", s && !own && s.source && /ИИ/.test(s.source) ? `<span class="dx-tag ai">черновик ИИ</span>` : "", s && s.checked ? `<span class="dx-tag ok">проверено</span>` : ""].join("");
  return (n ? `признаков: ${n}` : `<span class="muted">признаков нет</span>`) + tags;
}
function collect(form: HTMLElement, name: string): Sg.Signs {
  const base = signsFor(name) || { labs: [] };
  const labs: Sg.LabSign[] = [];
  form.querySelectorAll<HTMLElement>("tr[data-sign]").forEach(tr => {
    const code = tr.querySelector<HTMLSelectElement>("[name=code]")!.value; if (!code) return;
    const w = Math.min(10, Math.max(0, Math.round(Number(tr.querySelector<HTMLInputElement>("[name=w]")!.value) || 0)));
    const dir = tr.querySelector<HTMLSelectElement>("[name=dir]")!.value as Sg.Dir;
    const normal = tr.querySelector<HTMLSelectElement>("[name=normal]")!.value === "lower" ? "lower" as const : undefined;
    const d = tr.dataset;   // пояснения ИИ сохраняем, пока строку не поменяли на другой анализ
    labs.push({ code, dir, w, ...(normal ? { normal } : {}), ...(d.kind === "risk" ? { kind: "risk" as const } : {}), ...(d.src === "knowledge" ? { src: "knowledge" as const } : {}), ...(d.why ? { why: d.why } : {}) });
  });
  const pr = Number(form.querySelector<HTMLInputElement>("[name=prior]")!.value);
  const out: Sg.Signs = { labs, source: "изменено вручную" };
  if (form.querySelector<HTMLInputElement>("[name=prior]")!.value !== "" && isFinite(pr)) out.prior = Math.min(99, Math.max(0.01, pr));
  if (base.exam) out.exam = base.exam;
  if (base.instr) out.instr = base.instr;
  if (base.nolist) out.nolist = base.nolist;
  if (form.querySelector<HTMLInputElement>("[name=checked]")!.checked) out.checked = true;
  return out;
}

function drawSection(main: HTMLElement, d: DxData, sec: DxSection): void {
  const list = Object.entries(d.items).filter(([, it]) => it.sections.includes(sec.id)).sort((a, b) => a[1].title.localeCompare(b[1].title, "ru"));
  const flagTitle = (id: string) => (d.flags.find(f => f.id === id) || { title: id }).title;
  const secTitle = (id: string) => (d.sections.find(s => s.id === id) || { title: id }).title;
  const used = d.flags.filter(f => list.some(([, it]) => (it.flags || []).includes(f.id)));
  main.innerHTML = `<p class="dx-back"><a href="#/settings/diagnoses">← Все разделы</a></p>
    <div class="set-head dx-head">${icon(sec.id, 32)}<h2>${esc(sec.title)}</h2><span class="muted" id="dxcount">${list.length} ${plural(list.length)}</span></div>
    <div class="dx-tools"><input type="search" id="dxq" placeholder="Поиск по названию" aria-label="Поиск по названию">
      ${used.length ? `<span class="dx-chips" role="group" aria-label="Пометки"><button type="button" class="dx-chip on" data-f="">Все</button>${used.map(f => `<button type="button" class="dx-chip" data-f="${esc(f.id)}">${esc(f.title)}</button>`).join("")}</span>` : ""}</div>
    <div class="dx-acc">${list.map(([name, it]) => {
      const also = it.sections.filter(s => s !== sec.id);
      return `<details class="fold dx-item" data-dx="${esc(name)}" data-k="${esc(it.title.toLowerCase())}" data-f="${esc((it.flags || []).join(" "))}">
        <summary><span class="dx-title"><span class="fold-title">${esc(it.title)}</span><a class="dx-art" href="${articleUrl(name)}" target="_blank" rel="noopener" title="статья о диагнозе — откроется в новой вкладке" aria-label="статья">↗</a>${(it.flags || []).map(f => `<span class="dx-flag f-${esc(f)}">${esc(flagTitle(f))}</span>`).join("")}${also.length ? `<small class="muted dx-also">также: ${also.map(s => esc(secTitle(s))).join(", ")}</small>` : ""}</span><span class="fold-status" data-dxstatus>${dxStatus(name)}</span><span class="fold-chev" aria-hidden="true"></span></summary>
        <div class="fold-body" data-dxbody></div></details>`;
    }).join("")}</div><p class="muted empty" id="dxempty" hidden>Ничего не найдено</p>`;
  // Содержимое строки собирается при раскрытии — страница остаётся лёгкой даже на 150 диагнозов
  const acc = main.querySelector<HTMLElement>(".dx-acc")!;
  acc.addEventListener("toggle", ev => {
    const d = ev.target as HTMLDetailsElement; if (!d.matches || !d.matches("details[data-dx]") || !d.open) return;
    const body = d.querySelector<HTMLElement>("[data-dxbody]")!;
    if (!body.firstChild) body.innerHTML = dxBody(d.dataset.dx!);
  }, true);
  const store = (form: HTMLElement) => {
    const name = form.dataset.dxform!;
    putOwn(name, collect(form, name));
    const d = form.closest("details")!;
    d.querySelector("[data-dxstatus]")!.innerHTML = dxStatus(name);
    const src = form.querySelector<HTMLElement>("[data-dxsrc]"); if (src) src.textContent = "изменено вручную";
    const foot = form.querySelector<HTMLElement>(".dx-foot");
    if (foot && !foot.querySelector("[data-dx-act=reset]")) foot.insertAdjacentHTML("beforeend", `<button type="button" class="btn" data-dx-act="reset">${Sg.FILE_SIGNS[name] ? "Вернуть исходные признаки" : "Очистить признаки"}</button>`);
    const sv = form.querySelector<HTMLElement>("[data-dxsaved]"); if (sv) { sv.textContent = "Сохранено"; setTimeout(() => { sv.textContent = ""; }, 1500); }
  };
  acc.addEventListener("change", ev => {
    const el = ev.target as HTMLElement;
    if (el.matches("[name=code]")) { const tr = el.closest<HTMLElement>("tr")!; delete tr.dataset.why; delete tr.dataset.kind; delete tr.dataset.src; tr.querySelector(".dx-why")?.remove(); }
    const f = el.closest<HTMLElement>("[data-dxform]"); if (f) store(f);
  });
  acc.addEventListener("click", ev => {
    const b = (ev.target as HTMLElement).closest<HTMLElement>("[data-dx-act]"); if (!b) return;
    const form = b.closest<HTMLElement>("[data-dxform]")!, name = form.dataset.dxform!;
    if (b.dataset.dxAct === "add") {
      form.querySelector("tbody")!.insertAdjacentHTML("beforeend", labRow());
      form.querySelector<HTMLSelectElement>("tr[data-sign]:last-child [name=code]")!.focus();
    } else if (b.dataset.dxAct === "rm") { b.closest("tr")!.remove(); store(form); }
    else if (b.dataset.dxAct === "reset") {
      if (!confirm("Убрать свои правки признаков у этого диагноза?")) return;
      putOwn(name, null);
      const body = form.parentElement!; body.innerHTML = dxBody(name);
      body.closest("details")!.querySelector("[data-dxstatus]")!.innerHTML = dxStatus(name);
    }
  });
  const qi = main.querySelector<HTMLInputElement>("#dxq")!;
  let flag = "";
  const apply = () => {
    const s = qi.value.trim().toLowerCase(); let n = 0;
    main.querySelectorAll<HTMLElement>(".dx-item").forEach(li => {
      const ok = (!s || (li.dataset.k || "").includes(s)) && (!flag || (li.dataset.f || "").split(" ").includes(flag));
      li.hidden = !ok; if (ok) n++;
    });
    main.querySelector<HTMLElement>("#dxempty")!.hidden = n > 0;
    main.querySelector<HTMLElement>("#dxcount")!.textContent = `${n} ${plural(n)}${n !== list.length ? " из " + list.length : ""}`;
  };
  qi.addEventListener("input", apply);
  main.querySelectorAll<HTMLButtonElement>(".dx-chip").forEach(b => b.addEventListener("click", () => {
    flag = b.dataset.f || ""; main.querySelectorAll(".dx-chip").forEach(x => x.classList.toggle("on", x === b)); apply();
  }));
}
