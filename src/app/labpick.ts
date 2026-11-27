// SPDX-License-Identifier: AGPL-3.0-or-later
// Электродоктор — выбор анализа из каталога по разделам (всплывающее окно на вкладке «Анализы»).
import * as Labs from "./labs.js";
import { SECS, type LabSec } from "./setlabs.js";
import { lockScroll, unlockScroll } from "./ui.js";

const esc = (s: unknown) => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" } as Record<string, string>)[c]);
const S = 'fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"';
const ico = (paths: string, size = 36) =>
  `<svg class="dx-ico" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" ${S}>${paths}</svg>`;

function plural(n: number): string {
  if (n % 10 === 1 && n % 100 !== 11) return "анализ";
  if (n % 10 >= 2 && n % 10 <= 4 && !(n % 100 >= 12 && n % 100 <= 14)) return "анализа";
  return "анализов";
}

function groupLabel(group: string, sec: LabSec): string {
  const p = sec.prefix + " — ";
  return group.startsWith(p) ? group.slice(p.length) : group;
}

function entriesFor(sec: LabSec): [string, Labs.Lab][] {
  return Object.entries(Labs.LABS)
    .filter(([, l]) => (l.group || "").startsWith(sec.prefix))
    .sort((a, b) => (a[1].group || "").localeCompare(b[1].group || "", "ru")
      || a[1].name.localeCompare(b[1].name, "ru"));
}

export interface LabPickOpts {
  /** Уже на бланке — не показывать кнопку «Добавить». */
  exclude: (code: string) => boolean;
  /** Выбрали анализ — добавить пустую строку для ручного ввода. */
  onAdd: (code: string) => void;
}

