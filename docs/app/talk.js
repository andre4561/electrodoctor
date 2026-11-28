import * as Settings from "./settings.js";
import * as Call from "./aicall.js";
import * as Exams from "./exams.js";
import * as Labs from "./labs.js";
import { STEPS } from "./fields.js";
import { t } from "./i18n.js";
import { lockScroll, unlockScroll } from "./ui.js";
export const FORMAT = "electrodoctor-talk";
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const str = (v) => (v == null ? "" : String(v)).trim();
const SKIP_TYPES = new Set(["table", "files", "aiimport"]);
/** Поля одной вкладки (без таблиц/файлов); осмотр на params — из справочника. */
function talkFieldsForStep(steps, stepId) {
    const g = steps.find(s => s.id === stepId);
    if (!g)
        return [];
    if (stepId === "params") {
        Exams.applyOwn(Settings.load().exams);
        const staticF = g.sections.filter(s => s.title !== "Осмотр").flatMap(s => s.fields);
        return [...staticF, ...Exams.allFields()].filter(f => !SKIP_TYPES.has(f.type) && !f.computed);
    }
    return g.sections.flatMap(s => s.fields).filter(f => !SKIP_TYPES.has(f.type));
}
/**
 * Поля для помощника / выписки.
 * С stepId — только эта вкладка; без stepId — Общее + Параметры (чат помощника пишет в обе).
 */
