// SPDX-License-Identifier: AGPL-3.0-or-later
// Электродоктор — кабинет: вход, список клиентов, анкета по этапам.
// Данные хранятся в localStorage этого браузера и, если выбрана папка, ещё и в ней
// (см. folder.ts); есть выгрузка в CSV, Markdown и JSON.
import { STEPS } from "./fields.js";
import * as FS from "./folder.js";
import { fold, lockScroll, unlockScroll } from "./ui.js";
import * as Files from "./files.js";
import * as AI from "./aiimport.js";
import * as Settings from "./settings.js";
import * as Call from "./aicall.js";
import * as Norms from "./norms.js";
import * as Curve from "./curve.js";
import * as Dx from "./diagnoses.js";
import * as Sg from "./signs.js";
import * as Labs from "./labs.js";
import * as LabPick from "./labpick.js";
import { secOfLab } from "./setlabs.js";
import * as Cmp from "./complaints.js";
import * as Talk from "./talk.js";
import * as Exams from "./exams.js";
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
function syncExamCatalog() {
    Exams.applyOwn(Settings.load().exams);
}
function examFields() {
    syncExamCatalog();
    return Exams.allFields();
}
const fieldsOf = (step) => step.sections.flatMap(s => step.id === "params" && s.title === "Осмотр" ? examFields() : s.fields);
const isFilled = (f, v) => f && f.type === "files" ? Array.isArray(v) && v.length > 0
    : f && f.type === "table"
        ? Array.isArray(v) && v.some(r => Object.values(r).some(x => String(x).trim() !== ""))
        : v !== undefined && v !== null && String(v).trim() !== "";
