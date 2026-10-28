export const SAFE_MAX = 10; // безопасно — пока критичность не выше 10
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pctOf = (c, q) => q < 0 ? q * -c.L : q * c.R;
function tangents(xs, ys) {
    const n = xs.length, d = [], m = new Array(n).fill(0);
    for (let i = 0; i < n - 1; i++)
        d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
    if (n < 2)
        return m;
    m[0] = d[0];
    m[n - 1] = d[n - 2];
    for (let i = 1; i < n - 1; i++) {
        if (d[i - 1] * d[i] <= 0)
            m[i] = 0;
        else {
            const w1 = 2 * (xs[i + 1] - xs[i]) + (xs[i] - xs[i - 1]), w2 = (xs[i + 1] - xs[i]) + 2 * (xs[i] - xs[i - 1]);
            m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
        }
    }
    for (let i = 0; i < n - 1; i++)
        if (d[i] === 0) {
            m[i] = 0;
            m[i + 1] = 0;
        }
    return m;
}
// Критичность при отклонении pct (%) от нормы
export function evaluate(c, pct) {
    const xs = c.pts.map(p => pctOf(c, p[0])), ys = c.pts.map(p => p[1]), n = xs.length;
    if (!n)
        return 0;
    if (pct <= xs[0])
        return ys[0];
    if (pct >= xs[n - 1])
        return ys[n - 1];
    let i = 0;
    while (pct > xs[i + 1])
        i++;
    const h = xs[i + 1] - xs[i], t = (pct - xs[i]) / h;
    if (c.linear)
        return ys[i] + (ys[i + 1] - ys[i]) * t;
    const m = tangents(xs, ys), t2 = t * t, t3 = t2 * t;
    return clamp((2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1], 0, 100);
}
// Безопасная зона вокруг нормы: от 0% влево и вправо, пока критичность ≤ SAFE_MAX.
// open: зона не кончается в пределах кривой (крайняя точка тоже безопасна).
export function safeZone(c) {
    if (evaluate(c, 0) > SAFE_MAX)
        return null;
    const step = Math.max(0.1, (c.R - c.L) / 4000);
    let lo = 0, hi = 0;
    while (lo - step >= c.L && evaluate(c, lo - step) <= SAFE_MAX)
        lo -= step;
    while (hi + step <= c.R && evaluate(c, hi + step) <= SAFE_MAX)
        hi += step;
    return { lo, hi, openLo: lo - step < c.L && evaluate(c, c.L) <= SAFE_MAX, openHi: hi + step > c.R && evaluate(c, c.R) <= SAFE_MAX };
}
// Стартовая кривая по типичному интервалу нормы («120–170», «до 5»): внутри интервала — 0,
// дальше плавный подъём до 100 к краям. Края — втрое дальше границ интервала (догадка, не данные).
const num = (s) => Number(s.replace(",", "."));
export function defaultCurve(norm, range) {
    let loPct = -15, hiPct = 15;
    const m = range.match(/([\d.,]+)\s*[–-]\s*([\d.,]+)/), up = range.match(/до\s*([\d.,]+)/);
    if (norm > 0 && m) {
        loPct = (num(m[1]) / norm - 1) * 100;
        hiPct = (num(m[2]) / norm - 1) * 100;
    }
    else if (norm > 0 && up) {
        loPct = -100;
        hiPct = (num(up[1]) / norm - 1) * 100;
    }
    loPct = clamp(loPct, -100, -1);
    hiPct = Math.max(1, hiPct);
    const L = loPct <= -99 ? -100 : clamp(Math.round(loPct * 3), -100, Math.round(loPct) - 5);
    const R = Math.max(Math.round(hiPct * 3), Math.round(hiPct) + 5);
    const q = (p) => p < 0 ? p / -L : p / R;
    const pts = [];
    if (loPct <= -99)
        pts.push([-1, 0]);
    else
        pts.push([-1, 100], [q((L + loPct) / 2), 55], [q(loPct), 0]);
    pts.push([0, 0], [q(hiPct), 0], [q((R + hiPct) / 2), 55], [1, 100]);
    return { L, R, pts: pts.map(p => [Math.round(p[0] * 1000) / 1000, p[1]]) };
}
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
const fmt = (n, d = 1) => (Math.round(n * 10 ** d) / 10 ** d).toString().replace(".", ",");
const copy = (c) => ({ L: c.L, R: c.R, linear: !!c.linear, pts: c.pts.map(p => [p[0], p[1]]) });
export const sameCurve = (a, b) => JSON.stringify(copy(a)) === JSON.stringify(copy(b));
export function safeText(c, norm, unit) {
    const z = safeZone(c);
    if (!z || norm <= 0)
        return { mid: "—", range: z ? "" : "нет безопасной зоны" };
    const lo = norm * (1 + z.lo / 100), hi = norm * (1 + z.hi / 100);
    const d = norm >= 100 ? 0 : norm >= 10 ? 1 : norm >= 1 ? 2 : 3;
    const r = z.openLo && z.openHi ? "любое" : z.openLo ? `до ${fmt(hi, d)}` : z.openHi ? `от ${fmt(lo, d)}` : `${fmt(lo, d)}–${fmt(hi, d)}`;
    return { mid: z.openLo || z.openHi ? "—" : fmt((lo + hi) / 2, d), range: r + (unit ? " " + unit : "") };
}
export function openEditor(o) {
    let c = copy(o.curve), drag = -1, probeP = Math.round(c.L / 3), norm = o.norm;
    const W = 700, H = 380, X0 = 60, X1 = 680, Y0 = 290, Y1 = 20, XM = (X0 + X1) / 2;
    const sx = (p) => p < 0 ? X0 + (p - c.L) / -c.L * (XM - X0) : XM + p / c.R * (X1 - XM);
    const ix = (x) => x < XM ? c.L + (x - X0) / (XM - X0) * -c.L : (x - XM) / (X1 - XM) * c.R;
    const sy = (v) => Y0 - v / 100 * (Y0 - Y1), iy = (y) => (Y0 - y) / (Y0 - Y1) * 100;
    const frac = (p) => p < 0 ? p / -c.L : p / c.R;
    const isFixed = (i) => i === 0 || i === c.pts.length - 1 || c.pts[i][0] === 0;
    const ov = document.createElement("div");
    ov.className = "cv-overlay";
    ov.innerHTML = `<div class="cv-dialog" role="dialog" aria-modal="true" aria-label="Кривая критичности: ${esc(o.title)}">
    <div class="cv-head"><div><b>${esc(o.title)}</b>${o.subtitle ? ` <span class="muted cv-sub">${esc(o.subtitle)}</span>` : ""}<div class="cv-safe" data-safe></div></div>
      <button type="button" class="btn cv-x" data-close aria-label="закрыть">✕</button></div>
    <div class="cv-norm"><label>Норма <input type="text" inputmode="decimal" data-norm value="${fmt(norm, 3)}" aria-label="норма"></label><span class="muted">${esc(o.unit)}</span>
      <button type="button" class="btn cv-nreset" data-nreset title="вернуть норму ${fmt(o.normBase, 3)}">↺ ${fmt(o.normBase, 3)}</button>
      <span class="muted cv-nhint">точка 0% на графике; кривая задана в процентах от неё</span></div>
    <p class="note cv-zero" data-zero hidden>Норма 0 — отклонение в процентах не считается, поэтому кривой критичности у этого показателя нет. Можно задать только норму.</p>
    <div data-chart>
    <div class="cv-ctrls">
      <label>Левый край, % <input type="number" data-l min="-100" max="-5" step="5" value="${c.L}"></label>
      <label>Правый край, % <input type="number" data-r min="5" max="2000" step="5" value="${c.R}"></label>
      <span class="seg" role="group" aria-label="вид кривой"><button type="button" data-mode="smooth" class="${c.linear ? "" : "on"}">Плавная</button><button type="button" data-mode="linear" class="${c.linear ? "on" : ""}">Прямые</button></span>
      <button type="button" class="btn" data-base>${esc(o.baseLabel || "Вернуть исходную")}</button>
    </div>
    <svg class="cv-svg" viewBox="0 0 ${W} ${H}" aria-label="график кривой">
      <g data-grid></g><path data-area class="cv-area"></path><path data-line class="cv-line"></path>
      <line data-probe class="cv-probe" y1="${Y1}"></line><circle data-pdot r="5" class="cv-pdot"></circle>
      <g><rect data-lbox rx="8" height="26" class="cv-lbox"></rect><text data-ltxt text-anchor="middle" class="cv-ltxt"></text></g>
      <g data-pts></g>
    </svg>
    </div>
    <details class="fold cv-help"><summary><span class="fold-title">Справка</span><span class="fold-chev" aria-hidden="true"></span></summary><div class="fold-body"><ul>
      <li>Перетаскивайте точки мышкой. Синяя линия следует за мышкой: под ней — отклонение, значение анализа и критичность.</li>
      <li>Двойной щелчок по пустому месту — добавить точку, по точке — удалить (крайние точки и точка нормы не удаляются).</li>
      <li>Края по горизонтали задаются отдельно слева и справа; точки этой стороны растягиваются пропорционально.</li>
      <li>Безопасно — там, где критичность не выше ${SAFE_MAX}. 100 — «уже скорая», выше кривая не поднимается.</li>
      <li>Закрыть окно — крестик, Esc или щелчок мимо окна. Всё сохраняется само.</li>
    </ul></div></details>
  </div>`;
    document.body.appendChild(ov);
    document.body.classList.add("cv-lock");
    const $ = (s) => ov.querySelector(s);
    const svg = $(".cv-svg"), ns = "http://www.w3.org/2000/svg";
    const mk = (parent, n, a, t) => {
        const e = document.createElementNS(ns, n);
        for (const k in a)
            e.setAttribute(k, String(a[k]));
        if (t != null)
            e.textContent = t;
        parent.appendChild(e);
        return e;
    };
    function grid() {
        const g = $("[data-grid]");
        g.innerHTML = "";
        for (let v = 0; v <= 100; v += 25) {
            mk(g, "line", { x1: X0, x2: X1, y1: sy(v), y2: sy(v), class: "cv-gl" });
            mk(g, "text", { x: X0 - 10, y: sy(v) + 4, "text-anchor": "end", class: "cv-t" }, String(v));
        }
        const ticks = (s) => [1, 0.75, 0.5, 0.25].map(k => Math.round(k * s));
        mk(g, "rect", { x: sx(0), y: Y1, width: 0, height: 0, class: "cv-safezone", "data-sz": "" });
        [...ticks(c.L), 0, ...ticks(c.R).reverse()].forEach(v => {
            mk(g, "line", { x1: sx(v), x2: sx(v), y1: Y1, y2: Y0, class: v === 0 ? "cv-gl0" : "cv-gl" });
            mk(g, "text", { x: sx(v), y: Y0 + 20, "text-anchor": "middle", class: "cv-t" }, (v > 0 ? "+" : "") + v + "%");
        });
        mk(g, "text", { x: X0, y: 12, class: "cv-t" }, "Критичность");
        mk(g, "text", { x: XM, y: Y0 + 80, "text-anchor": "middle", class: "cv-t" }, "отклонение от нормы, %");
        mk(g, "text", { x: sx(0), y: Y1 - 6, "text-anchor": "middle", class: "cv-t", "data-normlbl": "" }, "норма " + fmt(norm, 3));
    }
    function draw() {
        let d = "";
        const N = 260;
        for (let k = 0; k <= N; k++) {
            const x = X0 + (X1 - X0) * k / N;
            d += (k ? "L" : "M") + x.toFixed(1) + " " + sy(evaluate(c, ix(x))).toFixed(1) + " ";
        }
        $("[data-line]").setAttribute("d", d);
        $("[data-area]").setAttribute("d", d + `L${X1} ${Y0} L${X0} ${Y0} Z`);
        const z = safeZone(c), sz = $("[data-sz]");
        if (z) {
            sz.setAttribute("x", String(sx(z.lo)));
            sz.setAttribute("width", String(Math.max(0, sx(z.hi) - sx(z.lo))));
            sz.setAttribute("y", String(Y1));
            sz.setAttribute("height", String(Y0 - Y1));
        }
        else
            sz.setAttribute("width", "0");
        const zero = !(norm > 0);
        $("[data-zero]").hidden = !zero;
        $("[data-chart]").hidden = zero;
        const nl = ov.querySelector("[data-normlbl]");
        if (nl)
            nl.textContent = "норма " + fmt(norm, 3);
        const st = safeText(c, norm, o.unit);
        $("[data-safe]").textContent = zero ? "Кривая не применяется: норма 0" : `Безопасно (критичность ≤ ${SAFE_MAX}): ${st.range}`;
        const pts = $("[data-pts]");
        pts.innerHTML = "";
        c.pts.forEach((p, i) => {
            const e = mk(pts, "circle", { cx: sx(p[0] < 0 ? p[0] * -c.L : p[0] * c.R), cy: sy(p[1]), r: drag === i ? 9 : 7, class: "cv-pt" + (isFixed(i) ? " fixed" : "") });
            e.addEventListener("pointerdown", ev => { ev.stopPropagation(); drag = i; svg.setPointerCapture(ev.pointerId); draw(); });
            e.addEventListener("dblclick", ev => { ev.stopPropagation(); if (isFixed(i))
                return; c.pts.splice(i, 1); draw(); });
        });
        probe();
    }
    function probe() {
        const p = clamp(probeP, c.L, c.R), y = evaluate(c, p), x = sx(p);
        const pr = $("[data-probe]");
        pr.setAttribute("x1", String(x));
        pr.setAttribute("x2", String(x));
        pr.setAttribute("y2", String(Y0 + 30));
        const dot = $("[data-pdot]");
        dot.setAttribute("cx", String(x));
        dot.setAttribute("cy", String(sy(y)));
        const t = $("[data-ltxt]"), b = $("[data-lbox]");
        t.textContent = `${p > 0 ? "+" : ""}${Math.round(p)}% · ${fmt(norm * (1 + p / 100), norm >= 100 ? 0 : 2)}${o.unit ? " " + o.unit : ""} · критичность ${Math.round(y)}`;
        const w = t.getComputedTextLength() + 24, cx = clamp(x, X0 + w / 2 - 40, X1 - w / 2 + 10);
        t.setAttribute("x", String(cx));
        t.setAttribute("y", String(Y0 + 48));
        b.setAttribute("x", String(cx - w / 2));
        b.setAttribute("y", String(Y0 + 30));
        b.setAttribute("width", String(w));
    }
    const pos = (e) => { const r = svg.getBoundingClientRect(); return [(e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height]; };
    svg.addEventListener("pointermove", e => {
        const [px, py] = pos(e);
        if (drag < 0) {
            probeP = Math.round(ix(clamp(px, X0, X1)));
            probe();
            return;
        }
        let q = frac(ix(clamp(px, X0, X1)));
        const y = Math.round(clamp(iy(py), 0, 100));
        if (drag === 0)
            q = -1;
        else if (drag === c.pts.length - 1)
            q = 1;
        else if (c.pts[drag][0] === 0)
            q = 0;
        else
            q = clamp(q, c.pts[drag - 1][0] + 0.01, c.pts[drag + 1][0] - 0.01);
        c.pts[drag] = [Math.round(q * 1000) / 1000, y];
        draw();
    });
    svg.addEventListener("pointerup", () => { drag = -1; draw(); });
    svg.addEventListener("dblclick", e => {
        const [px, py] = pos(e);
        if (px < X0 || px > X1 || py < Y1 || py > Y0)
            return;
        const q = frac(ix(px)), i = c.pts.findIndex(p => p[0] > q);
        if (i <= 0)
            return;
        c.pts.splice(i, 0, [Math.round(q * 1000) / 1000, Math.round(clamp(iy(py), 0, 100))]);
        draw();
    });
    const li = $("[data-l]"), ri = $("[data-r]");
    li.addEventListener("change", () => { c.L = clamp(Math.round(Number(li.value) || -60), -100, -5); li.value = String(c.L); grid(); draw(); });
    ri.addEventListener("change", () => { c.R = clamp(Math.round(Number(ri.value) || 60), 5, 2000); ri.value = String(c.R); grid(); draw(); });
    ov.querySelectorAll("[data-mode]").forEach(b => b.addEventListener("click", () => {
        c.linear = b.dataset.mode === "linear";
        ov.querySelectorAll("[data-mode]").forEach(x => x.classList.toggle("on", x === b));
        draw();
    }));
    $("[data-base]").addEventListener("click", () => {
        c = copy(o.base);
        li.value = String(c.L);
        ri.value = String(c.R);
        ov.querySelectorAll("[data-mode]").forEach(x => x.classList.toggle("on", (x.dataset.mode === "linear") === !!c.linear));
        grid();
        draw();
    });
    const ni = $("[data-norm]");
    const readNorm = () => { const v = Number(ni.value.trim().replace(/\s+/g, "").replace(",", ".")); if (ni.value.trim() !== "" && isFinite(v) && v >= 0) {
        norm = v;
        ni.classList.remove("bad");
    }
    else
        ni.classList.add("bad"); draw(); };
    ni.addEventListener("input", readNorm);
    ni.addEventListener("keydown", e => { if (e.key === "Enter")
        ni.blur(); });
    $("[data-nreset]").addEventListener("click", () => { norm = o.normBase; ni.value = fmt(norm, 3); ni.classList.remove("bad"); draw(); });
    const close = () => {
        document.removeEventListener("keydown", onKey);
        ov.remove();
        document.body.classList.remove("cv-lock");
        o.onClose(copy(c), sameCurve(c, o.base), norm);
    };
    const onKey = (e) => { if (e.key === "Escape")
        close(); };
    document.addEventListener("keydown", onKey);
    ov.addEventListener("click", e => { if (e.target === ov)
        close(); });
    $("[data-close]").addEventListener("click", close);
    grid();
    draw();
    $("[data-close]").focus();
}
