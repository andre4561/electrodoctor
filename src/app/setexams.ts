// SPDX-License-Identifier: AGPL-3.0-or-later
// Электродоктор — Настройки → Осмотр: справочник пунктов по системам.
// У признака — описание; галочка «1» = ползунок 0…100 (края — первая строка описания).
import * as Exams from "./exams.js";
import * as Settings from "./settings.js";

const esc = (s: unknown) => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" } as Record<string, string>)[c]!);

function syncOwn(): void {
  Exams.applyOwn(Settings.load().exams as Record<string, Partial<Exams.ExamItem> & { id?: string }> | undefined);
}

function putOwn(id: string, patch: Partial<Exams.ExamItem> & { deleted?: boolean } | null): void {
  const st = Settings.load();
  const own = { ...(st.exams || {}) } as Record<string, any>;
  if (!patch) delete own[id];
  else own[id] = { ...(own[id] || {}), ...patch, id };
  st.exams = own;
  Settings.save(st);
  syncOwn();
}

function plural(n: number): string {
  if (n % 10 === 1 && n % 100 !== 11) return "пункт";
  if (n % 10 >= 2 && n % 10 <= 4 && !(n % 100 >= 12 && n % 100 <= 14)) return "пункта";
  return "пунктов";
}

function linesPlural(n: number): string {
  if (n % 10 === 1 && n % 100 !== 11) return "признак";
  if (n % 10 >= 2 && n % 10 <= 4 && !(n % 100 >= 12 && n % 100 <= 14)) return "признака";
  return "признаков";
}

function lineCard(line: Exams.ExamLine): string {
  const checked = Exams.usesSlider(line) ? " checked" : "";
  return `<div class="exam-line-card" data-line="${esc(line.id)}">
    <div class="exam-line-top">
      <label class="exam-field exam-line-label"><span>Признак</span>
        <input type="text" name="llabel" value="${esc(line.label)}" placeholder="название признака" maxlength="200"></label>
      <label class="exam-scale" title="Ползунок 0…100; края — первая строка описания">
        <input type="checkbox" name="lscale1"${checked}>
        <span>1</span>
      </label>
      <button type="button" class="btn danger" data-exam-act="rm-line" title="удалить признак" aria-label="удалить признак">×</button>
    </div>
    <label class="exam-field"><span>Описание признака</span>
      <textarea name="ldesc" rows="3" placeholder="здоров — срочно в больницу&#10;кратко: на что смотреть при оценке">${esc(Exams.editorDesc(line))}</textarea></label>
  </div>`;
}

