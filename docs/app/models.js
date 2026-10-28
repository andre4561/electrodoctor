export const CAPS = [
    { cap: "vision", label: "понимает фото и изображения", svg: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-8 8"/>' },
    { cap: "pdf", label: "читает PDF", svg: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>' },
    { cap: "tools", label: "работает с инструментами", svg: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.2L3.6 17.2a1.9 1.9 0 0 0 2.7 2.7l5.7-5.7a4 4 0 0 0 5.2-5.4l-2.6 2.6-2.4-.5-.5-2.4z"/>' },
    { cap: "reasoning", label: "рассуждает перед ответом", svg: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>' },
    { cap: "free", label: "бесплатная", svg: '<path d="M20 12l-8 8-9-9V3h8z"/><circle cx="7.5" cy="7.5" r="1.3"/>' },
];
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export function capIcons(m) {
    if (!m)
        return "";
    return CAPS.filter(c => m.caps.includes(c.cap)).map(c => `<svg class="cap cap-${c.cap}${m.guessed && c.cap !== "free" ? " guess" : ""}" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="${esc(c.label)}"><title>${esc(c.label)}${m.guessed ? " (определено по названию модели)" : ""}</title>${c.svg}</svg>`).join("");
}
export function legendHtml() {
    return `<div class="cap-legend">${CAPS.map(c => `<span>${capIcons({ id: "", caps: [c.cap] })} ${esc(c.label)}</span>`).join("")}<span class="muted">приглушённый значок — определено по названию модели</span></div>`;
}
// ---------- определение по названию ----------
const NOT_CHAT = /(embed|embedding|whisper|tts|transcri|dall-e|davinci|babbage|moderation|text-search|similarity|rerank|imagen|veo|aqa|audio|realtime|image-gen|gpt-image|computer-use|sora|^emb:)/i;
export function guessCaps(provider, id) {
    const m = id.toLowerCase();
    const caps = new Set();
    if (provider === "anthropic") {
        caps.add("vision");
        caps.add("pdf");
        caps.add("tools");
        if (/claude-(3-7|.*-4|4|.*-[5-9])/.test(m))
            caps.add("reasoning");
    }
    else if (provider === "gemini") {
        caps.add("vision");
        caps.add("pdf");
        caps.add("tools");
        if (/(2\.5|thinking|gemini-[3-9])/.test(m))
            caps.add("reasoning");
    }
    else if (provider === "openai") {
        if (/(gpt-4o|gpt-4\.1|gpt-4\.5|gpt-4-turbo|gpt-5|^o[1345]|vision|chatgpt-4o)/.test(m) && !/o1-mini|o3-mini/.test(m)) {
            caps.add("vision");
            caps.add("pdf");
        }
        if (!/o1-mini|o1-preview/.test(m))
            caps.add("tools");
        if (/(^o\d|gpt-5)/.test(m))
            caps.add("reasoning");
    }
    else if (provider === "deepseek") {
        caps.add("tools");
        if (/(reason|r1)/.test(m))
            caps.add("reasoning");
    }
    else {
        if (/(vl\b|-vl|vision|llava|gemma-?3|pixtral|minicpm-v|moondream|qwen2\.5-?vl|qwen3-?vl|internvl|llama-?3\.2-?(11|90)|llama-?4|mistral-small-3|mistral-medium|gpt-4o|gpt-4\.1|gpt-5|claude|gemini|glm-4\.?[1-9]v|granite-vision|aya-vision)/.test(m))
            caps.add("vision");
        if (/(claude|gemini)/.test(m))
            caps.add("pdf");
        if (/(qwen|llama-?3\.[1-3]|llama-?4|mistral|mixtral|hermes|command-r|gpt-oss|gpt-4|gpt-5|deepseek-(v3|chat)|glm|granite|claude|gemini|yandexgpt|firefunction|functionary)/.test(m))
            caps.add("tools");
        if (/(r1\b|-r1|reason|think|qwq|qwen3|gpt-oss|magistral|o[134]-|deepseek-r)/.test(m))
            caps.add("reasoning");
    }
    if (/:free$/.test(m))
        caps.add("free");
    return [...caps];
}
// ---------- посредник ----------
// Некоторые провайдеры (YandexGPT) не принимают запросы прямо со страницы в браузере (нет CORS).
// Тогда запрос идёт через посредника в tools/preview.py: /proxy/<хост>/<путь> на этом же компьютере.
export const proxyDefault = (p) => p.id === "yandexgpt";
export const proxyOn = (p, c) => c.viaProxy ?? proxyDefault(p);
export const proxyAllowed = (p) => p.id === "yandexgpt" || p.kind === "custom";
const PROXY_HINT = "Посредник не отвечает. Он работает, только когда кабинет открыт с этого компьютера через python tools\\preview.py (адрес http://localhost:8000/app/).";
export function route(p, c, url) {
    if (!proxyOn(p, c) || !proxyAllowed(p))
        return url;
    const h = location.hostname;
    if (h !== "localhost" && h !== "127.0.0.1")
        throw new Error(p.name + " не принимает запросы прямо из браузера, а посредник есть только при запуске кабинета с вашего компьютера (python tools\\preview.py). Откройте кабинет по адресу http://localhost:8000/app/.");
    const u = new URL(url);
    return `${location.origin}/proxy/${u.host}${u.pathname}${u.search}`;
}
export function proxyError(url, status) {
    return url.includes("/proxy/") && (status === 404 || status === 405 || status === 501) ? PROXY_HINT : "";
}
// ---------- запрос списка ----------
const trim = (s) => s.trim().replace(/\/+$/, "");
const rootOf = (base) => trim(base).replace(/\/(v1|api\/v0|api)$/i, "");
export function authHeaders(p, c) {
    const h = {};
    if (p.id === "anthropic") {
        h["x-api-key"] = c.apiKey;
        h["anthropic-version"] = "2023-06-01";
        h["anthropic-dangerous-direct-browser-access"] = "true";
    }
    else if (p.id === "yandexgpt") {
        if (c.apiKey)
            h.Authorization = "Api-Key " + c.apiKey;
        if (c.folder) {
            h["OpenAI-Project"] = c.folder;
            h["x-folder-id"] = c.folder;
        }
    }
    else if (p.id !== "gemini" && c.apiKey)
        h.Authorization = "Bearer " + c.apiKey;
    return h;
}
async function getJSON(url, headers = {}, init = {}) {
    let res;
    try {
        res = await fetch(url, { ...init, headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...headers } });
    }
    catch (e) {
        throw new Error(url.includes("/proxy/") ? PROXY_HINT : "Браузер не смог связаться с провайдером: проверьте адрес API. Возможно, сервис не принимает запросы прямо из браузера (CORS) — тогда включите «Через посредника».");
    }
    const text = await res.text();
    let j = null;
    try {
        j = JSON.parse(text);
    }
    catch (e) { /* не JSON */ }
    if (!res.ok) {
        const px = proxyError(url, res.status);
        if (px)
            throw new Error(px);
        const m = j && (j.error?.message || j.error || j.message);
        const hint = res.status === 401 || res.status === 403 ? " Проверьте ключ API и права сервисного аккаунта." : res.status === 404 ? " Проверьте адрес API." : "";
        throw new Error(`Ошибка ${res.status}${m ? ": " + (typeof m === "string" ? m : JSON.stringify(m)) : ""}.${hint}`);
    }
    if (!j)
        throw new Error("Провайдер вернул не JSON.");
    return j;
}
const byId = (a, b) => a.id.localeCompare(b.id);
export async function fetchModels(p, c) {
    const base = trim(c.baseUrl);
    if (!base)
        throw new Error("Сначала укажите адрес API.");
    if (p.id === "gigachat")
        throw new Error("GigaChat не отдаёт список моделей прямо в браузер — впишите модель вручную (например, GigaChat-Pro).");
    if (p.kind !== "local" && !c.apiKey && p.id !== "openrouter")
        throw new Error("Сначала вставьте ключ API.");
    if (p.id === "yandexgpt" && !c.folder)
        throw new Error("Для YandexGPT укажите идентификатор каталога (folder ID).");
    let list = [];
    if (p.id === "gemini") {
        const j = await getJSON(`${base}/models?pageSize=1000&key=${encodeURIComponent(c.apiKey)}`);
        list = (j.models || []).filter((m) => (m.supportedGenerationMethods || []).includes("generateContent")).map((m) => {
            const id = String(m.name || "").replace(/^models\//, "");
            const caps = guessCaps("gemini", id).filter(x => x !== "reasoning");
            if (m.thinking)
                caps.push("reasoning");
            return { id, name: m.displayName, caps };
        });
    }
    else if (p.id === "anthropic") {
        const j = await getJSON(`${base}/models?limit=1000`, authHeaders(p, c));
        list = (j.data || []).map((m) => ({ id: m.id, name: m.display_name, caps: guessCaps("anthropic", m.id), guessed: true }));
    }
    else if (p.id === "ollama") {
        const root = rootOf(base);
        const j = await getJSON(root + "/api/tags");
        const names = (j.models || []).map((m) => m.name || m.model).filter(Boolean);
        list = await Promise.all(names.map(async (id) => {
            try {
                const s = await getJSON(root + "/api/show", {}, { method: "POST", body: JSON.stringify({ model: id }) });
                const ac = s.capabilities || [];
                if (!ac.length)
                    throw new Error();
                const caps = [];
                if (ac.includes("vision"))
                    caps.push("vision");
                if (ac.includes("tools"))
                    caps.push("tools");
                if (ac.includes("thinking"))
                    caps.push("reasoning");
                if (!ac.includes("completion"))
                    return { id, caps: [], guessed: false, name: "не для чата" };
                return { id, caps };
            }
            catch (e) {
                return { id, caps: guessCaps("other", id), guessed: true };
            }
        }));
        list = list.filter(m => m.name !== "не для чата");
    }
    else {
        let lm = null;
        if (p.id === "lmstudio") {
            try {
                lm = await getJSON(rootOf(base) + "/api/v0/models");
            }
            catch (e) {
                lm = null;
            }
        }
        if (lm && Array.isArray(lm.data)) {
            list = lm.data.filter((m) => m.type !== "embeddings").map((m) => {
                const caps = [];
                if (m.type === "vlm")
                    caps.push("vision");
                if ((m.capabilities || []).includes("tool_use"))
                    caps.push("tools");
                if (guessCaps("other", m.id).includes("reasoning"))
                    caps.push("reasoning");
                return { id: m.id, caps };
            });
        }
        else {
            const j = await getJSON(route(p, c, base + "/models"), authHeaders(p, c));
            const data = Array.isArray(j) ? j : (j.data || j.models || []);
            list = data.map((m) => {
                const id = String(m.id || m.name || "");
                if (m.architecture || m.supported_parameters) { // OpenRouter
                    const inp = (m.architecture && m.architecture.input_modalities) || [];
                    const sp = m.supported_parameters || [];
                    const caps = [];
                    if (inp.includes("image"))
                        caps.push("vision");
                    if (inp.includes("file"))
                        caps.push("pdf");
                    if (sp.includes("tools"))
                        caps.push("tools");
                    if (sp.includes("reasoning") || sp.includes("include_reasoning"))
                        caps.push("reasoning");
                    const pr = m.pricing || {};
                    if (/:free$/.test(id) || (pr.prompt === "0" && pr.completion === "0"))
                        caps.push("free");
                    return { id, name: m.name, caps };
                }
                if (m.capabilities && typeof m.capabilities === "object" && !Array.isArray(m.capabilities)) { // Mistral
                    const k = m.capabilities;
                    if (k.completion_chat === false)
                        return { id, caps: [], name: "не для чата" };
                    const caps = [];
                    if (k.vision)
                        caps.push("vision");
                    if (k.function_calling)
                        caps.push("tools");
                    if (/magistral/.test(id))
                        caps.push("reasoning");
                    return { id, name: m.name && m.name !== id ? m.name : undefined, caps };
                }
                return { id, caps: guessCaps(p.id === "openai" || p.id === "deepseek" ? p.id : "other", id), guessed: true };
            });
            list = list.filter(m => m.name !== "не для чата");
        }
    }
    const all = list.filter(m => m.id);
    const chat = all.filter(m => !NOT_CHAT.test(m.id));
    chat.sort(byId);
    return { models: chat, hidden: all.length - chat.length };
}
// ---------- выпадающий список моделей ----------
// Поле ввода остаётся обычным текстом (модель можно вписать руками), рядом — значки выбранной модели
// и кнопка, раскрывающая список с поиском.
export function pickerHtml(name, value, models, placeholder = "название модели") {
    const cur = (models || []).find(m => m.id === value);
    return `<span class="mp" data-mp>
    <input type="text" name="${esc(name)}" value="${esc(value)}" spellcheck="false" autocomplete="off" placeholder="${esc(placeholder)}">
    <span class="mp-caps" data-mp-caps>${capIcons(cur)}</span>
    <button type="button" class="btn mp-open" data-mp-open aria-label="выбрать из списка" title="${models && models.length ? "выбрать из списка" : "список моделей не загружен"}"${models && models.length ? "" : " disabled"}>▾</button>
    <span class="mp-pop" data-mp-pop hidden></span>
  </span>`;
}
// Привязать поведение. getModels — актуальный список (меняется, если в агенте выбрали другого провайдера).
export function bindPicker(root, getModels) {
    const input = root.querySelector("input");
    const caps = root.querySelector("[data-mp-caps]");
    const btn = root.querySelector("[data-mp-open]");
    const pop = root.querySelector("[data-mp-pop]");
    const refresh = () => {
        const ms = getModels() || [];
        caps.innerHTML = capIcons(ms.find(m => m.id === input.value.trim()));
        btn.disabled = !ms.length;
        btn.title = ms.length ? "выбрать из списка" : "список моделей не загружен";
    };
    const close = () => { pop.hidden = true; document.removeEventListener("click", outside, true); };
    const outside = (ev) => { if (!root.contains(ev.target))
        close(); };
    const draw = (q) => {
        const ms = (getModels() || []).filter(m => !q || (m.id + " " + (m.name || "")).toLowerCase().includes(q.toLowerCase()));
        const list = pop.querySelector(".mp-list");
        list.innerHTML = ms.length ? ms.map(m => `<button type="button" class="mp-item${m.id === input.value ? " on" : ""}" data-id="${esc(m.id)}"><span class="mp-id">${esc(m.id)}${m.name && m.name !== m.id ? `<small>${esc(m.name)}</small>` : ""}</span><span class="mp-caps">${capIcons(m)}</span></button>`).join("")
            : `<p class="muted mp-empty">Ничего не найдено</p>`;
    };
    btn.addEventListener("click", () => {
        if (!pop.hidden) {
            close();
            return;
        }
        pop.innerHTML = `<input type="search" class="mp-q" placeholder="поиск модели" aria-label="поиск модели"><div class="mp-list"></div>${legendHtml()}`;
        pop.hidden = false;
        const q = pop.querySelector(".mp-q");
        q.addEventListener("input", () => draw(q.value.trim()));
        q.addEventListener("keydown", ev => { if (ev.key === "Escape")
            close(); });
        draw("");
        q.focus();
        document.addEventListener("click", outside, true);
    });
    pop.addEventListener("click", ev => {
        const it = ev.target.closest(".mp-item");
        if (!it)
            return;
        input.value = it.dataset.id || "";
        close();
        refresh();
        input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    input.addEventListener("input", refresh);
    input.addEventListener("change", refresh);
    root._mpRefresh = refresh;
}