/** Окно: сначала разделы материала, затем список с подгруппами и кнопкой «+». */
export function openLabPicker(opts: LabPickOpts): void {
  const ov = document.createElement("div");
  ov.className = "cv-overlay";
  ov.innerHTML = `<div class="cv-dialog labpick-dlg" role="dialog" aria-modal="true" aria-labelledby="labpick-title">
    <div class="cv-head"><b id="labpick-title">Выбрать анализ</b>
      <button type="button" class="btn cv-x" data-close aria-label="закрыть">✕</button></div>
    <div class="labpick-body" id="labpick-body"></div>
  </div>`;
  document.body.appendChild(ov);
  lockScroll();

  const body = ov.querySelector<HTMLElement>("#labpick-body")!;
  let sec: LabSec | null = null;
  let group = "";
  let q = "";

  const close = () => {
    document.removeEventListener("keydown", onKey);
    ov.remove(); unlockScroll();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      if (sec) { sec = null; group = ""; q = ""; draw(); }
      else close();
    }
  };
  document.addEventListener("keydown", onKey);
  ov.addEventListener("click", e => { if (e.target === ov) close(); });
  ov.querySelector("[data-close]")!.addEventListener("click", close);

  const drawHome = () => {
    const counts = SECS.map(s => ({ s, n: entriesFor(s).length }));
    const total = counts.reduce((a, x) => a + x.n, 0);
    body.innerHTML = `<p class="muted labpick-lead">Разделы каталога · ${total} ${plural(total)}. Новый код — в <a href="#/settings/weights">Настройки → Нормы и веса</a>.</p>
      <div class="dx-grid labpick-grid">${counts.map(({ s, n }) =>
        `<button type="button" class="dx-card labpick-card" data-sec="${esc(s.id)}">${ico(s.icon)}<span class="dx-name">${esc(s.title)}</span><span class="dx-desc">${esc(s.desc)}</span><span class="dx-count">${n} ${plural(n)}</span></button>`
      ).join("")}</div>`;
  };

  const drawSec = () => {
    if (!sec) return;
    const list = entriesFor(sec);
    const counts = new Map<string, number>();
    for (const [code, l] of list) {
      if (opts.exclude(code)) continue;
      const g = l.group || `${sec.prefix} — прочее`;
      counts.set(g, (counts.get(g) || 0) + 1);
    }
    const available = list.filter(([code]) => !opts.exclude(code));
    const groups = [...counts.keys()].sort((a, b) => (counts.get(b)! - counts.get(a)!)
      || groupLabel(a, sec!).localeCompare(groupLabel(b, sec!), "ru"));
    const chip = (g: string, label: string, n: number, on = false) =>
      `<button type="button" class="dx-chip${on ? " on" : ""}" data-g="${esc(g)}">${esc(label)} <span class="dx-chip-n">${n}</span></button>`;
    const nq = q.trim().toLowerCase();
    const rows = available.map(([code, l]) => {
      const g = l.group || `${sec!.prefix} — прочее`;
      const key = (l.name + " " + code + " " + (l.aliases || []).join(" ")).toLowerCase();
      const hide = (group && g !== group) || (nq && !key.includes(nq));
      const unit = l.unit ? `<small class="muted">${esc(l.unit)}</small>` : "";
      const type = l.type === "qual" ? `<small class="muted">положит. / отриц.</small>` : "";
      return `<div class="labpick-row"${hide ? " hidden" : ""} data-row data-g="${esc(g)}" data-k="${esc(key)}">
        <div class="labpick-info"><b>${esc(l.name)}</b>${unit}${type}<small class="muted">${esc(code)}${l.aliases.length ? " · " + esc(l.aliases.slice(0, 3).join(", ")) : ""}</small></div>
        <button type="button" class="btn primary labpick-add" data-add="${esc(code)}" title="добавить на бланк">+</button>
      </div>`;
    }).join("");
    const shown = available.filter(([code, l]) => {
      const g = l.group || `${sec!.prefix} — прочее`;
      const key = (l.name + " " + code + " " + (l.aliases || []).join(" ")).toLowerCase();
      return (!group || g === group) && (!nq || key.includes(nq));
    }).length;
    body.innerHTML = `<div class="labpick-bar">
        <button type="button" class="btn" data-back>← Разделы</button>
        ${ico(sec.icon, 28)}
        <b class="labpick-secname">${esc(sec.title)}</b>
        <span class="muted" id="labpick-n">${shown} ${plural(shown)}</span>
        <input type="search" id="labpick-q" value="${esc(q)}" placeholder="Поиск в разделе" aria-label="Поиск в разделе" autocomplete="off">
      </div>
      <div class="lab-chips" role="group" aria-label="Группы">
        ${chip("", "Все", available.length, !group)}
        ${groups.map(g => chip(g, groupLabel(g, sec!), counts.get(g) || 0, group === g)).join("")}
      </div>
      <div class="labpick-list">${rows || `<p class="muted">В этом разделе всё уже на бланке, либо каталог пуст.</p>`}
        <p class="muted" id="labpick-empty" ${shown || !available.length ? "hidden" : ""}>Ничего не найдено</p>
      </div>`;
    body.querySelector<HTMLInputElement>("#labpick-q")?.focus();
  };

  const draw = () => { if (sec) drawSec(); else drawHome(); };
  draw();

  body.addEventListener("click", ev => {
    const t = ev.target as HTMLElement;
    const add = t.closest<HTMLElement>("[data-add]");
    const back = t.closest<HTMLElement>("[data-back]");
    const card = t.closest<HTMLElement>("[data-sec]");
    const chip = t.closest<HTMLElement>(".lab-chips .dx-chip");
    if (add) {
      const code = add.dataset.add!;
      if (opts.exclude(code)) return;
      opts.onAdd(code);
      close();
      return;
    }
    if (back) { sec = null; group = ""; q = ""; draw(); return; }
    if (card) {
      sec = SECS.find(s => s.id === card.dataset.sec) || null;
      group = ""; q = ""; draw(); return;
    }
    if (chip && sec) {
      group = chip.dataset.g || "";
      draw();
    }
  });
  body.addEventListener("input", ev => {
    const inp = ev.target as HTMLInputElement;
    if (inp.id !== "labpick-q" || !sec) return;
    q = inp.value;
    const nq = q.trim().toLowerCase();
    let n = 0;
    body.querySelectorAll<HTMLElement>("[data-row]").forEach(row => {
      const ok = (!group || row.dataset.g === group) && (!nq || (row.dataset.k || "").includes(nq));
      row.hidden = !ok; if (ok) n++;
    });
    const empty = body.querySelector<HTMLElement>("#labpick-empty");
    if (empty) empty.hidden = n > 0;
    const cnt = body.querySelector("#labpick-n");
    if (cnt) cnt.textContent = `${n} ${plural(n)}`;
  });
}