const counts = (f) => !f.computed && !f.hidden && f.type !== "aiimport"; // участвует в «заполнено N из M»
function progress(c, step) {
    // Анализы: только уже появившиеся показатели (не весь пустой бланк)
    if (step.id === "labs") {
        const fs = labFieldsOf(c).filter(f => f.type !== "files" && f.type !== "aiimport");
        const filled = fs.filter(f => isFilled(f, c.values[f.code])).length;
        return { filled, total: fs.length };
    }
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
    const h = location.hash || "";
    const n = (href, label, on) => `<a class="btn${on ? " on" : ""}" href="${href}"${on ? ' aria-current="page"' : ""}>${label}</a>`;
    const theme = window.EDTheme;
    $("#nav").innerHTML =
        n("../", "Главная", false) +
            n("#/clients", "Клиенты", h.startsWith("#/clients") || h.startsWith("#/client/")) +
            n("#/settings", "Настройки", h.startsWith("#/settings")) +
            n("../articles/", "Информация", false) +
            n("../help.html", "Помощь", false) +
            (theme ? theme.buttonHtml("btn theme-toggle") : `<button type="button" class="btn theme-toggle" data-theme-toggle title="Тема" aria-label="Тема">◐</button>`);
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
/** Путь к папке: браузер его не отдаёт, храним то, что человек вписал. Без отдельных кнопок — сохранение по blur/Enter. */
function storePathHtml(st) {
    if (!st.handle)
        return "";
    return `<label class="store-path-lab">Путь к папке
    <input type="text" id="folderpath" value="${esc(st.path)}" placeholder="например, D:\\${esc(st.name)} — браузер путь не сообщает, можно вписать сами" spellcheck="false" autocomplete="off">
  </label>`;
}
function drawStore() {
    const box = $("#store");
    if (!box)
        return;
    const st = FS.state;
    const needPick = !!(st.handle && !FS.ready()); // доступ сброшен — снова выбрать ту же папку
    let html = "";
    if (FS.ready()) {
        html += `<p>Клиенты сохраняются в папку <b>«${esc(st.name)}»</b> на этом компьютере: у каждого клиента своя подпапка с файлами <code>анкета.md</code>, <code>данные.csv</code> и <code>client.json</code>. Копия остаётся и в браузере.</p>
      ${storePathHtml(st)}`;
    }
    else if (st.handle) {
        html += `<p>Раньше была выбрана папка <b>«${esc(st.name)}»</b>, но браузер снял доступ. Пока данные только в браузере — снова выберите эту папку. Если очистить кэш или данные сайта в браузере, клиенты пропадут.</p>
      ${storePathHtml(st)}`;
    }
    else if (FS.supported) {
        html += `<p>Сейчас данные сохраняются внутри этого браузера, на этом компьютере. Найти эти файлы вручную нельзя. Если очистить кэш или данные сайта в браузере — вся информация о клиентах исчезнет. Можно выбрать папку на компьютере: тогда у каждого клиента там будет своя подпапка с файлами, и очистка браузера их не затронет.</p>`;
    }
    else {
        html += `<p>Данные сохраняются внутри этого браузера, на этом компьютере. Если очистить кэш или данные сайта в браузере — вся информация о клиентах исчезнет. Время от времени нажимайте «Выгрузить всех».</p>
      <p class="muted">Сохранять в выбранную папку умеют Chrome, Edge, Яндекс.Браузер и Opera на компьютере. В этом браузере такой возможности нет.</p>`;
    }
    if (FS.supported) {
        html += `<div class="grp"><button class="btn${FS.ready() ? "" : " primary"}" id="pick">Выбрать папку</button><button class="btn" id="unpick"${st.handle ? "" : " disabled"} title="${st.handle ? "" : "уже сохраняется в браузере"}">Сохранять в браузере</button></div>`;
    }
    if (folderErr)
        html += `<p class="err">Не удалось записать в папку: ${esc(folderErr)}</p>`;
    const status = FS.ready()
        ? (st.path ? `в папке «${esc(st.name)}» · ${esc(st.path)}` : `в папке «${esc(st.name)}»`)
        : needPick ? "нужно снова выбрать папку" : "в этом браузере";
    box.innerHTML = fold("store", "Где хранятся данные", status, html, {
        open: !!folderErr || needPick,
        warn: !!folderErr || needPick,
    });
    const after = () => syncFolder().then(() => renderClients()).catch(e => { folderError(e); drawStore(); });
    const pathInp = document.querySelector("#folderpath");
    if (pathInp) {
        const savePath = () => { void FS.setPath(pathInp.value).then(() => drawStore()); };
        pathInp.onchange = savePath;
        pathInp.onkeydown = e => { if (e.key === "Enter") {
            e.preventDefault();
            pathInp.blur();
        } };
    }
    const pick = $("#pick"), unpick = $("#unpick");
    if (pick)
        pick.onclick = async () => {
            const prev = { handle: FS.state.handle, name: FS.state.name, path: FS.state.path, granted: FS.state.granted };
            try {
                await FS.choose();
                const inFolder = await FS.readAll();
                if (inFolder.length) {
                    const n = inFolder.length;
                    const word = n === 1 ? "клиент" : n < 5 ? "клиента" : "клиентов";
                    const ok = confirm(`В папке «${FS.state.name}» уже есть ${n} ${word}.\n\n` +
                        `• клиенты из браузера запишутся в эту папку;\n` +
                        `• клиенты только из папки появятся в списке;\n` +
                        `• если один и тот же клиент есть и там и там — останется более свежая версия, другая перезапишется.\n\n` +
                        `Продолжить?`);
                    if (!ok) {
                        await FS.restore(prev);
                        drawStore();
                        return;
                    }
                }
                const data = loadAll(); // в новой папке подпапки создаются заново
                for (const c of Object.values(data.clients))
                    delete c.folder;
                saveAll(data);
                after();
            }
            catch (e) {
                if (e instanceof Error && e.name === "AbortError")
                    return;
                folderError(e);
                drawStore();
            }
        };
    if (unpick)
        unpick.onclick = async () => {
            if (!st.handle)
                return;
            if (!confirm("Перестать сохранять в папку «" + st.name + "»? Файлы в ней останутся на диске, в браузере останется текущая копия — новые правки в папку больше не пишутся."))
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
function openOverlayDialog(title, bodyHtml, dlgClass = "") {
    const ov = document.createElement("div");
    ov.className = "cv-overlay";
    ov.innerHTML = `<div class="cv-dialog${dlgClass ? " " + dlgClass : ""}" role="dialog" aria-modal="true" aria-labelledby="ov-dlg-title">
    <div class="cv-head"><b id="ov-dlg-title">${esc(title)}</b>
      <button type="button" class="btn cv-x" data-close aria-label="закрыть">✕</button></div>
    ${bodyHtml}
  </div>`;
    document.body.appendChild(ov);
    lockScroll();
    const close = () => {
        document.removeEventListener("keydown", onKey);
        ov.remove();
        unlockScroll();
    };
    const onKey = (e) => { if (e.key === "Escape")
        close(); };
    document.addEventListener("keydown", onKey);
    ov.addEventListener("click", e => { if (e.target === ov)
        close(); });
    const x = ov.querySelector("[data-close]");
    x.addEventListener("click", close);
    x.focus();
}
function openDxNote() {
    openOverlayDialog("О расчёте", `<p class="dxt-note">Это подсказка расчёта по анализам, а не диагноз. Сверху — самые вероятные. Учитываются только анализы; осмотр, жалобы и исследования пока не входят в расчёт. Признаки диагнозов — черновик ИИ, их можно поправить в <a href="#/settings/diagnoses">Настройки → Диагнозы</a>.</p>`, "dxt-note-dlg");
}
/** Короткий текст для подсказки при наведении (~2 строки). Полный — по клику. */
function examTipPreview(desc, max = 120) {
    const t = desc.replace(/\s+/g, " ").trim();
    if (!t)
        return "";
    if (t.length <= max)
        return t;
    const cut = t.slice(0, max - 1);
    const sp = cut.lastIndexOf(" ");
    return ((sp > max * 0.55 ? cut.slice(0, sp) : cut).trimEnd()) + "…";
}
/** Подсказка по признаку осмотра: своё описание или статья из exam-descs. */
function openExamSignHelp(code) {
    const p = Exams.parseLineCode(code);
    const it = p ? Exams.get(p.examId) : undefined;
    const line = it ? Exams.findLine(it, p.lineId) : undefined;
    if (!line)
        return;
    const text = Exams.resolvedDesc(it.id, line).trim();
    const art = Exams.articleHref(line);
    const artLink = art
        ? `<p class="exam-help-art"><a href="${esc(art)}" target="_blank" rel="noopener">Статья об осмотре ↗</a></p>`
        : "";
    const body = text
        ? `<p class="exam-help-body">${esc(text)}</p>${artLink}`
        : `<p class="muted">Описания пока нет — добавьте в <a href="#/settings/exam">Настройки → Осмотр</a> или подтяните файл Markdown.</p>${artLink}`;
    openOverlayDialog(line.label, body, "exam-help-dlg");
}
function examSignLinkHtml(code, label) {
    const p = Exams.parseLineCode(code);
    const line = p && Exams.get(p.examId) ? Exams.findLine(Exams.get(p.examId), p.lineId) : undefined;
    const tip = examTipPreview(line && p ? Exams.resolvedDesc(p.examId, line) : "");
    const tipAttr = tip ? ` data-tip="${esc(tip)}"` : "";
    const cls = "exam-sign-link" + (tip ? " has-tip" : "");
    const title = tip ? "" : ` title="как оценивать"`;
    return `<button type="button" class="${cls}" data-exam-help="${esc(code)}"${tipAttr}${title}><span class="exam-sign-txt">${esc(label)}</span></button>`;
}
function bindDxNote(box) {
    box.querySelector(".dxt-info")?.addEventListener("click", openDxNote);
}
let dxSort = "p";
const sortDx = (list) => [...list].sort(dxSort === "lift"
    ? (a, b) => (b.score.p - b.prior) - (a.score.p - a.prior) || b.score.p - a.score.p
    : (a, b) => b.score.p - a.score.p || (b.score.p - b.prior) - (a.score.p - a.prior));
const dxSortUi = () => `<span class="seg dxt-sort" role="group" aria-label="Сортировка">
  <button type="button" data-dx-sort="p"${dxSort === "p" ? ' class="on"' : ""} title="по убыванию вероятности">По %</button>
  <button type="button" data-dx-sort="lift"${dxSort === "lift" ? ' class="on"' : ""} title="насколько анализы подняли вероятность над распространённостью">По приросту</button>
</span>`;
function switchDxLab(c, setId) {
    if (setId === (c.labSel || ""))
        return;
    if (labDirty(c) && !confirm("Анализы не сохранены. Переключить дату без сохранения? Несохранённые изменения пропадут."))
        return;
    const s = (c.labs || []).find(x => x.id === setId);
    if (!s)
        return;
    loadBuf(c, s.values);
    c.labSel = s.id;
    c.labMeta = { date: s.date, ...(s.time ? { time: s.time } : {}) };
    putClient(c);
    drawDxTab(c, "");
}
function dxSrcHtml(c) {
    const sets = sortedSets(c), sel = selSet(c);
    const filled = labFieldsOf(c).filter(f => (f.type === "number" || f.type === "select") && isFilled(f, c.values[f.code])).length;
    if (!sets.length)
        return filled ? `<span class="muted dxt-src">по новому, ещё не сохранённому бланку анализов</span>` : "";
    const label = sel ? labDateLabel(c, sel) : "новому бланку";
    const tip = sel ? `анализы от ${ruDate(sel.date)}${sel.time ? " " + sel.time : ""}` : "открытый бланк";
    return `<span class="muted dxt-src">по анализам от
    <button type="button" class="dxt-date" id="dxdatebtn" aria-haspopup="listbox" aria-expanded="false" title="${esc(tip)}">${esc(label)} ▾</button>
    <span class="dxt-date-menu" id="dxdatemenu" hidden role="listbox">${sets.map(s => `<button type="button" role="option" data-dx-lab="${esc(s.id)}"${s.id === c.labSel ? ' class="on" aria-selected="true"' : ""} title="${Object.keys(s.values).length} показателей">${esc(labDateLabel(c, s))}${s.time ? " " + esc(s.time) : ""}</button>`).join("")}</span></span>`;
}
function bindDxSrc(box, c) {
    const btn = box.querySelector("#dxdatebtn");
    const menu = box.querySelector("#dxdatemenu");
    if (!btn || !menu)
        return;
    const close = () => { menu.hidden = true; btn.setAttribute("aria-expanded", "false"); document.removeEventListener("click", onDoc); };
    const onDoc = (e) => { if (!box.querySelector(".dxt-src")?.contains(e.target))
        close(); };
    btn.addEventListener("click", ev => {
        ev.stopPropagation();
        const open = menu.hidden;
        menu.hidden = !open;
        btn.setAttribute("aria-expanded", open ? "true" : "false");
        if (open)
            setTimeout(() => document.addEventListener("click", onDoc), 0);
        else
            document.removeEventListener("click", onDoc);
    });
    menu.addEventListener("click", ev => {
        const b = ev.target.closest("[data-dx-lab]");
        if (!b)
            return;
        close();
        switchDxLab(c, b.dataset.dxLab || "");
    });
}
function drawDxTab(c, err) {
    const box = document.getElementById("dxtab");
    if (!box)
        return;
    if (err) {
        box.innerHTML = `<p class="err">${esc(err)}</p>`;
        return;
    }
    const values = c.values;
    const filled = labFieldsOf(c).filter(f => (f.type === "number" || f.type === "select") && isFilled(f, c.values[f.code])).length;
    const src = dxSrcHtml(c);
    const head = (withSort) => `<div class="dxt-head"><div class="dxt-title"><h2>Вероятные диагнозы</h2><button type="button" class="dxt-info" aria-label="О расчёте" title="О расчёте">!</button>${withSort ? dxSortUi() : ""}</div>${src}</div>`;
    if (!filled) {
        box.innerHTML = head(false) + `<div class="empty">Анализов пока нет. Заполните или загрузите их на вкладке <a href="#/client/${esc(c.id)}/labs">«Анализы»</a>.</div>`;
        bindDxNote(box);
        bindDxSrc(box, c);
        return;
    }
    const all = Dx.rank(values, c);
    const list = sortDx(all.filter(r => r.score.p >= DX_SHOW_MIN && r.score.p - r.prior >= DX_LIFT_MIN && r.score.contribs.some(x => x.c > 0)));
    if (!list.length) {
        box.innerHTML = head(false) + `<div class="empty">По этим анализам вероятность ни одного диагноза заметно не выросла.</div>`;
        bindDxNote(box);
        bindDxSrc(box, c);
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
        return `<details class="fold dxt-item" data-secs="${esc(r.item.sections.join(" "))}" data-p="${r.score.p}" data-lift="${r.score.p - r.prior}">
      <summary><span class="dxt-p ${pctCls(r.score.p)}">${pct(r.score.p)}%</span><span class="dx-title"><span class="fold-title">${esc(r.item.title)}</span><a class="dx-art" href="${Dx.articleUrl(r.name)}" target="_blank" rel="noopener" title="статья о диагнозе — в новой вкладке" aria-label="статья">↗</a>${(r.item.flags || []).map(f => `<span class="dx-flag f-${esc(f)}">${esc(Dx.flagTitle(f))}</span>`).join("")}<small class="muted dx-also">${r.item.sections.map(s => esc(Dx.sectionTitle(s))).join(", ")}</small></span><button type="button" class="btn dxt-talk" data-dx-talk="${esc(r.name)}" title="Поговорить с врачом по этому диагнозу">Поговорить</button><span class="fold-chev" aria-hidden="true"></span></summary>
      <div class="fold-body dxt-body">
        <p><span class="dxt-lbl">За</span>${up.map(chip).join("")}</p>
        ${down.length ? `<p><span class="dxt-lbl">Против</span>${down.map(chip).join("")}</p>` : ""}
        ${miss.length ? `<p><span class="dxt-lbl">Досдать</span>${miss.map(code => `<button type="button" class="dxt-chip miss" data-dx-add="${esc(code)}" title="добавить в бланк анализов и перейти к нему">${esc(Dx.labName(code))}</button>`).join("")}</p>` : ""}
        ${look.length ? `<p><span class="dxt-lbl">Проверить</span><span class="dxt-look">${look.map(x => esc(x.name)).join(" · ")}</span></p>` : ""}
        <p class="muted dxt-meta">без анализов ${pct(r.prior)}% → по анализам ${pct(r.score.p)}% · признаков-анализов ${Sg.labSigns(r.signs).length} · <a href="#/settings/diagnoses/${esc(r.item.sections[0] || "")}/${encodeURIComponent(r.name)}">признаки в настройках</a></p>
      </div></details>`;
    };
    box.innerHTML = head(true) + `<div class="dx-chips dxt-filter" role="group" aria-label="Раздел"><button type="button" class="dx-chip on" data-sec="">Все ${list.length}</button>${secs.map(s => `<button type="button" class="dx-chip" data-sec="${esc(s)}">${esc(Dx.sectionTitle(s))} ${list.filter(r => r.item.sections.includes(s)).length}</button>`).join("")}</div>
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
    const reorder = () => {
        const listEl = box.querySelector("#dxtlist");
        const items = [...listEl.children];
        const key = dxSort === "lift" ? "lift" : "p";
        items.sort((a, b) => (+b.dataset[key] - +a.dataset[key]) || (+b.dataset.p - +a.dataset.p));
        items.forEach(el => listEl.appendChild(el));
        apply();
    };
    box.querySelectorAll("[data-dx-sort]").forEach(b => b.addEventListener("click", () => {
        const next = (b.dataset.dxSort || "p");
        if (next === dxSort)
            return;
        dxSort = next;
        box.querySelectorAll("[data-dx-sort]").forEach(x => x.classList.toggle("on", x === b));
        reorder();
    }));
    box.querySelectorAll(".dxt-filter .dx-chip").forEach(b => b.addEventListener("click", () => {
        sec = b.dataset.sec || "";
        box.querySelectorAll(".dxt-filter .dx-chip").forEach(x => x.classList.toggle("on", x === b));
        apply();
    }));
    box.querySelector("#dxtmorebtn").addEventListener("click", () => { showAll = true; apply(); });
    box.querySelectorAll("[data-dx-talk]").forEach(btn => {
        btn.addEventListener("click", ev => {
            ev.preventDefault();
            ev.stopPropagation();
            const name = btn.dataset.dxTalk;
            const r = list.find(x => x.name === name);
            if (!r)
                return;
            const up = r.score.contribs.filter(x => x.c > 0).sort((a, b) => b.c - a.c);
            const down = r.score.contribs.filter(x => x.c < 0).sort((a, b) => a.c - b.c);
            const brief = [
                `${pct(r.score.p)}% (без анализов ${pct(r.prior)}%)`,
                up.length ? "за: " + up.slice(0, 8).map(x => Dx.labName(x.code)).join(", ") : "",
                down.length ? "против: " + down.slice(0, 5).map(x => Dx.labName(x.code)).join(", ") : "",
            ].filter(Boolean).join("; ");
            Talk.openDxTalkDialog(c, { file: r.name, title: r.item.title, sections: r.item.sections, brief });
        });
    });
    // «Досдать» → пустая строка показателя на вкладке «Анализы» и переход к ней
    box.addEventListener("click", ev => {
        const b = ev.target.closest("[data-dx-add]");
        if (!b)
            return;
        const code = b.dataset.dxAdd;
        if (isLabValueCode(code) || Labs.has(code))
            (labAdded[c.id] = labAdded[c.id] || new Set()).add(code);
        labFocus = code;
        location.hash = "#/client/" + c.id + "/labs";
    });
    bindDxNote(box);
    bindDxSrc(box, c);
    apply();
}
// ---------- анализы по датам ----------
// На вкладке «Анализы» пустой бланк не показывают: только даты, загрузка через ИИ и показатели,
// которые уже появились (ИИ, справочник). Сохранённые сдачи — в c.labs; открыть сдачу = подставить
// значения в c.values. fields.ts по-прежнему задаёт коды бланка для ИИ/норм/каталога (inForm).
const LAB_STEP = STEPS.find(s => s.id === "labs");
const LAB_FIELDS = LAB_STEP ? fieldsOf(LAB_STEP).filter(f => f.type !== "aiimport" && f.type !== "files") : [];
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const ruDate = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ""); return m ? `${m[3]}.${m[2]}.${m[1]}` : iso || "без даты"; };
const ruDateShort = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ""); return m ? `${m[3]}.${m[2]}.${m[1].slice(2)}` : iso || "без даты"; };
const setKey = (s) => (s.date || "") + " " + (s.time || "");
const sortedSets = (c) => [...(c.labs || [])].sort((a, b) => setKey(a).localeCompare(setKey(b)) || a.savedAt.localeCompare(b.savedAt));
// Подпись сдачи на чипе: ДД.ММ.ГГ, при нескольких сдачах в один день — ДД.ММ.ГГ-2, -3…
function labDateLabel(c, s) {
    const same = sortedSets(c).filter(x => x.date === s.date);
    const i = same.findIndex(x => x.id === s.id);
    return ruDateShort(s.date) + (i > 0 ? "-" + (i + 1) : "");
}
const OTHER_STEP_CODES = new Set(STEPS.filter(s => s.id !== "labs").flatMap(s => fieldsOf(s).map(f => f.code)));
const LAB_FORM_CODES = new Set(LAB_FIELDS.map(f => f.code));
const isExtraCode = (code) => Labs.has(code) && !LAB_FORM_CODES.has(code) && !OTHER_STEP_CODES.has(code);
const isLabValueCode = (code) => LAB_FORM_CODES.has(code) || isExtraCode(code);
const labAdded = {}; // добавлены, но ещё без значения — до перезагрузки страницы
let labFocus = ""; // какое поле открыть и подсветить после перерисовки
/** Поля анализов, которые уже есть у клиента (значения или только что добавленные из справочника). */
function labFieldsOf(c) {
    const codes = new Set([...(labAdded[c.id] || [])]);
    for (const code of Object.keys(c.values))
        if (isLabValueCode(code))
            codes.add(code);
    const out = [];
    for (const code of codes) {
        const f = Labs.resolveField(code, LAB_FIELDS.find(x => x.code === code));
        if (f && f.type !== "aiimport" && f.type !== "files")
            out.push(f);
    }
    return out.sort((a, b) => a.label.localeCompare(b.label, "ru"));
}
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
    for (const code of Object.keys(c.values))
        if (isLabValueCode(code))
            delete c.values[code];
    labAdded[c.id]?.clear();
    for (const [k, v] of Object.entries(values)) {
        c.values[k] = JSON.parse(JSON.stringify(v));
        if (isExtraCode(k))
            (labAdded[c.id] = labAdded[c.id] || new Set()).add(k);
    }
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
    for (const [code, v] of Object.entries(values)) {
        if (!isLabValueCode(code) || !Norms.hasNorm(code))
            continue;
        const r = Norms.criticality(code, v, c);
        if (r.k !== undefined && r.k > k)
            k = r.k;
    }
    return k < 0 ? "" : k <= 10 ? "k0" : k <= 35 ? "k1" : k <= 65 ? "k2" : k < 90 ? "k3" : "k4";
}
function labDatesHtml(c) {
    const sets = sortedSets(c), sel = selSet(c);
    const chips = sets.map(s => {
        const n = Object.keys(s.values).length, cls = worstCls(c, s.values);
        const label = labDateLabel(c, s);
        return `<button type="button" class="ld-chip ${cls}${s.id === c.labSel ? " on" : ""}" data-ld="${esc(s.id)}" title="анализы от ${esc(ruDate(s.date))}${s.time ? " " + esc(s.time) : ""} · показателей: ${n}"><span class="ld-txt">${esc(label)}${s.time ? `<small>${esc(s.time)}</small>` : ""}</span></button>`;
    }).join("");
    const cap = sel ? `Анализы от <b>${esc(labDateLabel(c, sel))}${sel.time ? " " + esc(sel.time) : ""}</b>` : `<b>Новые анализы</b> — загрузите через ИИ или выберите из справочника, затем сохраните внизу`;
    return `<div class="lab-dates"><button type="button" class="ld-new${sel ? "" : " on"}" data-ld="" title="новый бланк анализов">+ Новые</button>
    <div class="ld-scroll" id="ldscroll">${chips || `<span class="muted ld-none">сохранённых анализов пока нет</span>`}</div></div>
    <p class="ld-cap">${cap} <span class="ld-state" id="ldstate"></span></p>`;
}
/** Показатели вне безопасной зоны — те же, что в плашке «Требуют внимания», по убыванию критичности. */
function labAttnRows(c) {
    const rows = [];
    for (const f of labFieldsOf(c)) {
        if (f.type !== "number" || !Norms.hasNorm(f.code))
            continue;
        const r = Norms.criticality(f.code, c.values[f.code], c);
        if (r.k !== undefined && r.k > Curve.SAFE_MAX)
            rows.push({ f, k: r.k, cls: r.cls });
    }
    return rows.sort((a, b) => b.k - a.k || a.f.label.localeCompare(b.f.label, "ru"));
}
/** Список показателей: сначала «требуют внимания», затем остальные по алфавиту. */
function labFieldsSorted(c) {
    const attn = labAttnRows(c);
    const top = new Set(attn.map(r => r.f.code));
    const rest = labFieldsOf(c).filter(f => !top.has(f.code));
    return [...attn.map(r => r.f), ...rest];
}
/** Вкладка «Анализы»: ИИ + список уже появившихся показателей + поиск по справочнику (пустых групп бланка нет). */
function labSheetHtml(c) {
    const aiSec = LAB_STEP?.sections.find(s => s.id === "ai");
    const ai = aiSec ? sectionHtml(LAB_STEP, aiSec, c) : "";
    const fields = labFieldsSorted(c);
    const attnCls = new Map(labAttnRows(c).map(r => [r.f.code, r.cls]));
    const head = fields.some(f => f.type === "number" && Norms.hasNorm(f.code))
        ? `<div class="field fhead" aria-hidden="true"><span></span><div class="ctl"><span class="fh-val">Значение</span><span class="unit">ед. изм.</span><span class="lab-cols"><span class="norm-h">Норма</span><span class="dev-h">Отклонение</span><span class="crit-h">Критичность</span><span class="marks-h" title="откуда норма: серый — настройки, фиолетовый — правило по параметрам клиента, голубой — своё у клиента">Метка</span></span></div></div>` : "";
    const rows = fields.map(f => {
        const cls = attnCls.get(f.code);
        const rowCls = cls ? `lab-extra-row lab-attn ${cls}` : "lab-extra-row";
        return `<div class="${rowCls}" data-lab-code="${esc(f.code)}">${fieldHtml(f, c.values[f.code], c)}<button type="button" class="btn lab-rm" data-rm-lab="${esc(f.code)}" title="убрать" aria-label="убрать">×</button></div>`;
    }).join("");
    const attn = labAttnHtml(c);
    return `${ai}${attn ? `<div class="attn" id="attn">${attn}</div>` : `<div class="attn" id="attn" hidden></div>`}
    <div class="sec lab-extra" id="labextra">
      <h3>Показатели <small class="muted">${fields.length ? fields.length + " · " : ""}справочник — ${Object.keys(Labs.LABS).length} · новый код — в <a href="#/settings/weights">Настройки → Нормы и веса</a></small></h3>
      ${rows ? head + `<div class="lab-extra-list">${rows}</div>` : `<p class="muted">Пока пусто. Загрузите бланк через ИИ выше или выберите анализ из справочника — строка появится здесь.</p>`}
      <div class="lab-add"><input type="search" id="labadd" placeholder="Добавить из справочника: гемоглобин, ТПО, HLA-B27…" aria-label="Добавить анализ из справочника" autocomplete="off"><div class="lab-add-res" id="labaddres"></div>
        <button type="button" class="btn" id="labpick">Выбрать анализ…</button>
      </div>
    </div>`;
}
function labAttnHtml(c) {
    const rows = labAttnRows(c);
    if (!rows.length)
        return "";
    return `<span class="attn-title">Требуют внимания:</span> ${rows.map(({ f, k, cls }) => `<button type="button" class="attn-item ${cls}" data-go="${esc(f.code)}" title="критичность ${k} — показать">${esc(f.label)}</button>`).join('<span class="attn-sep">, </span>')}`;
}
/** Обновить плашку и порядок/подсветку строк списка (после смены значения). */
function refreshLabAttnList(c) {
    const html = labAttnHtml(c);
    const box = document.getElementById("attn");
    if (box) {
        box.innerHTML = html;
        box.hidden = !html;
    }
    const list = document.querySelector(".lab-extra-list");
    if (!list)
        return;
    const attn = labAttnRows(c);
    const attnCls = new Map(attn.map(r => [r.f.code, r.cls]));
    const byCode = new Map();
    list.querySelectorAll(".lab-extra-row").forEach(row => {
        const code = row.dataset.labCode || row.querySelector("[data-code]")?.dataset.code || "";
        if (code)
            byCode.set(code, row);
        row.className = "lab-extra-row";
        const cls = code && attnCls.get(code);
        if (cls)
            row.classList.add("lab-attn", cls);
    });
    for (const { f } of attn) {
        const row = byCode.get(f.code);
        if (row) {
            list.appendChild(row);
            byCode.delete(f.code);
        }
    }
    for (const f of labFieldsOf(c)) {
        if (attnCls.has(f.code))
            continue;
        const row = byCode.get(f.code);
        if (row) {
            list.appendChild(row);
            byCode.delete(f.code);
        }
    }
    for (const row of byCode.values())
        list.appendChild(row);
}
function labSaveHtml(c) {
    const sel = selSet(c), m = c.labMeta || { date: todayIso() };
    const dirty = labDirty(c);
    return `<div class="lab-save" id="labsave">
    <label>Дата <input type="date" name="lsdate" value="${esc(m.date || "")}" required></label>
    <label>Время <input type="time" name="lstime" value="${esc(m.time || "")}"></label>
    <span class="ls-msg" id="lsmsg" aria-live="polite"></span>
    <span class="ls-btns">${sel ? `<button type="button" class="btn danger" data-ls="del">Удалить эти анализы</button>` : ""}<button type="button" class="btn${dirty ? " primary" : ""}" data-ls="save">${sel ? "Сохранить изменения" : "Сохранить анализы"}</button></span>
    <div class="ls-ask" id="lsask" hidden></div>
  </div>`;
}
// ---------- параметры тела по датам ----------
// В историю входят меняющиеся поля; рост и генетика всегда в c.values без дат.
const PARAM_STEP = STEPS.find(s => s.id === "params");
const PARAM_BASE_HIST = new Set(["WEIGHT", "WAIST", "BMI", "BP_SYS", "BP_DIA", "PULSE", "TEMP", "SPO2"]);
const isParamHistCode = (code) => {
    if (PARAM_BASE_HIST.has(code))
        return true;
    syncExamCatalog();
    return Exams.isExamLineCode(code);
};
function paramHistFields() {
    const base = PARAM_STEP ? PARAM_STEP.sections.flatMap(s => s.fields).filter(f => PARAM_BASE_HIST.has(f.code)) : [];
    return [...base, ...examFields()];
}
const sortedParamSets = (c) => [...(c.params || [])].sort((a, b) => setKey(a).localeCompare(setKey(b)) || a.savedAt.localeCompare(b.savedAt));
function paramDateLabel(c, s) {
    const same = sortedParamSets(c).filter(x => x.date === s.date);
    const i = same.findIndex(x => x.id === s.id);
    return ruDateShort(s.date) + (i > 0 ? "-" + (i + 1) : "");
}
const selParamSet = (c) => (c.params || []).find(s => s.id === c.paramSel);
function paramBufValues(c) {
    const out = {};
    for (const f of paramHistFields()) {
        const v = c.values[f.code];
        if (v !== undefined && isFilled(f, v))
            out[f.code] = JSON.parse(JSON.stringify(v));
    }
    return out;
}
function loadParamBuf(c, values) {
    for (const f of paramHistFields())
        delete c.values[f.code];
    for (const [k, v] of Object.entries(values))
        if (isParamHistCode(k))
            c.values[k] = JSON.parse(JSON.stringify(v));
}
function paramDirty(c) {
    const s = selParamSet(c), buf = paramBufValues(c), m = c.paramMeta || { date: "" };
    if (!s)
        return Object.keys(buf).length > 0;
    return !sameVals(buf, s.values) || m.date !== s.date || (m.time || "") !== (s.time || "");
}
function migrateParams(c) {
    if (c.params)
        return false;
    c.params = [];
    const buf = paramBufValues(c);
    if (!Object.keys(buf).length) {
        c.paramSel = "";
        c.paramMeta = { date: todayIso() };
        return true;
    }
    const date = (c.updatedAt || c.createdAt || new Date().toISOString()).slice(0, 10);
    const s = { id: "p" + Date.now().toString(36), date, values: buf, savedAt: new Date().toISOString() };
    c.params.push(s);
    c.paramSel = s.id;
    c.paramMeta = { date };
    return true;
}
function paramDatesHtml(c) {
    const sets = sortedParamSets(c), sel = selParamSet(c);
    const chips = sets.map(s => {
        const n = Object.keys(s.values).length;
        const label = paramDateLabel(c, s);
        return `<button type="button" class="ld-chip${s.id === c.paramSel ? " on" : ""}" data-pd="${esc(s.id)}" title="замеры от ${esc(ruDate(s.date))}${s.time ? " " + esc(s.time) : ""} · показателей: ${n}"><span class="ld-txt">${esc(label)}${s.time ? `<small>${esc(s.time)}</small>` : ""}</span></button>`;
    }).join("");
    const cap = sel ? `Замеры от <b>${esc(paramDateLabel(c, sel))}${sel.time ? " " + esc(sel.time) : ""}</b>` : `<b>Новые замеры</b> — вес, давление и остальное по дате; рост и генетика без дат`;
    return `<div class="lab-dates"><button type="button" class="ld-new${sel ? "" : " on"}" data-pd="" title="новый бланк замеров">+ Новые</button>
    <div class="ld-scroll" id="pdscroll">${chips || `<span class="muted ld-none">сохранённых замеров пока нет</span>`}</div></div>
    <p class="ld-cap">${cap} <span class="ld-state" id="pdstate"></span></p>`;
}
function paramSaveHtml(c) {
    const sel = selParamSet(c), m = c.paramMeta || { date: todayIso() };
    const dirty = paramDirty(c);
    return `<div class="lab-save" id="paramsave">
    <label>Дата <input type="date" name="psdate" value="${esc(m.date || "")}" required></label>
    <label>Время <input type="time" name="pstime" value="${esc(m.time || "")}"></label>
    <span class="ls-msg" id="psmsg" aria-live="polite"></span>
    <span class="ls-btns">${sel ? `<button type="button" class="btn danger" data-ps="del">Удалить эти замеры</button>` : ""}<button type="button" class="btn${dirty ? " primary" : ""}" data-ps="save">${sel ? "Сохранить изменения" : "Сохранить замеры"}</button></span>
    <div class="ls-ask" id="psask" hidden></div>
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
    let migrated = false;
    if (migrateLabs(c))
        migrated = true;
    if (migrateParams(c))
        migrated = true;
    if (migrated && getClient(id)) {
        const data = loadAll();
        data.clients[id] = c;
        saveAll(data);
    }
    const labs = step.id === "labs";
    const params = step.id === "params";
    view.innerHTML = `
    <div class="head">
      <a class="head-back" href="#/clients">← Клиенты</a>
      <h1 id="title">${esc(isNew && !c.values.NAME ? "Новый клиент" : displayName(c))}</h1>
      <div class="head-actions">
        <button type="button" class="btn" id="export" ${isNew ? "disabled" : ""}>Выгрузить</button>
        <button type="button" class="btn" id="import">Загрузить</button>
        <input type="file" id="import-file" accept=".csv,.md,.markdown,.txt,text/csv,text/markdown,text/plain" hidden>
        <span class="saved" id="saved">${isNew ? "Ещё не сохранён" : ""}</span>
      </div>
    </div>
    <div class="steps" role="tablist">${STEPS.map((s, i) => {
        const p = progress(c, s);
        const full = p.total && p.filled === p.total;
        return `<a class="step${i === si ? " on" : ""}${full && i !== si ? " full" : ""}" role="tab" aria-selected="${i === si}" href="#/client/${esc(id)}/${s.id}"${full ? ' title="всё заполнено"' : ""}>${esc(s.title)}</a>`;
    }).join("")}</div>
    ${labs ? `<div class="card lab-top" id="labtop">${labDatesHtml(c)}</div>` : ""}
    ${params ? `<div class="card lab-top" id="paramtop">${paramDatesHtml(c)}</div>` : ""}
    <div class="card" id="form">${labs ? labSheetHtml(c) + labSaveHtml(c)
        : step.sections.length ? step.sections.map(sec => sectionHtml(step, sec, c)).join("")
            : step.id === "diagnoses" ? `<div id="dxtab"><p class="muted">Считаю вероятности диагнозов…</p></div>`
                : step.id === "other" ? `<div class="other-tab">
          <h2>Прочее</h2>
          <p class="muted">Действия с карточкой клиента, которые не относятся к анкете и расчёту.</p>
          <div class="other-danger">
            <button type="button" class="btn danger" id="del" ${isNew ? "disabled" : ""}>Удалить пациента</button>
            <p class="muted">Удалит карточку и все её данные на этом компьютере. Отменить нельзя.</p>
          </div>
        </div>`
                    : `<div class="empty">Этап «${esc(step.title)}»: поля пока не заданы.<br><small>Их можно добавить в файле src/app/fields.ts.</small></div>`}
      ${params ? paramSaveHtml(c) : ""}
    </div>
    <div class="nav2">
      ${si > 0 ? `<a class="btn" href="#/client/${esc(id)}/${STEPS[si - 1].id}">← ${esc(stepName(si - 1))}</a>` : "<span></span>"}
      ${si < STEPS.length - 1 ? `<a class="btn primary" href="#/client/${esc(id)}/${STEPS[si + 1].id}">${esc(stepName(si + 1))} →</a>` : "<span></span>"}
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
        ["export", "del"].forEach(b => { const el = document.querySelector("#" + b); if (el)
            el.disabled = false; });
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
        if (params)
            paramState();
    };
    // Состояние бланка анализов: сохранён или есть изменения
    const labState = () => {
        const dirty = labDirty(c), has = Object.keys(bufValues(c)).length > 0;
        const st = document.getElementById("ldstate");
        if (st) {
            st.className = "ld-state" + (dirty ? " dirty" : "");
            st.textContent = dirty ? (selSet(c) ? "· есть несохранённые изменения" : has ? "· не сохранены" : "") : selSet(c) ? "· сохранено" : "";
        }
        const saveBtn = document.querySelector("#labsave [data-ls=save]");
        if (saveBtn)
            saveBtn.classList.toggle("primary", dirty);
    };
    const paramState = () => {
        const dirty = paramDirty(c), has = Object.keys(paramBufValues(c)).length > 0;
        const st = document.getElementById("pdstate");
        if (st) {
            st.className = "ld-state" + (dirty ? " dirty" : "");
            st.textContent = dirty ? (selParamSet(c) ? "· есть несохранённые изменения" : has ? "· не сохранены" : "") : selParamSet(c) ? "· сохранено" : "";
        }
        const saveBtn = document.querySelector("#paramsave [data-ps=save]");
        if (saveBtn)
            saveBtn.classList.toggle("primary", dirty);
    };
    const fieldByCode = (code) => {
        if (!code)
            return undefined;
        if (labs)
            return Labs.resolveField(code, LAB_FIELDS.find(x => x.code === code)) || undefined;
        return fieldsOf(step).find(x => x.code === code);
    };
    const form = $("#form");
    form.addEventListener("input", ev => {
        const el = ev.target;
        if (el.dataset.row !== undefined)
            return readTable(el.closest("[data-table]"));
        if (!el.dataset.code)
            return;
        const f = fieldByCode(el.dataset.code);
        if (el.dataset.slider) {
            el.removeAttribute("data-empty");
            const n = Number(el.value);
            set(el.dataset.code, n);
            const val = form.querySelector(`[data-slider-val="${el.dataset.code}"]`);
            if (val)
                val.textContent = String(n);
            el.setAttribute("aria-valuenow", String(n));
            return;
        }
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
    form.addEventListener("click", ev => {
        const help = ev.target.closest("[data-exam-help]");
        if (help) {
            ev.preventDefault();
            openExamSignHelp(help.dataset.examHelp || "");
            return;
        }
        const clr = ev.target.closest("[data-slider-clear]");
        if (!clr)
            return;
        const code = clr.dataset.sliderClear;
        set(code, "");
        const range = form.querySelector(`input[data-code="${code}"][data-slider]`);
        if (range) {
            range.value = String(range.min || "0");
            range.setAttribute("data-empty", "1");
            range.setAttribute("aria-valuenow", range.value);
        }
        const val = form.querySelector(`[data-slider-val="${code}"]`);
        if (val)
            val.textContent = "";
    });
    if (labs) {
        bindLabs();
        bindExtra();
    }
    if (params) {
        bindParams();
        bindTalk("params");
    }
    if (step.id === "general") {
        bindComplaints();
        bindTalk("general");
    }
    if (step.id === "diagnoses")
        Dx.ready().then(err => drawDxTab(c, err));
    function bindComplaints() {
        const list = document.getElementById("cmplist");
        if (!list)
            return;
        const refresh = () => { list.innerHTML = Cmp.complaintsListHtml(c); };
        list.addEventListener("click", ev => {
            const b = ev.target.closest("[data-cmp]");
            if (!b)
                return;
            const def = Cmp.COMPLAINTS.find(d => d.id === b.dataset.cmp);
            if (!def)
                return;
            Cmp.openComplaintDialog(c, def, () => {
                clearTimeout(timer);
                save();
                refresh();
            });
        });
    }
    /** Подтянуть видимые поля (и чипы жалоб на «Общем») после правок из чата с доктором. */
    function syncTalkFields(stepId) {
        for (const f of Talk.talkFields(STEPS, stepId)) {
            const v = c.values[f.code];
            const s = v === undefined || v === null || v === "" ? "" : String(v);
            const el = form.querySelector(`[data-code="${f.code}"]`);
            if (el && el.value !== s) {
                if (f.type === "slider") {
                    const range = el;
                    const empty = s === "";
                    range.value = empty ? String(range.min || "0") : s;
                    if (empty)
                        range.setAttribute("data-empty", "1");
                    else
                        range.removeAttribute("data-empty");
                    const val = form.querySelector(`[data-slider-val="${f.code}"]`);
                    if (val)
                        val.textContent = empty ? "" : s;
                }
                else
                    el.value = s;
            }
            const seg = form.querySelector(`[data-choice="${f.code}"]`);
            if (seg) {
                seg.querySelectorAll("button").forEach(b => {
                    const bv = b.dataset.v ?? "";
                    b.classList.toggle("on", bv === s);
                });
            }
        }
        if (stepId === "general") {
            const list = document.getElementById("cmplist");
            if (list)
                list.innerHTML = Cmp.complaintsListHtml(c);
            const title = document.getElementById("title");
            if (title)
                title.textContent = (!getClient(id) && !c.values.NAME) ? "Новый клиент" : displayName(c);
        }
        if (stepId === "params")
            paramState();
    }
    function bindTalk(stepId) {
        const btn = document.getElementById("talk-doctor");
        if (!btn)
            return;
        btn.addEventListener("click", () => {
            Talk.openTalkDialog(c, {
                stepId,
                onChange: () => { clearTimeout(timer); save(); syncTalkFields(stepId); },
            });
        });
    }
    // Добавить из справочника (поиск или окно по разделам) / убрать строку
    function bindExtra() {
        const box = document.getElementById("labextra");
        if (!box)
            return;
        const q = box.querySelector("#labadd"), res = box.querySelector("#labaddres");
        const have = () => new Set(labFieldsOf(c).map(f => f.code));
        const exclude = (code) => OTHER_STEP_CODES.has(code) || have().has(code);
        const addCode = (code) => {
            (labAdded[c.id] = labAdded[c.id] || new Set()).add(code);
            labFocus = code;
            clearTimeout(timer);
            save();
            renderClient(id, step.id);
        };
        const draw = () => {
            const found = Labs.search(q.value, exclude);
            res.innerHTML = q.value.trim().length < 2 ? "" : found.length
                ? found.map(code => { const l = Labs.LABS[code]; return `<button type="button" class="lab-res" data-add="${esc(code)}"><b>${esc(l.name)}</b>${l.unit ? ` <small>${esc(l.unit)}</small>` : ""}${l.type === "qual" ? ` <small class="muted">положительно / отрицательно</small>` : ""}${l.aliases.length ? `<small class="muted lab-al">${esc(l.aliases.slice(0, 4).join(", "))}</small>` : ""}</button>`; }).join("")
                : `<p class="muted">В справочнике ничего не нашлось. Новый анализ добавляют в <a href="#/settings/weights">Настройки → Нормы и веса</a>.</p>`;
        };
        q.addEventListener("input", draw);
        q.addEventListener("keydown", ev => { if (ev.key === "Enter") {
            ev.preventDefault();
            const b = res.querySelector("[data-add]");
            if (b)
                b.click();
        } });
        box.querySelector("#labpick")?.addEventListener("click", () => {
            LabPick.openLabPicker({ exclude, onAdd: addCode });
        });
        box.addEventListener("click", ev => {
            const t = ev.target;
            const add = t.closest("[data-add]"), rm = t.closest("[data-rm-lab]");
            if (add)
                addCode(add.dataset.add);
            else if (rm) {
                const code = rm.dataset.rmLab;
                const name = (Labs.LABS[code] && Labs.LABS[code].name) || LAB_FIELDS.find(f => f.code === code)?.label || code;
                if (c.values[code] !== undefined && !confirm(`Убрать «${name}»? Значение в открытых анализах сотрётся.`))
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
    function bindParams() {
        paramState();
        const sc = document.getElementById("pdscroll");
        if (sc)
            sc.scrollLeft = sc.scrollWidth;
        const go = (setId) => {
            if (setId === (c.paramSel || ""))
                return;
            if (paramDirty(c) && !confirm("Замеры не сохранены. Перейти без сохранения? Несохранённые изменения пропадут."))
                return;
            const s = (c.params || []).find(x => x.id === setId);
            loadParamBuf(c, s ? s.values : {});
            c.paramSel = s ? s.id : "";
            c.paramMeta = s ? { date: s.date, time: s.time } : { date: todayIso() };
            clearTimeout(timer);
            save();
            renderClient(id, step.id);
        };
        $("#paramtop").addEventListener("click", ev => { const b = ev.target.closest("[data-pd]"); if (b)
            go(b.dataset.pd || ""); });
        const bar = $("#paramsave"), msg = $("#psmsg"), ask = $("#psask");
        const dIn = bar.querySelector("[name=psdate]"), tIn = bar.querySelector("[name=pstime]");
        const meta = () => { c.paramMeta = { date: dIn.value, ...(tIn.value ? { time: tIn.value } : {}) }; clearTimeout(timer); timer = setTimeout(save, 250); paramState(); };
        dIn.addEventListener("change", meta);
        tIn.addEventListener("change", meta);
        const finish = (s, text) => {
            c.paramSel = s.id;
            c.paramMeta = { date: s.date, ...(s.time ? { time: s.time } : {}) };
            loadParamBuf(c, s.values);
            clearTimeout(timer);
            save();
            paramFlash = text;
            renderClient(id, step.id);
        };
        const write = (mode, target) => {
            const buf = paramBufValues(c), m = c.paramMeta, now = new Date().toISOString();
            if (mode === "update" && target) {
                target.values = buf;
                target.date = m.date;
                target.time = m.time;
                target.savedAt = now;
                return finish(target, "Изменения сохранены.");
            }
            if (mode === "merge" && target) {
                target.values = { ...target.values, ...buf };
                target.savedAt = now;
                return finish(target, `Добавлено к замерам от ${ruDate(target.date)}.`);
            }
            const s = { id: "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), date: m.date, ...(m.time ? { time: m.time } : {}), values: buf, savedAt: now };
            (c.params = c.params || []).push(s);
            finish(s, `Замеры от ${ruDate(s.date)} сохранены.`);
        };
        bar.addEventListener("click", ev => {
            const b = ev.target.closest("[data-ps]");
            if (!b)
                return;
            const act = b.dataset.ps;
            if (act === "cancel") {
                ask.hidden = true;
                return;
            }
            if (act === "merge" || act === "separate") {
                ask.hidden = true;
                return write(act === "merge" ? "merge" : "new", (c.params || []).find(x => x.id === b.dataset.target));
            }
            if (act === "del") {
                const s = selParamSet(c);
                if (!s || !confirm(`Удалить замеры от ${ruDate(s.date)}? Это нельзя отменить.`))
                    return;
                c.params = (c.params || []).filter(x => x.id !== s.id);
                const last = sortedParamSets(c).pop();
                loadParamBuf(c, last ? last.values : {});
                c.paramSel = last ? last.id : "";
                c.paramMeta = last ? { date: last.date, time: last.time } : { date: todayIso() };
                clearTimeout(timer);
                save();
                paramFlash = `Замеры от ${ruDate(s.date)} удалены.`;
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
                msg.textContent = "Укажите дату замеров.";
                dIn.focus();
                return;
            }
            meta();
            if (!Object.keys(paramBufValues(c)).length) {
                msg.className = "ls-msg err";
                msg.textContent = "Нечего сохранять — заполните вес, давление или другие показатели.";
                return;
            }
            const sel = selParamSet(c);
            if (sel)
                return write("update", sel);
            const same = (c.params || []).find(x => x.date === dIn.value);
            if (same) {
                ask.innerHTML = `На ${esc(ruDate(same.date))} уже есть замеры. <button type="button" class="btn primary" data-ps="merge" data-target="${esc(same.id)}">Добавить к ним</button><button type="button" class="btn" data-ps="separate">Сохранить отдельно</button><button type="button" class="btn" data-ps="cancel">Отмена</button>`;
                ask.hidden = false;
                return;
            }
            write("new");
        });
        if (paramFlash) {
            msg.className = "ls-msg ok";
            msg.textContent = paramFlash;
            paramFlash = "";
        }
    }
    // Сводка «Требуют внимания»: обновляется при уходе из поля; на вкладке анализов — ещё порядок и подсветка строк
    const refreshAttn = () => {
        if (labs)
            refreshLabAttnList(c);
        else {
            const box = document.getElementById("attn");
            if (box)
                box.innerHTML = attnHtml(step, c);
        }
    };
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
    $("#export").onclick = () => openExportDialog(c);
    $("#import").onclick = () => {
        const input = $("#import-file");
        input.value = "";
        input.onchange = async () => {
            const f = input.files && input.files[0];
            if (!f)
                return;
            try {
                const text = await f.text();
                const kind = detectImportKind(f.name, text);
                if (!kind) {
                    alert("Не понял формат файла. Нужен CSV или Markdown, выгруженный из кабинета.");
                    return;
                }
                const r = kind === "csv" ? fromCSV(text) : fromMarkdown(text);
                const msg = applyImport(c, r);
                if (!msg) {
                    alert("В файле не нашлось данных для загрузки.");
                    return;
                }
                if (!isFilled(null, c.values.NAME) && !getClient(id)) {
                    alert(msg + "\n\nУкажите имя на вкладке «Общее», чтобы сохранить клиента.");
                }
                labFlash = msg;
                clearTimeout(timer);
                save();
                location.hash = "#/client/" + id + "/labs";
                renderClient(id, "labs");
            }
            catch (e) {
                alert("Не удалось прочитать файл: " + ((e instanceof Error && e.message) || e));
            }
        };
        input.click();
    };
    const delBtn = document.getElementById("del");
    if (delBtn)
        delBtn.addEventListener("click", () => {
            const inFolder = FS.ready() && c.folder ? " Подпапка «" + c.folder + "» в папке «" + FS.state.name + "» тоже будет удалена." : "";
            if (!confirm("Удалить клиента «" + displayName(c) + "» и все его данные?" + inFolder))
                return;
            deleteClient(id);
            location.hash = "#/clients";
        });
    const first = form.querySelector("input, textarea, select");
    if (first && si === 0 && !c.values.NAME)
        first.focus();
}
let labFlash = ""; // сообщение после сохранения анализов
let paramFlash = ""; // сообщение после сохранения замеров параметров
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
/** Соседние поля с одним `row` — в одну линию; остальные по одному. */
function fieldsLayoutHtml(fields, c) {
    const parts = [];
    for (let i = 0; i < fields.length;) {
        const f = fields[i];
        if (f.row) {
            const group = [];
            while (i < fields.length && fields[i].row === f.row)
                group.push(fields[i++]);
            parts.push(`<div class="field-row" data-row="${esc(f.row)}">${group.map(x => fieldHtml(x, c.values[x.code], c)).join("")}</div>`);
        }
        else {
            parts.push(fieldHtml(f, c.values[f.code], c));
            i++;
        }
    }
    return parts.join("");
}
function sectionHtml(step, sec, c) {
    // над колонкой норм — заголовок «Норма» (если в разделе есть показатели с нормой)
    const head = sec.fields.some(f => f.type === "number" && Norms.hasNorm(f.code))
        ? `<div class="field fhead" aria-hidden="true"><span></span><div class="ctl"><span class="fh-val">Значение</span><span class="unit">ед. изм.</span><span class="lab-cols"><span class="norm-h">Норма</span><span class="dev-h">Отклонение</span><span class="crit-h">Критичность</span><span class="marks-h" title="откуда норма: серый — настройки, фиолетовый — правило по параметрам клиента, голубой — своё у клиента">Метка</span></span></div></div>` : "";
    const note = sec.note ? `<p class="sec-note">${esc(sec.note)}</p>` : "";
    if (step.id === "general" && sec.title === "Жалобы") {
        const plain = fieldsLayoutHtml(sec.fields.filter(f => !Cmp.isComplaintCode(f.code)), c);
        return `<div class="sec"><h2>${esc(sec.title)}</h2>${note}
      <div class="cmp-list" id="cmplist">${Cmp.complaintsListHtml(c)}</div>
      ${plain}</div>`;
    }
    const fields = head + fieldsLayoutHtml(sec.fields, c);
    if (sec.fold && sec.id)
        return `<div class="sec">${fold(step.id + "." + sec.id, sec.title, foldStatusHtml(sec, c), note + fields)}</div>`;
    if (step.id === "general" && sec.title === "Клиент") {
        return `<div class="sec"><div class="sec-head"><h2>${esc(sec.title)}</h2>
      <button type="button" class="btn" id="talk-doctor" title="помощник заполняет поля вкладки, это не врач из Настройки → Агенты">Помощник по анкете</button></div>${note}${fields}</div>`;
    }
    if (step.id === "params" && sec.title === "Тело") {
        return `<div class="sec"><div class="sec-head"><h2>${esc(sec.title)}</h2>
      <button type="button" class="btn" id="talk-doctor" title="помощник заполняет поля вкладки, это не врач из Настройки → Агенты">Помощник по анкете</button></div>${note}${fields}</div>`;
    }
    if (step.id === "params" && sec.title === "Осмотр") {
        syncExamCatalog();
        const signWord = (n) => {
            if (n % 10 === 1 && n % 100 !== 11)
                return "признак";
            if (n % 10 >= 2 && n % 10 <= 4 && !(n % 100 >= 12 && n % 100 <= 14))
                return "признака";
            return "признаков";
        };
        const itemWord = (n) => {
            if (n % 10 === 1 && n % 100 !== 11)
                return "пункт";
            if (n % 10 >= 2 && n % 10 <= 4 && !(n % 100 >= 12 && n % 100 <= 14))
                return "пункта";
            return "пунктов";
        };
        const blockFields = (fields) => {
            if (!fields.length)
                return "";
            // шкала и число осмотра — одна сетка: название-ссылка, значение справа
            const compact = fields.every(f => f.type === "slider" || (f.type === "number" && Exams.isExamLineCode(f.code)));
            return compact
                ? `<div class="exam-slider-grid">${fields.map(f => fieldHtml(f, c.values[f.code], c)).join("")}</div>`
                : fieldsLayoutHtml(fields, c);
        };
        // группа систем → пункты; раскрывалка пункта только если признаков больше одного (или есть вложенные группы)
        const blocks = Exams.GROUPS.map(g => {
            const items = Exams.inGroup(g.id);
            if (!items.length)
                return "";
            const inner = items.map(it => {
                const top = Exams.topFields(it);
                const nests = Exams.nestFields(it);
                const n = Exams.flatSigns(it).length;
                const status = n ? `${n} ${signWord(n)}` : "пусто";
                let body;
                if (!top.length && !nests.length) {
                    body = `<p class="muted">Строк пока нет — добавьте в <a href="#/settings/exam/${esc(g.id)}">настройках</a>.</p>`;
                }
                else {
                    const nestHtml = nests.map(({ nest, fields }) => `<details class="exam-nest-card">
              <summary><span class="exam-nest-mark" aria-hidden="true"></span><span class="exam-nest-title">${esc(nest.name)}</span>
                <span class="muted">${fields.length}</span></summary>
              <div class="exam-nest-card-body">${blockFields(fields) || `<p class="muted">Пусто</p>`}</div>
            </details>`).join("");
                    body = `${blockFields(top)}${nestHtml}`;
                }
                // один признак без вложенных групп — поле сразу, без лишней раскрывалки
                if (n <= 1 && !nests.length)
                    return `<div class="exam-flat-item">${body}</div>`;
                return fold(`exam.${g.id}.${it.id}`, it.name, status, body);
            }).join("");
            return `<div class="exam-sec">${fold(`exam.${g.id}`, g.title, `${items.length} ${itemWord(items.length)}`, `<p class="muted exam-sys-desc">${esc(g.desc)}</p><div class="exam-sys-items">${inner}</div>`)}</div>`;
        }).join("");
        return `<div class="sec"><h2>${esc(sec.title)}</h2>
      <p class="muted sec-note">Список из <a href="#/settings/exam">Настройки → Осмотр</a> — те же группы и пункты, что в настройках.</p>
      ${blocks || `<p class="muted">В справочнике пока нет пунктов.</p>`}</div>`;
    }
    return `<div class="sec">${sec.title ? `<h2>${esc(sec.title)}</h2>` : ""}${note}${fields}</div>`;
}
function filesListHtml(refs) {
    if (!refs.length)
        return `<p class="muted files-empty">Файлов пока нет.</p>`;
    return `<ul class="files">${refs.map(r => `<li><a href="#" data-openfile="${esc(r.id)}" title="открыть">${esc(r.name)}</a><span class="muted">${Files.sizeText(r.size)} · ${fmtDate(r.addedAt)}${r.savedAs ? " · в папке" : ""}</span><button type="button" class="btn danger" data-rmfile="${esc(r.id)}" title="удалить файл" aria-label="удалить файл ${esc(r.name)}">×</button></li>`).join("")}</ul>`;
}
function fieldHtml(f, v, own) {
    if (f.hidden)
        return f.type === "files" ? `<p class="muted hidden-note">${esc(f.label)}: ${esc(f.hint || "добавление скрыто")}</p>` : "";
    if (f.type === "aiimport")
        return aiImportHtml();
    const la = Labs.LABS[f.code]; // название — статья; рядом иконка — норма/кривая в настройках
    const art = articleUrl(f.code) || (la && la.article ? "../articles/lab-tests/" + encodeURIComponent(la.article) + ".html" : undefined);
    const title = art
        ? `<a class="art-link" href="${art}" target="_blank" rel="noopener" title="статья «${esc(f.label)}» — откроется в новой вкладке">${esc(f.label)}</a>`
        : esc(f.label);
    const canEditNorm = !!(la || LAB_FORM_CODES.has(f.code));
    const edit = canEditNorm
        ? `<a class="lab-norm-edit" href="#/settings/weights/${encodeURIComponent(secOfLab(f.code).id)}/${encodeURIComponent(f.code)}" title="норма и кривая — Настройки → Нормы и веса" aria-label="настроить норму «${esc(f.label)}»"><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></a>`
        : "";
    const name = edit ? `${title}<span class="lab-name-gap"></span>${edit}` : title;
    const exam = Exams.isExamLineCode(f.code);
    // у осмотра описание — наведение/клик по названию, не <small> под полем
    const lbl = exam
        ? examSignLinkHtml(f.code, f.label) + (f.required ? ' <span class="req">*</span>' : "")
        : `${name}${f.required ? ' <span class="req">*</span>' : ""}${f.hint ? `<small>${esc(f.hint)}</small>` : ""}`;
    const id = "f_" + f.code;
    const s = v === undefined || v === null || v === "" ? "" : String(v);
    let ctl = "";
    switch (f.type) {
        case "text":
            ctl = `<input type="text" id="${id}" data-code="${f.code}" value="${esc(v)}">`;
            break;
        case "textarea":
            if (exam) {
                return `<div class="field wide exam-text-field">
          ${examSignLinkHtml(f.code, f.label)}
          <textarea id="${id}" data-code="${f.code}" rows="3" placeholder="по описанию признака">${esc(v)}</textarea>
        </div>`;
            }
            return `<div class="field wide"><label for="${id}">${lbl}</label><textarea id="${id}" data-code="${f.code}">${esc(v)}</textarea></div>`;
        case "date":
            ctl = `<input type="date" id="${id}" data-code="${f.code}" value="${esc(v)}">`;
            break;
        case "select":
            ctl = `<select id="${id}" data-code="${f.code}"><option value="">—</option>${(f.options || []).map(([val, t]) => `<option value="${esc(val)}"${v === val ? " selected" : ""}>${esc(t)}</option>`).join("")}</select>`;
            break;
        case "number": {
            ctl = `<input type="number" inputmode="decimal" id="${id}" data-code="${f.code}" value="${esc(v)}"${f.min != null ? ` min="${f.min}"` : ""}${f.max != null ? ` max="${f.max}"` : ""} step="${f.step || "any"}"${f.computed ? " readonly tabindex=\"-1\" title=\"считается автоматически\"" : ""}>${f.computed ? '<span class="unit">авто</span>' : `<span class="unit">${esc(f.unit || "")}</span>`}${Norms.colsHtml(f.code, f.unit || "", v, own)}`;
            if (exam) {
                return `<div class="field wide exam-num-field">
          <div class="slider-line">
            ${examSignLinkHtml(f.code, f.label)}
            <span class="ctl exam-num-ctl">${ctl}</span>
          </div></div>`;
            }
            break;
        }
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
        case "slider": {
            const lo = f.min ?? 0, hi = f.max ?? 100;
            const empty = s === "";
            const num = empty ? lo : Math.min(hi, Math.max(lo, Number(s) || lo));
            const exam = Exams.isExamLineCode(f.code);
            // у осмотра: наведение — короткий текст; клик — полное описание
            const title = exam
                ? examSignLinkHtml(f.code, f.label)
                : `<label for="${id}" class="slider-name">${name}${f.required ? ' <span class="req">*</span>' : ""}</label>`;
            const ends = exam ? "" : `<span class="slider-span">${esc(f.scaleFrom || String(lo))} — ${esc(f.scaleTo || String(hi))}</span>`;
            return `<div class="field wide slider-field">
        <div class="slider-line">
          ${title}
          ${ends}
          <span class="slider-control">
            <input type="range" id="${id}" data-code="${f.code}" data-slider="1" min="${lo}" max="${hi}" step="1" value="${num}"${empty ? ` data-empty="1"` : ""} aria-valuemin="${lo}" aria-valuemax="${hi}" aria-valuenow="${num}" aria-label="${esc(f.label)}">
            <span class="slider-val" data-slider-val="${esc(f.code)}">${empty ? "" : esc(num)}</span>
            <button type="button" class="btn slider-reset" data-slider-clear="${esc(f.code)}" title="сбросить" aria-label="сбросить">↩</button>
          </span>
        </div></div>`;
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
const fileBase = (c) => "client-" + displayName(c).replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_|_$/g, "").slice(0, 40);
const csvCell = (v) => { const s = String(v == null ? "" : v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const SOURCE = { general: "опрос", params: "осмотр", labs: "анализ", psych: "психолог" };
const FIELD_BY_CODE = {};
const STEP_OF_CODE = {};
for (const step of STEPS)
    for (const sec of step.sections) {
        // Осмотр подставляется динамически — в статичный индекс не кладём
        if (step.id === "params" && sec.title === "Осмотр")
            continue;
        for (const f of sec.fields) {
            FIELD_BY_CODE[f.code] = f;
            STEP_OF_CODE[f.code] = step.id;
        }
    }
const fieldByAny = (code) => {
    // анализы: тип/имя из каталога (Настройки), даже если код есть в бланке fields.ts
    if (Labs.has(code) || LAB_FORM_CODES.has(code)) {
        return Labs.resolveField(code, FIELD_BY_CODE[code] || null);
    }
    if (FIELD_BY_CODE[code])
        return FIELD_BY_CODE[code];
    syncExamCatalog();
    return Exams.fieldByLineCode(code);
};
const isLabCode = (code) => STEP_OF_CODE[code] === "labs" || isExtraCode(code);
// Дата в файле: ISO / дд.мм.гггг → ISO; day0, пусто, относительные — сегодня
function parseExportDate(raw) {
    const s = String(raw || "").trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s))
        return s.slice(0, 10);
    const dmy = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s);
    if (dmy)
        return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
    return todayIso();
}
// Анализы для выгрузки: все сохранённые + несохранённый бланк; при правках открытых — актуальные значения
function labExportSets(c) {
    const out = sortedSets(c).map(s => ({ date: s.date, ...(s.time ? { time: s.time } : {}), values: { ...s.values } }));
    const buf = bufValues(c);
    if (!Object.keys(buf).length)
        return out;
    const metaDate = (c.labMeta && c.labMeta.date) || todayIso();
    const metaTime = c.labMeta && c.labMeta.time;
    if (!(c.labSel || "")) {
        out.push({ date: metaDate, ...(metaTime ? { time: metaTime } : {}), values: buf });
        return out;
    }
    if (labDirty(c)) {
        const sel = selSet(c);
        const i = sel ? sortedSets(c).findIndex(s => s.id === sel.id) : -1;
        if (i >= 0)
            out[i] = { date: metaDate, ...(metaTime ? { time: metaTime } : {}), values: buf };
    }
    return out;
}
function labsForExport(c, opts) {
    const sets = labExportSets(c);
    if (opts && opts.scope === "labs" && opts.labPick !== "all")
        return sets.filter(s => s.date === opts.labPick);
    return sets;
}
function paramExportSets(c) {
    const out = sortedParamSets(c).map(s => ({ date: s.date, ...(s.time ? { time: s.time } : {}), values: { ...s.values } }));
    const buf = paramBufValues(c);
    if (!Object.keys(buf).length)
        return out;
    const metaDate = (c.paramMeta && c.paramMeta.date) || todayIso();
    const metaTime = c.paramMeta && c.paramMeta.time;
    if (!(c.paramSel || "")) {
        out.push({ date: metaDate, ...(metaTime ? { time: metaTime } : {}), values: buf });
        return out;
    }
    if (paramDirty(c)) {
        const sel = selParamSet(c);
        const i = sel ? sortedParamSets(c).findIndex(s => s.id === sel.id) : -1;
        if (i >= 0)
            out[i] = { date: metaDate, ...(metaTime ? { time: metaTime } : {}), values: buf };
    }
    return out;
}
function pushCsvValue(lines, code, v, date, src) {
    const f = fieldByAny(code);
    if (f && f.type === "files")
        return;
    if (f && f.type === "table") {
        for (const r of v)
            if (r.name || r.value)
                lines.push(["LAB:" + (r.name || ""), r.value, r.unit || "", r.date || date, src].map(csvCell).join(","));
        return;
    }
    const unit = (f && f.unit) || (f && f.type === "yesno" ? "да/нет" : f && f.type === "scale" ? "0–" + f.max : "");
    lines.push([code, v, unit, date, src].map(csvCell).join(","));
}
function toCSV(c, opts) {
    const scope = (opts && opts.scope) || "all";
    const lines = ["code,value,unit,date,source"];
    if (scope === "all") {
        for (const step of STEPS) {
            if (step.id === "labs")
                continue;
            for (const f of fieldsOf(step)) {
                if (step.id === "params" && isParamHistCode(f.code))
                    continue; // timed → paramExportSets
                const v = c.values[f.code];
                if (!isFilled(f, v) || f.code === "NAME" || f.type === "files")
                    continue;
                pushCsvValue(lines, f.code, v, todayIso(), SOURCE[step.id] || step.id);
            }
        }
        for (const s of paramExportSets(c)) {
            for (const [code, v] of Object.entries(s.values))
                pushCsvValue(lines, code, v, s.date, "осмотр");
        }
    }
    for (const s of labsForExport(c, opts)) {
        for (const [code, v] of Object.entries(s.values))
            pushCsvValue(lines, code, v, s.date, "анализ");
    }
    return lines.join("\n") + "\n";
}
const mdCell = (s) => String(s == null ? "" : s).replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
const mdShow = (f, v) => f.type === "yesno" ? (String(v) === "1" ? "да" : "нет")
    : f.type === "select" ? ((f.options || []).find(o => o[0] === v) || ["", String(v)])[1]
        : f.type === "scale" ? v + " из " + f.max
            : f.unit ? v + " " + f.unit : String(v);
function mdValuesTable(values) {
    let out = "";
    const codes = Object.keys(values);
    const simple = codes.map(code => fieldByAny(code)).filter((f) => !!f && f.type !== "table" && f.type !== "files" && isFilled(f, values[f.code]));
    const tables = codes.map(code => fieldByAny(code)).filter((f) => !!f && f.type === "table" && isFilled(f, values[f.code]));
    const extras = codes.filter(code => !fieldByAny(code));
    if (simple.length) {
        out += "| Поле | Код | Значение |\n|---|---|---|\n";
        for (const f of simple)
            out += `| ${mdCell(f.label)} | ${f.code} | ${mdCell(mdShow(f, values[f.code]))} |\n`;
    }
    for (const code of extras)
        out += (out.includes("| Поле |") ? "" : "| Поле | Код | Значение |\n|---|---|---|\n") + `| ${mdCell(code)} | ${code} | ${mdCell(values[code])} |\n`;
    for (const f of tables) {
        const cols = f.columns || [];
        out += `\n#### ${mdCell(f.label)}\n\n| ${cols.map(col => mdCell(col.label)).join(" | ")} |\n|${cols.map(() => "---").join("|")}|\n`;
        for (const r of values[f.code])
            out += `| ${cols.map(col => mdCell(r[col.key])).join(" | ")} |\n`;
    }
    return out;
}
function toMarkdown(c, opts) {
    const scope = (opts && opts.scope) || "all";
    let out = `# ${mdCell(displayName(c))}\n\nСоздан: ${fmtDate(c.createdAt)} · изменён: ${fmtDate(c.updatedAt)}\n`;
    STEPS.forEach((step, i) => {
        if (step.id === "labs") {
            const sets = labsForExport(c, opts);
            if (!sets.length)
                return;
            out += `\n## ${i + 1}. ${mdCell(step.title)}\n`;
            for (const s of sets) {
                out += `\n### ${s.date}${s.time ? " " + s.time : ""}\n\n`;
                out += mdValuesTable(s.values);
            }
            return;
        }
        if (scope !== "all")
            return;
        if (step.id === "params") {
            const stable = fieldsOf(step).filter(f => !isParamHistCode(f.code) && isFilled(f, c.values[f.code]));
            const sets = paramExportSets(c);
            if (!stable.length && !sets.length)
                return;
            out += `\n## ${i + 1}. ${mdCell(step.title)}\n`;
            if (stable.length) {
                out += "\n" + mdValuesTable(Object.fromEntries(stable.map(f => [f.code, c.values[f.code]])));
            }
            for (const s of sets) {
                out += `\n### ${s.date}${s.time ? " " + s.time : ""}\n\n`;
                out += mdValuesTable(s.values);
            }
            return;
        }
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
                out += `| ${mdCell(f.label)} | ${f.code} | ${mdCell(mdShow(f, c.values[f.code]))} |\n`;
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
function openExportDialog(c) {
    const sets = labExportSets(c);
    const dates = [...new Set(sets.map(s => s.date))];
    const selDate = (c.labMeta && c.labMeta.date && dates.includes(c.labMeta.date)) ? c.labMeta.date
        : (selSet(c) && dates.includes(selSet(c).date) ? selSet(c).date : dates[dates.length - 1] || "");
    const ov = document.createElement("div");
    ov.className = "cv-overlay";
    ov.innerHTML = `<div class="cv-dialog exp-dlg" role="dialog" aria-modal="true" aria-labelledby="exp-title">
    <div class="cv-head"><b id="exp-title">Выгрузить</b>
      <button type="button" class="btn cv-x" data-close aria-label="закрыть">✕</button></div>
    <div class="exp-row"><span class="exp-lbl">Формат</span>
      <span class="seg" role="group" aria-label="Формат">
        <button type="button" class="on" data-fmt="csv">CSV</button>
        <button type="button" data-fmt="md">Markdown</button>
      </span></div>
    <div class="exp-row"><span class="exp-lbl">Что</span>
      <span class="seg" role="group" aria-label="Объём">
        <button type="button" class="on" data-scope="all">Всё</button>
        <button type="button" data-scope="labs">Анализы</button>
      </span></div>
    <div class="exp-labs" data-labs hidden>
      <label class="exp-radio"><input type="radio" name="exp-pick" value="all" checked> Все анализы</label>
      <label class="exp-radio"><input type="radio" name="exp-pick" value="date" ${dates.length ? "" : "disabled"}> За дату
        <select data-exp-date ${dates.length ? "" : "disabled"}>${dates.length
        ? dates.map(d => `<option value="${esc(d)}"${d === selDate ? " selected" : ""}>${esc(ruDate(d))}</option>`).join("")
        : `<option value="">нет анализов</option>`}</select>
      </label>
      ${dates.length ? "" : `<p class="muted exp-empty">Сохранённых анализов пока нет — выгружать нечего.</p>`}
    </div>
    <div class="exp-actions">
      <button type="button" class="btn primary" data-go>Выгрузить</button>
    </div>
  </div>`;
    document.body.appendChild(ov);
    lockScroll();
    let fmt = "csv", scope = "all";
    const labsBox = ov.querySelector("[data-labs]");
    const sync = () => { labsBox.hidden = scope !== "labs"; };
    const close = () => {
        document.removeEventListener("keydown", onKey);
        ov.remove();
        unlockScroll();
    };
    const onKey = (e) => { if (e.key === "Escape")
        close(); };
    document.addEventListener("keydown", onKey);
    ov.addEventListener("click", e => { if (e.target === ov)
        close(); });
    ov.querySelector("[data-close]").addEventListener("click", close);
    ov.querySelectorAll("[data-fmt]").forEach(b => b.addEventListener("click", () => {
        fmt = (b.dataset.fmt || "csv");
        ov.querySelectorAll("[data-fmt]").forEach(x => x.classList.toggle("on", x === b));
    }));
    ov.querySelectorAll("[data-scope]").forEach(b => b.addEventListener("click", () => {
        scope = (b.dataset.scope || "all");
        ov.querySelectorAll("[data-scope]").forEach(x => x.classList.toggle("on", x === b));
        sync();
    }));
    const dateSel = ov.querySelector("[data-exp-date]");
    if (dateSel)
        dateSel.addEventListener("change", () => {
            const r = ov.querySelector('input[name="exp-pick"][value="date"]');
            if (r && !r.disabled)
                r.checked = true;
        });
    ov.querySelector("[data-go]").addEventListener("click", () => {
        const pickRad = ov.querySelector('input[name="exp-pick"]:checked');
        const dateSel = ov.querySelector("[data-exp-date]");
        const opts = {
            scope,
            labPick: scope === "labs" && pickRad && pickRad.value === "date" ? (dateSel && dateSel.value || "") : "all",
        };
        if (scope === "labs") {
            const labs = labsForExport(c, opts);
            if (!labs.length) {
                alert(opts.labPick === "all" ? "Анализов пока нет." : "На эту дату анализов нет.");
                return;
            }
        }
        if (fmt === "csv")
            download(fileBase(c) + ".csv", toCSV(c, opts), "text/csv");
        else
            download(fileBase(c) + ".md", toMarkdown(c, opts), "text/markdown");
        close();
    });
    sync();
    ov.querySelector("[data-go]").focus();
}
function parseCsvLine(line) {
    const out = [];
    let cur = "", i = 0, q = false;
    while (i < line.length) {
        const ch = line[i];
        if (q) {
            if (ch === '"' && line[i + 1] === '"') {
                cur += '"';
                i += 2;
                continue;
            }
            if (ch === '"') {
                q = false;
                i++;
                continue;
            }
            cur += ch;
            i++;
            continue;
        }
        if (ch === '"') {
            q = true;
            i++;
            continue;
        }
        if (ch === ",") {
            out.push(cur);
            cur = "";
            i++;
            continue;
        }
        cur += ch;
        i++;
    }
    out.push(cur);
    return out;
}
function coerceImportValue(f, raw) {
    const s = String(raw == null ? "" : raw).trim();
    if (s === "")
        return undefined;
    if (!f) {
        const n = Number(s.replace(/\s/g, "").replace(",", "."));
        return isFinite(n) && /^-?\d/.test(s.replace(/\s/g, "")) ? n : s;
    }
    if (f.type === "number" || f.type === "scale") {
        const n = Number(s.replace(/\s/g, "").replace(",", "."));
        return isFinite(n) ? n : undefined;
    }
    if (f.type === "yesno") {
        if (/^(1|да|yes|true)$/i.test(s))
            return "1";
        if (/^(0|нет|no|false)$/i.test(s))
            return "0";
        return undefined;
    }
    if (f.type === "select") {
        const opts = f.options || [];
        const byVal = opts.find(o => o[0] === s);
        if (byVal)
            return byVal[0];
        const byLabel = opts.find(o => o[1].toLowerCase() === s.toLowerCase());
        return byLabel ? byLabel[0] : s;
    }
    return s;
}
function emptyImport() { return { labs: new Map(), params: new Map(), other: {} }; }
function dateBucket(map, date) {
    const d = parseExportDate(date);
    let vals = map.get(d);
    if (!vals) {
        vals = {};
        map.set(d, vals);
    }
    return vals;
}
function labBucket(data, date) { return dateBucket(data.labs, date); }
function paramBucket(data, date) { return dateBucket(data.params, date); }
function putImported(data, code, raw, date, unit = "") {
    if (!code || code === "NAME")
        return;
    if (code.startsWith("LAB:")) {
        const name = code.slice(4).trim();
        if (!name)
            return;
        const vals = labBucket(data, date);
        const rows = Array.isArray(vals.LABS_OTHER) ? [...vals.LABS_OTHER] : [];
        rows.push({ name, value: raw, unit: unit || "", date: parseExportDate(date) });
        vals.LABS_OTHER = rows;
        return;
    }
    const f = fieldByAny(code);
    const v = coerceImportValue(f, raw);
    if (v === undefined)
        return;
    if (isParamHistCode(code)) {
        paramBucket(data, date)[code] = v;
        return;
    }
    if (isLabCode(code) || (f && STEP_OF_CODE[code] === "labs"))
        labBucket(data, date)[code] = v;
    else
        data.other[code] = v;
}
// По расширению, иначе по содержимому: CSV с заголовком code,value… или Markdown с ## / таблицами
function detectImportKind(name, text) {
    const n = (name || "").toLowerCase();
    if (/\.csv$/i.test(n))
        return "csv";
    if (/\.(md|markdown)$/i.test(n))
        return "md";
    const head = text.replace(/^\uFEFF/, "").trimStart().slice(0, 800);
    if (/^#\s+/m.test(head) || /^\|\s*Поле\s*\|\s*Код\s*\|/m.test(head) || /^##\s+/m.test(head))
        return "md";
    const first = head.split(/\r?\n/).find(l => l.trim()) || "";
    if (/^code\s*,\s*value\b/i.test(first) || /^[A-Z][A-Z0-9_]*\s*,/.test(first))
        return "csv";
    if (/\.txt$/i.test(n)) {
        if (head.includes("|") && /код/i.test(head))
            return "md";
        if (first.includes(","))
            return "csv";
    }
    return null;
}
function fromCSV(text) {
    const data = emptyImport();
    const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(l => l.trim());
    if (!lines.length)
        return data;
    const head = parseCsvLine(lines[0]).map(h => h.trim().toLowerCase());
    const iCode = head.indexOf("code"), iVal = head.indexOf("value");
    const start = iCode >= 0 && iVal >= 0 ? 1 : 0;
    const col = (row, name, fallback) => {
        const i = head.indexOf(name);
        return i >= 0 ? (row[i] || "") : (row[fallback] || "");
    };
    for (let li = start; li < lines.length; li++) {
        const row = parseCsvLine(lines[li]);
        if (!row.length || row.every(c => !c.trim()))
            continue;
        const code = (start ? col(row, "code", 0) : row[0] || "").trim();
        const value = start ? col(row, "value", 1) : (row[1] || "");
        const unit = start ? col(row, "unit", 2) : (row[2] || "");
        const date = start ? col(row, "date", 3) : (row[3] || "");
        putImported(data, code, value, date, unit);
    }
    return data;
}
function fromMarkdown(text) {
    const data = emptyImport();
    const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
    let mode = "none";
    let dated = todayIso();
    let inCodeTable = false;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const h2 = /^##\s+\d+\.\s+(.+?)\s*$/.exec(line);
        if (h2) {
            const title = h2[1].trim().toLowerCase();
            mode = title.includes("анализ") ? "labs" : title.includes("параметр") ? "params" : "other";
            dated = todayIso();
            inCodeTable = false;
            continue;
        }
        const h3 = /^###\s+(.+?)\s*$/.exec(line);
        if (h3 && (mode === "labs" || mode === "params")) {
            const raw = h3[1].trim();
            const m = /^(\d{4}-\d{2}-\d{2})/.exec(raw)
                || /^(\d{1,2}\.\d{1,2}\.\d{4})/.exec(raw)
                || /(?:от\s+)?(\d{4}-\d{2}-\d{2}|\d{1,2}\.\d{1,2}\.\d{4})/i.exec(raw);
            dated = m ? parseExportDate(m[1]) : todayIso();
            inCodeTable = false;
            continue;
        }
        if (/^\|\s*Поле\s*\|\s*Код\s*\|\s*Значение\s*\|/i.test(line)) {
            inCodeTable = true;
            continue;
        }
        if (inCodeTable) {
            if (/^\|\s*-+/.test(line))
                continue;
            if (!line.trim().startsWith("|")) {
                inCodeTable = false;
                continue;
            }
            const parts = line.split("|").map(x => x.trim());
            const cells = parts[0] === "" && parts[parts.length - 1] === "" ? parts.slice(1, -1) : parts;
            if (cells.length < 3)
                continue;
            const code = cells[1];
            const rawVal = cells[2].replace(/<br\s*\/?>/gi, "\n").trim();
            const f = fieldByAny(code);
            let vraw = rawVal;
            if (f && (f.type === "number" || f.type === "scale")) {
                const num = rawVal.match(/-?\d+(?:[.,]\d+)?/);
                if (num)
                    vraw = num[0];
            }
            else if (f && f.type === "yesno") {
                vraw = /да/i.test(rawVal) ? "1" : /нет/i.test(rawVal) ? "0" : rawVal;
            }
            if (mode === "labs")
                putImported(data, code, vraw, dated);
            else if (mode === "params")
                putImported(data, code, vraw, isParamHistCode(code) ? dated : todayIso());
            else
                putImported(data, code, vraw, todayIso());
        }
    }
    return data;
}
function applyImport(c, data) {
    let nVals = 0, nLabSets = 0, nParamSets = 0;
    for (const [code, v] of Object.entries(data.other)) {
        c.values[code] = v;
        nVals++;
    }
    c.labs = c.labs || [];
    let lastLab = null;
    for (const [date, values] of data.labs) {
        const keys = Object.keys(values);
        if (!keys.length)
            continue;
        nVals += keys.length;
        nLabSets++;
        for (const code of keys)
            if (isExtraCode(code))
                (labAdded[c.id] = labAdded[c.id] || new Set()).add(code);
        const now = new Date().toISOString();
        const s = { id: "l" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), date, values: { ...values }, savedAt: now };
        c.labs.push(s);
        lastLab = s;
    }
    if (lastLab) {
        c.labSel = lastLab.id;
        c.labMeta = { date: lastLab.date, ...(lastLab.time ? { time: lastLab.time } : {}) };
        loadBuf(c, lastLab.values);
    }
    c.params = c.params || [];
    let lastParam = null;
    for (const [date, values] of data.params) {
        const keys = Object.keys(values);
        if (!keys.length)
            continue;
        nVals += keys.length;
        nParamSets++;
        const now = new Date().toISOString();
        const s = { id: "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), date, values: { ...values }, savedAt: now };
        c.params.push(s);
        lastParam = s;
    }
    if (lastParam) {
        c.paramSel = lastParam.id;
        c.paramMeta = { date: lastParam.date, ...(lastParam.time ? { time: lastParam.time } : {}) };
        loadParamBuf(c, lastParam.values);
    }
    if (!nLabSets && !nParamSets && !Object.keys(data.other).length)
        return "";
    const parts = [];
    if (nLabSets)
        parts.push(nLabSets === 1 ? "1 сдача анализов" : nLabSets + " сдач анализов");
    if (nParamSets)
        parts.push(nParamSets === 1 ? "1 срез параметров" : nParamSets + " срезов параметров");
    if (nVals)
        parts.push(nVals + " показателей");
    return "Загружено: " + parts.join(", ");
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
Promise.all([FS.init().catch(folderError), Settings.Store.init(), Norms.loadNorms(), Labs.loadLabs(), Exams.loadDescs()])
    .then(() => Labs.applyOwn(Settings.load().labs))
    .finally(route);
// настройки дочитались из папки, открылся доступ или введён пароль — перерисовать страницу настроек
Settings.Store.onChange(() => { if (location.hash.startsWith("#/settings"))
    route(); });
