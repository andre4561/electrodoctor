// SPDX-License-Identifier: AGPL-3.0-or-later
// Электродоктор — кабинет: вход, список клиентов, анкета по этапам.
// Данные хранятся в localStorage этого браузера; есть выгрузка в CSV, Markdown и JSON.
(function () {
  "use strict";

  const STEPS = window.ED_STEPS;
  const KEY = "electrodoctor.clients.v1";
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const view = $("#view");

  // ---------- хранилище ----------
  let storageOk = true;
  function loadAll() {
    try {
      const raw = localStorage.getItem(KEY);
      const data = raw ? JSON.parse(raw) : null;
      return data && data.clients ? data : { version: 1, clients: {} };
    } catch (e) { storageOk = false; return memory; }
  }
  let memory = { version: 1, clients: {} };
  function saveAll(data) {
    memory = data;
    try { localStorage.setItem(KEY, JSON.stringify(data)); storageOk = true; }
    catch (e) { storageOk = false; }
  }
  const getClient = id => loadAll().clients[id] || null;
  function putClient(c) {
    const data = loadAll();
    c.updatedAt = new Date().toISOString();
    data.clients[c.id] = c;
    saveAll(data);
  }
  function deleteClient(id) {
    const data = loadAll();
    delete data.clients[id];
    saveAll(data);
  }
  const newId = () => "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  // ---------- поля ----------
  const fieldsOf = step => step.sections.flatMap(s => s.fields);
  const isFilled = (f, v) => f.type === "table" ? Array.isArray(v) && v.some(r => Object.values(r).some(x => String(x).trim() !== "")) : v !== undefined && v !== null && String(v).trim() !== "";
  function progress(c, step) {
    const fs = fieldsOf(step).filter(f => !f.computed);
    const filled = fs.filter(f => isFilled(f, c.values[f.code])).length;
    return { filled, total: fs.length };
  }
  function compute(c) {
    const h = Number(c.values.HEIGHT), w = Number(c.values.WEIGHT);
    if (h > 0 && w > 0) c.values.BMI = Math.round(w / ((h / 100) ** 2) * 10) / 10;
    else delete c.values.BMI;
  }
  const displayName = c => (c.values.NAME || "").trim() || "Без имени";
  const sexLabel = v => v === "F" ? "ж" : v === "M" ? "м" : "";
  const fmtDate = iso => iso ? new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";

  // ---------- маршруты ----------
  function route() {
    const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
    const loggedIn = sessionStorageGet("ed.login") === "1";
    if (!loggedIn && parts.length) { location.replace("#/"); return; }
    if (!parts.length) return renderLogin();
    if (parts[0] === "clients") return renderClients();
    if (parts[0] === "client" && parts[1] === "new") {
      const c = { id: newId(), createdAt: new Date().toISOString(), values: {} };
      drafts[c.id] = c;
      location.replace("#/client/" + c.id + "/" + STEPS[0].id);
      return;
    }
    if (parts[0] === "client" && parts[1]) return renderClient(parts[1], parts[2] || STEPS[0].id);
    location.hash = "#/clients";
  }
  const drafts = {};
  function sessionStorageGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return memSession[k]; } }
  function sessionStorageSet(k, v) { try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch (e) { memSession[k] = v; } }
  const memSession = {};

  function renderNav() {
    const loggedIn = sessionStorageGet("ed.login") === "1";
    $("#nav").innerHTML = loggedIn
      ? `<a class="btn" href="#/clients">Клиенты</a><button class="btn" id="logout">Выход</button>`
      : "";
    const lo = $("#logout");
    if (lo) lo.onclick = () => { sessionStorageSet("ed.login", null); location.hash = "#/"; };
  }

  // ---------- вход ----------
  function renderLogin() {
    if (sessionStorageGet("ed.login") === "1") { location.hash = "#/clients"; return; }
    renderNav();
    view.innerHTML = `<section class="login"><div>
      <h1>Кабинет Электродоктора</h1>
      <p>Учёт клиентов и анкеты по этапам: общее, параметры, анализы, психолог. Авторизации пока нет — вход открыт.</p>
      <button class="btn primary big" id="enter">Вход</button>
    </div></section>`;
    $("#enter").onclick = () => { sessionStorageSet("ed.login", "1"); location.hash = "#/clients"; };
  }

  // ---------- клиенты ----------
  function renderClients() {
    renderNav();
    const all = Object.values(loadAll().clients).sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
    view.innerHTML = `
      <h1>Клиенты</h1>
      ${storageOk ? "" : '<div class="note">Браузер не даёт сохранять данные (приватный режим?). Записи пропадут после закрытия вкладки — выгрузите их в файл.</div>'}
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
      if (!all.length) { $("#list").innerHTML = `<div class="empty">Клиентов пока нет.<br><br><a class="btn primary" href="#/client/new">Добавить клиента</a></div>`; return; }
      if (!rows.length) { $("#list").innerHTML = `<div class="empty">Никого не нашлось.</div>`; return; }
      $("#list").innerHTML = `<table><thead><tr><th>Имя</th><th>Пол</th><th>Возраст</th><th>Этапы</th><th class="hide-sm">Изменён</th></tr></thead><tbody>${
        rows.map(c => `<tr class="click" data-id="${esc(c.id)}"><td><a href="#/client/${esc(c.id)}/${STEPS[0].id}">${esc(displayName(c))}</a></td><td>${sexLabel(c.values.SEX)}</td><td>${esc(c.values.AGE || "")}</td><td>${dots(c)}</td><td class="hide-sm muted">${fmtDate(c.updatedAt)}</td></tr>`).join("")
      }</tbody></table>`;
      document.querySelectorAll("tr.click").forEach(tr => tr.onclick = ev => { if (!ev.target.closest("a")) location.hash = "#/client/" + tr.dataset.id + "/" + STEPS[0].id; });
    };
    $("#q").oninput = draw;
    draw();
    $("#exp").onclick = () => download("electrodoctor-clients.json", JSON.stringify(loadAll(), null, 2), "application/json");
    $("#imp").onclick = () => $("#impfile").click();
    $("#impfile").onchange = async ev => {
      const f = ev.target.files[0]; if (!f) return;
      try {
        const inc = JSON.parse(await f.text());
        if (!inc || !inc.clients) throw new Error();
        const data = loadAll();
        let n = 0;
        for (const c of Object.values(inc.clients)) if (c && c.id && c.values) { data.clients[c.id] = c; n++; }
        saveAll(data);
        alert("Загружено клиентов: " + n);
        renderClients();
      } catch (e) { alert("Не получилось прочитать файл. Нужен JSON, выгруженный кнопкой «Выгрузить всех»."); }
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
  function renderClient(id, stepId) {
    renderNav();
    const c = getClient(id) || drafts[id];
    if (!c) { view.innerHTML = `<p>Клиент не найден. <a href="#/clients">К списку</a></p>`; return; }
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
        const label = /^\d+$/.test(s.title) ? "" : esc(s.title);
        return `<a class="step${i === si ? " on" : ""}${full && i !== si ? " full" : ""}" role="tab" aria-selected="${i === si}" href="#/client/${esc(id)}/${s.id}" style="text-decoration:none"><span class="n">${i + 1}</span>${label}</a>`;
      }).join("")}</div>
      <div class="card" id="form">${step.sections.length ? step.sections.map(sec => `
        <div class="sec"><h2>${esc(sec.title)}</h2>${sec.fields.map(f => fieldHtml(f, c.values[f.code])).join("")}</div>`).join("")
        : `<div class="empty">Этап ${si + 1}: поля пока не заданы.<br><small>Их можно добавить в файле docs/app/fields.js.</small></div>`}
      </div>
      <div class="nav2">
        ${si > 0 ? `<a class="btn" href="#/client/${esc(id)}/${STEPS[si - 1].id}">← ${esc(stepName(si - 1))}</a>` : "<span></span>"}
        ${si < STEPS.length - 1 ? `<a class="btn primary" href="#/client/${esc(id)}/${STEPS[si + 1].id}">${esc(stepName(si + 1))} →</a>` : `<a class="btn primary" href="#/clients">Готово</a>`}
      </div>`;

    let timer = null;
    const save = () => {
      compute(c);
      const bmi = $('[data-code="BMI"]'); if (bmi) bmi.value = c.values.BMI ?? "";
      if (!isFilled({}, c.values.NAME) && !getClient(id)) {
        $("#saved").textContent = "Заполните имя, чтобы сохранить";
        return;
      }
      putClient(c);
      delete drafts[id];
      $("#title").textContent = displayName(c);
      ["csv", "md", "del"].forEach(b => $("#" + b).disabled = false);
      $("#saved").textContent = storageOk ? "Сохранено " + new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : "Не сохраняется в браузере — выгрузите файл";
      document.querySelectorAll(".step").forEach((el, i) => {
        const p = progress(c, STEPS[i]);
        el.classList.toggle("full", !!p.total && p.filled === p.total && i !== si);
      });
    };
    const set = (code, v) => {
      if (v === "" || v == null) delete c.values[code]; else c.values[code] = v;
      clearTimeout(timer); timer = setTimeout(save, 250);
    };

    const form = $("#form");
    form.addEventListener("input", ev => {
      const el = ev.target;
      if (el.dataset.row !== undefined) return readTable(el.closest("[data-table]"));
      if (!el.dataset.code) return;
      const f = fieldsOf(step).find(x => x.code === el.dataset.code);
      let v = el.value;
      if (f && f.type === "number") v = v === "" ? "" : Number(v);
      set(el.dataset.code, v);
    });
    form.addEventListener("click", ev => {
      const b = ev.target.closest("button"); if (!b) return;
      const box = b.closest("[data-choice]");
      if (box) {
        const v = b.dataset.v;
        box.querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b && v !== ""));
        if (box.classList.contains("seg") && v === "") b.classList.add("on");
        set(box.dataset.choice, v === "" ? "" : Number(v));
        return;
      }
      const tbl = b.closest("[data-table]");
      if (tbl && b.dataset.act === "add") { addRow(tbl); return; }
      if (tbl && b.dataset.act === "rm") { b.closest("tr").remove(); readTable(tbl); }
    });
    function addRow(tbl) {
      const f = fieldsOf(step).find(x => x.code === tbl.dataset.table);
      tbl.querySelector("tbody").insertAdjacentHTML("beforeend", rowHtml(f, {}));
      tbl.querySelector("tbody tr:last-child input").focus();
    }
    function readTable(tbl) {
      const f = fieldsOf(step).find(x => x.code === tbl.dataset.table);
      const rows = [...tbl.querySelectorAll("tbody tr")].map(tr => {
        const r = {}; f.columns.forEach((col, i) => r[col.key] = tr.querySelectorAll("input")[i].value); return r;
      });
      set(f.code, rows.length ? rows : "");
    }

    $("#csv").onclick = () => download(fileBase(c) + ".csv", toCSV(c), "text/csv");
    $("#md").onclick = () => download(fileBase(c) + ".md", toMarkdown(c), "text/markdown");
    $("#del").onclick = () => {
      if (!confirm("Удалить клиента «" + displayName(c) + "» и все его данные?")) return;
      deleteClient(id); location.hash = "#/clients";
    };
    const first = form.querySelector("input, textarea, select");
    if (first && si === 0 && !c.values.NAME) first.focus();
  }
  const stepName = i => /^\d+$/.test(STEPS[i].title) ? "Этап " + STEPS[i].title : STEPS[i].title;

  function fieldHtml(f, v) {
    const lbl = `${esc(f.label)}${f.required ? ' <span class="req">*</span>' : ""}${f.hint ? `<small>${esc(f.hint)}</small>` : ""}`;
    const id = "f_" + f.code;
    let ctl = "";
    switch (f.type) {
      case "text":
        ctl = `<input type="text" id="${id}" data-code="${f.code}" value="${esc(v)}">`; break;
      case "textarea":
        return `<div class="field wide"><label for="${id}">${lbl}</label><textarea id="${id}" data-code="${f.code}">${esc(v)}</textarea></div>`;
      case "date":
        ctl = `<input type="date" id="${id}" data-code="${f.code}" value="${esc(v)}">`; break;
      case "select":
        ctl = `<select id="${id}" data-code="${f.code}"><option value="">—</option>${f.options.map(([val, t]) => `<option value="${esc(val)}"${v === val ? " selected" : ""}>${esc(t)}</option>`).join("")}</select>`; break;
      case "number":
        ctl = `<input type="number" inputmode="decimal" id="${id}" data-code="${f.code}" value="${esc(v)}"${f.min != null ? ` min="${f.min}"` : ""}${f.max != null ? ` max="${f.max}"` : ""} step="${f.step || "any"}"${f.computed ? " readonly tabindex=\"-1\" title=\"считается автоматически\"" : ""}>${f.unit ? `<span class="unit">${esc(f.unit)}</span>` : ""}${f.computed ? '<span class="unit">авто</span>' : ""}`; break;
      case "yesno": {
        const s = v === undefined || v === null || v === "" ? "" : String(v);
        ctl = `<span class="seg" data-choice="${f.code}" role="group" aria-label="${esc(f.label)}"><button type="button" data-v="" class="${s === "" ? "on" : ""}" title="не спрашивали">?</button><button type="button" data-v="1" class="${s === "1" ? "on" : ""}">да</button><button type="button" data-v="0" class="${s === "0" ? "on" : ""}">нет</button></span>`; break;
      }
      case "scale": {
        const s = v === undefined || v === null || v === "" ? "" : String(v);
        let b = "";
        for (let i = 0; i <= f.max; i++) b += `<button type="button" data-v="${i}" class="${s === String(i) ? "on" : ""}">${i}</button>`;
        ctl = `<span class="scale" data-choice="${f.code}" role="group" aria-label="${esc(f.label)}">${b}<button type="button" data-v="" class="clr" title="очистить">—</button></span>`; break;
      }
      case "table": {
        const rows = Array.isArray(v) && v.length ? v : [{}];
        return `<div class="field wide"><label>${lbl}</label><div class="tblwrap" data-table="${f.code}"><table class="rows"><thead><tr>${f.columns.map(col => `<th>${esc(col.label)}</th>`).join("")}<th></th></tr></thead><tbody>${rows.map(r => rowHtml(f, r)).join("")}</tbody></table><button type="button" class="btn" data-act="add" style="margin-top:6px">+ строка</button></div></div>`;
      }
    }
    return `<div class="field"><label for="${id}">${lbl}</label><div class="ctl">${ctl}</div></div>`;
  }
  function rowHtml(f, r) {
    return `<tr>${f.columns.map(col => `<td><input type="text" data-row value="${esc(r[col.key])}" placeholder="${esc(col.placeholder || "")}" aria-label="${esc(col.label)}"></td>`).join("")}<td><button type="button" class="btn danger" data-act="rm" title="удалить строку" aria-label="удалить строку">×</button></td></tr>`;
  }

  // ---------- выгрузка ----------
  const fileBase = c => "client-" + displayName(c).replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_|_$/g, "").slice(0, 40);
  const csvCell = v => { const s = String(v == null ? "" : v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const SOURCE = { general: "опрос", params: "осмотр", labs: "анализ", psych: "психолог" };
  // Формат examples/*.csv: code,value,unit,date,source — его понимает engine/electrodoctor.py
  function toCSV(c) {
    const lines = ["code,value,unit,date,source"];
    for (const step of STEPS) for (const f of fieldsOf(step)) {
      const v = c.values[f.code];
      if (!isFilled(f, v) || f.code === "NAME") continue; // имя в CSV не пишем: файл обезличен
      const src = SOURCE[step.id] || step.id;
      if (f.type === "table") {
        for (const r of v) if (r.name || r.value)
          lines.push([ "LAB:" + (r.name || ""), r.value, r.unit, r.date || "day0", src ].map(csvCell).join(","));
      } else {
        const unit = f.unit || (f.type === "yesno" ? "да/нет" : f.type === "scale" ? "0–" + f.max : "");
        lines.push([f.code, v, unit, "day0", src].map(csvCell).join(","));
      }
    }
    return lines.join("\n") + "\n";
  }
  function mdCell(s) { return String(s == null ? "" : s).replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>"); }
  function toMarkdown(c) {
    const show = (f, v) => f.type === "yesno" ? (String(v) === "1" ? "да" : "нет")
      : f.type === "select" ? ((f.options.find(o => o[0] === v) || [, v])[1])
      : f.type === "scale" ? v + " из " + f.max
      : f.unit ? v + " " + f.unit : v;
    let out = `# ${mdCell(displayName(c))}\n\nСоздан: ${fmtDate(c.createdAt)} · изменён: ${fmtDate(c.updatedAt)}\n`;
    STEPS.forEach((step, i) => {
      const fs = fieldsOf(step).filter(f => isFilled(f, c.values[f.code]));
      if (!fs.length) return;
      out += `\n## ${i + 1}. ${mdCell(step.title)}\n\n`;
      const simple = fs.filter(f => f.type !== "table");
      if (simple.length) {
        out += "| Поле | Код | Значение |\n|---|---|---|\n";
        for (const f of simple) out += `| ${mdCell(f.label)} | ${f.code} | ${mdCell(show(f, c.values[f.code]))} |\n`;
      }
      for (const f of fs.filter(f => f.type === "table")) {
        out += `\n### ${mdCell(f.label)}\n\n| ${f.columns.map(col => mdCell(col.label)).join(" | ")} |\n|${f.columns.map(() => "---").join("|")}|\n`;
        for (const r of c.values[f.code]) out += `| ${f.columns.map(col => mdCell(r[col.key])).join(" | ")} |\n`;
      }
    });
    return out;
  }
  function download(name, text, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: type + ";charset=utf-8" }));
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  window.addEventListener("hashchange", route);
  route();
})();