function itemFold(it: Exams.ExamItem, open: boolean): string {
  const n = it.lines.length;
  const status = n ? `${n} ${linesPlural(n)}` : "нет признаков";
  return `<details class="fold exam-item"${open ? " open" : ""} data-exam="${esc(it.id)}">
    <summary><span class="fold-title">${esc(it.name)}</span>
      <span class="fold-status">${esc(status)}${it.own ? " · своё" : ""}</span>
      <span class="fold-chev" aria-hidden="true"></span></summary>
    <div class="fold-body exam-body">
      <label class="exam-field"><span>Название</span>
        <input type="text" name="name" value="${esc(it.name)}" maxlength="120"></label>
      <div class="exam-lines-wrap">
        <div class="exam-lines-head"><b>Признаки</b>
          <span class="muted">галочка «1» — ползунок; первая строка описания — края «здоров — срочно…»</span></div>
        <div class="exam-line-list" data-lines>${it.lines.map(lineCard).join("")}</div>
        <button type="button" class="btn" data-exam-act="add-line" style="margin-top:8px">+ признак</button>
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

function readLines(body: Element): Exams.ExamLine[] {
  const out: Exams.ExamLine[] = [];
  body.querySelectorAll<HTMLElement>("[data-line]").forEach(card => {
    const id = card.dataset.line || Exams.newLineId();
    const label = card.querySelector<HTMLInputElement>("[name=llabel]")?.value.trim() || "";
    if (!label) return;
    const desc = card.querySelector<HTMLTextAreaElement>("[name=ldesc]")?.value.trim() || "";
    const scaleOn = !!card.querySelector<HTMLInputElement>("[name=lscale1]")?.checked;
    const line: Exams.ExamLine = { id, label };
    if (desc) line.desc = desc;
    if (scaleOn) line.scale = 1;
    out.push(line);
  });
  return out;
}

function drawGroup(main: HTMLElement, group: Exams.ExamGroup, focusId?: string): void {
  syncOwn();
  const list = Exams.inGroup(group.id);
  main.innerHTML = `<div class="set-head">
      <h2><a class="muted" href="#/settings/exam">Осмотр</a> · ${esc(group.title)}</h2>
      <span class="muted">${list.length} ${plural(list.length)}</span></div>
    <p class="muted dx-lead">${esc(group.desc)}. У признака — описание; галочка «1» включает ползунок (края — первая строка описания).</p>
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

  main.querySelectorAll<HTMLElement>("[data-exam]").forEach(fold => {
    const id = fold.dataset.exam!;
    const body = fold.querySelector(".exam-body")!;
    const msg = body.querySelector(".exam-msg")!;
    const listEl = body.querySelector<HTMLElement>("[data-lines]")!;

    const bindLineRm = (scope: ParentNode) => {
      scope.querySelectorAll<HTMLButtonElement>("[data-exam-act=rm-line]").forEach(btn => {
        btn.onclick = () => btn.closest("[data-line]")?.remove();
      });
    };
    bindLineRm(body);

    body.querySelector<HTMLButtonElement>("[data-exam-act=add-line]")!.onclick = () => {
      const line: Exams.ExamLine = { id: Exams.newLineId(), label: "" };
      listEl.insertAdjacentHTML("beforeend", lineCard(line));
      const card = listEl.querySelector<HTMLElement>(`[data-line="${line.id}"]`);
      card?.querySelector<HTMLInputElement>("[name=llabel]")?.focus();
      bindLineRm(card!);
    };

    body.querySelector<HTMLButtonElement>("[data-exam-act=save]")!.onclick = () => {
      const name = body.querySelector<HTMLInputElement>("[name=name]")!.value.trim();
      if (!name) { msg.textContent = "нужно название"; return; }
      const lines = readLines(body);
      putOwn(id, { name, lines, group: group.id });
      msg.textContent = "Сохранено";
      setTimeout(() => { msg.textContent = ""; }, 1500);
      const st = fold.querySelector(".fold-status");
      if (st) st.textContent = (lines.length ? `${lines.length} ${linesPlural(lines.length)}` : "нет признаков") + " · своё";
    };

    const rm = body.querySelector<HTMLButtonElement>("[data-exam-act=rm]");
    if (rm) rm.onclick = () => {
      if (!confirm("Удалить пункт «" + (Exams.get(id)?.name || id) + "»?")) return;
      putOwn(id, null);
      drawGroup(main, group);
    };
    const reset = body.querySelector<HTMLButtonElement>("[data-exam-act=reset]");
    if (reset) reset.onclick = () => {
      putOwn(id, null);
      drawGroup(main, group, id);
    };
  });

  const addBox = main.querySelector(".exam-add")!;
  addBox.querySelector<HTMLButtonElement>("[data-exam-act=add]")!.onclick = () => {
    const name = addBox.querySelector<HTMLInputElement>("[name=newname]")!.value.trim();
    const amsg = addBox.querySelector(".exam-add-msg")!;
    if (!name) { amsg.textContent = "укажите название"; return; }
    const nid = Exams.newOwnId();
    putOwn(nid, { id: nid, name, group: group.id, lines: [] });
    drawGroup(main, group, nid);
  };
}

export function draw(main: HTMLElement): void {
  syncOwn();
  const parts = location.hash.replace(/^#\/?/, "").split("/");
  const sub = decodeURIComponent(parts[2] || "");
  const group = Exams.GROUPS.find(g => g.id === sub);
  if (group) return drawGroup(main, group);

  const total = Exams.all().length;
  main.innerHTML = `<div class="set-head"><h2>Осмотр</h2><span class="muted">${total} ${plural(total)} в ${Exams.GROUPS.length} группах</span></div>
    <p class="muted dx-lead">Справочник пунктов осмотра по системам. Галочка «1» у признака — ползунок; края шкалы — первая строка описания.</p>
    <div class="dx-grid">${Exams.GROUPS.map(g => {
      const n = Exams.inGroup(g.id).length;
      return `<a class="dx-card" href="#/settings/exam/${esc(g.id)}"><span class="dx-name">${esc(g.title)}</span><span class="dx-desc">${esc(g.desc)}</span><span class="dx-count">${n} ${plural(n)}</span></a>`;
    }).join("")}</div>`;
}
