import * as Settings from "./settings.js";
import * as Call from "./aicall.js";
import * as Exams from "./exams.js";
import * as Labs from "./labs.js";
import { STEPS } from "./fields.js";
import { lockScroll, unlockScroll } from "./ui.js";
export const FORMAT = "electrodoctor-talk";
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const str = (v) => (v == null ? "" : String(v)).trim();
const PROV_KEY = "ed.talk.provider";
const SKIP_TYPES = new Set(["table", "files", "aiimport"]);
/** Поля вкладки, которые ИИ может менять (без таблиц/файлов). */
export function talkFields(steps = STEPS, stepId = "general") {
    const g = steps.find(s => s.id === stepId);
    if (!g)
        return [];
    // Осмотр на вкладке params — из справочника Настройки → Осмотр
    if (stepId === "params") {
        Exams.applyOwn(Settings.load().exams);
        const staticF = g.sections.filter(s => s.title !== "Осмотр").flatMap(s => s.fields);
        return [...staticF, ...Exams.allFields()].filter(f => !SKIP_TYPES.has(f.type) && !f.computed);
    }
    return g.sections.flatMap(s => s.fields).filter(f => !SKIP_TYPES.has(f.type));
}
export function readyProviders(s = Settings.load()) {
    return Settings.allProviders(s)
        .map(p => ({ preset: p, conf: Settings.providerConf(s, p) }))
        .filter(({ preset, conf }) => Settings.isReady(preset, conf) && !Call.unsupportedReason(preset));
}
function fieldLine(f) {
    if (f.type === "yesno")
        return `${f.code} — ${f.label}; yesno: «1» (да) / «0» (нет); чтобы снять — clear`;
    if (f.type === "select")
        return `${f.code} — ${f.label}; select: одно из ${(f.options || []).map(o => `«${o[0]}» (${o[1]})`).join(", ")}`;
    if (f.type === "number")
        return `${f.code} — ${f.label}${f.unit ? `, ${f.unit}` : ""}; число${f.min != null ? `, от ${f.min}` : ""}${f.max != null ? ` до ${f.max}` : ""}`;
    if (f.type === "scale")
        return `${f.code} — ${f.label}; целое 0…${f.max ?? 0}`;
    if (f.type === "slider")
        return `${f.code} — ${f.label}; число 0…100 (ползунок${f.scaleFrom || f.scaleTo ? `: «${f.scaleFrom || 0}» → «${f.scaleTo || 100}»` : ""})`;
    if (f.type === "textarea")
        return `${f.code} — ${f.label}; свободный текст`;
    return `${f.code} — ${f.label}; текст`;
}
function currentSnapshot(c, fields) {
    const lines = [];
    for (const f of fields) {
        const v = c.values[f.code];
        if (v === undefined || v === null || v === "")
            continue;
        lines.push(`${f.code}=${JSON.stringify(v)}`);
    }
    return lines.length ? lines.join("\n") : "(пусто)";
}
function roleBlurb(stepId) {
    if (stepId === "params") {
        return {
            role: "Твоя роль — спокойно собрать параметры тела, жизненные показатели и данные осмотра для анкеты. Ты не врач на приёме: не ставь диагноз, не назначай лечение и дозировки, не пугай. Уточняй недостающее простыми словами.",
            rulesExtra: `4. Неизвестное или то, чему нет кода — в GEN_NOTES текстом; новые коды не выдумывай. Таблицу генетических тестов (GEN_TESTS) не заполняй через этот чат.
5. Давление: если человек сказал «120 на 80» — BP_SYS=120, BP_DIA=80.
6. Рост обычно в см (170), вес в кг. Если назвали рост в метрах (1,7) — переведи в см (170).
7. Пункты осмотра — только коды из списка полей ниже (из справочника Настройки → Осмотр).
8. Если новых правок нет — "set": [], "clear": []. Всё равно заполни "say".
9. Не копируй в анкету ФИО из документов, адреса, телефоны.`,
            hint: "Назовите рост, вес, давление, пульс или что видели на осмотре — помощник уточнит и заполнит параметры в анкете.",
        };
    }
    return {
        role: "Твоя роль — спокойно собрать жалобы и базовые сведения о человеке для анкеты. Ты не врач на приёме: не ставь диагноз, не назначай лечение и дозировки, не пугай. Уточняй недостающее простыми словами.",
        rulesExtra: `4. Неизвестное или то, чему нет кода — в COMPLAINTS_OTHER или NOTES текстом; новые коды не выдумывай.
5. Для жалобы «боль в груди»: сначала PAIN_CHEST=1, затем атрибуты (PRESSING, STABBING, IRRAD_LARM, EXERTION, RELIEF_REST) и PAIN_CHEST_NRS 0–100, описание — PAIN_CHEST_NOTE.
6. Интенсивность боли: если человек сказал «6 из 10» — пиши 60 в шкале 0–100.
7. Если новых правок нет — "set": [], "clear": []. Всё равно заполни "say".
8. Не копируй в анкету ФИО из документов, адреса, телефоны — для имени достаточно псевдонима, если человек его дал.`,
        hint: "Опишите, что беспокоит — помощник уточнит и заполнит жалобы в анкете.",
    };
}
export function buildSystem(c, steps = STEPS, stepId = "general") {
    const fields = talkFields(steps, stepId);
    const { role, rulesExtra } = roleBlurb(stepId);
    return `Ты помощник кабинета «Электродоктор». ${role}

Отвечай ТОЛЬКО одним JSON-объектом — без markdown, без текста до и после.

Формат:
{
  "format": "${FORMAT}",
  "version": 1,
  "say": "текст человеку: вопросы, пересказ «я понял так…», без кодов полей",
  "set": [ { "code": "PAIN_CHEST", "value": "1" } ],
  "clear": [ "PAIN_CHEST_STABBING" ]
}

Правила:
1. "say" — то, что увидит человек в чате. Без JSON и без кодов полей.
2. "set" — только коды из списка ниже, если человек явно сообщил факт. value по типу поля.
3. "clear" — коды, которые нужно убрать (человек отрёкся или ошибка). Можно [] .
${rulesExtra}

Допустимые поля:
${fields.map(fieldLine).join("\n")}

Сейчас в анкете уже записано:
${currentSnapshot(c, fields)}
`;
}
function extractJSON(text) {
    const t = text.trim().replace(/^﻿/, "");
    try {
        return JSON.parse(t);
    }
    catch { /* ищем */ }
    const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) {
        try {
            return JSON.parse(fence[1]);
        }
        catch { /* дальше */ }
    }
    const start = t.search(/[{]/), end = t.lastIndexOf("}");
    if (start >= 0 && end > start)
        return JSON.parse(t.slice(start, end + 1));
    throw new Error("в тексте не найден JSON");
}
export function parse(text) {
    let data;
    try {
        data = extractJSON(text);
    }
    catch (e) {
        throw new Error("Не получилось прочитать ответ ИИ: " + ((e instanceof Error && e.message) || e));
    }
    const obj = data;
    if (!obj || typeof obj !== "object")
        throw new Error("Ответ ИИ не объект JSON.");
    const say = str(obj.say);
    if (!say)
        throw new Error("В ответе нет текста say для человека.");
    const setRaw = Array.isArray(obj.set) ? obj.set : [];
    const clearRaw = Array.isArray(obj.clear) ? obj.clear : [];
    const set = [];
    for (const row of setRaw) {
        if (!row || typeof row !== "object")
            continue;
        const r = row;
        const code = str(r.code).toUpperCase();
        if (!code || r.value === undefined || r.value === null)
            continue;
        if (typeof r.value === "number" && isFinite(r.value))
            set.push({ code, value: r.value });
        else
            set.push({ code, value: str(r.value) });
    }
    const clear = clearRaw.map(x => str(x).toUpperCase()).filter(Boolean);
    return { say, set, clear };
}
function coerce(f, raw) {
    if (f.type === "yesno") {
        const s = String(raw).trim().toLowerCase();
        if (s === "1" || s === "да" || s === "yes" || s === "true")
            return "1";
        if (s === "0" || s === "нет" || s === "no" || s === "false")
            return "0";
        return null;
    }
    if (f.type === "number") {
        const n = typeof raw === "number" ? raw : Number(String(raw).replace(",", "."));
        if (!isFinite(n))
            return null;
        if (f.min != null && n < f.min)
            return f.min;
        if (f.max != null && n > f.max)
            return f.max;
        return n;
    }
    if (f.type === "scale" || f.type === "slider") {
        let n = typeof raw === "number" ? raw : Number(String(raw).replace(",", "."));
        if (!isFinite(n))
            return null;
        const max = f.max ?? (f.type === "slider" ? 100 : 0);
        const min = f.min ?? 0;
        // «6 из 10» при шкале 0–100
        if (max === 100 && n > 0 && n <= 10 && !String(raw).includes("."))
            n = n * 10;
        return Math.max(min, Math.min(max, Math.round(n)));
    }
    if (f.type === "select") {
        const s = str(raw);
        const ok = (f.options || []).some(([v]) => v === s);
        return ok ? s : null;
    }
    if (f.type === "text" || f.type === "textarea") {
        const s = str(raw);
        return s || null;
    }
    return null;
}
function displayValue(f, v) {
    if (f.type === "yesno")
        return v === "1" ? "да" : v === "0" ? "нет" : String(v);
    if (f.type === "select") {
        const opt = (f.options || []).find(([val]) => val === v);
        return opt ? opt[1] : String(v);
    }
    return String(v);
}
/** Применить set/clear к клиенту; неизвестные коды пропускаются. */
export function apply(c, reply, steps = STEPS, stepId = "general") {
    const byCode = new Map(talkFields(steps, stepId).map(f => [f.code, f]));
    const changes = [];
    for (const code of reply.clear) {
        const f = byCode.get(code);
        if (!f)
            continue;
        if (c.values[code] === undefined)
            continue;
        delete c.values[code];
        changes.push({ code, label: f.label, kind: "clear", text: "снято" });
    }
    for (const item of reply.set) {
        const f = byCode.get(item.code);
        if (!f)
            continue;
        const v = coerce(f, item.value);
        if (v === null)
            continue;
        c.values[f.code] = v;
        changes.push({ code: f.code, label: f.label, kind: "set", text: displayValue(f, v) });
    }
    return changes;
}
export function openTalkDialog(c, opts) {
    const stepId = opts.stepId || "general";
    const { hint } = roleBlurb(stepId);
    const providers = readyProviders();
    const ov = document.createElement("div");
    ov.className = "cv-overlay";
    const hist = [];
    let busy = false;
    let ctrl = null;
    const savedProv = sessionStorage.getItem(PROV_KEY) || "";
    const provOpts = providers.map(({ preset }) => `<option value="${esc(preset.id)}"${preset.id === savedProv ? " selected" : ""}>${esc(preset.name)}</option>`).join("");
    const bodyAi = `<div class="talk-bar">
      <label class="talk-prov">Модель
        <select id="talk-prov">${provOpts}</select>
      </label>
    </div>
    <div class="talk-log" id="talk-log" aria-live="polite">
      <div class="talk-hint muted">${esc(hint)}</div>
    </div>
    <div class="talk-compose">
      <textarea id="talk-in" rows="2" placeholder="Напишите сообщение…"></textarea>
      <button type="button" class="btn primary" id="talk-send">Отправить</button>
    </div>
    <p class="talk-err err" id="talk-err" hidden></p>`;
    const bodyNoAiForm = `<div class="talk-empty">
      <p>Чтобы заполнять анкету с помощником, подключите искусственный интеллект в настройках.</p>
      <p><a class="btn primary" href="#/settings/providers" data-go-settings>Настройки → Провайдеры</a></p>
    </div>`;
    ov.innerHTML = `<div class="cv-dialog talk-dlg" role="dialog" aria-modal="true" aria-labelledby="talk-title">
    <div class="cv-head"><b id="talk-title">Помощник по анкете</b>
      <button type="button" class="btn cv-x" data-close aria-label="закрыть">✕</button></div>
    ${providers.length ? bodyAi : bodyNoAiForm}
  </div>`;
    document.body.appendChild(ov);
    lockScroll();
    const close = () => {
        if (ctrl)
            ctrl.abort();
        document.removeEventListener("keydown", onKey);
        ov.remove();
        unlockScroll();
    };
    const onKey = (e) => {
        if (e.key === "Escape" && !busy)
            close();
    };
    document.addEventListener("keydown", onKey);
    ov.addEventListener("click", e => { if (e.target === ov && !busy)
        close(); });
    ov.querySelector("[data-close]").addEventListener("click", () => { if (!busy)
        close(); });
    ov.querySelector("[data-go-settings]")?.addEventListener("click", () => close());
    if (!providers.length)
        return;
    const log = ov.querySelector("#talk-log");
    const input = ov.querySelector("#talk-in");
    const sendBtn = ov.querySelector("#talk-send");
    const errEl = ov.querySelector("#talk-err");
    const sel = ov.querySelector("#talk-prov");
    const showErr = (msg) => {
        errEl.hidden = !msg;
        errEl.textContent = msg;
    };
    const bubble = (role, html) => {
        const h = log.querySelector(".talk-hint");
        if (h)
            h.remove();
        const div = document.createElement("div");
        div.className = "talk-msg talk-" + role;
        div.innerHTML = html;
        log.appendChild(div);
        log.scrollTop = log.scrollHeight;
    };
    const setBusy = (on) => {
        busy = on;
        sendBtn.disabled = on;
        input.disabled = on;
        sel.disabled = on;
        sendBtn.textContent = on ? "Ждём…" : "Отправить";
    };
    const pickProvider = () => {
        const id = sel.value;
        sessionStorage.setItem(PROV_KEY, id);
        const hit = providers.find(p => p.preset.id === id) || providers[0];
        return hit;
    };
    sendBtn.onclick = async () => {
        const text = input.value.trim();
        if (!text || busy)
            return;
        showErr("");
        input.value = "";
        bubble("user", `<div class="talk-bubble">${esc(text)}</div>`);
        const nextHist = hist.concat([{ role: "user", content: text }]);
        setBusy(true);
        ctrl = new AbortController();
        try {
            const { preset, conf } = pickProvider();
            const model = (conf.model || preset.model || "").trim();
            if (!model)
                throw new Error("У провайдера не указана модель. Впишите её в Настройках → Провайдеры.");
            const raw = await Call.chat({
                preset, conf, model,
                system: buildSystem(c, STEPS, stepId),
                messages: nextHist,
                temperature: 0.3,
                signal: ctrl.signal,
            });
            const reply = parse(raw);
            hist.length = 0;
            hist.push(...nextHist, {
                role: "assistant",
                content: JSON.stringify({ format: FORMAT, version: 1, say: reply.say, set: reply.set, clear: reply.clear }),
            });
            const changes = apply(c, reply, STEPS, stepId);
            if (changes.length)
                opts.onChange();
            const meta = changes.length
                ? `<div class="talk-meta">В анкете: ${changes.map(ch => esc(ch.kind === "clear" ? `${ch.label} — снято` : `${ch.label} — ${ch.text}`)).join("; ")}</div>`
                : "";
            bubble("assistant", `<div class="talk-bubble">${esc(reply.say)}</div>${meta}`);
        }
        catch (e) {
            showErr(e instanceof Error ? e.message : String(e));
        }
        finally {
            setBusy(false);
            ctrl = null;
            input.focus();
        }
    };
    input.addEventListener("keydown", e => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendBtn.click();
        }
    });
    input.focus();
}
// ---------- чат с врачом по диагнозу (промпт агента из настроек) ----------
function assistantPlain(raw) {
    const t = raw.trim();
    try {
        const data = extractJSON(t);
        if (data && typeof data === "object" && str(data.say))
            return str(data.say);
    }
    catch { /* обычный текст */ }
    return t;
}
function labsSnapshot(c) {
    const lines = [];
    for (const [code, v] of Object.entries(c.values || {})) {
        if (v === undefined || v === null || v === "")
            continue;
        if (!Labs.has(code) && !/^[A-Z][A-Z0-9_]*$/.test(code))
            continue;
        if (typeof v === "object")
            continue;
        const name = (Labs.LABS[code] && Labs.LABS[code].name) || code;
        const u = (Labs.LABS[code] && Labs.LABS[code].unit) || "";
        lines.push(`${code} (${name})=${JSON.stringify(v)}${u ? " " + u : ""}`);
    }
    return lines.length ? lines.join("\n") : "(анализов нет)";
}
function clientBrief(c, stepIds) {
    const parts = [];
    for (const id of stepIds) {
        if (id === "diagnoses")
            continue;
        const step = STEPS.find(s => s.id === id);
        if (!step)
            continue;
        if (id === "labs") {
            parts.push(`## Анализы\n${labsSnapshot(c)}`);
            continue;
        }
        if (id === "general" || id === "params") {
            const snap = currentSnapshot(c, talkFields(STEPS, id));
            if (snap !== "(пусто)")
                parts.push(`## ${step.title}\n${snap}`);
            continue;
        }
        const fields = step.sections.flatMap(s => s.fields).filter(f => !SKIP_TYPES.has(f.type) && !f.computed);
        const snap = currentSnapshot(c, fields);
        if (snap !== "(пусто)")
            parts.push(`## ${step.title}\n${snap}`);
    }
    return parts.join("\n\n") || "(анкета почти пуста)";
}
/** Чат с врачом раздела: system = prompt агента + контекст диагноза и анкеты. Анкету не правит. */
export function openDxTalkDialog(c, opts) {
    const s = Settings.load();
    const agents = Settings.agentsForSections(opts.sections, s);
    const ov = document.createElement("div");
    ov.className = "cv-overlay";
    const hist = [];
    let busy = false;
    let ctrl = null;
    let agentId = agents[0] ? agents[0].id : "";
    const noAgent = `<div class="talk-empty">
      <p>К разделам этого диагноза не привязан врач в <a href="#/settings/agents" data-go-settings>Настройки → Агенты</a> (поле «раздел» у агента).</p>
      <p class="muted">Так бывает у диагнозов без специальности (раздел «Другое»).</p>
    </div>`;
    const agentReady = (a) => {
        const rt = Settings.agentRuntime(s, a);
        return !!(rt.preset && rt.conf && Settings.isReady(rt.preset, rt.conf) && rt.model.trim() && !Call.unsupportedReason(rt.preset));
    };
    const anyReady = agents.some(agentReady);
    const agentOpts = agents.map(a => `<option value="${esc(a.id)}"${a.id === agentId ? " selected" : ""}>${esc(a.name)}</option>`).join("");
    const bodyAi = `<div class="talk-bar">
      ${agents.length > 1 ? `<label class="talk-prov">Врач<select id="talk-agent">${agentOpts}</select></label>` : `<p class="talk-who muted">Врач: <b>${esc(agents[0] ? agents[0].name : "")}</b></p>`}
    </div>
    <div class="talk-log" id="talk-log" aria-live="polite">
      <div class="talk-hint muted">Спросите про диагноз «${esc(opts.title)}» — ответы по инструкции врача из настроек. Лечение и дозировки не назначает.</div>
    </div>
    <div class="talk-compose">
      <textarea id="talk-in" rows="2" placeholder="Напишите сообщение…"></textarea>
      <button type="button" class="btn primary" id="talk-send">Отправить</button>
    </div>
    <p class="talk-err err" id="talk-err" hidden></p>`;
    const bodyNoProv = `<div class="talk-empty">
      <p>У врача не настроен провайдер или модель. Укажите их у агента или общий провайдер агентов в <a href="#/settings/agents" data-go-settings>Настройки → Агенты</a>.</p>
    </div>`;
    const titleName = agents[0] ? agents[0].name : "врачом";
    ov.innerHTML = `<div class="cv-dialog talk-dlg" role="dialog" aria-modal="true" aria-labelledby="talk-title">
    <div class="cv-head"><b id="talk-title">Поговорить: ${esc(opts.title)}</b>
      <button type="button" class="btn cv-x" data-close aria-label="закрыть">✕</button></div>
    ${!agents.length ? noAgent : !anyReady ? bodyNoProv : bodyAi}
  </div>`;
    // уточним заголовок именем врача
    const titleEl = ov.querySelector("#talk-title");
    if (titleEl && agents[0])
        titleEl.textContent = `${agents[0].name} · ${opts.title}`;
    document.body.appendChild(ov);
    lockScroll();
    const close = () => {
        if (ctrl)
            ctrl.abort();
        document.removeEventListener("keydown", onKey);
        ov.remove();
        unlockScroll();
    };
    const onKey = (e) => { if (e.key === "Escape" && !busy)
        close(); };
    document.addEventListener("keydown", onKey);
    ov.addEventListener("click", e => { if (e.target === ov && !busy)
        close(); });
    ov.querySelector("[data-close]").addEventListener("click", () => { if (!busy)
        close(); });
    ov.querySelector("[data-go-settings]")?.addEventListener("click", () => close());
    if (!agents.length || !anyReady)
        return;
    const log = ov.querySelector("#talk-log");
    const input = ov.querySelector("#talk-in");
    const sendBtn = ov.querySelector("#talk-send");
    const errEl = ov.querySelector("#talk-err");
    const agentSel = ov.querySelector("#talk-agent");
    const showErr = (msg) => { errEl.hidden = !msg; errEl.textContent = msg; };
    const bubble = (role, html) => {
        const h = log.querySelector(".talk-hint");
        if (h)
            h.remove();
        const div = document.createElement("div");
        div.className = "talk-msg talk-" + role;
        div.innerHTML = html;
        log.appendChild(div);
        log.scrollTop = log.scrollHeight;
    };
    const setBusy = (on) => {
        busy = on;
        sendBtn.disabled = on;
        input.disabled = on;
        if (agentSel)
            agentSel.disabled = on;
        sendBtn.textContent = on ? "Ждём…" : "Отправить";
    };
    const curAgent = () => {
        const id = agentSel ? agentSel.value : agentId;
        return agents.find(a => a.id === id) || agents[0];
    };
    if (agentSel) {
        agentSel.onchange = () => {
            agentId = agentSel.value;
            hist.length = 0;
            log.innerHTML = `<div class="talk-hint muted">Сменили врача на «${esc(curAgent().name)}». История чата сброшена — можно писать снова.</div>`;
            if (titleEl)
                titleEl.textContent = `${curAgent().name} · ${opts.title}`;
        };
    }
    const buildDxSystem = (a) => {
        const brief = opts.brief ? `\nРасчёт кабинета по этому диагнозу: ${opts.brief}.` : "";
        return `${a.prompt}

Сейчас вы обсуждаете с человеком вероятный диагноз «${opts.title}» (статья: ${opts.file}).${brief}
Это исследовательский расчёт вероятностей, не установленный клинический диагноз — не утверждай его как факт.
Отвечай обычным текстом человеку (без JSON и без кодов полей). Не назначай лечение и дозировки.

Данные из анкеты (вкладки, которые тебе доступны):
${clientBrief(c, a.steps)}
`;
    };
    sendBtn.onclick = async () => {
        const text = input.value.trim();
        if (!text || busy)
            return;
        showErr("");
        input.value = "";
        bubble("user", `<div class="talk-bubble">${esc(text)}</div>`);
        const nextHist = hist.concat([{ role: "user", content: text }]);
        setBusy(true);
        ctrl = new AbortController();
        try {
            const a = curAgent();
            const rt = Settings.agentRuntime(s, a);
            if (!rt.preset || !rt.conf)
                throw new Error("У агента не выбран провайдер.");
            if (!Settings.isReady(rt.preset, rt.conf))
                throw new Error("Провайдер агента не готов (ключ, адрес или модель).");
            const bad = Call.unsupportedReason(rt.preset);
            if (bad)
                throw new Error(bad);
            if (!rt.model.trim())
                throw new Error("У агента не указана модель.");
            const raw = await Call.chat({
                preset: rt.preset, conf: rt.conf, model: rt.model,
                system: buildDxSystem(a),
                messages: nextHist,
                temperature: a.temperature,
                signal: ctrl.signal,
            });
            const say = assistantPlain(raw);
            if (!say)
                throw new Error("Провайдер вернул пустой ответ.");
            hist.length = 0;
            hist.push(...nextHist, { role: "assistant", content: say });
            bubble("assistant", `<div class="talk-bubble">${esc(say)}</div>`);
        }
        catch (e) {
            showErr(e instanceof Error ? e.message : String(e));
        }
        finally {
            setBusy(false);
            ctrl = null;
            input.focus();
        }
    };
    input.addEventListener("keydown", e => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendBtn.click();
        }
    });
    input.focus();
}
