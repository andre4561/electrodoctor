// SPDX-License-Identifier: AGPL-3.0-or-later
// Электродоктор — демо-страница расчёта (docs/index.html).
import { buildReference, evaluate, parseCSV, THRESHOLD } from "./engine.js";
import type { Reference, ReferenceCSV } from "./engine.js";

const REPO_RAW = "https://raw.githubusercontent.com/andre4561/electrodoctor/main/";
const LOCAL = "../";
const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
const fmt = (x: number, d: number) => x.toLocaleString("ru-RU", { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (p: number) => fmt(p * 100, 1) + "%";
const esc = (s: unknown) => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" } as Record<string, string>)[c]);

let ref: Reference;
const state: Record<string, number> = {};

async function getText(path: string): Promise<string> {
  for (const base of [LOCAL, REPO_RAW]) {
    try {
      const r = await fetch(base + path, { cache: "no-cache" });
      if (r.ok) return await r.text();
    } catch (e) { /* пробуем следующий источник */ }
  }
  throw new Error("Не удалось загрузить " + path);
}

async function load(): Promise<void> {
  const names = ["parameters", "diagnoses", "links", "directions"] as const;
  const texts = await Promise.all(names.map(n => getText("data/" + n + ".csv")));
  const csv = {} as ReferenceCSV;
  names.forEach((n, i) => { csv[n] = texts[i]; });
  ref = buildReference(csv);
  $("#thr").textContent = pct(THRESHOLD);
  renderInputs();
  render();
}

const GROUPS: [string, string][] = [
  ["continuous", "Анализы и измерения"],
  ["binary", "Жалобы и признаки"],
  ["ordinal", "Шкалы"]
];

function renderInputs(): void {
  let html = "";
  for (const [type, title] of GROUPS) {
    const ps = Object.values(ref.parameters).filter(p => p.type === type);
    if (!ps.length) continue;
    html += `<h3>${title}</h3>`;
    for (const p of ps) {
      html += `<div class="row"><div class="lbl">${esc(p.name)}<small>${esc(p.code)}</small></div><div class="ctl">`;
      if (type === "continuous") {
        html += `<input type="number" step="any" inputmode="decimal" data-code="${p.code}" placeholder="${fmt(p.x0 as number, 0)}" aria-label="${esc(p.name)}"><span class="unit">${esc(p.unit)}</span><span class="dev" id="dev-${p.code}"></span>`;
      } else if (type === "binary") {
        html += `<span class="seg" data-code="${p.code}" role="group" aria-label="${esc(p.name)}"><button data-v="" class="on" title="не спрашивали">?</button><button data-v="1">да</button><button data-v="0">нет</button></span>`;
      } else {
        let opts = `<option value="">—</option>`;
        for (let i = 0; i <= (p.max as number); i++) opts += `<option value="${i}">${i}</option>`;
        html += `<select data-code="${p.code}" aria-label="${esc(p.name)}">${opts}</select><span class="unit">из ${fmt(p.max as number, 0)}</span>`;
      }
      html += `</div></div>`;
    }
  }
  $("#inputs").innerHTML = html;

  document.querySelectorAll<HTMLInputElement | HTMLSelectElement>("#inputs input, #inputs select").forEach(el => {
    el.addEventListener("input", () => { setValue(el.dataset.code as string, el.value); render(); });
  });
  document.querySelectorAll<HTMLElement>("#inputs .seg").forEach(seg => {
    seg.addEventListener("click", ev => {
      const b = (ev.target as HTMLElement).closest("button"); if (!b) return;
      const code = seg.dataset.code as string;
      setValue(code, b.dataset.v); syncControl(code); render();
    });
  });
}

function setValue(code: string, v: string | number | undefined): void {
  if (v === "" || v == null || Number.isNaN(Number(v))) delete state[code];
  else state[code] = Number(v);
}

function syncControl(code: string): void {
  const v = state[code];
  const el = document.querySelector<HTMLElement>(`[data-code="${code}"]`);
  if (!el) return;
  if (el.classList.contains("seg")) {
    el.querySelectorAll("button").forEach(b => b.classList.toggle("on", (v === undefined ? "" : String(v)) === b.dataset.v));
  } else (el as HTMLInputElement).value = v === undefined ? "" : String(v);
}

function render(): void {
  const { deviations, redFlags, ranked } = evaluate(state, ref);

  for (const p of Object.values(ref.parameters)) {
    if (p.type !== "continuous") continue;
    const el = document.getElementById("dev-" + p.code), d = deviations[p.code];
    if (!el) continue;
    el.className = "dev" + (d ? " " + d.direction : "");
    el.textContent = !d ? "" : d.direction === "normal" ? "норма" : (d.direction === "down" ? "↓ " : "↑ ") + "k " + fmt(d.k, 2);
  }

  const fl = $("#flags");
  if (redFlags.length) {
    fl.hidden = false;
    fl.innerHTML = "<strong>Красные флаги:</strong> " + redFlags.map(d => esc(ref.parameters[d.code].name) + " (k = " + fmt(d.k, 2) + ")").join(", ") + ". Сильное отклонение — повод обратиться к врачу без промедления.";
  } else fl.hidden = true;

  if (!Object.keys(state).length) { $("#results").innerHTML = '<p class="status">Введите хотя бы один показатель или выберите пример.</p>'; return; }

  $("#results").innerHTML = ranked.map(r => {
    const shown = r.probability >= THRESHOLD;
    const rows = r.contributions.map(c => {
      const p = ref.parameters[c.param];
      const why = c.dev.direction === "normal" ? "в норме / нет признака" :
        c.dev.direction === c.link.expected ? (c.link.weight >= 0 ? "в ожидаемую сторону" : "признак против") : "в обратную сторону";
      const cls = c.value > 0 ? "plus" : c.value < 0 ? "minus" : "";
      return `<tr><td>${esc(p.name)}</td><td>${esc(why)}</td><td class="num ${cls}">${c.value > 0 ? "+" : ""}${fmt(c.value, 2)}</td></tr>`;
    }).join("");
    const miss = r.missing.length ? `<div class="missing">Что уточнить: ${r.missing.map(c => esc(ref.parameters[c] ? ref.parameters[c].name : c)).join("; ")}</div>` : "";
    return `<div class="dx${shown ? "" : " low"}">
      <div class="dx-head"><div class="dx-name">${esc(r.name)}<span class="code">${esc(r.code)}</span>${shown ? '<span class="tag">выше порога</span>' : ""}</div><div class="pct">${pct(r.probability)}</div></div>
      <div class="bar"><i style="width:${Math.max(0.5, r.probability * 100)}%"></i></div>
      <details${shown ? " open" : ""}><summary>Почему: исходная частота ${pct(r.prior)}, сумма вкладов ${r.contributions.length ? fmt(r.contributions.reduce((s, c) => s + c.value, 0), 2) : "0"}</summary>
        ${rows ? `<table><thead><tr><th>Показатель</th><th>Отклонение</th><th class="num">Вклад</th></tr></thead><tbody>${rows}</tbody></table>` : ""}
        ${miss}
      </details></div>`;
  }).join("");
}

async function loadPreset(name: string): Promise<void> {
  const rows = parseCSV(await getText("examples/" + name + ".csv"));
  for (const k of Object.keys(state)) delete state[k];
  for (const r of rows) if (ref.parameters[r.code]) setValue(r.code, r.value);
  Object.keys(ref.parameters).forEach(syncControl);
  render();
}

document.querySelectorAll<HTMLElement>("[data-preset]").forEach(b => b.addEventListener("click", () => loadPreset(b.dataset.preset as string)));
$("#clear").addEventListener("click", () => { for (const k of Object.keys(state)) delete state[k]; Object.keys(ref.parameters).forEach(syncControl); render(); });

load().catch((err: Error) => { $("#inputs").innerHTML = '<p class="status">' + esc(err.message) + "</p>"; });
