// SPDX-License-Identifier: AGPL-3.0-or-later
// Электродоктор — где и как хранятся настройки (провайдеры, ключи, агенты).
//
// Где:   в этом браузере (localStorage) — по умолчанию;
//        или в выбранной папке на компьютере — файл electrodoctor-settings.json
//        (тогда в браузере остаётся только пометка, что настройки в папке).
// Как:   ключи API открытым текстом — по умолчанию;
//        или зашифрованы паролем (AES-GCM, ключ из пароля через PBKDF2). Пароль нигде не хранится:
//        после перезагрузки страницы кабинет попросит его снова, пока не попросит — ключей нет.
// Файл одного формата и в папке, и при выгрузке «Сохранить настройки в файл».
import { tx } from "./db.js";
export const FILE = "electrodoctor-settings.json";
export const FORMAT = "electrodoctor-settings";
const LS_KEY = "electrodoctor.settings.v1";
const LS_WHERE = "electrodoctor.settings.where"; // "folder" — настройки в папке
const IDB_KEY = "settingsFolder";
const ITER = 250000;
export const folderSupported = typeof window.showDirectoryPicker === "function" && typeof indexedDB !== "undefined";
export const state = {
    where: "browser",
    folderName: "",
    folderGranted: false,
    encrypted: false,
    locked: false, // зашифровано и пароль ещё не введён
    loaded: false, // настройки прочитаны (для папки — асинхронно)
    error: "",
};
let handle = null;
let cryptoKey = null;
let salt = null;
let lockedVault = null; // зашифрованные ключи, пока пароль не введён — сохраняем как есть
let data = null;
const listeners = [];
export const onChange = (f) => { listeners.push(f); };
const changed = () => listeners.forEach(f => { try {
    f();
}
catch (e) {
    console.error(e);
} });
// ---------- шифрование ----------
const b64 = (u) => { let s = ""; u.forEach(x => { s += String.fromCharCode(x); }); return btoa(s); };
const unb64 = (s) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function derive(password, saltBytes, iter) {
    const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "PBKDF2", salt: saltBytes, iterations: iter, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
async function seal(keys) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const enc = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, cryptoKey, new TextEncoder().encode(JSON.stringify(keys)));
    return { salt: b64(salt), iv: b64(iv), data: b64(new Uint8Array(enc)), iter: ITER };
}
async function open(v, key) {
    const dec = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(v.iv) }, key, unb64(v.data));
    return JSON.parse(new TextDecoder().decode(dec));
}
// ---------- сериализация ----------
async function toFile() {
    const d = data || { providers: {}, agents: [] };
    const providers = JSON.parse(JSON.stringify(d.providers));
    const out = { format: FORMAT, version: 1, providers, agents: d.agents, norms: d.norms || {}, curves: d.curves || {}, agentDefaults: d.agentDefaults, agentsRev: d.agentsRev, signs: d.signs || {}, signMethod: d.signMethod, recognizer: d.recognizer, savedAt: new Date().toISOString() };
    if (state.encrypted) {
        if (state.locked)
            out.vault = lockedVault || undefined; // ключи не знаем — оставляем старые зашифрованными
        else {
            const keys = {};
            for (const [id, c] of Object.entries(providers))
                if (c && c.apiKey)
                    keys[id] = c.apiKey;
            out.vault = await seal(keys);
        }
        for (const c of Object.values(providers))
            if (c)
                c.apiKey = "";
    }
    return out;
}
function fromFile(f) {
    if (!f || !f.providers || !Array.isArray(f.agents))
        throw new Error("это не файл настроек Электродоктора");
    data = { providers: f.providers, agents: f.agents, norms: f.norms || {}, curves: f.curves || {}, agentDefaults: f.agentDefaults, agentsRev: f.agentsRev, signs: f.signs || {}, signMethod: f.signMethod, recognizer: f.recognizer };
    cryptoKey = null;
    salt = null;
    if (f.vault) {
        state.encrypted = true;
        state.locked = true;
        lockedVault = f.vault;
        salt = unb64(f.vault.salt);
    }
    else {
        state.encrypted = false;
        state.locked = false;
        lockedVault = null;
    }
}
// ---------- запись (с задержкой, чтобы не писать на каждую букву) ----------
let timer = 0;
let writing = Promise.resolve();
export function persist() {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => { writing = writing.then(writeNow).catch(e => { state.error = (e instanceof Error && e.message) || String(e); changed(); }); }, 250);
}
export function flush() { window.clearTimeout(timer); writing = writing.then(writeNow); return writing; }
async function writeNow() {
    const f = await toFile();
    if (state.where === "folder") {
        if (!handle || !state.folderGranted)
            throw new Error("нет доступа к папке настроек — изменения пока только в памяти этой вкладки");
        const fh = await handle.getFileHandle(FILE, { create: true });
        const w = await fh.createWritable();
        await w.write(JSON.stringify(f, null, 2));
        await w.close();
    }
    else {
        try {
            localStorage.setItem(LS_KEY, JSON.stringify(f));
        }
        catch (e) {
            throw new Error("браузер не даёт сохранять настройки (приватный режим?)");
        }
    }
    if (state.error) {
        state.error = "";
        changed();
    }
}
// ---------- доступ для settings.ts ----------
export function getData() { return data; }
export function setData(d) { data = d; persist(); }
// ---------- запуск ----------
function readBrowser() {
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (raw) {
            const j = JSON.parse(raw);
            if (j && j.providers)
                fromFile({ format: FORMAT, version: 1, ...j });
        }
    }
    catch (e) { /* испорченная запись — начнём с чистых настроек */ }
}
const idb = (mode, fn) => tx("kv", mode, fn);
async function permission(h, ask) {
    if (!h.queryPermission)
        return true;
    if (await h.queryPermission({ mode: "readwrite" }) === "granted")
        return true;
    return ask && !!h.requestPermission ? await h.requestPermission({ mode: "readwrite" }) === "granted" : false;
}
async function readFolder() {
    if (!handle)
        return false;
    try {
        const f = await (await handle.getFileHandle(FILE)).getFile();
        fromFile(JSON.parse(await f.text()));
        return true;
    }
    catch (e) {
        if (e instanceof DOMException && e.name === "NotFoundError")
            return false;
        throw new Error("не удалось прочитать " + FILE + ": " + ((e instanceof Error && e.message) || e));
    }
}
// Синхронная часть: браузер читается сразу, папка — в init()
let where = "";
try {
    where = localStorage.getItem(LS_WHERE) || "";
}
catch (e) { /* нет доступа */ }
if (where === "folder" && folderSupported)
    state.where = "folder";
