// SPDX-License-Identifier: AGPL-3.0-or-later
// Электродоктор — кабинет: вход, список клиентов, анкета по этапам.
// Данные хранятся в localStorage этого браузера и, если выбрана папка, ещё и в ней
// (см. folder.ts); есть выгрузка в CSV, Markdown и JSON.
import { STEPS } from "./fields.js";
import * as FS from "./folder.js";
import { fold } from "./ui.js";
import * as Files from "./files.js";
import * as AI from "./aiimport.js";
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
const sexLabel = (v) => v === "F" ? "ж" : v === "M" ? "м" : "";
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
const loggedIn = () => sessionGet("ed.login") === "1";
function route() {
    const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
    if (!loggedIn() && parts.length) {
        location.replace("#/");
        return;
    }
    if (!parts.length)
        return renderLogin();
    if (parts[0] === "clients")
        return renderClients();
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
    $("#nav").innerHTML = loggedIn()
        ? `<a class="btn" href="#/clients">Клиенты</a><button class="btn" id="logout">Выход</button>`
        : "";
    const lo = $("#logout");
    if (lo)
        lo.onclick = () => { sessionSet("ed.login", null); location.hash = "#/"; };
}
// ---------- вход ----------
function renderLogin() {
    if (loggedIn()) {
        location.hash = "#/clients";
        return;
    }
    renderNav();
    view.innerHTML = `<section class="login"><div>
    <h1>Кабинет Электродоктора</h1>
    <p>Учёт клиентов и анкеты по этапам: общее, параметры, анализы, психолог. Авторизации пока нет — вход открыт.</p>
    <button class="btn primary big" id="enter">Вход</button>
  </div></section>`;
    $("#enter").onclick = () => { sessionSet("ed.login", "1"); location.hash = "#/clients"; };
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
        $("#list").innerHTML = `<table><thead><tr><th>Имя</th><th>Пол</th><th>Возраст</th><th>Этапы</th><th class="hide-sm">Изменён</th></tr></thead><tbody>${rows.map(c => `<tr class="click" data-id="${esc(c.id)}"><td><a href="#/client/${esc(c.id)}/${STEPS[0].id}">${esc(displayName(c))}</a></td><td>${sexLabel(c.values.SEX)}</td><td>${esc(c.values.AGE || "")}</td><td>${dots(c)}</td><td class="hide-sm muted">${fmtDate(c.updatedAt)}</td></tr>`).join("")}</tbody></table>`;
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
function dots(c) {
    return `<span class="dots" title="заполненность этапов">${STEPS.map(s => {
        const p = progress(c, s);
        const cls = p.total && p.filled === p.total ? "full" : p.filled ? "part" : "";
        return `<i class="${cls}" title="${esc(s.title)}: ${p.filled}/${p.total}"></i>`;
    }).join("")}</span>`;
}
// ---------- анкета ----------
const stepName = (i) => /^\d+$/.test(STEPS[i].title) ? "Этап " + STEPS[i].title : STEPS[i].title;
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
    <div class="card" id="form">${step.sections.length ? step.sections.map(sec => sectionHtml(step, sec, c)).join("")
        : `<div class="empty">Этап «${esc(step.title)}»: поля пока не заданы.<br><small>Их можно добавить в файле src/app/fields.ts.</small></div>`}
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
                st.textContent = foldStatus(sec, c);
        }
    };
    const set = (code, v) => {
        if (v === "" || v == null)
            delete c.values[code];
        else
            c.values[code] = v;
        clearTimeout(timer);
        timer = setTimeout(save, 250);
    };
    const fieldByCode = (code) => fieldsOf(step).find(x => x.code === code);
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
                clearTimeout(timer);
                save();
                aiFlash = `Перенесено показателей: ${chosen.length}.` + (parsed.date ? ` Дата анализов: ${parsed.date}.` : "");
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
let aiFlash = ""; // сообщение после переноса, показывается на перерисованной странице
function aiImportHtml() {
    return `<div class="ai" data-ai>
    <p class="ai-lead">Распознавание делает любой ИИ, который вы выберете: ChatGPT, DeepSeek, Claude, Gemini… Фото уходят только туда, куда вы их отправите сами.</p>
    <ol class="ai-steps">
      <li><div>Скопируйте промпт — в нём список всех полей анкеты и формат ответа.</div>
        <div class="grp"><button type="button" class="btn primary" data-ai-act="copy">Скопировать промпт</button><button type="button" class="btn" data-ai-act="download">Скачать .txt</button></div></li>
      <li><div>Откройте ИИ, вставьте промпт и приложите фото или PDF анализов.</div></li>
      <li><div>Вставьте ответ ИИ сюда или загрузите сохранённый .json.</div>
        <textarea data-ai-text rows="4" spellcheck="false" placeholder='{ "format": "electrodoctor-labs", "version": 1, "results": [ … ] }' aria-label="Ответ ИИ"></textarea>
        <div class="grp"><button type="button" class="btn primary" data-ai-act="parse">Разобрать ответ</button><label class="btn">Загрузить .json<input type="file" data-ai-file accept=".json,.txt,application/json,text/plain" hidden></label></div></li>
    </ol>
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
function foldStatus(sec, c) {
    const fs = sec.fields.filter(counts);
    if (!fs.length)
        return "";
    const n = fs.filter(f => isFilled(f, c.values[f.code])).length;
    return n ? `заполнено ${n} из ${fs.length}` : "не заполнено";
}
function sectionHtml(step, sec, c) {
    const fields = sec.fields.map(f => fieldHtml(f, c.values[f.code])).join("");
    if (sec.fold && sec.id)
        return `<div class="sec">${fold(step.id + "." + sec.id, sec.title, esc(foldStatus(sec, c)), fields)}</div>`;
    return `<div class="sec">${sec.title ? `<h2>${esc(sec.title)}</h2>` : ""}${fields}</div>`;
}
function filesListHtml(refs) {
    if (!refs.length)
        return `<p class="muted files-empty">Файлов пока нет.</p>`;
    return `<ul class="files">${refs.map(r => `<li><a href="#" data-openfile="${esc(r.id)}" title="открыть">${esc(r.name)}</a><span class="muted">${Files.sizeText(r.size)} · ${fmtDate(r.addedAt)}${r.savedAs ? " · в папке" : ""}</span><button type="button" class="btn danger" data-rmfile="${esc(r.id)}" title="удалить файл" aria-label="удалить файл ${esc(r.name)}">×</button></li>`).join("")}</ul>`;
}
function fieldHtml(f, v) {
    if (f.hidden)
        return `<p class="muted hidden-note">${esc(f.label)}: добавление скрыто.</p>`;
    if (f.type === "aiimport")
        return aiImportHtml();
    const lbl = `${esc(f.label)}${f.required ? ' <span class="req">*</span>' : ""}${f.hint ? `<small>${esc(f.hint)}</small>` : ""}`;
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
            ctl = `<input type="number" inputmode="decimal" id="${id}" data-code="${f.code}" value="${esc(v)}"${f.min != null ? ` min="${f.min}"` : ""}${f.max != null ? ` max="${f.max}"` : ""} step="${f.step || "any"}"${f.computed ? " readonly tabindex=\"-1\" title=\"считается автоматически\"" : ""}>${f.unit ? `<span class="unit">${esc(f.unit)}</span>` : ""}${f.computed ? '<span class="unit">авто</span>' : ""}`;
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
FS.init().catch(folderError).finally(route);
