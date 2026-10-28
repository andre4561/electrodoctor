// SPDX-License-Identifier: AGPL-3.0-or-later
// Электродоктор — запрос к провайдеру ИИ прямо из браузера: промпт + фото (или PDF) анализов → текст ответа.
//
// Запрос идёт напрямую от этой страницы к провайдеру, без нашего сервера (его у проекта нет).
// Ключ берётся из настроек (settings.ts) и уходит только этому провайдеру.
// Поддерживаются три вида API:
//   • совместимый с OpenAI (/chat/completions) — OpenAI, Mistral, OpenRouter, DeepSeek, Ollama, LM Studio, свои;
//   • Anthropic (/messages);
//   • Google Gemini (:generateContent).
import type { ProviderPreset, ProviderConf } from "./settings.js";
import { authHeaders, route, proxyError } from "./models.js";

export interface Attachment { name: string; type: string; data: string }   // data — base64 без префикса

type Api = "openai" | "anthropic" | "gemini" | "none";
export function apiOf(p: ProviderPreset): Api {
  if (p.id === "anthropic") return "anthropic";
  if (p.id === "gemini") return "gemini";
  if (p.id === "gigachat") return "none";   // свой API с отдельной авторизацией, из браузера недоступен
  return "openai";
}
// Кто из провайдеров принимает PDF напрямую (остальным — только картинки)
export const takesPdf = (p: ProviderPreset) => ["anthropic", "gemini", "openai"].includes(p.id);
export function unsupportedReason(p: ProviderPreset): string {
  if (apiOf(p) === "none") return `${p.name} пока нельзя вызвать прямо из браузера — выберите другого провайдера.`;
  return "";
}

const trimSlash = (s: string) => s.trim().replace(/\/+$/, "");

// ---------- подготовка файлов ----------
const MAX_SIDE = 2200;          // больше не нужно для чтения бланка, а запрос легче
function readAsDataURL(b: Blob): Promise<string> {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(b); });
}
async function shrink(file: Blob): Promise<{ type: string; data: string }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("не картинка")); i.src = url; });
    const k = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    if (k === 1 && file.size < 3.5 * 1024 * 1024 && /^image\/(jpeg|png|webp)$/.test(file.type)) {
      const d = await readAsDataURL(file);
      return { type: file.type, data: d.slice(d.indexOf(",") + 1) };
    }
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    const g = c.getContext("2d")!;
    g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0, c.width, c.height);
    const d = c.toDataURL("image/jpeg", 0.9);
    return { type: "image/jpeg", data: d.slice(d.indexOf(",") + 1) };
  } finally { URL.revokeObjectURL(url); }
}
export async function prepare(file: File): Promise<Attachment> {
  if (file.type === "application/pdf") {
    const d = await readAsDataURL(file);
    return { name: file.name, type: file.type, data: d.slice(d.indexOf(",") + 1) };
  }
  const s = await shrink(file);
  return { name: file.name, ...s };
}

// ---------- запрос ----------
export interface CallOpts { preset: ProviderPreset; conf: ProviderConf; model: string; prompt: string; files: Attachment[]; signal?: AbortSignal }

async function post(url: string, headers: Record<string, string>, body: unknown, signal?: AbortSignal): Promise<any> {
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body), signal });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw new Error("Запрос отменён.");
    if (url.includes("/proxy/")) throw new Error("Посредник не отвечает. Он работает, только когда кабинет открыт с этого компьютера через python tools\\preview.py.");
    throw new Error("Браузер не смог связаться с провайдером. Проверьте адрес API и интернет. Для Ollama и LM Studio: программа должна быть запущена, а доступ со страниц сайтов (CORS) — разрешён. Некоторые сервисы вообще не принимают запросы из браузера.");
  }
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch (e) { /* не JSON */ }
  if (!res.ok) {
    const px = proxyError(url, res.status); if (px) throw new Error(px);
    const m = json && (json.error?.message || json.error || json.message);
    const hint = res.status === 401 || res.status === 403 ? " Проверьте ключ API в настройках."
      : res.status === 404 ? " Проверьте адрес API и название модели."
      : res.status === 429 ? " Превышен лимит запросов или закончились деньги на счёте провайдера." : "";
    throw new Error(`Провайдер ответил ошибкой ${res.status}${m ? ": " + (typeof m === "string" ? m : JSON.stringify(m)) : ""}.${hint}`);
  }
  if (!json) throw new Error("Провайдер вернул не JSON: " + text.slice(0, 200));
  return json;
}

export async function recognize(o: CallOpts): Promise<string> {
  const api = apiOf(o.preset);
  const base = trimSlash(o.conf.baseUrl);
  const model = o.model.trim();
  if (api === "none") throw new Error(unsupportedReason(o.preset));
  if (!model) throw new Error("Не указана модель. Впишите её здесь или в настройках провайдера — нужна модель, которая понимает изображения.");
  if (!o.files.length) throw new Error("Добавьте хотя бы одно фото анализов.");

  if (api === "anthropic") {
    const content: unknown[] = o.files.map(f => f.type === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: f.type, data: f.data } }
      : { type: "image", source: { type: "base64", media_type: f.type, data: f.data } });
    content.push({ type: "text", text: o.prompt });
    const j = await post(base + "/messages", authHeaders(o.preset, o.conf), { model, max_tokens: 8192, temperature: 0, messages: [{ role: "user", content }] }, o.signal);
    return (j.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");
  }

  if (api === "gemini") {
    const parts: unknown[] = [{ text: o.prompt }, ...o.files.map(f => ({ inline_data: { mime_type: f.type, data: f.data } }))];
    const j = await post(`${base}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(o.conf.apiKey)}`, {},
      { contents: [{ role: "user", parts }], generationConfig: { temperature: 0, responseMimeType: "application/json" } }, o.signal);
    const c = j.candidates && j.candidates[0];
    if (!c) throw new Error("Gemini не вернул ответ" + (j.promptFeedback?.blockReason ? ": " + j.promptFeedback.blockReason : "."));
    return (c.content?.parts || []).map((p: any) => p.text || "").join("");
  }

  // совместимый с OpenAI
  const content: unknown[] = [{ type: "text", text: o.prompt }, ...o.files.map(f => f.type === "application/pdf"
    ? { type: "file", file: { filename: f.name || "analysis.pdf", file_data: `data:${f.type};base64,${f.data}` } }
    : { type: "image_url", image_url: { url: `data:${f.type};base64,${f.data}` } })];
  const headers = authHeaders(o.preset, o.conf);
  if (o.preset.id === "openrouter") headers["X-Title"] = "Electrodoctor";
  const j = await post(route(o.preset, o.conf, base + "/chat/completions"), headers, { model, temperature: 0, messages: [{ role: "user", content }] }, o.signal);
  const msg = j.choices && j.choices[0] && j.choices[0].message;
  const out = msg && (typeof msg.content === "string" ? msg.content : Array.isArray(msg.content) ? msg.content.map((p: any) => p.text || "").join("") : "");
  if (!out) throw new Error("Провайдер вернул пустой ответ. Возможно, модель не умеет читать изображения — выберите модель с поддержкой картинок (vision).");
  return out;
}