export function talkFields(steps = STEPS, stepId) {
    if (stepId)
        return talkFieldsForStep(steps, stepId);
    const seen = new Set();
    const out = [];
    for (const id of ["general", "params"]) {
        for (const f of talkFieldsForStep(steps, id)) {
            if (seen.has(f.code))
                continue;
            seen.add(f.code);
            out.push(f);
        }
    }
    return out;
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
/** Снимок для помощника анкеты: коды полей (нужны для set/clear). */
function currentSnapshot(c, fields) {
    const lines = [];
    for (const f of fields) {
        const v = c.values[f.code];
        if (v === undefined || v === null || v === "")
            continue;
        lines.push(`${f.code}=${JSON.stringify(v)}`);
    }
    return lines.length ? lines.join("\n") : t("brief.empty", "(пусто)");
}
/** Значение поля → текст для врача (без JSON-кавычек и сырых кодов где можно). */
function briefValue(f, v) {
    if (f.type === "yesno") {
        const s = String(v);
        if (s === "1" || s === "0")
            return t("value.yesno." + s, s === "1" ? "да" : "нет");
    }
    if (f.type === "select" && f.options) {
        const s = String(v);
        const opt = f.options.find(o => o[0] === s);
        if (opt) {
            if (f.code === "SEX")
                return t("value.sex." + s, opt[1]);
            return opt[1];
        }
    }
    if ((f.type === "slider" || f.type === "scale") && (f.scaleFrom || f.scaleTo)) {
        const hint = t("brief.scale_hint", "{from} → {to}", {
            from: f.scaleFrom || "0",
            to: f.scaleTo || String(f.max ?? 100),
        });
        return `${v} (${hint})`;
    }
    if (typeof v === "number")
        return String(v);
    if (typeof v === "string")
        return v;
    return JSON.stringify(v);
}
/**
 * Снимок для врача в «Поговорить»: подписи полей, не NAME=…
 * Помощник анкеты по-прежнему получает currentSnapshot с кодами.
 */
function humanBriefSnapshot(c, fields) {
    const lines = [];
    for (const f of fields) {
        const v = c.values[f.code];
        if (v === undefined || v === null || v === "")
            continue;
        if (typeof v === "object")
            continue;
        const unit = f.unit ? " " + f.unit : "";
        lines.push(`${f.label}: ${briefValue(f, v)}${unit}`);
    }
    return lines.length ? lines.join("\n") : t("brief.empty", "(пусто)");
}
function talkHint(stepId) {
    return stepId === "params"
        ? "Назовите рост, вес, давление, пульс, жалобы или что видели на осмотре — помощник уточнит и заполнит анкету (Общее и Параметры)."
        : "Опишите, что беспокоит, или назовите параметры (рост, вес, давление) — помощник уточнит и заполнит анкету (Общее и Параметры).";
}
function stepTitle(stepId) {
    return stepId === "params" ? "Параметры" : "Общее";
}
/** Промпт агента из Настройки → Агенты + JSON-формат, вкладка открытия и поля Общее+Параметры. */
export function buildSystem(c, steps = STEPS, stepId = "general", agent) {
    const a = agent || Settings.talkAgent();
    const general = talkFieldsForStep(steps, "general");
    const params = talkFieldsForStep(steps, "params");
    const fields = talkFields(steps);
    return `${a.prompt}

Сейчас человек открыл чат со вкладки «${stepTitle(stepId)}». Учитывай это в уточняющих вопросах, но заполнять можно поля обеих вкладок.

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

Допустимые поля вкладки «Общее»:
${general.map(fieldLine).join("\n")}

Допустимые поля вкладки «Параметры»:
${params.map(fieldLine).join("\n")}

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
export function apply(c, reply, steps = STEPS, _stepId = "general") {
    const byCode = new Map(talkFields(steps).map(f => [f.code, f]));
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
function fmtTalkTime(iso) {
    try {
        return new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    }
    catch {
        return iso;
    }
}
function outBody(meta, system, messages) {
    const lines = [
        `Провайдер: ${meta.provider}`,
        `Модель: ${meta.model}`,
        `Temperature: ${meta.temperature}`,
        "",
        "=== system ===",
        system,
        "",
        "=== messages ===",
    ];
    messages.forEach((m, i) => {
        lines.push(`--- [${i + 1}] ${m.role} ---`);
        lines.push(m.content);
        lines.push("");
    });
    return lines.join("\n").trimEnd();
}
/** Собрать HTML-страницу лога и открыть в новой вкладке (blob:). */
export function openTalkLogHtml(entries, pageTitle) {
    const kindLabel = { out: "Отправка", in: "Ответ", err: "Ошибка" };
    const blocks = entries.length
        ? entries.map(e => `<section class="blk blk-${e.kind}">
  <header><span class="tag">${esc(kindLabel[e.kind])}</span> <time>${esc(fmtTalkTime(e.at))}</time> · ${esc(e.title)}</header>
  <pre>${esc(e.body)}</pre>
</section>`).join("\n")
        : `<p class="empty">Пока пусто — отправьте сообщение в чате.</p>`;
    const html = `<!DOCTYPE html>
<html lang="ru"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(pageTitle)} — запросы</title>
<style>
  body { margin: 0; font: 16px/1.5 system-ui, sans-serif; background: #f4f6f8; color: #1a1f24; }
  header.page { padding: 18px 22px; border-bottom: 1px solid #d8dee6; background: #fff; }
  header.page h1 { margin: 0 0 4px; font-size: 20px; font-weight: 600; }
  header.page p { margin: 0; color: #5b6570; font-size: 14px; }
  main { padding: 18px 22px 40px; display: grid; gap: 16px; max-width: 960px; }
  .blk { border-radius: 10px; border: 1px solid #d8dee6; background: #fff; overflow: hidden; }
  .blk header { padding: 10px 14px; font-size: 14px; border-bottom: 1px solid #e5e9ef; display: flex; flex-wrap: wrap; gap: 6px; align-items: baseline; background: #fafbfc; }
  .tag { font-weight: 700; text-transform: uppercase; letter-spacing: .03em; font-size: 12px; }
  .blk-out { border-left: 4px solid #2563eb; }
  .blk-out .tag { color: #1d4ed8; }
  .blk-in { border-left: 4px solid #16a34a; }
  .blk-in .tag { color: #15803d; }
  .blk-err { border-left: 4px solid #dc2626; }
  .blk-err .tag { color: #b91c1c; }
  pre { margin: 0; padding: 14px 16px; white-space: pre-wrap; word-break: break-word; font: 16px/1.5 ui-monospace, Consolas, monospace; background: #f7f8fa; color: #1a1f24; overflow: auto; max-height: 70vh; }
  .empty { color: #5b6570; }
  time { color: #5b6570; }
</style>
</head><body>
<header class="page">
  <h1>${esc(pageTitle)}</h1>
  <p>Лог запросов к агенту · открыт ${esc(fmtTalkTime(new Date().toISOString()))} · записей: ${entries.length}</p>
</header>
<main>${blocks}</main>
</body></html>`;
    // about:blank + document.write: надёжнее blob: — у window.open с noopener
    // браузер возвращает null и прежний код сразу отзывал URL (ERR_FILE_NOT_FOUND).
    const w = window.open("about:blank", "_blank");
    if (!w) {
        alert("Не удалось открыть вкладку — разрешите всплывающие окна для этого сайта.");
        return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
}
function bindTalkLogLink(root, entries, title) {
    root.querySelectorAll("[data-talk-log]").forEach(a => {
        a.addEventListener("click", e => {
            e.preventDefault();
            openTalkLogHtml(entries, title());
        });
    });
}
export function openTalkDialog(c, opts) {
    const stepId = opts.stepId || "general";
    const s = Settings.load();
    const agent = Settings.talkAgent(s);
    const rt = Settings.agentRuntime(s, agent);
    const agentOk = !!(agent.enabled && rt.preset && rt.conf && Settings.isReady(rt.preset, rt.conf)
        && rt.model.trim() && !Call.unsupportedReason(rt.preset));
    const ov = document.createElement("div");
    ov.className = "cv-overlay";
    const hist = [];
    const reqLog = [];
    let busy = false;
    let ctrl = null;
    const bodyAi = `<div class="talk-bar">
      <p class="talk-who muted">Агент: <b>${esc(agent.name)}</b> · вкладка «${esc(stepTitle(stepId))}» · <a href="#/settings/agents/${encodeURIComponent(agent.id)}" data-go-settings>настройки</a> · <a href="#" data-talk-log>запросы</a></p>
    </div>
    <div class="talk-log" id="talk-log" aria-live="polite">
      <div class="talk-hint muted">${esc(talkHint(stepId))}</div>
    </div>
    <div class="talk-compose">
      <textarea id="talk-in" rows="2" placeholder="Напишите сообщение…"></textarea>
      <button type="button" class="btn primary" id="talk-send">Отправить</button>
    </div>
    <p class="talk-err err" id="talk-err" hidden></p>`;
    const bodyOff = !agent.enabled
        ? `<div class="talk-empty">
      <p>Агент «${esc(agent.name)}» выключен. Включите его в настройках.</p>
      <p><a class="btn primary" href="#/settings/agents/${encodeURIComponent(agent.id)}" data-go-settings>Настройки → Агенты</a></p>
    </div>`
        : `<div class="talk-empty">
      <p>У помощника не настроен провайдер или модель. Укажите их у агента «${esc(agent.name)}» или общий провайдер агентов.</p>
      <p><a class="btn primary" href="#/settings/agents/${encodeURIComponent(agent.id)}" data-go-settings>Настройки → Агенты</a></p>
    </div>`;
    ov.innerHTML = `<div class="cv-dialog talk-dlg" role="dialog" aria-modal="true" aria-labelledby="talk-title">
    <div class="cv-head"><b id="talk-title">${esc(agent.name)}</b>
      <button type="button" class="btn cv-x" data-close aria-label="закрыть">✕</button></div>
    ${agentOk ? bodyAi : bodyOff}
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
    bindTalkLogLink(ov, reqLog, () => agent.name);
    if (!agentOk)
        return;
    const log = ov.querySelector("#talk-log");
    const input = ov.querySelector("#talk-in");
    const sendBtn = ov.querySelector("#talk-send");
    const errEl = ov.querySelector("#talk-err");
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
        sendBtn.textContent = on ? "Ждём…" : "Отправить";
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
        let loggedOut = false;
        try {
            const live = Settings.talkAgent();
            const run = Settings.agentRuntime(Settings.load(), live);
            if (!run.preset || !run.conf)
                throw new Error("У агента не выбран провайдер.");
            if (!Settings.isReady(run.preset, run.conf))
                throw new Error("Провайдер агента не готов (ключ, адрес или модель).");
            const bad = Call.unsupportedReason(run.preset);
            if (bad)
                throw new Error(bad);
            if (!run.model.trim())
                throw new Error("У агента не указана модель.");
            const system = buildSystem(c, STEPS, stepId, live);
            reqLog.push({
                kind: "out",
                at: new Date().toISOString(),
                title: `${live.name} · ${run.preset.name}`,
                body: outBody({ provider: run.preset.name, model: run.model, temperature: live.temperature }, system, nextHist),
            });
            loggedOut = true;
            const raw = await Call.chat({
                preset: run.preset, conf: run.conf, model: run.model,
                system,
                messages: nextHist,
                temperature: live.temperature,
                signal: ctrl.signal,
            });
            reqLog.push({ kind: "in", at: new Date().toISOString(), title: live.name, body: raw });
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
            const msg = e instanceof Error ? e.message : String(e);
            if (loggedOut)
                reqLog.push({ kind: "err", at: new Date().toISOString(), title: agent.name, body: msg });
            showErr(msg);
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
/** Анализы для врача: «Гемоглобин: 112 г/л», код в скобках для однозначности. */
function labsSnapshot(c) {
    const lines = [];
    for (const [code, v] of Object.entries(c.values || {})) {
        if (v === undefined || v === null || v === "")
            continue;
        if (!Labs.has(code))
            continue;
        if (typeof v === "object")
            continue;
        const l = Labs.LABS[code];
        const u = l.unit || "";
        const val = typeof v === "string" || typeof v === "number" ? String(v) : JSON.stringify(v);
        lines.push(`${l.name} (${code}): ${val}${u ? " " + u : ""}`);
    }
    return lines.length ? lines.join("\n") : t("brief.no_labs", "(анализов нет)");
}
function studiesSnapshot(c) {
    const list = [...(c.studies || [])]
        .filter(s => (s.title || s.text || "").trim())
        .sort((a, b) => (b.date || "").localeCompare(a.date || "") || b.savedAt.localeCompare(a.savedAt));
    if (!list.length)
        return t("brief.no_studies", "(исследований нет)");
    const kindName = {
        us: "УЗИ", mri: "МРТ", ct: "КТ", xray: "Рентген", ecg: "ЭКГ", endo: "Эндоскопия", other: "Другое",
    };
    return list.map(s => {
        const kind = s.kind && kindName[s.kind] ? kindName[s.kind] : "";
        const head = [s.date || "без даты", kind, s.title || "без названия"].filter(Boolean).join(" · ");
        const body = (s.text || "").trim();
        return body ? `### ${head}\n${body}` : `### ${head}`;
    }).join("\n\n");
}
function clientBrief(c, stepIds) {
    const empty = t("brief.empty", "(пусто)");
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
        if (id === "studies") {
            parts.push(`## Исследования\n${studiesSnapshot(c)}`);
            continue;
        }
        if (id === "general" || id === "params") {
            const snap = humanBriefSnapshot(c, talkFields(STEPS, id));
            if (snap !== empty)
                parts.push(`## ${step.title}\n${snap}`);
            continue;
        }
        const fields = step.sections.flatMap(s => s.fields).filter(f => !SKIP_TYPES.has(f.type) && !f.computed);
        const snap = humanBriefSnapshot(c, fields);
        if (snap !== empty)
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
    const reqLog = [];
    let busy = false;
    let ctrl = null;
    let agentId = agents[0] ? agents[0].id : "";
    const noAgent = `<div class="talk-empty">
      <p>К разделам этого диагноза не привязан врач в <a href="#/settings/agents" data-go-settings>Настройки → Агенты</a>.</p>
      <p class="muted">Так бывает у диагнозов без специальности (раздел «Другое»).</p>
    </div>`;
    const agentReady = (a) => {
        const rt = Settings.agentRuntime(s, a);
        return !!(rt.preset && rt.conf && Settings.isReady(rt.preset, rt.conf) && rt.model.trim() && !Call.unsupportedReason(rt.preset));
    };
    const anyReady = agents.some(agentReady);
    const agentOpts = agents.map(a => `<option value="${esc(a.id)}"${a.id === agentId ? " selected" : ""}>${esc(a.name)}</option>`).join("");
    const agentSetHref = (id) => `#/settings/agents/${encodeURIComponent(id)}`;
    const logLinks = (id) => `<a href="${agentSetHref(id)}" data-go-settings>настройки</a> · <a href="#" data-talk-log>запросы</a>`;
    const bodyAi = `<div class="talk-bar">
      ${agents.length > 1
        ? `<p class="talk-who muted"><label class="talk-prov">Врач <select id="talk-agent">${agentOpts}</select></label> · ${logLinks(agents[0] ? agents[0].id : "")}</p>`
        : `<p class="talk-who muted">Врач: <b>${esc(agents[0] ? agents[0].name : "")}</b> · ${logLinks(agents[0] ? agents[0].id : "")}</p>`}
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
      <p>У врача не настроен провайдер или модель. Укажите их у агента или общий провайдер агентов.</p>
      <p><a class="btn primary" href="${agentSetHref(agents[0] ? agents[0].id : "")}" data-go-settings>Настройки → Агенты</a></p>
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
    ov.querySelectorAll("[data-go-settings]").forEach(el => el.addEventListener("click", () => close()));
    bindTalkLogLink(ov, reqLog, () => {
        const a = agents.find(x => x.id === agentId) || agents[0];
        return `${a ? a.name : "Врач"} · ${opts.title}`;
    });
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
            const a = curAgent();
            const setA = ov.querySelector("[data-go-settings]");
            if (setA)
                setA.href = agentSetHref(a.id);
            log.innerHTML = `<div class="talk-hint muted">Сменили врача на «${esc(a.name)}». История чата сброшена — можно писать снова.</div>`;
            if (titleEl)
                titleEl.textContent = `${a.name} · ${opts.title}`;
        };
    }
    const buildDxSystem = (a) => {
        const brief = opts.brief ? `\nРасчёт кабинета по этому диагнозу: ${opts.brief}.` : "";
        const map = (a.examMap || "").trim();
        const mapBlock = map ? `\n\nКарта обследования (ориентир по специальности; не выдумывай лишних назначений сверх нужного):\n${map}` : "";
        const proto = (a.protocols || "").trim();
        const protoBlock = proto ? `\n\nПротоколы (справочный ориентир; не назначай лечение и дозировки человеку — только обсуждай в общих чертах, если спросят):\n${proto}` : "";
        return `${a.prompt}${mapBlock}${protoBlock}

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
        let loggedOut = false;
        const a = curAgent();
        try {
            const rt = Settings.agentRuntime(Settings.load(), a);
            if (!rt.preset || !rt.conf)
                throw new Error("У агента не выбран провайдер.");
            if (!Settings.isReady(rt.preset, rt.conf))
                throw new Error("Провайдер агента не готов (ключ, адрес или модель).");
            const bad = Call.unsupportedReason(rt.preset);
            if (bad)
                throw new Error(bad);
            if (!rt.model.trim())
                throw new Error("У агента не указана модель.");
            const system = buildDxSystem(a);
            reqLog.push({
                kind: "out",
                at: new Date().toISOString(),
                title: `${a.name} · ${rt.preset.name}`,
                body: outBody({ provider: rt.preset.name, model: rt.model, temperature: a.temperature }, system, nextHist),
            });
            loggedOut = true;
            const raw = await Call.chat({
                preset: rt.preset, conf: rt.conf, model: rt.model,
                system,
                messages: nextHist,
                temperature: a.temperature,
                signal: ctrl.signal,
            });
            reqLog.push({ kind: "in", at: new Date().toISOString(), title: a.name, body: raw });
            const say = assistantPlain(raw);
            if (!say)
                throw new Error("Провайдер вернул пустой ответ.");
            hist.length = 0;
            hist.push(...nextHist, { role: "assistant", content: say });
            bubble("assistant", `<div class="talk-bubble">${esc(say)}</div>`);
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            if (loggedOut)
                reqLog.push({ kind: "err", at: new Date().toISOString(), title: a.name, body: msg });
            showErr(msg);
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
