// SPDX-License-Identifier: AGPL-3.0-or-later
// Электродоктор — Настройки → Осмотр: справочник пунктов по системам.
// У пункта — признаки и вложенные группы; у признака — «описание» и тип «шкала»/«поле».
import * as Exams from "./exams.js";
import * as Settings from "./settings.js";
import * as I18n from "./i18n.js";
import { lockScroll, unlockScroll } from "./ui.js";
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function syncOwn() {
    Exams.applyOwn(Settings.load().exams);
}
function putOwn(id, patch) {
    const st = Settings.load();
    const own = { ...(st.exams || {}) };
    if (!patch)
        delete own[id];
    else {
        const next = { ...(own[id] || {}), ...patch, id };
        delete next.lines; // канон — entries
        own[id] = next;
    }
    st.exams = own;
    Settings.save(st);
    syncOwn();
}
function plural(n) {
    if (n % 10 === 1 && n % 100 !== 11)
        return "пункт";
    if (n % 10 >= 2 && n % 10 <= 4 && !(n % 100 >= 12 && n % 100 <= 14))
        return "пункта";
    return "пунктов";
}
function linesPlural(n) {
    if (n % 10 === 1 && n % 100 !== 11)
        return "признак";
    if (n % 10 >= 2 && n % 10 <= 4 && !(n % 100 >= 12 && n % 100 <= 14))
        return "признака";
    return "признаков";
}
function descBtnClass(desc) {
    return "btn exam-desc-btn" + (desc.trim() ? " has-tip" : " empty");
}
function syncDescTip(btn, desc) {
    const t = desc.trim();
    btn.className = descBtnClass(t);
    if (t)
        btn.setAttribute("data-tip", t);
    else
        btn.removeAttribute("data-tip");
    btn.title = t ? "" : "описание";
}
function replyBtn(line) {
    const reply = Exams.replyOf(line);
    const label = Exams.replyLabel(line);
    return `<button type="button" class="btn exam-reply-btn" data-exam-act="edit-reply" data-reply="${esc(reply)}" title="тип значения в карточке">${esc(label)}</button>`;
}
/** Текст для просмотра: своё desc, иначе из статьи / from–to. */
function lineEditorText(line, examId) {
    const own = Exams.editorDesc(line).trim();
    if (own)
        return own;
    if (examId)
        return Exams.resolvedDesc(examId, line);
    return "";
}
function lineCard(line, examId) {
    const desc = lineEditorText(line, examId);
    const tip = desc.trim() ? ` data-tip="${esc(desc)}"` : "";
    const title = desc.trim() ? "" : ` title="посмотреть описание"`;
    const reply = Exams.replyOf(line);
    return `<div class="exam-line-card" data-line="${esc(line.id)}">
    <div class="exam-line-top">
      <label class="exam-field exam-line-label"><span>Признак</span>
        <input type="text" name="llabel" value="${esc(line.label)}" placeholder="название признака" maxlength="200"></label>
      <button type="button" class="${descBtnClass(desc)}" data-exam-act="edit-desc"${tip}${title}>описание</button>
      ${replyBtn(line)}
      <button type="button" class="btn danger" data-exam-act="rm-line" title="удалить признак" aria-label="удалить признак">×</button>
    </div>
    <textarea name="ldesc" hidden>${esc(desc)}</textarea>
    <input type="hidden" name="lreply" value="${esc(reply)}">
    <input type="hidden" name="larticle" value="${esc(line.article || "")}">
  </div>`;
}
function nestFold(nest, examId) {
    const n = nest.lines.length;
    return `<details class="exam-nest" data-nest="${esc(nest.id)}" open>
    <summary class="exam-nest-sum">
      <span class="exam-nest-mark" aria-hidden="true"></span>
      <input type="text" name="nname" class="exam-nest-name" value="${esc(nest.name)}" maxlength="120" placeholder="название группы">
      <span class="muted exam-nest-count">${n} ${linesPlural(n)}</span>
      <button type="button" class="btn danger" data-exam-act="rm-nest" title="удалить группу" aria-label="удалить группу">×</button>
    </summary>
    <div class="exam-nest-body">
      <div class="exam-line-list" data-nest-lines>${nest.lines.map(l => lineCard(l, examId)).join("")}</div>
      <button type="button" class="btn" data-exam-act="add-line-nest" style="margin-top:8px">+ признак</button>
    </div>
  </details>`;
}
function entryHtml(e, examId) {
    return Exams.isNest(e) ? nestFold(e, examId) : lineCard(e, examId);
}
function itemFold(it, open) {
    const n = Exams.flatSigns(it).length;
    const status = n ? `${n} ${linesPlural(n)}` : "нет признаков";
    const entries = it.entries || [];
    return `<details class="fold exam-item"${open ? " open" : ""} data-exam="${esc(it.id)}">
    <summary><span class="fold-title">${esc(it.name)}</span>
      <span class="fold-status">${esc(status)}${it.own ? " · своё" : ""}</span>
      <span class="fold-chev" aria-hidden="true"></span></summary>
    <div class="fold-body exam-body">
      <label class="exam-field"><span>Название</span>
        <input type="text" name="name" value="${esc(it.name)}" maxlength="120"></label>
      <div class="exam-lines-wrap">
        <div class="exam-lines-head"><b>Признаки и группы</b>
          <span class="muted">«описание»; тип — «шкала» / «поле» / «текст»; группа — вложенный список</span></div>
        <div class="exam-entry-list" data-entries>${entries.map(e => entryHtml(e, it.id)).join("")}</div>
        <div class="exam-add-row">
          <button type="button" class="btn" data-exam-act="add-line">+ признак</button>
          <button type="button" class="btn" data-exam-act="add-nest">+ группа</button>
        </div>
      </div>
      <div class="exam-actions">
        <button type="button" class="btn primary" data-exam-act="save">Сохранить</button>
        <span class="muted exam-msg" aria-live="polite"></span>
        ${it.id.startsWith("own_")
        ? `<button type="button" class="btn danger" data-exam-act="rm" title="удалить пункт">Удалить пункт</button>`
        : it.own
            ? `<button type="button" class="btn" data-exam-act="reset" title="вернуть встроенный набор">Сбросить правки</button>`
            : ""}
      </div>
    </div>
  </details>`;
}
function readLineCard(card) {
    const id = card.dataset.line || Exams.newLineId();
    const label = card.querySelector("[name=llabel]")?.value.trim() || "";
    if (!label)
        return null;
    const desc = card.querySelector("[name=ldesc]")?.value.trim() || "";
    const replyRaw = card.querySelector("[name=lreply]")?.value || "scale";
    const reply = replyRaw === "number" || replyRaw === "text" ? replyRaw : "scale";
    const article = card.querySelector("[name=larticle]")?.value.trim() || "";
    const line = { id, label, reply };
    if (desc)
        line.desc = desc;
    if (article)
        line.article = article;
    return line;
}
function readEntries(body) {
    const list = body.querySelector("[data-entries]");
    if (!list)
        return [];
    const out = [];
    for (const child of Array.from(list.children)) {
        if (child.matches("[data-line]")) {
            const line = readLineCard(child);
            if (line)
                out.push(line);
            continue;
        }
        if (child.matches("[data-nest]")) {
            const id = child.dataset.nest || Exams.newNestId();
            const name = child.querySelector("[name=nname]")?.value.trim() || "";
            if (!name)
                continue;
            const lines = [];
            child.querySelectorAll("[data-nest-lines] [data-line]").forEach(card => {
                const line = readLineCard(card);
                if (line)
                    lines.push(line);
            });
            out.push({ kind: "group", id, name, lines });
        }
    }
    return out;
}
function syncReplyBtn(card, reply) {
    const hidden = card.querySelector("[name=lreply]");
    if (hidden)
        hidden.value = reply;
    const btn = card.querySelector("[data-exam-act=edit-reply]");
    if (btn) {
        btn.dataset.reply = reply;
        btn.textContent = Exams.replyLabel({ id: "", label: "", reply });
    }
}
/** Окно: шкала / поле / текст (радио, без галочек). */
function openReplyEditor(card, persist) {
    const label = card.querySelector("[name=llabel]")?.value.trim() || "Признак";
    const raw = card.querySelector("[name=lreply]")?.value || "scale";
    const cur = raw === "number" || raw === "text" ? raw : "scale";
    const ov = document.createElement("div");
    ov.className = "cv-overlay";
    ov.innerHTML = `<div class="cv-dialog exam-reply-dlg" role="dialog" aria-modal="true" aria-labelledby="exam-reply-title">
    <div class="cv-head"><b id="exam-reply-title">${esc(label)}</b>
      <button type="button" class="btn cv-x" data-close aria-label="закрыть">✕</button></div>
    <div class="exam-reply-opts" role="radiogroup" aria-label="Тип значения">
      <label class="exam-reply-opt"><input type="radio" name="exam-reply" value="scale"${cur === "scale" ? " checked" : ""}> Шкала</label>
      <label class="exam-reply-opt"><input type="radio" name="exam-reply" value="number"${cur === "number" ? " checked" : ""}> Поле</label>
      <label class="exam-reply-opt"><input type="radio" name="exam-reply" value="text"${cur === "text" ? " checked" : ""}> Текст</label>
    </div>
    <div class="exam-actions exam-reply-actions">
      <button type="button" class="btn primary" data-save>Сохранить</button>
      <button type="button" class="btn" data-close>Отмена</button>
    </div>
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
    ov.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", close));
    ov.querySelector("[data-save]").onclick = () => {
        const picked = ov.querySelector("input[name=exam-reply]:checked")?.value;
        const reply = picked === "number" || picked === "text" ? picked : "scale";
        syncReplyBtn(card, reply);
        persist();
        close();
    };
    ov.querySelector("input[name=exam-reply]:checked")?.focus();
}
/** Просмотр описания: из кабинета статьи в репозиторий не пишутся. */
function openDescViewer(card) {
    const store = card.querySelector("[name=ldesc]");
    const label = card.querySelector("[name=llabel]")?.value.trim() || "Признак";
    const article = card.querySelector("[name=larticle]")?.value.trim() || "";
    const text = store.value.trim();
    const artHref = article ? Exams.articleHref({ id: "", label, article }) : undefined;
    const body = text
        ? `<pre class="exam-desc-view">${esc(text)}</pre>`
        : `<p class="muted">Описания пока нет.</p>`;
    const artLink = artHref
        ? `<p class="exam-help-art"><a href="${esc(artHref)}" target="_blank" rel="noopener">Статья на сайте ↗</a></p>`
        : "";
    const ov = document.createElement("div");
    ov.className = "cv-overlay";
    ov.innerHTML = `<div class="cv-dialog exam-desc-dlg" role="dialog" aria-modal="true" aria-labelledby="exam-desc-title">
    <div class="cv-head"><b id="exam-desc-title">Описание: ${esc(label)}</b>
      <button type="button" class="btn cv-x" data-close aria-label="закрыть">✕</button></div>
    ${body}${artLink}
    <p class="muted exam-desc-hint">Чтобы изменить описание, скачайте проект себе на компьютер и правьте статью Markdown локально (папка <code>docs/articles/exams/</code>) — из кабинета в файлы сайта это не записывается.</p>
    <div class="exam-actions" style="margin-top:12px">
      <button type="button" class="btn" data-close>Закрыть</button>
    </div>
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
    ov.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", close));
    ov.querySelector("[data-close]")?.focus();
}
function bindLineActs(scope, persist) {
    scope.querySelectorAll("[data-exam-act=rm-line]").forEach(btn => {
        btn.onclick = () => btn.closest("[data-line]")?.remove();
    });
    scope.querySelectorAll("[data-exam-act=edit-desc]").forEach(btn => {
        btn.onclick = () => {
            const card = btn.closest("[data-line]");
            if (card)
                openDescViewer(card);
        };
    });
    scope.querySelectorAll("[data-exam-act=edit-reply]").forEach(btn => {
        btn.onclick = () => {
            const card = btn.closest("[data-line]");
            if (card)
                openReplyEditor(card, persist);
        };
    });
}
function bindNestActs(nestEl, persist) {
    nestEl.querySelector("[data-exam-act=rm-nest]").onclick = ev => {
        ev.preventDefault();
        ev.stopPropagation();
        if (!confirm("Удалить группу и все её признаки?"))
            return;
        nestEl.remove();
    };
    const nameInp = nestEl.querySelector("[name=nname]");
    if (nameInp) {
        nameInp.addEventListener("click", ev => ev.stopPropagation());
        nameInp.addEventListener("keydown", ev => ev.stopPropagation());
    }
    nestEl.querySelector("[data-exam-act=add-line-nest]").onclick = () => {
        const list = nestEl.querySelector("[data-nest-lines]");
        const examId = nestEl.closest("[data-exam]")?.dataset.exam;
        const line = { id: Exams.newLineId(), label: "", reply: "scale" };
        list.insertAdjacentHTML("beforeend", lineCard(line, examId));
        const card = list.querySelector(`[data-line="${line.id}"]`);
        card?.querySelector("[name=llabel]")?.focus();
        bindLineActs(card, persist);
    };
    bindLineActs(nestEl, persist);
}
function drawGroup(main, group, focusId) {
    syncOwn();
    const list = Exams.inGroup(group.id);
    main.innerHTML = `<div class="set-head">
      <h2><a class="muted" href="#/settings/exam">Осмотр</a> · ${esc(group.title)}</h2>
      <span class="muted">${list.length} ${plural(list.length)}</span></div>
    <p class="muted dx-lead">${esc(group.desc)}. Признаки, вложенные группы; описание — текст или статья Markdown.</p>
    <div class="dx-acc exam-list">${list.map(it => itemFold(it, focusId === it.id)).join("")
        || `<p class="muted">В этой группе пока пусто.</p>`}</div>
    <div class="card exam-add">
      <b>+ Добавить осмотр в «${esc(group.title)}»</b>
      <label class="exam-field"><span>Название</span><input type="text" name="newname" maxlength="120" placeholder="например: Симптом Пастернацкого"></label>
      <div class="exam-actions">
        <button type="button" class="btn primary" data-exam-act="add">Добавить</button>
        <span class="muted exam-add-msg" aria-live="polite"></span>
      </div>
    </div>
    <p class="muted"><a href="#/settings/exam">← Все группы</a></p>`;
    main.querySelectorAll("[data-exam]").forEach(fold => {
        const id = fold.dataset.exam;
        const body = fold.querySelector(".exam-body");
        const msg = body.querySelector(".exam-msg");
        const listEl = body.querySelector("[data-entries]");
        const persistItem = () => {
            const name = body.querySelector("[name=name]").value.trim();
            if (!name)
                return;
            const entries = readEntries(body);
            putOwn(id, { name, entries, group: group.id });
            const st = fold.querySelector(".fold-status");
            const n = Exams.flatSigns({ id, name, group: group.id, entries }).length;
            if (st)
                st.textContent = (n ? `${n} ${linesPlural(n)}` : "нет признаков") + " · своё";
        };
        bindLineActs(body, persistItem);
        body.querySelectorAll("[data-nest]").forEach(n => bindNestActs(n, persistItem));
        body.querySelector("[data-exam-act=add-line]").onclick = () => {
            const line = { id: Exams.newLineId(), label: "", reply: "scale" };
            listEl.insertAdjacentHTML("beforeend", lineCard(line, id));
            const card = listEl.querySelector(`[data-line="${line.id}"]`);
            card?.querySelector("[name=llabel]")?.focus();
            bindLineActs(card, persistItem);
        };
        body.querySelector("[data-exam-act=add-nest]").onclick = () => {
            const nest = { kind: "group", id: Exams.newNestId(), name: "Новая группа", lines: [] };
            listEl.insertAdjacentHTML("beforeend", nestFold(nest, id));
            const el = listEl.querySelector(`[data-nest="${nest.id}"]`);
            bindNestActs(el, persistItem);
            el.querySelector("[name=nname]")?.focus();
        };
        body.querySelector("[data-exam-act=save]").onclick = () => {
            const name = body.querySelector("[name=name]").value.trim();
            if (!name) {
                msg.textContent = "нужно название";
                return;
            }
            persistItem();
            msg.textContent = "Сохранено";
            setTimeout(() => { msg.textContent = ""; }, 1500);
        };
        const rm = body.querySelector("[data-exam-act=rm]");
        if (rm)
            rm.onclick = () => {
                if (!confirm("Удалить пункт «" + (Exams.get(id)?.name || id) + "»?"))
                    return;
                putOwn(id, null);
                drawGroup(main, group);
            };
        const reset = body.querySelector("[data-exam-act=reset]");
        if (reset)
            reset.onclick = () => {
                putOwn(id, null);
                drawGroup(main, group, id);
            };
    });
    const addBox = main.querySelector(".exam-add");
    addBox.querySelector("[data-exam-act=add]").onclick = () => {
        const name = addBox.querySelector("[name=newname]").value.trim();
        const amsg = addBox.querySelector(".exam-add-msg");
        if (!name) {
            amsg.textContent = "укажите название";
            return;
        }
        const nid = Exams.newOwnId();
        putOwn(nid, { id: nid, name, group: group.id, entries: [] });
        drawGroup(main, group, nid);
    };
}
export function draw(main) {
    syncOwn();
    const parts = location.hash.replace(/^#\/?/, "").split("/");
    const sub = decodeURIComponent(parts[2] || "");
    const group = Exams.GROUPS.find(g => g.id === sub);
    if (group)
        return drawGroup(main, group);
    const total = Exams.all().length;
    main.innerHTML = `<div class="set-head"><h2>${esc(I18n.t("set.head.exam", "Осмотр"))}</h2><span class="muted">${total} ${plural(total)} в ${Exams.GROUPS.length} группах</span></div>
    <p class="muted dx-lead">Справочник пунктов осмотра по системам. У пункта — признаки и вложенные группы (например ШКГ).</p>
    <div class="dx-grid">${Exams.GROUPS.map(g => {
        const n = Exams.inGroup(g.id).length;
        return `<a class="dx-card" href="#/settings/exam/${esc(g.id)}"><span class="dx-name">${esc(g.title)}</span><span class="dx-desc">${esc(g.desc)}</span><span class="dx-count">${n} ${plural(n)}</span></a>`;
    }).join("")}</div>`;
}
