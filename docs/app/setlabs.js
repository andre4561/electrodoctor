// SPDX-License-Identifier: AGPL-3.0-or-later
// Электродоктор — Настройки → Анализы: каталог docs/data/labs.json по разделам (как карточки статей).
import * as Labs from "./labs.js";
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const SECS = [
    {
        id: "blood", title: "Кровь", desc: "Общий анализ, биохимия, гормоны, инфекции и другие показатели крови",
        prefix: "Кровь",
        icon: '<path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z"/><path d="M9.5 14.5A2.5 2.5 0 0 0 12 17"/>',
    },
    {
        id: "urine", title: "Моча", desc: "Общий анализ мочи, Нечипоренко, суточная и другие",
        prefix: "Моча",
        icon: '<path d="M12 3c4 6 6 9 6 12a6 6 0 0 1-12 0c0-3 2-6 6-12z"/><path d="M10 15h4"/>',
    },
];
const TYPE_NAME = { number: "число", qual: "качеств.", text: "текст" };
const S = 'fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"';
const ico = (paths, size = 40) => `<svg class="dx-ico" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" ${S}>${paths}</svg>`;
function plural(n) {
    if (n % 10 === 1 && n % 100 !== 11)
        return "анализ";
    if (n % 10 >= 2 && n % 10 <= 4 && !(n % 100 >= 12 && n % 100 <= 14))
        return "анализа";
    return "анализов";
}
function entriesFor(sec) {
    return Object.entries(Labs.LABS)
        .filter(([, l]) => (l.group || "").startsWith(sec.prefix))
        .sort((a, b) => (a[1].group || "").localeCompare(b[1].group || "", "ru")
        || a[1].name.localeCompare(b[1].name, "ru"));
}
function artUrl(l) {
    const name = l.article;
    if (!name)
        return null;
    return "../articles/lab-tests/" + encodeURIComponent(name) + ".html";
}
function row(code, l) {
    const art = artUrl(l);
    const aliases = (l.aliases || []).length ? esc(l.aliases.join(", ")) : "—";
    return `<tr data-lab="${esc(code)}" data-k="${esc((l.name + " " + code + " " + (l.aliases || []).join(" ")).toLowerCase())}">
    <td><b>${esc(l.name)}</b><small>${esc(code)}${l.inForm ? " · в бланке" : ""}</small></td>
    <td>${esc(TYPE_NAME[l.type] || l.type)}</td>
    <td>${esc(l.unit || "—")}</td>
    <td>${esc(Labs.TIER_NAME[l.tier] || l.tier)}</td>
    <td>${esc(l.group || "—")}</td>
    <td class="muted">${aliases}</td>
    <td>${l.refs != null ? esc(l.refs) : "—"}</td>
    <td>${art ? `<a href="${esc(art)}" target="_blank" rel="noopener" title="статья">↗</a>` : "—"}</td>
  </tr>`;
}
function drawSection(main, sec) {
    const list = entriesFor(sec);
    // Подгруппы по group внутри раздела
    const byGroup = new Map();
    for (const e of list) {
        const g = e[1].group || sec.title;
        if (!byGroup.has(g))
            byGroup.set(g, []);
        byGroup.get(g).push(e);
    }
    main.innerHTML = `<div class="dx-secbar">
      <a href="#/settings/labs">← Все разделы</a>
      ${ico(sec.icon, 32)}
      <h2>${esc(sec.title)}</h2>
      <span class="muted" id="labcount">${list.length} ${plural(list.length)}</span>
      <input type="search" id="labq" placeholder="Поиск по названию, коду, синониму" aria-label="Поиск анализов">
    </div>
    <div class="card tblwrap lab-card"><table class="lab-table">
      <thead><tr><th>Название</th><th>Тип</th><th>Ед.</th><th>Редкость</th><th>Группа</th><th>Синонимы</th><th>В диагнозах</th><th>Статья</th></tr></thead>
      ${[...byGroup.entries()].map(([g, rows]) => `<tbody data-labsec><tr class="lab-sec"><th colspan="8">${esc(g)}</th></tr>${rows.map(([c, l]) => row(c, l)).join("")}</tbody>`).join("")}
    </table><p class="muted empty" id="labempty" hidden>Ничего не найдено</p></div>`;
    const qi = main.querySelector("#labq");
    const apply = () => {
        const s = qi.value.trim().toLowerCase();
        let n = 0;
        main.querySelectorAll("tr[data-lab]").forEach(tr => {
            const ok = !s || (tr.dataset.k || "").includes(s);
            tr.hidden = !ok;
            if (ok)
                n++;
        });
        main.querySelectorAll("tbody[data-labsec]").forEach(tb => {
            const any = [...tb.querySelectorAll("tr[data-lab]")].some(tr => !tr.hidden);
            tb.hidden = !any;
        });
        main.querySelector("#labempty").hidden = n > 0;
        main.querySelector("#labcount").textContent = `${n} ${plural(n)}${n !== list.length ? " из " + list.length : ""}`;
    };
    qi.addEventListener("input", apply);
}
export function draw(main) {
    if (!Object.keys(Labs.LABS).length) {
        main.innerHTML = `<p class="muted">Загружаю каталог анализов…</p>`;
        Labs.loadLabs().then(() => draw(main));
        return;
    }
    const sub = decodeURIComponent(location.hash.split("/")[3] || "");
    const sec = SECS.find(s => s.id === sub);
    if (sec)
        return drawSection(main, sec);
    const counts = SECS.map(s => ({ s, n: entriesFor(s).length }));
    const total = counts.reduce((a, x) => a + x.n, 0);
    main.innerHTML = `<div class="set-head"><h2>Анализы</h2><span class="muted">${total} ${plural(total)} в каталоге по выбранным разделам</span></div>
    <p class="muted dx-lead">Справочник из <code>docs/data/labs.json</code>. Пока открыты разделы «Кровь» и «Моча» — по полю группы анализа.</p>
    <div class="dx-grid">${counts.map(({ s, n }) => `<a class="dx-card" href="#/settings/labs/${esc(s.id)}">${ico(s.icon)}<span class="dx-name">${esc(s.title)}</span><span class="dx-desc">${esc(s.desc)}</span><span class="dx-count">${n} ${plural(n)}</span></a>`).join("")}</div>`;
}
