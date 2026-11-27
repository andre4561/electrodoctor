// SPDX-License-Identifier: AGPL-3.0-or-later
// Электродоктор — разделы каталога анализов по материалу (SECS, иконки).
// UI каталога живёт в Настройки → Нормы и веса (settings.ts); этот модуль — карточки и helpers.
import * as Labs from "./labs.js";
import * as Settings from "./settings.js";
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
/** Разделы каталога по материалу — те же, что в модалке выбора анализа у клиента. */
export const SECS = [
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
    {
        id: "stool", title: "Кал", desc: "Копрограмма, скрытая кровь, эластаза, патогены и другие",
        prefix: "Кал",
        icon: '<ellipse cx="12" cy="14" rx="6" ry="5"/><path d="M8 11c1-3 2.5-5 4-5s3 2 4 5"/>',
    },
    {
        id: "swab", title: "Мазки", desc: "Слюна, мазки, мокрота, отделяемое слизистых и ран",
        prefix: "Мазки",
        icon: '<path d="M8 20l8-8"/><path d="M14 4l6 6"/><path d="M9 19l-2 2"/><path d="M16 6l2-2"/>',
    },
    {
        id: "csf", title: "Ликвор", desc: "Спинномозговая жидкость: белок, клетки, инфекции ЦНС",
        prefix: "Ликвор",
        icon: '<circle cx="12" cy="8" r="3"/><path d="M12 11v8"/><path d="M9 16h6"/>',
    },
    {
        id: "fluid", title: "Другие жидкости", desc: "Плевральная, синовиальная, асцит, амниотическая и выпоты",
        prefix: "Другие жидкости",
        icon: '<path d="M7 10c0 4 2.5 8 5 8s5-4 5-8-2.5-5-5-5-5 2-5 5z"/>',
    },
    {
        id: "tissue", title: "Ткань", desc: "Биоптат, гистология, цитология, FISH и исследования ткани",
        prefix: "Ткань",
        icon: '<rect x="5" y="7" width="14" height="10" rx="1"/><path d="M9 7V5h6v2"/><path d="M8 12h8"/>',
    },
    {
        id: "breath", title: "Выдыхаемый воздух", desc: "FeNO и другие показатели выдыхаемого воздуха",
        prefix: "Выдыхаемый воздух",
        icon: '<path d="M4 14c2-4 4-6 8-6s6 2 8 6"/><path d="M8 14c1-2 2-3 4-3s3 1 4 3"/>',
    },
    {
        id: "other", title: "Прочее", desc: "Пот, ногти, волосы, кожный соскоб и редкие материалы",
        prefix: "Прочее",
        icon: '<circle cx="12" cy="12" r="7"/><path d="M12 8v4l2.5 2.5"/>',
    },
];
const TYPE_MARK = {
    number: { mark: "X", title: "число" },
    qual: { mark: "±", title: "качеств." },
    text: { mark: "T", title: "текст" },
};
const S = 'fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"';
const ico = (paths, size = 40) => `<svg class="dx-ico" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" ${S}>${paths}</svg>`;
/** Иконка раздела материала — та же, что на карточках «Анализы» / «Нормы и веса». */
export const secIcon = (sec, size = 40) => ico(sec.icon, size);
/** Раздел материала по group каталога; нет группы → «Прочее». */
export function secOfLab(code) {
    const g = (Labs.LABS[code] && Labs.LABS[code].group) || "";
    return SECS.find(s => g.startsWith(s.prefix)) || SECS.find(s => s.id === "other");
}
export function pluralLabs(n) {
    if (n % 10 === 1 && n % 100 !== 11)
        return "анализ";
    if (n % 10 >= 2 && n % 10 <= 4 && !(n % 100 >= 12 && n % 100 <= 14))
        return "анализа";
    return "анализов";
}
const plural = pluralLabs;
function syncOwn() {
    Labs.applyOwn(Settings.load().labs);
}
function entriesFor(sec) {
    syncOwn();
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
/** Короткая подпись кнопки: «Кровь — биохимия» → «биохимия» */
function groupLabel(group, sec) {
    const p = sec.prefix + " — ";
    return group.startsWith(p) ? group.slice(p.length) : group;
}
function row(code, l) {
    const art = artUrl(l);
    const g = l.group || "";
    const tm = TYPE_MARK[l.type] || TYPE_MARK.text;
    const artLink = art ? `<a class="dx-art" href="${esc(art)}" target="_blank" rel="noopener" title="статья об анализе" aria-label="статья">↗</a>` : "";
    const typeBadge = `<span class="lab-type" title="${esc(tm.title)}" aria-label="${esc(tm.title)}">${esc(tm.mark)}</span>`;
    const unit = l.unit ? `<span class="lab-unit">${esc(l.unit)}</span>` : "";
    const own = !!(Settings.load().labs || {})[code];
    return `<tr data-lab="${esc(code)}" data-g="${esc(g)}" data-k="${esc((l.name + " " + code + " " + (l.aliases || []).join(" ")).toLowerCase())}">
    <td><span class="lab-name"><b>${esc(l.name)}</b>${artLink}${typeBadge}${unit}${own ? `<span class="lab-own" title="добавлен в настройках">своё</span>` : ""}</span><small>${esc(code)}${l.inForm ? " · в бланке" : ""}</small></td>
    <td>${l.refs != null ? esc(l.refs) : "—"}</td>
  </tr>`;
}
function drawSection(main, sec) {
    const list = entriesFor(sec);
    const counts = new Map();
    for (const [, l] of list) {
        const g = l.group || `${sec.prefix} — прочее`;
        counts.set(g, (counts.get(g) || 0) + 1);
    }
    const groups = [...counts.keys()].sort((a, b) => (counts.get(b) - counts.get(a))
        || groupLabel(a, sec).localeCompare(groupLabel(b, sec), "ru"));
    const chip = (g, label, n, on = false) => `<button type="button" class="dx-chip${on ? " on" : ""}" data-g="${esc(g)}">${esc(label)} <span class="dx-chip-n">${n}</span></button>`;
    main.innerHTML = `<div class="dx-secbar">
      <a href="#/settings/weights">← Все разделы</a>
      ${secIcon(sec, 32)}
      <h2>${esc(sec.title)}</h2>
      <span class="muted" id="labcount">${list.length} ${plural(list.length)}</span>
      <button type="button" class="btn primary" id="lab-new">+ Добавить анализ</button>
      <input type="search" id="labq" placeholder="Поиск по названию, коду, синониму" aria-label="Поиск анализов">
    </div>
    <div class="lab-chips" role="group" aria-label="Группы">
      ${chip("", "Все", list.length, true)}
      ${groups.map(g => chip(g, groupLabel(g, sec), counts.get(g) || 0)).join("")}
    </div>
    <div class="lab-newform card" id="labnewform" hidden>
      <div class="lab-newgrid">
        <label>Название <input name="name" required placeholder="например, Витамин B12"></label>
        <label>Код <input name="code" required placeholder="B12" pattern="[A-Za-z][A-Za-z0-9_]*" title="латиница, цифры, подчёркивание"></label>
        <label>Единица <input name="unit" placeholder="пмоль/л"></label>
        <label>Тип <select name="type"><option value="number">число</option><option value="qual">качеств.</option><option value="text">текст</option></select></label>
        <label>Группа <select name="group">${groups.map(g => `<option value="${esc(g)}">${esc(groupLabel(g, sec))} (${counts.get(g) || 0})</option>`).join("")}
          <option value="${esc(sec.prefix + " — прочее")}">прочее</option></select></label>
      </div>
      <p class="muted">Анализ попадёт в справочник (в этих настройках) и станет доступен для выбора в кабинете и признаках.</p>
      <div class="grp"><button type="button" class="btn primary" data-lab-save>Сохранить</button><button type="button" class="btn" data-lab-cancel>Отмена</button><span class="err" data-lab-err></span></div>
    </div>
    <div class="card tblwrap lab-card"><table class="lab-table">
      <thead><tr><th>Название</th><th>В диагнозах</th></tr></thead>
      <tbody>${list.map(([c, l]) => row(c, l)).join("")}</tbody>
    </table><p class="muted empty" id="labempty" hidden>Ничего не найдено</p></div>`;
    const qi = main.querySelector("#labq");
    const form = main.querySelector("#labnewform");
    let group = "";
    const apply = () => {
        const s = qi.value.trim().toLowerCase();
        let n = 0;
        main.querySelectorAll("tr[data-lab]").forEach(tr => {
            const ok = (!group || tr.dataset.g === group) && (!s || (tr.dataset.k || "").includes(s));
            tr.hidden = !ok;
            if (ok)
                n++;
        });
        main.querySelector("#labempty").hidden = n > 0;
        main.querySelector("#labcount").textContent = `${n} ${plural(n)}${n !== list.length ? " из " + list.length : ""}`;
    };
    qi.addEventListener("input", apply);
    main.querySelectorAll(".lab-chips .dx-chip").forEach(b => b.addEventListener("click", () => {
        group = b.dataset.g || "";
        main.querySelectorAll(".lab-chips .dx-chip").forEach(x => x.classList.toggle("on", x === b));
        const gs = form.querySelector("[name=group]");
        if (gs && group)
            gs.value = group;
        apply();
    }));
    main.querySelector("#lab-new").onclick = () => {
        form.hidden = false;
        const gs = form.querySelector("[name=group]");
        if (gs && group)
            gs.value = group;
        form.querySelector("[name=name]").focus();
    };
    form.querySelector("[data-lab-cancel]").onclick = () => { form.hidden = true; form.querySelector("[data-lab-err]").textContent = ""; };
    form.querySelector("[data-lab-save]").onclick = () => {
        const err = form.querySelector("[data-lab-err]");
        const name = form.querySelector("[name=name]").value.trim();
        let code = form.querySelector("[name=code]").value.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_");
        const unit = form.querySelector("[name=unit]").value.trim();
        const type = form.querySelector("[name=type]").value;
        const g = form.querySelector("[name=group]").value || `${sec.prefix} — прочее`;
        if (!name) {
            err.textContent = "Укажите название.";
            return;
        }
        if (!code || !/^[A-Z][A-Z0-9_]*$/.test(code)) {
            err.textContent = "Код: латиница, можно цифры и _ , начинается с буквы.";
            return;
        }
        syncOwn();
        if (Labs.has(code)) {
            err.textContent = `Код ${code} уже есть в справочнике.`;
            return;
        }
        const lab = { name, aliases: [], type, unit, group: g, inForm: false, refs: 0 };
        const st = Settings.load();
        st.labs = { ...(st.labs || {}), [code]: lab };
        Settings.save(st);
        Labs.applyOwn(st.labs);
        drawSection(main, sec);
    };
}
export function draw(main) {
    if (!Object.keys(Labs.LABS).length && !Object.keys(Settings.load().labs || {}).length) {
        main.innerHTML = `<p class="muted">Загружаю каталог анализов…</p>`;
        Labs.loadLabs().then(() => { syncOwn(); draw(main); });
        return;
    }
    syncOwn();
    const sub = decodeURIComponent(location.hash.split("/")[3] || "");
    const sec = SECS.find(s => s.id === sub);
    if (sec)
        return drawSection(main, sec);
    const counts = SECS.map(s => ({ s, n: entriesFor(s).length }));
    const total = counts.reduce((a, x) => a + x.n, 0);
    main.innerHTML = `<div class="set-head"><h2>Анализы</h2><span class="muted">${total} ${plural(total)} в каталоге по выбранным разделам</span></div>
    <p class="muted dx-lead">Справочник из <code>docs/data/labs.json</code> плюс свои анализы из настроек. Новые анализы добавляются внутри раздела.</p>
    <div class="dx-grid">${counts.map(({ s, n }) => `<a class="dx-card" href="#/settings/weights/${esc(s.id)}">${secIcon(s)}<span class="dx-name">${esc(s.title)}</span><span class="dx-desc">${esc(s.desc)}</span><span class="dx-count">${n} ${plural(n)}</span></a>`).join("")}</div>`;
}
