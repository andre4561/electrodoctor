// SPDX-License-Identifier: AGPL-3.0-or-later
// Электродоктор — кабинет: вход, список клиентов, анкета по этапам.
// Данные хранятся в localStorage этого браузера и, если выбрана папка, ещё и в ней
// (см. folder.ts); есть выгрузка в CSV, Markdown и JSON.
import { STEPS } from "./fields.js";
import * as FS from "./folder.js";
import { fold } from "./ui.js";
import * as Files from "./files.js";
import * as AI from "./aiimport.js";
import * as Settings from "./settings.js";
import * as Call from "./aicall.js";
import * as Norms from "./norms.js";
import * as Curve from "./curve.js";
import * as Dx from "./diagnoses.js";
import * as Sg from "./signs.js";
import * as Labs from "./labs.js";
import { articleUrl } from "./articles.js";
const KEY = "electrodoctor.clients.v1";
const $ = (s) => document.querySelector(s);
const btn = (s) => $(s);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const view = $("#view");
// ---------- хранилище в браузере ----------
let storageOk = true;
let memory = { version: 1, clients: {} };
function loadAll() {
    try {
        const raw = localStorage.getItem(KEY);
        const data = raw ? JSON.parse(raw) : null;
        return data && data.clients ? data : { version: 1, clients: {} };
    }
    catch (e) {
        storageOk = false;
        return memory;
    }
}
function saveAll(data) {
    memory = data;
    try {
        localStorage.setItem(KEY, JSON.stringify(data));
        storageOk = true;
    }
    catch (e) {
        storageOk = false;
    }
}
const getClient = (id) => loadAll().clients[id] || null;
function putClient(c) {
    const data = loadAll();
    c.updatedAt = new Date().toISOString();
    data.clients[c.id] = c;
    saveAll(data);
    return toFolder(c);
}
function deleteClient(id) {
    const data = loadAll();
    const c = data.clients[id];
    delete data.clients[id];
    saveAll(data);
    if (c)
        queue = queue.then(() => FS.removeClient(c)).catch(folderError);
    Files.removeAll(id).catch(e => console.error(e));
}
const newId = () => "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
// ---------- папка на компьютере ----------
let queue = Promise.resolve(); // записи в папку идут по очереди
let folderErr = "";
function folderError(e) { folderErr = (e instanceof Error && e.message) || String(e); console.error(e); }
function toFolder(c) {
    if (!FS.ready())
        return Promise.resolve(null);
    const job = queue.then(async () => {
        const files = { "анкета.md": toMarkdown(c), "данные.csv": toCSV(c) };
        const had = c.folder;
        const folder = await FS.writeClient(c, files);
        folderErr = "";
        if (folder && folder !== had) { // запоминаем подпапку, не трогая дату изменения
            const data = loadAll();
            if (data.clients[c.id]) {
                data.clients[c.id].folder = folder;
                saveAll(data);
            }
        }
        return folder;
    });
    queue = job.catch(folderError);
    return job.catch(e => { folderError(e); return null; });
}
// Сверка браузера и папки: берём более свежую версию каждого клиента.
async function syncFolder() {
    if (!FS.ready())
        return 0;
    const data = loadAll();
    let changed = 0;
    for (const c of await FS.readAll()) {
        const mine = data.clients[c.id];
        if (!mine || (c.updatedAt || "") > (mine.updatedAt || "")) {
            data.clients[c.id] = c;
            changed++;
        }
        else if (!mine.folder)
            mine.folder = c.folder;
    }
    saveAll(data);
    for (const c of Object.values(data.clients))
        await toFolder(c);
    return changed;
}
// ---------- поля ----------
const fieldsOf = (step) => step.sections.flatMap(s => s.fields);
const isFilled = (f, v) => f && f.type === "files" ? Array.isArray(v) && v.length > 0
    : f && f.type === "table"
        ? Array.isArray(v) && v.some(r => Object.values(r).some(x => String(x).trim() !== ""))
        : v !== undefined && v !== null && String(v).trim() !== "";
