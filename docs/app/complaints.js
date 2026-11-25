import { lockScroll, unlockScroll } from "./ui.js";
export const COMPLAINTS = [
    {
        id: "chest",
        title: "Боль в груди",
        main: "PAIN_CHEST",
        attrs: [
            { code: "PAIN_CHEST_PRESSING", label: "давящая" },
            { code: "PAIN_CHEST_STABBING", label: "колющая" },
            { code: "PAIN_CHEST_IRRAD_LARM", label: "отдаёт в левую руку" },
            { code: "PAIN_CHEST_EXERTION", label: "при нагрузке" },
            { code: "PAIN_CHEST_RELIEF_REST", label: "проходит в покое" },
        ],
        scale: { code: "PAIN_CHEST_NRS", max: 100 },
        note: "PAIN_CHEST_NOTE",
    },
];
const managed = new Set();
for (const d of COMPLAINTS) {
    managed.add(d.main);
    for (const a of d.attrs)
        managed.add(a.code);
    if (d.scale)
        managed.add(d.scale.code);
    if (d.note)
        managed.add(d.note);
}
/** Коды, которые рисует UI жалоб, а не обычные поля анкеты */
export const isComplaintCode = (code) => managed.has(code);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const asStr = (v) => v === undefined || v === null || v === "" ? "" : String(v);
export function complaintActive(c, d) {
    if (asStr(c.values[d.main]) === "1")
        return true;
    if (d.attrs.some(a => asStr(c.values[a.code]) === "1"))
        return true;
    if (d.scale && asStr(c.values[d.scale.code]) !== "")
        return true;
    if (d.note && asStr(c.values[d.note]).trim())
        return true;
    return false;
}
/** Краткая подпись на чипе: «давящая · 42» или пусто */
export function complaintSummary(c, d) {
    if (!complaintActive(c, d))
        return "";
    const bits = [];
    for (const a of d.attrs)
        if (asStr(c.values[a.code]) === "1")
            bits.push(a.label);
    if (d.scale) {
        const n = asStr(c.values[d.scale.code]);
        if (n !== "")
            bits.push(n);
    }
    if (d.note && asStr(c.values[d.note]).trim())
        bits.push("есть описание");
    return bits.length ? bits.join(" · ") : "есть";
}
export function complaintsListHtml(c) {
    return COMPLAINTS.map(d => {
        const on = complaintActive(c, d);
        const sum = complaintSummary(c, d);
        return `<button type="button" class="cmp-chip${on ? " on" : ""}" data-cmp="${esc(d.id)}">
      <span class="cmp-title">${esc(d.title)}</span>
      ${sum ? `<span class="cmp-sum">${esc(sum)}</span>` : `<span class="cmp-sum muted">настроить</span>`}
    </button>`;
    }).join("");
}
/** Открыть окно жалобы; по «Готово» пишет в c.values и вызывает done */
export function openComplaintDialog(c, def, done) {
    const draft = {};
    draft[def.main] = asStr(c.values[def.main]) === "1" ? "1" : "";
    for (const a of def.attrs)
        draft[a.code] = asStr(c.values[a.code]);
    if (def.scale) {
        const raw = asStr(c.values[def.scale.code]);
        // старые значения 0–10 → 0–100
        if (raw !== "" && Number(raw) <= 10 && def.scale.max === 100 && !String(c.values[def.scale.code]).includes(".")) {
            const n = Number(raw);
            draft[def.scale.code] = String(n <= 10 ? n * 10 : n);
        }
        else
            draft[def.scale.code] = raw || "0";
    }
    if (def.note)
        draft[def.note] = asStr(c.values[def.note]);
    const ov = document.createElement("div");
    ov.className = "cv-overlay";
    const body = () => {
        const has = draft[def.main] === "1";
        const attrs = def.attrs.map(a => {
            const on = draft[a.code] === "1";
            return `<button type="button" class="cmp-attr${on ? " on" : ""}" data-attr="${esc(a.code)}" ${has ? "" : "disabled"}>${esc(a.label)}</button>`;
        }).join("");
        let scale = "";
        if (def.scale) {
            const max = def.scale.max;
            const cur = draft[def.scale.code] === "" ? "0" : draft[def.scale.code];
            scale = `<div class="cmp-block">
        <span class="cmp-lbl">Интенсивность</span>
        <div class="cmp-slide${has ? "" : " off"}">
          <div class="cmp-slide-val" id="cmp-slide-val" aria-live="polite">${esc(cur)}</div>
          <input type="range" id="cmp-slide" min="0" max="${max}" step="1" value="${esc(cur)}" ${has ? "" : "disabled"} aria-label="Интенсивность от 0 до ${max}">
          <div class="cmp-slide-ends"><span>0</span><span>${max}</span></div>
        </div>
      </div>`;
        }
        const note = def.note ? `<div class="cmp-block"><label class="cmp-lbl" for="cmp-note">Своими словами</label>
      <textarea id="cmp-note" rows="3" ${has ? "" : "disabled"} placeholder="если настроек не хватает">${esc(draft[def.note])}</textarea></div>` : "";
        return `<label class="cmp-check"><input type="checkbox" id="cmp-has" ${has ? "checked" : ""}> <span>есть</span></label>
      <div class="cmp-block"><span class="cmp-lbl">Характер и условия</span><div class="cmp-attrs">${attrs}</div></div>
      ${scale}${note}`;
    };
    ov.innerHTML = `<div class="cv-dialog cmp-dlg" role="dialog" aria-modal="true" aria-labelledby="cmp-title">
    <div class="cv-head"><b id="cmp-title">${esc(def.title)}</b>
      <button type="button" class="btn cv-x" data-close aria-label="закрыть">✕</button></div>
    <div class="cmp-body">${body()}</div>
    <div class="cmp-actions">
      <button type="button" class="btn" data-clear>Очистить</button>
      <button type="button" class="btn primary" data-ok>Готово</button>
    </div>
  </div>`;
    document.body.appendChild(ov);
    lockScroll();
    const box = ov.querySelector(".cmp-body");
    const redraw = () => { box.innerHTML = body(); };
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
    const clearDetails = () => {
        for (const a of def.attrs)
            draft[a.code] = "";
        if (def.scale)
            draft[def.scale.code] = "0";
        if (def.note)
            draft[def.note] = "";
    };
    ov.addEventListener("change", ev => {
        const t = ev.target;
        if (t.id === "cmp-has") {
            draft[def.main] = t.checked ? "1" : "";
            if (!t.checked)
                clearDetails();
            redraw();
        }
    });
    ov.addEventListener("input", ev => {
        const t = ev.target;
        if (t.id === "cmp-slide" && def.scale) {
            draft[def.scale.code] = t.value;
            if (draft[def.main] !== "1")
                draft[def.main] = "1";
            const val = ov.querySelector("#cmp-slide-val");
            if (val)
                val.textContent = t.value;
            return;
        }
        if (def.note && t.id === "cmp-note") {
            draft[def.note] = t.value;
            if (t.value.trim() && draft[def.main] !== "1") {
                draft[def.main] = "1";
                redraw();
                const again = ov.querySelector("#cmp-note");
                if (again) {
                    again.focus();
                    again.setSelectionRange(again.value.length, again.value.length);
                }
            }
        }
    });
    ov.addEventListener("click", ev => {
        const attr = ev.target.closest("[data-attr]");
        if (!attr || attr.hasAttribute("disabled"))
            return;
        const code = attr.dataset.attr;
        draft[code] = draft[code] === "1" ? "0" : "1";
        if (draft[def.main] !== "1")
            draft[def.main] = "1";
        redraw();
    });
    ov.querySelector("[data-clear]").addEventListener("click", () => {
        draft[def.main] = "";
        clearDetails();
        redraw();
    });
    ov.querySelector("[data-ok]").addEventListener("click", () => {
        if (draft[def.main] !== "1") {
            delete c.values[def.main];
            for (const a of def.attrs)
                delete c.values[a.code];
            if (def.scale)
                delete c.values[def.scale.code];
            if (def.note)
                delete c.values[def.note];
        }
        else {
            c.values[def.main] = "1";
            for (const a of def.attrs) {
                if (draft[a.code] === "1")
                    c.values[a.code] = "1";
                else
                    delete c.values[a.code];
            }
            if (def.scale) {
                const n = Number(draft[def.scale.code] || "0");
                c.values[def.scale.code] = isFinite(n) ? n : 0;
            }
            if (def.note) {
                const t = (draft[def.note] || "").trim();
                if (t)
                    c.values[def.note] = t;
                else
                    delete c.values[def.note];
            }
        }
        close();
        done();
    });
    ov.querySelector("[data-ok]").focus();
}