else {
    readBrowser();
    state.loaded = true;
}
// Настройки поменяли в другой вкладке (режим «в браузере») — перечитываем, чтобы не затереть их старой копией
window.addEventListener("storage", ev => {
    if (ev.key !== LS_KEY || state.where !== "browser" || !ev.newValue)
        return;
    const keepKey = cryptoKey, wasLocked = state.locked;
    try {
        fromFile({ format: FORMAT, version: 1, ...JSON.parse(ev.newValue) });
    }
    catch (e) {
        return;
    }
    if (keepKey && state.encrypted && lockedVault)
        unlockWith(keepKey).catch(() => { });
    else if (!wasLocked && !state.encrypted)
        state.locked = false;
    changed();
});
export async function init() {
    if (state.where !== "folder")
        return;
    try {
        handle = (await idb("readonly", s => s.get(IDB_KEY))) || null;
        if (!handle) {
            state.where = "browser";
            try {
                localStorage.removeItem(LS_WHERE);
            }
            catch (e) { /* нет */ }
            readBrowser();
            state.loaded = true;
            changed();
            return;
        }
        state.folderName = handle.name;
        state.folderGranted = await permission(handle, false);
        if (state.folderGranted) {
            await readFolder();
            state.loaded = true;
        }
    }
    catch (e) {
        state.error = (e instanceof Error && e.message) || String(e);
    }
    changed();
}
// Повторный запрос доступа к папке после перезагрузки (нужно нажатие кнопки)
export async function grant() {
    if (!handle)
        return;
    state.folderGranted = await permission(handle, true);
    if (state.folderGranted) {
        await readFolder();
        state.loaded = true;
        state.error = "";
    }
    changed();
}
// Перенести настройки в папку. Если там уже есть файл — спросить, чей брать.
export async function chooseFolder(preferFile) {
    const h = await window.showDirectoryPicker({ id: "electrodoctor-settings", mode: "readwrite" });
    if (!await permission(h, true))
        throw new Error("нет разрешения на запись в папку");
    const prev = handle;
    handle = h;
    let exists = false;
    try {
        await h.getFileHandle(FILE);
        exists = true;
    }
    catch (e) { /* файла нет */ }
    if (exists && preferFile(h.name))
        await readFolder();
    await idb("readwrite", s => s.put(h, IDB_KEY));
    state.where = "folder";
    state.folderName = h.name;
    state.folderGranted = true;
    state.loaded = true;
    try {
        localStorage.setItem(LS_WHERE, "folder");
    }
    catch (e) { /* нет */ }
    try {
        await writeNow();
    }
    catch (e) {
        handle = prev;
        throw e;
    }
    try {
        localStorage.removeItem(LS_KEY);
    }
    catch (e) { /* нет */ } // в браузере ключей больше нет
    changed();
}
// Вернуть настройки в браузер (файл в папке не удаляется)
export async function toBrowser() {
    state.where = "browser";
    handle = null;
    state.folderName = "";
    state.folderGranted = false;
    try {
        localStorage.removeItem(LS_WHERE);
    }
    catch (e) { /* нет */ }
    try {
        await idb("readwrite", s => s.delete(IDB_KEY));
    }
    catch (e) { /* нет */ }
    await writeNow();
    changed();
}
// ---------- пароль ----------
export async function enableEncryption(password) {
    salt = crypto.getRandomValues(new Uint8Array(16));
    cryptoKey = await derive(password, salt, ITER);
    state.encrypted = true;
    state.locked = false;
    lockedVault = null;
    await flush();
    changed();
}
export async function disableEncryption() {
    if (state.locked)
        throw new Error("сначала введите пароль");
    state.encrypted = false;
    cryptoKey = null;
    salt = null;
    await flush();
    changed();
}
export async function unlock(password) {
    if (!lockedVault)
        return;
    const key = await derive(password, unb64(lockedVault.salt), lockedVault.iter || ITER);
    try {
        await unlockWith(key);
    }
    catch (e) {
        throw new Error("неверный пароль");
    }
}
async function unlockWith(key) {
    if (!lockedVault)
        return;
    const keys = await open(lockedVault, key);
    cryptoKey = key;
    salt = unb64(lockedVault.salt);
    for (const [id, k] of Object.entries(keys))
        if (data && data.providers[id])
            data.providers[id].apiKey = k;
    state.locked = false;
    lockedVault = null;
    changed();
}
// ---------- выгрузка / загрузка файлом ----------
export async function exportText() { return JSON.stringify(await toFile(), null, 2); }
export async function importText(text) {
    let j;
    try {
        j = JSON.parse(text);
    }
    catch (e) {
        throw new Error("файл не читается как JSON");
    }
    if (j.format !== FORMAT)
        throw new Error("это не файл настроек Электродоктора");
    fromFile(j);
    await flush();
    changed();
}