const counts = (f) => !f.computed && !f.hidden && f.type !== "aiimport"; // участвует в «заполнено N из M»
function progress(c, step) {
    const fs = fieldsOf(step).filter(counts);
    const filled = fs.filter(f => isFilled(f, c.values[f.code])).length;
    return { filled, total: fs.length };
}
function compute(c) {
    const h = Number(c.values.HEIGHT), w = Number(c.values.WEIGHT);
    if (h > 0 && w > 0)
        c.values.BMI = Math.round(w / ((h / 100) ** 2) * 10) / 10;
    else
        delete c.values.BMI;
}
const displayName = (c) => String(c.values.NAME || "").trim() || "Без имени";
const fmtDate = (iso) => iso ? new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
// ---------- маршруты ----------
const drafts = {};
const memSession = {};
function sessionGet(k) { try {
    return sessionStorage.getItem(k);
}
catch (e) {
    return memSession[k] ?? null;
} }
function sessionSet(k, v) { try {
    v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v);
}
catch (e) {
    memSession[k] = v;
} }
function route() {
    const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
    if (!parts.length || parts[0] === "clients")
        return renderClients();
    if (parts[0] === "settings") {
        renderNav();
        Settings.render(view, parts[1] || "providers", STEPS.map(s => ({ id: s.id, title: s.title })));
        return;
    }
    if (parts[0] === "client" && parts[1] === "new") {
        const c = { id: newId(), createdAt: new Date().toISOString(), values: {} };
        drafts[c.id] = c;
        location.replace("#/client/" + c.id + "/" + STEPS[0].id);
        return;
    }
    if (parts[0] === "client" && parts[1])
        return renderClient(parts[1], parts[2] || STEPS[0].id);
    location.hash = "#/clients";
}
function renderNav() {
    $("#nav").innerHTML = `<a class="btn" href="../">Главная</a><a class="btn" href="../articles/">Информация</a><a class="btn" href="#/settings">Настройки</a><a class="btn" href="#/clients">Клиенты</a>`;
}
// ---------- клиенты ----------
function renderClients() {
    renderNav();
    const all = Object.values(loadAll().clients).sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
    view.innerHTML = `
    <h1>Клиенты</h1>
    ${storageOk ? "" : '<div class="note">Браузер не даёт сохранять данные (приватный режим?). Записи пропадут после закрытия вкладки — выгрузите их в файл.</div>'}
    <div class="store" id="store"></div>
    <div class="bar">
      <input class="search" id="q" type="search" placeholder="Поиск по имени" aria-label="Поиск">
      <div class="grp">
        <button class="btn" id="exp" ${all.length ? "" : "disabled"}>Выгрузить всех</button>
        <button class="btn" id="imp">Загрузить из файла</button>
        <input type="file" id="impfile" accept=".json,application/json" hidden>
        <a class="btn primary" href="#/client/new">Добавить клиента</a>
      </div>
    </div>
    <div class="card tblwrap" id="list"></div>`;
    const draw = () => {
        const q = $("#q").value.trim().toLowerCase();
        const rows = all.filter(c => !q || displayName(c).toLowerCase().includes(q));
        if (!all.length) {
            $("#list").innerHTML = `<div class="empty">Клиентов пока нет.<br><br><a class="btn primary" href="#/client/new">Добавить клиента</a></div>`;
            return;
        }
        if (!rows.length) {
            $("#list").innerHTML = `<div class="empty">Никого не нашлось.</div>`;
            return;
        }
        $("#list").innerHTML = `<table><thead><tr><th>Имя</th><th class="hide-sm">Изменён</th></tr></thead><tbody>${rows.map(c => `<tr class="click" data-id="${esc(c.id)}"><td><a href="#/client/${esc(c.id)}/${STEPS[0].id}">${esc(displayName(c))}</a></td><td class="hide-sm muted">${fmtDate(c.updatedAt)}</td></tr>`).join("")}</tbody></table>`;
        document.querySelectorAll("tr.click").forEach(tr => tr.onclick = ev => {
            if (!ev.target.closest("a"))
                location.hash = "#/client/" + tr.dataset.id + "/" + STEPS[0].id;
        });
    };
    $("#q").oninput = draw;
    draw();
    drawStore();
    if (FS.ready())
        syncFolder()
            .then(n => { if (n && location.hash === "#/clients")
            renderClients();
        else
            drawStore(); })
            .catch(e => { folderError(e); drawStore(); });
    $("#exp").onclick = () => download("electrodoctor-clients.json", JSON.stringify(loadAll(), null, 2), "application/json");
    $("#imp").onclick = () => $("#impfile").click();
    $("#impfile").onchange = async (ev) => {
        const f = ev.target.files?.[0];
        if (!f)
            return;
        try {
            const inc = JSON.parse(await f.text());
            if (!inc || !inc.clients)
                throw new Error();
            const data = loadAll();
            let n = 0;
            for (const c of Object.values(inc.clients))
                if (c && c.id && c.values) {
                    data.clients[c.id] = c;
                    n++;
                }
            saveAll(data);
            alert("Загружено клиентов: " + n);
            renderClients();
        }
        catch (e) {
            alert("Не получилось прочитать файл. Нужен JSON, выгруженный кнопкой «Выгрузить всех».");
        }
    };
}
function drawStore() {
    const box = $("#store");
    if (!box)
        return;
    const st = FS.state;
    let html = "";
    if (FS.ready()) {
        html += `<p>Клиенты сохраняются в папку <b>«${esc(st.name)}»</b> на этом компьютере: у каждого клиента своя подпапка с файлами <code>анкета.md</code>, <code>данные.csv</code> и <code>client.json</code>. Копия остаётся и в браузере.</p>
      <div class="grp"><button class="btn" id="pick">Выбрать другую папку</button><button class="btn" id="unpick">Не сохранять в папку</button></div>`;
    }
    else if (st.handle) {
        html += `<p>Выбрана папка <b>«${esc(st.name)}»</b>, но браузер просит заново подтвердить доступ к ней. Пока данные сохраняются только в браузере.</p>
      <div class="grp"><button class="btn primary" id="allow">Разрешить доступ к папке</button><button class="btn" id="pick">Выбрать другую папку</button><button class="btn" id="unpick">Не сохранять в папку</button></div>`;
    }
    else if (FS.supported) {
        html += `<p>По умолчанию данные сохраняются внутри этого браузера, на этом компьютере. Это служебное место браузера: найти эти файлы вручную нельзя, а при очистке истории браузера они удалятся. Вы можете выбрать папку на компьютере — тогда у каждого клиента там будет своя подпапка с файлами.</p>
      <div class="grp"><button class="btn primary" id="pick">Выбрать папку</button></div>`;
    }
    else {
        html += `<p>По умолчанию данные сохраняются внутри этого браузера, на этом компьютере. При очистке истории браузера они удалятся — время от времени нажимайте «Выгрузить всех».</p>
      <p class="muted">Сохранять в выбранную папку умеют Chrome, Edge, Яндекс.Браузер и Opera на компьютере. В этом браузере такой возможности нет.</p>`;
    }
    if (folderErr)
        html += `<p class="err">Не удалось записать в папку: ${esc(folderErr)}</p>`;
    const status = FS.ready() ? `в папке «${esc(st.name)}»` : st.handle ? "нужно разрешить доступ к папке" : "в этом браузере";
    // Раскрываем сами, если от человека что-то нужно: подтвердить доступ или разобраться с ошибкой.
    box.innerHTML = fold("store", "Где хранятся данные", status, html, { open: !!folderErr || (!!st.handle && !FS.ready()), warn: !!folderErr || (!!st.handle && !FS.ready()) });
    const after = () => syncFolder().then(() => renderClients()).catch(e => { folderError(e); drawStore(); });
    const pick = $("#pick"), allow = $("#allow"), unpick = $("#unpick");
    if (pick)
        pick.onclick = async () => {
            try {
                await FS.choose();
                const data = loadAll(); // в новой папке подпапки создаются заново
                for (const c of Object.values(data.clients))
                    delete c.folder;
                saveAll(data);
                after();
            }
            catch (e) {
                if (!(e instanceof Error && e.name === "AbortError")) {
                    folderError(e);
                    drawStore();
                }
            }
        };
    if (allow)
        allow.onclick = async () => { if (await FS.requestAccess())
            after();
        else
            drawStore(); };
    if (unpick)
        unpick.onclick = async () => {
            if (!confirm("Перестать сохранять в папку «" + st.name + "»? Файлы в ней останутся, данные продолжат храниться в браузере."))
                return;
            await FS.disconnect();
            renderClients();
        };
}
// ---------- анкета ----------
const stepName = (i) => /^\d+$/.test(STEPS[i].title) ? "Этап " + STEPS[i].title : STEPS[i].title;
// ---------- вкладка «Диагнозы»: вероятные диагнозы по анализам ----------
// Считается по открытому бланку вкладки «Анализы» и признакам из Настройки → Диагнозы.
const DX_SHOW_MIN = 5; // показываем диагнозы с вероятностью от 5%,
const DX_LIFT_MIN = 10; // выросшей по анализам хотя бы на 10 пунктов от распространённости, и с признаком «за»
const DX_PAGE = 25;
const pct = (p) => p >= 99.5 ? ">99" : p >= 10 ? String(Math.round(p)) : p >= 1 ? p.toFixed(1).replace(".", ",") : "<1";
const pctCls = (p) => p >= 70 ? "p4" : p >= 40 ? "p3" : p >= 20 ? "p2" : "p1";
function drawDxTab(c, err) {
    const box = document.getElementById("dxtab");
    if (!box)
        return;
    if (err) {
        box.innerHTML = `<p class="err">${esc(err)}</p>`;
        return;
    }
    const values = c.values;
    const sel = selSet(c);
    const filled = labFieldsOf(c).filter(f => (f.type === "number" || f.type === "select") && isFilled(f, c.values[f.code])).length;
    const src = sel ? `по анализам от <b>${esc(ruDate(sel.date))}</b>` : filled ? "по новому, ещё не сохранённому бланку анализов" : "";
    const method = Dx.currentMethod() === "dev" ? "сила отклонения — по проценту от нормы" : "сила отклонения — по критичности";
    const head = `<div class="dxt-head"><h2>Вероятные диагнозы</h2><span class="muted">${src}${src ? " · " : ""}${method}</span></div>
    <p class="muted dxt-note">Это подсказка расчёта по анализам, а не диагноз. Сверху — диагнозы, вероятность которых анализы подняли сильнее всего. Учитываются только анализы; осмотр, жалобы и исследования пока не входят в расчёт. Признаки диагнозов — черновик ИИ, их можно поправить в <a href="#/settings/diagnoses">Настройки → Диагнозы</a>.</p>`;
    if (!filled) {
        box.innerHTML = head + `<div class="empty">Анализов пока нет. Заполните или загрузите их на вкладке <a href="#/client/${esc(c.id)}/labs">«Анализы»</a>.</div>`;
        return;
    }
    const all = Dx.rank(values, c);
    const list = all.filter(r => r.score.p >= DX_SHOW_MIN && r.score.p - r.prior >= DX_LIFT_MIN && r.score.contribs.some(x => x.c > 0));
    if (!list.length) {
        box.innerHTML = head + `<div class="empty">По этим анализам вероятность ни одного диагноза заметно не выросла.</div>`;
        return;
    }
    const secs = [...new Set(list.flatMap(r => r.item.sections))];
    const row = (r) => {
        const up = r.score.contribs.filter(x => x.c > 0).sort((a, b) => b.c - a.c), down = r.score.contribs.filter(x => x.c < 0).sort((a, b) => a.c - b.c);
        const chip = (x) => {
            const v = c.values[x.code], u = typeof v === "number" ? Dx.labUnit(x.code) : "", d = Norms.deviation(x.code, v, c);
            return `<span class="dxt-chip ${x.c > 0 ? "pro" : "con"}" title="вклад в расчёт: ${x.c > 0 ? "+" : "−"}${Math.abs(x.c).toFixed(1).replace(".", ",")}">${esc(Dx.labName(x.code))} <b>${esc(String(v).replace(".", ","))}</b>${u ? " " + esc(u) : ""}${d.cls !== "empty" ? ` <small>${esc(d.text)}</small>` : ""}</span>`;
        };
        const weight = (code) => (Sg.labSigns(r.signs).find(l => l.code === code) || { w: 0 }).w;
        const miss = [...new Set(r.score.missing)].filter(code => weight(code) >= 5).sort((a, b) => weight(b) - weight(a));
        const look = [...(r.signs.exam || []), ...(r.signs.instr || [])].filter(x => (x.w ?? 0) >= 7).sort((a, b) => (b.w ?? 0) - (a.w ?? 0)).slice(0, 5);
        return `<details class="fold dxt-item" data-secs="${esc(r.item.sections.join(" "))}">
      <summary><span class="dxt-p ${pctCls(r.score.p)}">${pct(r.score.p)}%</span><span class="dx-title"><span class="fold-title">${esc(r.item.title)}</span><a class="dx-art" href="${Dx.articleUrl(r.name)}" target="_blank" rel="noopener" title="статья о диагнозе — в новой вкладке" aria-label="статья">↗</a>${(r.item.flags || []).map(f => `<span class="dx-flag f-${esc(f)}">${esc(Dx.flagTitle(f))}</span>`).join("")}<small class="muted dx-also">${r.item.sections.map(s => esc(Dx.sectionTitle(s))).join(", ")}</small></span><span class="fold-chev" aria-hidden="true"></span></summary>
      <div class="fold-body dxt-body">
        <p><span class="dxt-lbl">За</span>${up.map(chip).join("")}</p>
        ${down.length ? `<p><span class="dxt-lbl">Против</span>${down.map(chip).join("")}</p>` : ""}
        ${miss.length ? `<p><span class="dxt-lbl">Досдать</span>${miss.map(code => `<button type="button" class="dxt-chip miss" data-dx-add="${esc(code)}" title="добавить в бланк анализов и перейти к нему">${esc(Dx.labName(code))}</button>`).join("")}</p>` : ""}
        ${look.length ? `<p><span class="dxt-lbl">Проверить</span><span class="dxt-look">${look.map(x => esc(x.name)).join(" · ")}</span></p>` : ""}
        <p class="muted dxt-meta">без анализов ${pct(r.prior)}% → по анализам ${pct(r.score.p)}% · признаков-анализов ${Sg.labSigns(r.signs).length} · <a href="#/settings/diagnoses/${esc(r.item.sections[0] || "")}">признаки в настройках</a></p>
      </div></details>`;
    };
    box.innerHTML = head + `<div class="dx-chips dxt-filter" role="group" aria-label="Раздел"><button type="button" class="dx-chip on" data-sec="">Все ${list.length}</button>${secs.map(s => `<button type="button" class="dx-chip" data-sec="${esc(s)}">${esc(Dx.sectionTitle(s))} ${list.filter(r => r.item.sections.includes(s)).length}</button>`).join("")}</div>
    <div class="dx-acc" id="dxtlist">${list.map(row).join("")}</div>
    <p class="muted dxt-more" id="dxtmore" hidden><button type="button" class="btn" id="dxtmorebtn">Показать все</button></p>`;
    let sec = "", showAll = false;
    const apply = () => {
        let n = 0, shown = 0;
        box.querySelectorAll(".dxt-item").forEach(el => {
            const ok = !sec || (el.dataset.secs || "").split(" ").includes(sec);
            if (ok)
                n++;
            el.hidden = !ok || (!showAll && n > DX_PAGE);
            if (!el.hidden)
                shown++;
        });
        const more = box.querySelector("#dxtmore");
        more.hidden = shown >= n;
        box.querySelector("#dxtmorebtn").textContent = `Показать все ${n}`;
    };
    box.querySelectorAll(".dxt-filter .dx-chip").forEach(b => b.addEventListener("click", () => {
        sec = b.dataset.sec || "";
        box.querySelectorAll(".dxt-filter .dx-chip").forEach(x => x.classList.toggle("on", x === b));
        apply();
    }));
    box.querySelector("#dxtmorebtn").addEventListener("click", () => { showAll = true; apply(); });
    // «Досдать» → строка в бланке анализов (если анализа там ещё нет) и переход к ней
    box.addEventListener("click", ev => {
        const b = ev.target.closest("[data-dx-add]");
        if (!b)
            return;
        const code = b.dataset.dxAdd;
        if (isExtraCode(code))
            (labAdded[c.id] = labAdded[c.id] || new Set()).add(code);
        labFocus = code;
        location.hash = "#/client/" + c.id + "/labs";
    });
    apply();
}
// ---------- анализы по датам ----------
// Поля вкладки «Анализы» в c.values — открытый бланк. Сохранённые сдачи лежат в c.labs; открыть сдачу —
// значит скопировать её значения в бланк. Так всё остальное (критичность, ИИ, выгрузка) работает как раньше.
const LAB_STEP = STEPS.find(s => s.id === "labs");
const LAB_FIELDS = LAB_STEP ? fieldsOf(LAB_STEP).filter(f => f.type !== "aiimport") : [];
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const ruDate = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ""); return m ? `${m[3]}.${m[2]}.${m[1]}` : iso || "без даты"; };
const setKey = (s) => (s.date || "") + " " + (s.time || "");
const sortedSets = (c) => [...(c.labs || [])].sort((a, b) => setKey(a).localeCompare(setKey(b)) || a.savedAt.localeCompare(b.savedAt));
// Анализы из справочника, которых нет в бланке, но они есть у клиента (или только что добавлены кнопкой)
const OTHER_STEP_CODES = new Set(STEPS.filter(s => s.id !== "labs").flatMap(s => fieldsOf(s).map(f => f.code)));
const LAB_FORM_CODES = new Set(LAB_FIELDS.map(f => f.code));
const isExtraCode = (code) => Labs.has(code) && !LAB_FORM_CODES.has(code) && !OTHER_STEP_CODES.has(code);
const labAdded = {}; // добавлены, но ещё без значения — до перезагрузки страницы
let labFocus = ""; // какое поле открыть и подсветить после перерисовки
function extraCodes(c) {
    const set = new Set([...Object.keys(c.values).filter(isExtraCode), ...(labAdded[c.id] || [])]);
    return [...set].sort((a, b) => Labs.LABS[a].name.localeCompare(Labs.LABS[b].name, "ru"));
}
const labFieldsOf = (c) => [...LAB_FIELDS, ...extraCodes(c).map(Labs.fieldFor).filter((f) => !!f)];
function bufValues(c) {
    const out = {};
    for (const f of labFieldsOf(c)) {
        const v = c.values[f.code];
        if (v !== undefined && isFilled(f, v))
            out[f.code] = JSON.parse(JSON.stringify(v));
    }
    return out;
}
function loadBuf(c, values) {
    for (const f of labFieldsOf(c))
        delete c.values[f.code];
    for (const [k, v] of Object.entries(values))
        c.values[k] = JSON.parse(JSON.stringify(v));
}
const sameVals = (a, b) => {
    const ka = Object.keys(a).sort(), kb = Object.keys(b).sort();
    return ka.join() === kb.join() && ka.every(k => JSON.stringify(a[k]) === JSON.stringify(b[k]));
};
const selSet = (c) => (c.labs || []).find(s => s.id === c.labSel);
function labDirty(c) {
    const s = selSet(c), buf = bufValues(c), m = c.labMeta || { date: "" };
    if (!s)
        return Object.keys(buf).length > 0;
    return !sameVals(buf, s.values) || m.date !== s.date || (m.time || "") !== (s.time || "");
}
// Уже введённые анализы (до появления дат) становятся первой сохранённой сдачей с датой последнего изменения карточки
function migrateLabs(c) {
    if (c.labs)
        return false;
    c.labs = [];
    const buf = bufValues(c);
    if (!Object.keys(buf).length) {
        c.labSel = "";
        c.labMeta = { date: todayIso() };
        return true;
    }
    const date = (c.updatedAt || c.createdAt || new Date().toISOString()).slice(0, 10);
    const s = { id: "l" + Date.now().toString(36), date, values: buf, savedAt: new Date().toISOString() };
    c.labs.push(s);
    c.labSel = s.id;
    c.labMeta = { date };
    return true;
}
// Самая высокая критичность в сдаче — цвет столбика в полосе дат
function worstCls(c, values) {
    let k = -1;
    for (const f of LAB_FIELDS)
        if (f.type === "number" && Norms.hasNorm(f.code)) {
            const r = Norms.criticality(f.code, values[f.code], c);
            if (r.k !== undefined && r.k > k)
                k = r.k;
        }
    return k < 0 ? "" : k <= 10 ? "k0" : k <= 35 ? "k1" : k <= 65 ? "k2" : k < 90 ? "k3" : "k4";
}
function labDatesHtml(c) {
    const sets = sortedSets(c), sel = selSet(c);
    const chips = sets.map(s => {
        const n = Object.keys(s.values).length, cls = worstCls(c, s.values);
        return `<button type="button" class="ld-chip ${cls}${s.id === c.labSel ? " on" : ""}" data-ld="${esc(s.id)}" title="анализы от ${esc(ruDate(s.date))}${s.time ? " " + esc(s.time) : ""} · показателей: ${n}"><span class="ld-txt">${esc(ruDate(s.date))}${s.time ? `<small>${esc(s.time)}</small>` : ""}</span></button>`;
    }).join("");
    const cap = sel ? `Анализы от <b>${esc(ruDate(sel.date))}${sel.time ? " " + esc(sel.time) : ""}</b>` : `<b>Новые анализы</b> — заполните или загрузите через ИИ, затем сохраните внизу`;
    return `<div class="lab-dates"><button type="button" class="ld-new${sel ? "" : " on"}" data-ld="" title="новый бланк анализов">+ Новые</button>
    <div class="ld-scroll" id="ldscroll">${chips || `<span class="muted ld-none">сохранённых анализов пока нет</span>`}</div></div>
    <p class="ld-cap">${cap} <span class="ld-state" id="ldstate"></span></p>`;
}
// Блок под группами: анализы из справочника у этого клиента и поиск «+ Добавить анализ»
function labExtraHtml(c) {
    const rows = extraCodes(c).map(code => {
        const f = Labs.fieldFor(code);
        return `<div class="lab-extra-row">${fieldHtml(f, c.values[code], c)}<button type="button" class="btn lab-rm" data-rm-extra="${esc(code)}" title="убрать из бланка" aria-label="убрать из бланка">×</button></div>`;
    }).join("");
    return `<div class="sec lab-extra" id="labextra">
    <h3>Дополнительные анализы <small class="muted">из справочника — ${Object.keys(Labs.LABS).length} анализов</small></h3>
    ${rows ? `<div class="lab-extra-list">${rows}</div>` : `<p class="muted">Нужного анализа нет в бланке? Найдите его в справочнике: по названию, сокращению или по-английски.</p>`}
    <div class="lab-add"><input type="search" id="labadd" placeholder="+ Добавить анализ: например, антитела к ТПО, HLA-B27, посев мочи" aria-label="Добавить анализ из справочника" autocomplete="off"><div class="lab-add-res" id="labaddres"></div></div>
  </div>`;
}
function labSaveHtml(c) {
    const sel = selSet(c), m = c.labMeta || { date: todayIso() };
    return `<div class="lab-save" id="labsave">
    <label>Дата <input type="date" name="lsdate" value="${esc(m.date || "")}" required></label>
    <label>Время <input type="time" name="lstime" value="${esc(m.time || "")}"></label>
    <span class="ls-msg" id="lsmsg" aria-live="polite"></span>
    <span class="ls-btns">${sel ? `<button type="button" class="btn danger" data-ls="del">Удалить эти анализы</button>` : ""}<button type="button" class="btn primary" data-ls="save">${sel ? "Сохранить изменения" : "Сохранить анализы"}</button></span>
    <div class="ls-ask" id="lsask" hidden></div>
  </div>`;
}
function renderClient(id, stepId) {
    renderNav();
    const c = getClient(id) || drafts[id];
    if (!c) {
        view.innerHTML = `<p>Клиент не найден. <a href="#/clients">К списку</a></p>`;
        return;
    }
    const si = Math.max(0, STEPS.findIndex(s => s.id === stepId));
    const step = STEPS[si];
    const isNew = !getClient(id);
    if (migrateLabs(c) && getClient(id)) {
        const data = loadAll();
        data.clients[id] = c;
        saveAll(data);
    } // без смены даты изменения
    const labs = step.id === "labs";
    view.innerHTML = `
    <div class="head">
      <div><a href="#/clients">← Клиенты</a><h1 id="title">${esc(isNew && !c.values.NAME ? "Новый клиент" : displayName(c))}</h1></div>
      <div class="grp" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <span class="saved" id="saved">${isNew ? "Ещё не сохранён" : "Сохранено"}</span>
        <button class="btn" id="csv" ${isNew ? "disabled" : ""}>CSV</button>
        <button class="btn" id="md" ${isNew ? "disabled" : ""}>Markdown</button>
        <button class="btn danger" id="del" ${isNew ? "disabled" : ""}>Удалить</button>
      </div>
    </div>
    <div class="steps" role="tablist">${STEPS.map((s, i) => {
        const p = progress(c, s);
        const full = p.total && p.filled === p.total;
        return `<a class="step${i === si ? " on" : ""}${full && i !== si ? " full" : ""}" role="tab" aria-selected="${i === si}" href="#/client/${esc(id)}/${s.id}"${full ? ' title="всё заполнено"' : ""}>${esc(s.title)}</a>`;
    }).join("")}</div>
    ${labs ? `<div class="card lab-top" id="labtop">${labDatesHtml(c)}</div>` : ""}
    <div class="card" id="form">${step.sections.length ? step.sections.map((sec, i) => (step.id === "labs" && step.sections.findIndex(s => s.fields.some(f => f.type === "number" && Norms.hasNorm(f.code))) === i ? `<div class="attn" id="attn">${attnHtml(step, c)}</div>` : "") + sectionHtml(step, sec, c)).join("")
        : step.id === "diagnoses" ? `<div id="dxtab"><p class="muted">Считаю вероятности диагнозов…</p></div>`
            : `<div class="empty">Этап «${esc(step.title)}»: поля пока не заданы.<br><small>Их можно добавить в файле src/app/fields.ts.</small></div>`}
      ${labs ? labExtraHtml(c) + labSaveHtml(c) : ""}
    </div>
    <div class="nav2">
      ${si > 0 ? `<a class="btn" href="#/client/${esc(id)}/${STEPS[si - 1].id}">← ${esc(stepName(si - 1))}</a>` : "<span></span>"}
      ${si < STEPS.length - 1 ? `<a class="btn primary" href="#/client/${esc(id)}/${STEPS[si + 1].id}">${esc(stepName(si + 1))} →</a>` : `<a class="btn primary" href="#/clients">Готово</a>`}
    </div>`;
    let timer;
    const save = () => {
        compute(c);
        const bmi = $('[data-code="BMI"]');
        if (bmi)
            bmi.value = c.values.BMI == null ? "" : String(c.values.BMI);
        if (!isFilled(null, c.values.NAME) && !getClient(id)) {
            $("#saved").textContent = "Заполните имя, чтобы сохранить";
            return;
        }
        const written = putClient(c);
        delete drafts[id];
        $("#title").textContent = displayName(c);
        ["csv", "md", "del"].forEach(b => { btn("#" + b).disabled = false; });
        const time = new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
        $("#saved").textContent = storageOk ? "Сохранено " + time : "Не сохраняется в браузере — выгрузите файл";
        written.then(folder => {
            if (!$("#saved"))
                return;
            if (folder)
                $("#saved").textContent = "Сохранено " + time + " · в папку";
            else if (FS.ready() && folderErr)
                $("#saved").textContent = "В папку не записалось: " + folderErr;
        });
        document.querySelectorAll(".step").forEach((el, i) => {
            const p = progress(c, STEPS[i]);
            el.classList.toggle("full", !!p.total && p.filled === p.total && i !== si);
        });
        for (const sec of step.sections) { // «заполнено N из M» на свёрнутых блоках
            const st = sec.fold && sec.id ? document.querySelector(`[data-fold="${step.id}.${sec.id}"] .fold-status`) : null;
            if (st)
                st.innerHTML = foldStatusHtml(sec, c);
        }
    };
    const set = (code, v) => {
        if (v === "" || v == null)
            delete c.values[code];
        else
            c.values[code] = v;
        clearTimeout(timer);
        timer = setTimeout(save, 250);
        if (labs)
            labState();
    };
    // Состояние бланка анализов: сохранён или есть изменения
    const labState = () => {
        const st = document.getElementById("ldstate");
        if (!st)
            return;
        const dirty = labDirty(c), has = Object.keys(bufValues(c)).length > 0;
        st.className = "ld-state" + (dirty ? " dirty" : "");
        st.textContent = dirty ? (selSet(c) ? "· есть несохранённые изменения" : has ? "· не сохранены" : "") : selSet(c) ? "· сохранено" : "";
    };
    const fieldByCode = (code) => fieldsOf(step).find(x => x.code === code) || (labs && code && isExtraCode(code) ? Labs.fieldFor(code) || undefined : undefined);
    const form = $("#form");
    form.addEventListener("input", ev => {
        const el = ev.target;
        if (el.dataset.row !== undefined)
            return readTable(el.closest("[data-table]"));
        if (!el.dataset.code)
            return;
        const f = fieldByCode(el.dataset.code);
        const v = f && f.type === "number" && el.value !== "" ? Number(el.value) : el.value;
        set(el.dataset.code, v);
        const dev = form.querySelector(`[data-dev="${el.dataset.code}"]`);
        if (dev) {
            const d = Norms.deviation(el.dataset.code, v, c);
            dev.textContent = d.text;
            dev.className = "dev " + d.cls;
        }
        const crit = form.querySelector(`[data-crit="${el.dataset.code}"]`);
        if (crit) {
            const k = Norms.criticality(el.dataset.code, v, c);
            crit.textContent = k.text;
            crit.className = "crit " + k.cls;
            crit.title = k.tip;
        }
    });
    if (labs) {
        bindLabs();
        bindExtra();
    }
    if (step.id === "diagnoses")
        Dx.ready().then(err => drawDxTab(c, err));
    // «Дополнительные анализы»: поиск по справочнику и добавление строки
    function bindExtra() {
        const box = document.getElementById("labextra");
        if (!box)
            return;
        const q = box.querySelector("#labadd"), res = box.querySelector("#labaddres");
        const exclude = (code) => LAB_FORM_CODES.has(code) || OTHER_STEP_CODES.has(code) || extraCodes(c).includes(code);
        const draw = () => {
            const found = Labs.search(q.value, exclude);
            // анализ из бланка тоже можно найти — тогда кнопка ведёт к его полю
            const inForm = q.value.trim().length >= 2 ? LAB_FIELDS.filter(f => f.label.toLowerCase().includes(q.value.trim().toLowerCase())).slice(0, 3) : [];
            res.innerHTML = q.value.trim().length < 2 ? "" : (found.length || inForm.length)
                ? inForm.map(f => `<button type="button" class="lab-res" data-go-form="${esc(f.code)}"><b>${esc(f.label)}</b> <small class="muted">уже в бланке — перейти</small></button>`).join("")
                    + found.map(code => { const l = Labs.LABS[code]; return `<button type="button" class="lab-res" data-add="${esc(code)}"><b>${esc(l.name)}</b>${l.unit ? ` <small>${esc(l.unit)}</small>` : ""} <span class="lab-tier t-${l.tier}">${Labs.TIER_NAME[l.tier]}</span>${l.type === "qual" ? ` <small class="muted">положительно / отрицательно</small>` : ""}${l.aliases.length ? `<small class="muted lab-al">${esc(l.aliases.slice(0, 4).join(", "))}</small>` : ""}</button>`; }).join("")
                : `<p class="muted">Ничего не нашлось. Попробуйте другое название или сокращение.</p>`;
        };
        q.addEventListener("input", draw);
        q.addEventListener("keydown", ev => { if (ev.key === "Enter") {
            ev.preventDefault();
            const b = res.querySelector("[data-add], [data-go-form]");
            if (b)
                b.click();
        } });
        box.addEventListener("click", ev => {
            const t = ev.target;
            const add = t.closest("[data-add]"), goF = t.closest("[data-go-form]"), rm = t.closest("[data-rm-extra]");
            if (add) {
                (labAdded[c.id] = labAdded[c.id] || new Set()).add(add.dataset.add);
                labFocus = add.dataset.add;
                clearTimeout(timer);
                save();
                renderClient(id, step.id);
            }
            else if (goF) {
                labFocus = goF.dataset.goForm;
                focusLab();
            }
            else if (rm) {
                const code = rm.dataset.rmExtra;
                if (c.values[code] !== undefined && !confirm(`Убрать «${Labs.LABS[code].name}» из бланка? Значение в открытых анализах сотрётся.`))
                    return;
                delete c.values[code];
                labAdded[c.id]?.delete(code);
                clearTimeout(timer);
                save();
                renderClient(id, step.id);
            }
        });
        focusLab();
    }
    // Открыть группу с полем, прокрутить к нему и подсветить
    function focusLab() {
        if (!labFocus)
            return;
        const code = labFocus;
        labFocus = "";
        const inp = form.querySelector(`[data-code="${code}"]`);
        if (!inp)
            return;
        const d = inp.closest("details");
        if (d && !d.open)
            d.open = true;
        const row = inp.closest(".field") || inp;
        row.scrollIntoView({ block: "center", behavior: "smooth" });
        inp.focus({ preventScroll: true });
        row.classList.remove("flash");
        void row.offsetWidth;
        row.classList.add("flash");
    }
    function bindLabs() {
        labState();
        const sc = document.getElementById("ldscroll");
        if (sc)
            sc.scrollLeft = sc.scrollWidth; // свежие — справа
        const go = (setId) => {
            if (setId === (c.labSel || ""))
                return;
            if (labDirty(c) && !confirm("Анализы не сохранены. Перейти без сохранения? Несохранённые изменения пропадут."))
                return;
            const s = (c.labs || []).find(x => x.id === setId);
            loadBuf(c, s ? s.values : {});
            c.labSel = s ? s.id : "";
            c.labMeta = s ? { date: s.date, time: s.time } : { date: todayIso() };
            clearTimeout(timer);
            save();
            renderClient(id, step.id);
        };
        $("#labtop").addEventListener("click", ev => { const b = ev.target.closest("[data-ld]"); if (b)
            go(b.dataset.ld || ""); });
        const bar = $("#labsave"), msg = $("#lsmsg"), ask = $("#lsask");
        const dIn = bar.querySelector("[name=lsdate]"), tIn = bar.querySelector("[name=lstime]");
        const meta = () => { c.labMeta = { date: dIn.value, ...(tIn.value ? { time: tIn.value } : {}) }; clearTimeout(timer); timer = setTimeout(save, 250); labState(); };
        dIn.addEventListener("change", meta);
        tIn.addEventListener("change", meta);
        const finish = (s, text) => {
            c.labSel = s.id;
            c.labMeta = { date: s.date, ...(s.time ? { time: s.time } : {}) };
            loadBuf(c, s.values);
            clearTimeout(timer);
            save();
            labFlash = text;
            renderClient(id, step.id);
        };
        const write = (mode, target) => {
            const buf = bufValues(c), m = c.labMeta, now = new Date().toISOString();
            if (mode === "update" && target) {
                target.values = buf;
                target.date = m.date;
                target.time = m.time;
                target.savedAt = now;
                return finish(target, "Изменения сохранены.");
            }
            if (mode === "merge" && target) {
                const vals = { ...target.values };
                for (const [k, v] of Object.entries(buf)) {
                    const old = vals[k];
                    if (Array.isArray(v) && Array.isArray(old)) { // таблицы и файлы — дописываем строки, без повторов
                        const seen = new Set(old.map(x => JSON.stringify(x)));
                        vals[k] = [...old, ...v.filter(x => !seen.has(JSON.stringify(x)))];
                    }
                    else
                        vals[k] = v;
                }
                target.values = vals;
                target.savedAt = now;
                return finish(target, `Добавлено к анализам от ${ruDate(target.date)}.`);
            }
            const s = { id: "l" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), date: m.date, ...(m.time ? { time: m.time } : {}), values: buf, savedAt: now };
            (c.labs = c.labs || []).push(s);
            finish(s, `Анализы от ${ruDate(s.date)} сохранены.`);
        };
        bar.addEventListener("click", ev => {
            const b = ev.target.closest("[data-ls]");
            if (!b)
                return;
            const act = b.dataset.ls;
            if (act === "cancel") {
                ask.hidden = true;
                return;
            }
            if (act === "merge" || act === "separate") {
                ask.hidden = true;
                return write(act === "merge" ? "merge" : "new", (c.labs || []).find(x => x.id === b.dataset.target));
            }
            if (act === "del") {
                const s = selSet(c);
                if (!s || !confirm(`Удалить анализы от ${ruDate(s.date)}? Это нельзя отменить.`))
                    return;
                c.labs = (c.labs || []).filter(x => x.id !== s.id);
                const last = sortedSets(c).pop();
                loadBuf(c, last ? last.values : {});
                c.labSel = last ? last.id : "";
                c.labMeta = last ? { date: last.date, time: last.time } : { date: todayIso() };
                clearTimeout(timer);
                save();
                labFlash = `Анализы от ${ruDate(s.date)} удалены.`;
                renderClient(id, step.id);
                return;
            }
            if (act !== "save")
                return;
            if (!getClient(id) && !isFilled(null, c.values.NAME)) {
                msg.className = "ls-msg err";
                msg.textContent = "Сначала укажите имя клиента на вкладке «Общее».";
                return;
            }
            if (!dIn.value) {
                msg.className = "ls-msg err";
                msg.textContent = "Укажите дату сдачи анализов.";
                dIn.focus();
                return;
            }
            meta();
            if (!Object.keys(bufValues(c)).length) {
                msg.className = "ls-msg err";
                msg.textContent = "Бланк пустой — сохранять нечего.";
                return;
            }
            const sel = selSet(c);
            if (sel)
                return write("update", sel);
            const same = (c.labs || []).find(x => x.date === dIn.value);
            if (same) {
                ask.innerHTML = `На ${esc(ruDate(same.date))} уже есть анализы. <button type="button" class="btn primary" data-ls="merge" data-target="${esc(same.id)}">Добавить к ним</button><button type="button" class="btn" data-ls="separate">Сохранить отдельно</button><button type="button" class="btn" data-ls="cancel">Отмена</button>`;
                ask.hidden = false;
                return;
            }
            write("new");
        });
        if (labFlash) {
            msg.className = "ls-msg ok";
            msg.textContent = labFlash;
            labFlash = "";
        }
    }
    // Сводка «Требуют внимания»: обновляется, когда уходите из поля (а не на каждую цифру); нажатие — к полю
    const refreshAttn = () => { const box = document.getElementById("attn"); if (box)
        box.innerHTML = attnHtml(step, c); };
    form.addEventListener("change", ev => { if (ev.target.matches("input[type=number]"))
        refreshAttn(); });
    form.addEventListener("click", ev => {
        const row = ev.target.closest("[data-go]");
        if (!row)
            return;
        const d = row.dataset.sec ? document.querySelector(`details[data-fold="${step.id}.${row.dataset.sec}"]`) : null;
        if (d && !d.open)
            d.open = true;
        const inp = form.querySelector(`[data-code="${row.dataset.go}"]`);
        if (!inp)
            return;
        const fieldRow = inp.closest(".field");
        (fieldRow || inp).scrollIntoView({ block: "center", behavior: "smooth" });
        if (fieldRow) {
            fieldRow.classList.remove("flash");
            void fieldRow.offsetWidth;
            fieldRow.classList.add("flash");
        }
    });
    // Норма и кривая у конкретного клиента: нажатие на норму → то же окно с графиком, что в настройках
    form.addEventListener("click", ev => {
        const chip = ev.target.closest("button[data-norm]");
        if (!chip)
            return;
        const code = chip.dataset.norm;
        const f = fieldByCode(code);
        const r = Norms.resolve(code, c);
        Curve.openEditor({
            title: (f && f.label) || code, unit: (f && f.unit) || "", subtitle: "для клиента: " + displayName(c),
            norm: r.norm, normBase: r.general.norm, curve: r.curve, base: r.general.curve, baseLabel: "Вернуть общую кривую",
            onClose: (cv, isBase, nv) => {
                const norms = { ...(c.norms || {}) };
                if (nv === r.general.norm)
                    delete norms[code];
                else
                    norms[code] = nv;
                if (Object.keys(norms).length)
                    c.norms = norms;
                else
                    delete c.norms;
                const curves = { ...(c.curves || {}) };
                if (isBase)
                    delete curves[code];
                else
                    curves[code] = cv;
                if (Object.keys(curves).length)
                    c.curves = curves;
                else
                    delete c.curves;
                clearTimeout(timer);
                save();
                const cols = chip.closest(".lab-cols");
                if (cols) {
                    const tmp = document.createElement("span");
                    tmp.innerHTML = Norms.colsHtml(code, (f && f.unit) || "", c.values[code], c);
                    cols.replaceWith(tmp.firstElementChild);
                }
                refreshAttn();
                for (const sec of step.sections) {
                    const st = sec.fold && sec.id ? document.querySelector(`[data-fold="${step.id}.${sec.id}"] .fold-status`) : null;
                    if (st)
                        st.innerHTML = foldStatusHtml(sec, c);
                }
                const again = form.querySelector(`button[data-norm="${code}"]`);
                if (again)
                    again.focus();
            },
        });
    });
    form.addEventListener("click", ev => {
        const b = ev.target.closest("button");
        if (!b)
            return;
        const box = b.closest("[data-choice]");
        if (box) {
            const v = b.dataset.v;
            box.querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b && v !== ""));
            if (box.classList.contains("seg") && v === "")
                b.classList.add("on");
            set(box.dataset.choice, v === "" ? "" : Number(v));
            return;
        }
        const tbl = b.closest("[data-table]");
        if (tbl && b.dataset.act === "add") {
            addRow(tbl);
            return;
        }
        if (tbl && b.dataset.act === "rm") {
            b.closest("tr").remove();
            readTable(tbl);
        }
    });
    function addRow(tbl) {
        const f = fieldByCode(tbl.dataset.table);
        tbl.querySelector("tbody").insertAdjacentHTML("beforeend", rowHtml(f, {}));
        tbl.querySelector("tbody tr:last-child input").focus();
    }
    function readTable(tbl) {
        const f = fieldByCode(tbl.dataset.table);
        const rows = [...tbl.querySelectorAll("tbody tr")].map(tr => {
            const r = {};
            const inputs = tr.querySelectorAll("input");
            (f.columns || []).forEach((col, i) => { r[col.key] = inputs[i].value; });
            return r;
        });
        set(f.code, rows.length ? rows : "");
    }
    // ---- фото и файлы анализов ----
    const filesField = fieldsOf(step).find(f => f.type === "files" && !f.hidden);
    const fileList = () => (filesField && Array.isArray(c.values[filesField.code]) ? c.values[filesField.code] : []);
    const redrawFiles = () => {
        const box = filesField && document.querySelector(`[data-files="${filesField.code}"] .files-list`);
        if (box)
            box.innerHTML = filesListHtml(fileList());
    };
    async function addFiles(list) {
        if (!filesField)
            return;
        if (!getClient(id)) {
            alert("Сначала укажите имя клиента на вкладке «Общее» — после этого можно добавлять файлы.");
            return;
        }
        const all = [...list];
        const bad = all.filter(f => !Files.accepted(f) || f.size > Files.MAX_SIZE);
        const status = document.querySelector(`[data-files="${filesField.code}"] .files-msg`);
        if (status)
            status.textContent = all.length > bad.length ? "Сохраняю…" : "";
        const refs = [...fileList()];
        for (const f of all) {
            if (bad.includes(f))
                continue;
            try {
                const ref = await Files.add(id, f);
                refs.push(ref);
                set(filesField.code, [...refs]);
                redrawFiles();
                FS.writeAttachment(c, ref.name, f)
                    .then(saved => { if (saved) {
                    ref.savedAs = saved;
                    set(filesField.code, [...fileList()]);
                    redrawFiles();
                } })
                    .catch(folderError);
            }
            catch (e) {
                folderError(e);
                alert("Не удалось сохранить файл «" + f.name + "»: " + ((e instanceof Error && e.message) || e));
            }
        }
        if (status)
            status.textContent = bad.length
                ? "Не добавлено: " + bad.map(f => f.name || "картинка").join(", ") + " — подходят фото и PDF до " + Files.sizeText(Files.MAX_SIZE) + "."
                : "";
    }
    if (filesField) {
        const zone = document.querySelector(`[data-files="${filesField.code}"]`);
        const input = zone.querySelector("input[type=file]");
        input.addEventListener("change", () => { if (input.files)
            addFiles(input.files).finally(() => { input.value = ""; }); });
        zone.addEventListener("dragover", ev => { ev.preventDefault(); zone.classList.add("drag"); });
        zone.addEventListener("dragleave", () => zone.classList.remove("drag"));
        zone.addEventListener("drop", ev => { ev.preventDefault(); zone.classList.remove("drag"); if (ev.dataTransfer)
            addFiles(ev.dataTransfer.files); });
        zone.addEventListener("click", ev => {
            const t = ev.target;
            const rm = t.closest("[data-rmfile]"), open = t.closest("[data-openfile]");
            if (rm) {
                const ref = fileList().find(r => r.id === rm.dataset.rmfile);
                if (!ref)
                    return;
                if (!confirm("Удалить файл «" + ref.name + "»?"))
                    return;
                Files.remove(id, ref.id).catch(e => console.error(e));
                if (ref.savedAs)
                    FS.removeAttachment(c, ref.savedAs).catch(folderError);
                const rest = fileList().filter(r => r.id !== ref.id);
                set(filesField.code, rest.length ? rest : "");
                redrawFiles();
            }
            else if (open) {
                ev.preventDefault();
                Files.get(id, open.dataset.openfile).then(blob => {
                    if (!blob) {
                        alert("Этого файла нет в браузере" + (FS.ready() ? " — посмотрите в папке клиента, подпапка «файлы анализов»." : "."));
                        return;
                    }
                    const url = URL.createObjectURL(blob);
                    window.open(url, "_blank", "noopener");
                    setTimeout(() => URL.revokeObjectURL(url), 60000);
                });
            }
        });
        // Вставка картинки из буфера обмена (Ctrl+V), пока открыта эта вкладка
        const onPaste = (ev) => {
            if (!document.body.contains(zone)) {
                document.removeEventListener("paste", onPaste);
                return;
            }
            const files = [...(ev.clipboardData?.files || [])];
            if (files.length) {
                ev.preventDefault();
                addFiles(files);
            }
        };
        document.addEventListener("paste", onPaste);
    }
    // ---- перенос анализов из ответа ИИ ----
    const ai = document.querySelector("[data-ai]");
    if (ai) {
        const text = ai.querySelector("[data-ai-text]");
        const msg = ai.querySelector("[data-ai-msg]");
        const preview = ai.querySelector("[data-ai-preview]");
        const fileInput = ai.querySelector("[data-ai-file]");
        let parsed = null, rows = [];
        if (aiFlash) {
            msg.className = "ai-msg ok";
            msg.textContent = aiFlash;
            aiFlash = "";
        }
        const say = (t, ok = false) => { msg.className = "ai-msg " + (ok ? "ok" : "err"); msg.textContent = t; };
        const run = (src) => {
            preview.innerHTML = "";
            say("");
            try {
                parsed = AI.parse(src);
                rows = AI.match(parsed, STEPS);
            }
            catch (e) {
                parsed = null;
                say((e instanceof Error && e.message) || String(e));
                return;
            }
            preview.innerHTML = aiPreviewHtml(parsed, rows, c);
        };
        ai.addEventListener("click", ev => {
            const t = ev.target.closest("[data-ai-act]");
            if (!t)
                return;
            const act = t.dataset.aiAct;
            if (act === "copy") {
                const prompt = AI.buildPrompt(STEPS);
                (navigator.clipboard ? navigator.clipboard.writeText(prompt) : Promise.reject(new Error("нет доступа к буферу")))
                    .then(() => say("Промпт скопирован — вставьте его в ИИ вместе с фото анализов.", true))
                    .catch(() => { download("промпт-анализы.txt", prompt, "text/plain"); say("Скопировать не получилось — промпт скачан файлом.", true); });
            }
            else if (act === "download")
                download("промпт-анализы.txt", AI.buildPrompt(STEPS), "text/plain");
            else if (act === "parse")
                run(text.value);
            else if (act === "cancel") {
                preview.innerHTML = "";
                parsed = null;
            }
            else if (act === "apply" && parsed) {
                if (!getClient(id) && !isFilled(null, c.values.NAME)) {
                    alert("Сначала укажите имя клиента на вкладке «Общее».");
                    return;
                }
                const boxes = preview.querySelectorAll("input[data-ai-row]");
                const chosen = rows.filter((_, i) => boxes[i] && boxes[i].checked);
                if (!chosen.length) {
                    say("Ничего не отмечено.");
                    return;
                }
                const other = Array.isArray(c.values[AI.OTHER_CODE]) ? [...c.values[AI.OTHER_CODE]].filter(r => Object.values(r).some(x => String(x).trim())) : [];
                for (const row of chosen) {
                    if (row.field)
                        c.values[row.field.code] = row.value;
                    else {
                        const r = AI.otherRow(row, parsed.date);
                        if (!other.some(o => o.name === r.name && o.value === r.value))
                            other.push(r);
                    }
                }
                if (other.length)
                    c.values[AI.OTHER_CODE] = other;
                if (parsed.date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) && !selSet(c))
                    c.labMeta = { date: parsed.date }; // дата с бланка лаборатории
                clearTimeout(timer);
                save();
                aiFlash = `Перенесено показателей: ${chosen.length}.` + (parsed.date ? ` Дата анализов: ${ruDate(parsed.date)}${selSet(c) ? "" : " — поставлена внизу, у кнопки «Сохранить»"}.` : "") + " Не забудьте сохранить анализы.";
                renderClient(id, step.id);
            }
        });
        fileInput.addEventListener("change", async () => {
            const f = fileInput.files && fileInput.files[0];
            if (!f)
                return;
            text.value = await f.text();
            fileInput.value = "";
            run(text.value);
        });
        preview.addEventListener("change", () => {
            const n = preview.querySelectorAll("input[data-ai-row]:checked").length;
            const b = preview.querySelector('[data-ai-act="apply"]');
            if (b)
                b.textContent = `Перенести отмеченные (${n})`;
        });
        const gateBox = ai.querySelector("[data-ai-gate]");
        if (gateBox)
            Settings.bindGate(gateBox, () => renderClient(id, step.id));
        // вкладки
        ai.querySelectorAll("[data-ai-tab]").forEach(b => b.addEventListener("click", () => {
            const tab = b.dataset.aiTab;
            lsSet(AI_TAB_KEY, tab);
            ai.querySelectorAll("[data-ai-tab]").forEach(x => { const on = x === b; x.classList.toggle("on", on); x.setAttribute("aria-selected", String(on)); });
            ai.querySelectorAll("[data-ai-pane]").forEach(p => { p.hidden = p.dataset.aiPane !== tab; });
        }));
        // отправка фото провайдеру
        const drop = ai.querySelector("[data-ai-drop]");
        if (drop) {
            const pick = drop.querySelector("[data-ai-pick]");
            const thumbs = ai.querySelector("[data-ai-thumbs]");
            const sendBtn = ai.querySelector('[data-ai-act="send"]');
            const abortBtn = ai.querySelector('[data-ai-act="abort"]');
            const wait = ai.querySelector("[data-ai-wait]");
            const raw = ai.querySelector("[data-ai-raw]");
            const rawText = ai.querySelector("[data-ai-rawtext]");
            const picked = [];
            let ctrl = null;
            const current = recognizer;
            const drawThumbs = () => {
                thumbs.innerHTML = picked.map((p, i) => `<figure class="ai-thumb">${p.file.type === "application/pdf" ? `<span class="ai-pdf">PDF</span>` : `<img src="${p.url}" alt="">`}<figcaption title="${esc(p.file.name)}">${esc(p.file.name || "картинка")}</figcaption><button type="button" class="btn danger" data-ai-rm="${i}" aria-label="убрать">×</button></figure>`).join("");
                sendBtn.disabled = !picked.length || !!ctrl;
            };
            const addPicked = (list) => {
                const prov = current();
                const bad = [];
                for (const f of [...list]) {
                    const pdf = f.type === "application/pdf";
                    if (!(f.type.startsWith("image/") || pdf) || f.size > 30 * 1024 * 1024) {
                        bad.push(f.name || "файл");
                        continue;
                    }
                    if (pdf && prov && !Call.takesPdf(prov.preset)) {
                        bad.push((f.name || "PDF") + " (этот провайдер не принимает PDF — сделайте снимок страницы)");
                        continue;
                    }
                    picked.push({ file: f, url: pdf ? "" : URL.createObjectURL(f) });
                }
                drawThumbs();
                if (bad.length)
                    say("Не добавлено: " + bad.join(", ") + ".");
                else
                    say("");
            };
            pick.addEventListener("change", () => { if (pick.files)
                addPicked(pick.files); pick.value = ""; });
            drop.addEventListener("dragover", ev => { ev.preventDefault(); drop.classList.add("drag"); });
            drop.addEventListener("dragleave", () => drop.classList.remove("drag"));
            drop.addEventListener("drop", ev => { ev.preventDefault(); drop.classList.remove("drag"); if (ev.dataTransfer)
                addPicked(ev.dataTransfer.files); });
            thumbs.addEventListener("click", ev => {
                const b = ev.target.closest("[data-ai-rm]");
                if (!b)
                    return;
                const [p] = picked.splice(Number(b.dataset.aiRm), 1);
                if (p && p.url)
                    URL.revokeObjectURL(p.url);
                drawThumbs();
            });
            const onPaste = (ev) => {
                if (!document.body.contains(drop)) {
                    document.removeEventListener("paste", onPaste);
                    return;
                }
                if (drop.closest("[data-ai-pane]").hidden)
                    return;
                const files = [...(ev.clipboardData?.files || [])];
                if (files.length) {
                    ev.preventDefault();
                    addPicked(files);
                }
            };
            document.addEventListener("paste", onPaste);
            abortBtn.addEventListener("click", () => { if (ctrl)
                ctrl.abort(); });
            sendBtn.addEventListener("click", async () => {
                const prov = current();
                if (!prov) {
                    say("Распознавание не настроено — Настройки → Агенты.");
                    return;
                }
                ctrl = new AbortController();
                sendBtn.disabled = true;
                abortBtn.hidden = false;
                preview.innerHTML = "";
                raw.hidden = true;
                say("");
                wait.textContent = `Отправляю в ${prov.preset.name}… обычно это занимает 10–60 секунд.`;
                try {
                    const files = await Promise.all(picked.map(p => Call.prepare(p.file)));
                    const answer = await Call.recognize({ preset: prov.preset, conf: prov.conf, model: prov.model, prompt: AI.buildPrompt(STEPS), files, signal: ctrl.signal });
                    rawText.textContent = answer;
                    raw.hidden = false;
                    Settings.setCheck(prov.preset.id, true);
                    text.value = answer; // ответ виден и на вкладке «вручную»
                    run(answer);
                    if (parsed)
                        say(`Готово: ${prov.preset.name} нашёл показателей — ${rows.length}. Проверьте их ниже и перенесите отмеченные.`, true);
                }
                catch (e) {
                    say((e instanceof Error && e.message) || String(e));
                }
                finally {
                    ctrl = null;
                    abortBtn.hidden = true;
                    wait.textContent = "";
                    drawThumbs();
                }
            });
        }
    }
    $("#csv").onclick = () => download(fileBase(c) + ".csv", toCSV(c), "text/csv");
    $("#md").onclick = () => download(fileBase(c) + ".md", toMarkdown(c), "text/markdown");
    $("#del").onclick = () => {
        const inFolder = FS.ready() && c.folder ? " Подпапка «" + c.folder + "» в папке «" + FS.state.name + "» тоже будет удалена." : "";
        if (!confirm("Удалить клиента «" + displayName(c) + "» и все его данные?" + inFolder))
            return;
        deleteClient(id);
        location.hash = "#/clients";
    };
    const first = form.querySelector("input, textarea, select");
    if (first && si === 0 && !c.values.NAME)
        first.focus();
}
let labFlash = ""; // сообщение после сохранения анализов
let aiFlash = ""; // сообщение после переноса, показывается на перерисованной странице
const AI_TAB_KEY = "electrodoctor.ai.tab";
const lsGet = (k) => { try {
    return localStorage.getItem(k) || "";
}
catch (e) {
    return "";
} };
const lsSet = (k, v) => { try {
    localStorage.setItem(k, v);
}
catch (e) { /* не страшно */ } };
// Провайдер распознавания из настроек (Настройки → Агенты), если он включён, заполнен и работает из браузера
function recognizer() {
    const r = Settings.recognizerRuntime();
    return r.preset && r.conf && Settings.isReady(r.preset, r.conf) && !Call.unsupportedReason(r.preset) ? { preset: r.preset, conf: r.conf, model: r.model } : null;
}
function aiImportHtml() {
    const rec = recognizer();
    const tab = lsGet(AI_TAB_KEY) === "manual" ? "manual" : "auto";
    const gate = Settings.blocked() ? Settings.gateHtml() : "";
    const m = rec && (rec.conf.models || []).find(x => x.id === rec.model);
    const auto = gate ? `<div data-ai-gate>${gate}</div>` : rec ? `
      <p class="ai-lead">Распознаёт: <b>${esc(rec.preset.name)}${rec.model ? " · " + esc(rec.model) : ""}</b> — <a href="#/settings/agents">изменить в настройках</a>. Фото уходят только этому провайдеру — напрямую из браузера.</p>
      ${m && !m.caps.includes("vision") ? `<p class="err">У этой модели нет пометки «понимает фото» — распознавание может не сработать. Выберите другую в Настройки → Агенты → «Распознавание анализов по фото».</p>` : ""}
      <div class="dropzone" data-ai-drop>
        <div class="dz-row"><label class="btn primary dz-pick">Выбрать фото анализов<input type="file" data-ai-pick multiple accept="image/*,application/pdf" hidden></label>
        <span class="muted">или перетащите сюда, или вставьте картинку (Ctrl+V)</span></div>
        <div class="ai-thumbs" data-ai-thumbs></div>
      </div>
      <p class="ai-privacy muted">Перед отправкой по возможности закройте на фото ФИО, дату рождения и номер полиса — для распознавания они не нужны.</p>
      <div class="grp"><button type="button" class="btn primary" data-ai-act="send" disabled>Распознать</button><button type="button" class="btn" data-ai-act="abort" hidden>Отменить</button><span class="muted ai-wait" data-ai-wait></span></div>
      <details class="ai-raw" data-ai-raw hidden><summary>Ответ ИИ целиком</summary><pre data-ai-rawtext></pre></details>`
        : `<p class="ai-lead">Распознавание не настроено. Подключите провайдера в <a href="#/settings/providers">Настройки → Провайдеры</a> и выберите его в <a href="#/settings/agents">Настройки → Агенты → «Распознавание анализов по фото»</a> — один раз, для всех клиентов. Без провайдера можно распознать вручную через любой ИИ (вторая вкладка).</p>`;
    return `<div class="ai" data-ai>
    <div class="ai-tabs" role="tablist">
      <button type="button" role="tab" data-ai-tab="auto" aria-selected="${tab === "auto"}" class="${tab === "auto" ? "on" : ""}">Распознать</button>
      <button type="button" role="tab" data-ai-tab="manual" aria-selected="${tab === "manual"}" class="${tab === "manual" ? "on" : ""}">Вручную через любой ИИ</button>
    </div>
    <div class="ai-pane" data-ai-pane="auto"${tab === "auto" ? "" : " hidden"}>${auto}</div>
    <div class="ai-pane" data-ai-pane="manual"${tab === "manual" ? "" : " hidden"}>
    <p class="ai-lead">Распознавание делает любой ИИ, который вы выберете: ChatGPT, DeepSeek, Claude, Gemini… Фото уходят только туда, куда вы их отправите сами.</p>
    <ol class="ai-steps">
      <li><div>Скопируйте промпт — в нём список всех полей анкеты и формат ответа.</div>
        <div class="grp"><button type="button" class="btn primary" data-ai-act="copy">Скопировать промпт</button><button type="button" class="btn" data-ai-act="download">Скачать .txt</button></div></li>
      <li><div>Откройте ИИ, вставьте промпт и приложите фото или PDF анализов.</div></li>
      <li><div>Вставьте ответ ИИ сюда или загрузите сохранённый .json.</div>
        <textarea data-ai-text rows="4" spellcheck="false" placeholder='{ "format": "electrodoctor-labs", "version": 1, "results": [ … ] }' aria-label="Ответ ИИ"></textarea>
        <div class="grp"><button type="button" class="btn primary" data-ai-act="parse">Разобрать ответ</button><label class="btn">Загрузить .json<input type="file" data-ai-file accept=".json,.txt,application/json,text/plain" hidden></label></div></li>
    </ol>
    </div>
    <div class="ai-msg" data-ai-msg aria-live="polite"></div>
    <div data-ai-preview></div>
  </div>`;
}
function aiPreviewHtml(p, rows, c) {
    const unitOf = (r) => r.field ? (r.field.unit || "") : (r.result.unit || "");
    const now = (r) => r.field && isFilled(r.field, c.values[r.field.code]) ? String(c.values[r.field.code]) : "";
    const n = rows.filter(r => r.apply).length;
    return `<div class="ai-preview">
    <h3>Найдено показателей: ${rows.length}${p.date ? ` · дата: ${esc(p.date)}` : ""}${p.lab ? ` · ${esc(p.lab)}` : ""}</h3>
    <p class="muted">Проверьте значения со своим бланком. Отмеченное перенесётся в анкету; то, чему нет своего поля, — в таблицу «Другие показатели».</p>
    <div class="tblwrap"><table class="ai-table"><thead><tr><th></th><th>Показатель</th><th class="num">Значение</th><th class="num">Сейчас</th><th>Примечание</th></tr></thead><tbody>${rows.map((r, i) => `
      <tr class="st-${r.status}"><td><input type="checkbox" data-ai-row="${i}"${r.apply ? " checked" : ""} aria-label="перенести"></td>
      <td>${esc(r.field ? r.field.label : (r.result.name || r.result.code || "—"))}${r.result.ref ? `<small class="muted">норма ${esc(r.result.ref)}</small>` : ""}</td>
      <td class="num">${esc(r.value)} <span class="muted">${esc(r.status === "unit" ? r.result.unit : unitOf(r))}</span></td>
      <td class="num muted">${esc(now(r))}</td>
      <td class="ai-note">${esc(r.note)}</td></tr>`).join("")}</tbody></table></div>
    <div class="grp"><button type="button" class="btn primary" data-ai-act="apply">Перенести отмеченные (${n})</button><button type="button" class="btn" data-ai-act="cancel">Отмена</button></div>
  </div>`;
}
// Показатели раздела, вышедшие из безопасной зоны (критичность больше 10)
function badCount(sec, c) {
    return sec.fields.filter(f => f.type === "number" && (Norms.criticality(f.code, c.values[f.code], c).k ?? 0) > Curve.SAFE_MAX).length;
}
function foldStatusHtml(sec, c) {
    const n = badCount(sec, c);
    return esc(foldStatus(sec, c)) + (n ? ` · <span class="fs-bad">${n} вне нормы</span>` : "");
}
// Сводка над группами: названия показателей вне безопасной зоны, самые критичные — первыми; цвет — степень критичности
function attnHtml(step, c) {
    const rows = [];
    for (const sec of step.sections)
        for (const f of sec.fields) {
            if (f.type !== "number" || !Norms.hasNorm(f.code))
                continue;
            const r = Norms.criticality(f.code, c.values[f.code], c);
            if (r.k !== undefined && r.k > Curve.SAFE_MAX)
                rows.push({ f, sec, k: r.k, cls: r.cls });
        }
    if (!rows.length)
        return "";
    rows.sort((a, b) => b.k - a.k);
    return `<span class="attn-title">Требуют внимания:</span> ${rows.map(({ f, sec, k, cls }) => `<button type="button" class="attn-item ${cls}" data-go="${esc(f.code)}" data-sec="${esc(sec.id || "")}" title="критичность ${k} · ${esc(sec.title)} — показать">${esc(f.label)}</button>`).join('<span class="attn-sep">, </span>')}`;
}
function foldStatus(sec, c) {
    const fs = sec.fields.filter(counts);
    if (!fs.length)
        return "";
    const n = fs.filter(f => isFilled(f, c.values[f.code])).length;
    return n ? `заполнено ${n} из ${fs.length}` : "не заполнено";
}
function sectionHtml(step, sec, c) {
    // над колонкой норм — заголовок «Норма» (если в разделе есть показатели с нормой)
    const head = sec.fields.some(f => f.type === "number" && Norms.hasNorm(f.code))
        ? `<div class="field fhead" aria-hidden="true"><span></span><div class="ctl"><span class="fh-val">Значение</span><span class="unit">ед. изм.</span><span class="lab-cols"><span class="norm-h">Норма</span><span class="dev-h">Отклонение</span><span class="crit-h">Критичность</span><span class="marks-h" title="откуда норма: серый — настройки, фиолетовый — правило по параметрам клиента, голубой — своё у клиента">Метка</span></span></div></div>` : "";
    const fields = head + sec.fields.map(f => fieldHtml(f, c.values[f.code], c)).join("");
    if (sec.fold && sec.id)
        return `<div class="sec">${fold(step.id + "." + sec.id, sec.title, foldStatusHtml(sec, c), fields)}</div>`;
    return `<div class="sec">${sec.title ? `<h2>${esc(sec.title)}</h2>` : ""}${fields}</div>`;
}
function filesListHtml(refs) {
    if (!refs.length)
        return `<p class="muted files-empty">Файлов пока нет.</p>`;
    return `<ul class="files">${refs.map(r => `<li><a href="#" data-openfile="${esc(r.id)}" title="открыть">${esc(r.name)}</a><span class="muted">${Files.sizeText(r.size)} · ${fmtDate(r.addedAt)}${r.savedAs ? " · в папке" : ""}</span><button type="button" class="btn danger" data-rmfile="${esc(r.id)}" title="удалить файл" aria-label="удалить файл ${esc(r.name)}">×</button></li>`).join("")}</ul>`;
}
function fieldHtml(f, v, own) {
    if (f.hidden)
        return `<p class="muted hidden-note">${esc(f.label)}: добавление скрыто.</p>`;
    if (f.type === "aiimport")
        return aiImportHtml();
    const la = Labs.LABS[f.code]; // название анализа — ссылка на статью о нём, в новой вкладке
    const art = articleUrl(f.code) || (la && la.article ? "../articles/lab-tests/" + encodeURIComponent(la.article) + ".html" : undefined);
    const name = art ? `<a class="art-link" href="${art}" target="_blank" rel="noopener" title="статья «${esc(f.label)}» — откроется в новой вкладке">${esc(f.label)}</a>` : esc(f.label);
    const lbl = `${name}${f.required ? ' <span class="req">*</span>' : ""}${f.hint ? `<small>${esc(f.hint)}</small>` : ""}`;
    const id = "f_" + f.code;
    const s = v === undefined || v === null || v === "" ? "" : String(v);
    let ctl = "";
    switch (f.type) {
        case "text":
            ctl = `<input type="text" id="${id}" data-code="${f.code}" value="${esc(v)}">`;
            break;
        case "textarea":
            return `<div class="field wide"><label for="${id}">${lbl}</label><textarea id="${id}" data-code="${f.code}">${esc(v)}</textarea></div>`;
        case "date":
            ctl = `<input type="date" id="${id}" data-code="${f.code}" value="${esc(v)}">`;
            break;
        case "select":
            ctl = `<select id="${id}" data-code="${f.code}"><option value="">—</option>${(f.options || []).map(([val, t]) => `<option value="${esc(val)}"${v === val ? " selected" : ""}>${esc(t)}</option>`).join("")}</select>`;
            break;
        case "number":
            ctl = `<input type="number" inputmode="decimal" id="${id}" data-code="${f.code}" value="${esc(v)}"${f.min != null ? ` min="${f.min}"` : ""}${f.max != null ? ` max="${f.max}"` : ""} step="${f.step || "any"}"${f.computed ? " readonly tabindex=\"-1\" title=\"считается автоматически\"" : ""}>${f.computed ? '<span class="unit">авто</span>' : `<span class="unit">${esc(f.unit || "")}</span>`}${Norms.colsHtml(f.code, f.unit || "", v, own)}`;
            break;
        case "yesno":
            ctl = `<span class="seg" data-choice="${f.code}" role="group" aria-label="${esc(f.label)}"><button type="button" data-v="" class="${s === "" ? "on" : ""}" title="не спрашивали">?</button><button type="button" data-v="1" class="${s === "1" ? "on" : ""}">да</button><button type="button" data-v="0" class="${s === "0" ? "on" : ""}">нет</button></span>`;
            break;
        case "scale": {
            let b = "";
            for (let i = 0; i <= (f.max || 0); i++)
                b += `<button type="button" data-v="${i}" class="${s === String(i) ? "on" : ""}">${i}</button>`;
            ctl = `<span class="scale" data-choice="${f.code}" role="group" aria-label="${esc(f.label)}">${b}<button type="button" data-v="" class="clr" title="очистить">—</button></span>`;
            break;
        }
        case "files": {
            const refs = Array.isArray(v) ? v : [];
            return `<div class="field wide"><div class="dropzone" data-files="${f.code}">
        <div class="dz-row"><label class="btn primary dz-pick">Добавить фото или файлы<input type="file" multiple accept="${Files.ACCEPT}" hidden></label>
        <span class="muted">или перетащите сюда, или вставьте картинку (Ctrl+V)</span></div>
        ${f.hint ? `<small class="muted">${esc(f.hint)}</small>` : ""}
        <div class="files-msg err" aria-live="polite"></div>
        <div class="files-list">${filesListHtml(refs)}</div>
      </div></div>`;
        }
        case "table": {
            const rows = Array.isArray(v) && v.length ? v : [{}];
            return `<div class="field wide"><label>${lbl}</label><div class="tblwrap" data-table="${f.code}"><table class="rows"><thead><tr>${(f.columns || []).map(col => `<th>${esc(col.label)}</th>`).join("")}<th></th></tr></thead><tbody>${rows.map(r => rowHtml(f, r)).join("")}</tbody></table><button type="button" class="btn" data-act="add" style="margin-top:6px">+ строка</button></div></div>`;
        }
    }
    return `<div class="field"><label for="${id}">${lbl}</label><div class="ctl">${ctl}</div></div>`;
}
function rowHtml(f, r) {
    return `<tr>${(f.columns || []).map(col => `<td><input type="text" data-row value="${esc(r[col.key])}" placeholder="${esc(col.placeholder || "")}" aria-label="${esc(col.label)}"></td>`).join("")}<td><button type="button" class="btn danger" data-act="rm" title="удалить строку" aria-label="удалить строку">×</button></td></tr>`;
}
// ---------- выгрузка ----------
const fileBase = (c) => "client-" + displayName(c).replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_|_$/g, "").slice(0, 40);
const csvCell = (v) => { const s = String(v == null ? "" : v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const SOURCE = { general: "опрос", params: "осмотр", labs: "анализ", psych: "психолог" };
// Формат examples/*.csv: code,value,unit,date,source — его понимает engine/electrodoctor.py
function toCSV(c) {
    const lines = ["code,value,unit,date,source"];
    for (const step of STEPS)
        for (const f of fieldsOf(step)) {
            const v = c.values[f.code];
            if (!isFilled(f, v) || f.code === "NAME" || f.type === "files")
                continue; // имя в CSV не пишем: файл обезличен
            const src = SOURCE[step.id] || step.id;
            if (f.type === "table") {
                for (const r of v)
                    if (r.name || r.value)
                        lines.push(["LAB:" + (r.name || ""), r.value, r.unit, r.date || "day0", src].map(csvCell).join(","));
            }
            else {
                const unit = f.unit || (f.type === "yesno" ? "да/нет" : f.type === "scale" ? "0–" + f.max : "");
                lines.push([f.code, v, unit, "day0", src].map(csvCell).join(","));
            }
        }
    return lines.join("\n") + "\n";
}
const mdCell = (s) => String(s == null ? "" : s).replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
function toMarkdown(c) {
    const show = (f, v) => f.type === "yesno" ? (String(v) === "1" ? "да" : "нет")
        : f.type === "select" ? ((f.options || []).find(o => o[0] === v) || ["", String(v)])[1]
            : f.type === "scale" ? v + " из " + f.max
                : f.unit ? v + " " + f.unit : String(v);
    let out = `# ${mdCell(displayName(c))}\n\nСоздан: ${fmtDate(c.createdAt)} · изменён: ${fmtDate(c.updatedAt)}\n`;
    STEPS.forEach((step, i) => {
        const fs = fieldsOf(step).filter(f => isFilled(f, c.values[f.code]));
        if (!fs.length)
            return;
        out += `\n## ${i + 1}. ${mdCell(step.title)}\n\n`;
        const simple = fs.filter(f => f.type !== "table" && f.type !== "files");
        for (const f of fs.filter(f => f.type === "files")) {
            out += `### ${mdCell(f.label)}\n\n` + c.values[f.code].map(r => `- ${mdCell(r.savedAs ? "файлы анализов/" + r.savedAs : r.name)}`).join("\n") + "\n\n";
        }
        if (simple.length) {
            out += "| Поле | Код | Значение |\n|---|---|---|\n";
            for (const f of simple)
                out += `| ${mdCell(f.label)} | ${f.code} | ${mdCell(show(f, c.values[f.code]))} |\n`;
        }
        for (const f of fs.filter(f => f.type === "table")) {
            const cols = f.columns || [];
            out += `\n### ${mdCell(f.label)}\n\n| ${cols.map(col => mdCell(col.label)).join(" | ")} |\n|${cols.map(() => "---").join("|")}|\n`;
            for (const r of c.values[f.code])
                out += `| ${cols.map(col => mdCell(r[col.key])).join(" | ")} |\n`;
        }
    });
    return out;
}
function download(name, text, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: type + ";charset=utf-8" }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
window.addEventListener("hashchange", route);
Promise.all([FS.init().catch(folderError), Settings.Store.init(), Norms.loadNorms(), Labs.loadLabs()]).finally(route);
// настройки дочитались из папки, открылся доступ или введён пароль — перерисовать страницу настроек
Settings.Store.onChange(() => { if (location.hash.startsWith("#/settings"))
    route(); });
