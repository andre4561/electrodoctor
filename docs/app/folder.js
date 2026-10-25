import { tx } from "./db.js";
export const supported = typeof window.showDirectoryPicker === "function" && typeof indexedDB !== "undefined";
const HKEY = "folder";
export const state = { handle: null, name: "", granted: false };
const idb = (mode, fn) => tx("kv", mode, fn);
async function permission(handle, ask) {
    if (!handle.queryPermission)
        return true;
    const opts = { mode: "readwrite" };
    if (await handle.queryPermission(opts) === "granted")
        return true;
    return ask && !!handle.requestPermission ? await handle.requestPermission(opts) === "granted" : false;
}
export async function init() {
    if (!supported)
        return state;
    try {
        const h = await idb("readonly", s => s.get(HKEY));
        if (h) {
            state.handle = h;
            state.name = h.name;
            state.granted = await permission(h, false);
        }
    }
    catch (e) { /* нет доступа к IndexedDB — работаем без папки */ }
    return state;
}
export async function choose() {
    const h = await window.showDirectoryPicker({ id: "electrodoctor", mode: "readwrite" });
    if (!await permission(h, true))
        throw new Error("Нет разрешения на запись в папку");
    await idb("readwrite", s => s.put(h, HKEY));
    Object.assign(state, { handle: h, name: h.name, granted: true });
    return state;
}
export async function requestAccess() {
    if (!state.handle)
        return false;
    state.granted = await permission(state.handle, true);
    return state.granted;
}
export async function disconnect() {
    try {
        await idb("readwrite", s => s.delete(HKEY));
    }
    catch (e) { /* ничего */ }
    Object.assign(state, { handle: null, name: "", granted: false });
}
export const ready = () => !!(state.handle && state.granted);
const safeName = (s) => String(s || "").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().replace(/[. ]+$/, "").slice(0, 60) || "Без имени";
async function readJSON(dir, name) {
    try {
        return JSON.parse(await (await (await dir.getFileHandle(name)).getFile()).text());
    }
    catch (e) {
        return null;
    }
}
async function subfolders() {
    const names = new Map();
    for await (const [name, h] of state.handle.entries())
        if (h.kind === "directory")
            names.set(name.toLowerCase(), h);
    return names;
}
// Подпапка клиента выбирается один раз и дальше не меняется (даже если имя исправят).
async function folderFor(c) {
    if (c.folder)
        return c.folder;
    const base = safeName(c.values && c.values.NAME);
    const taken = await subfolders();
    for (let i = 1; i < 1000; i++) {
        const name = i === 1 ? base : `${base} (${i})`;
        const h = taken.get(name.toLowerCase()); // Windows не различает регистр
        if (!h)
            return name;
        const other = await readJSON(h, "client.json");
        if (other && other.id === c.id)
            return name;
    }
    return base + " " + c.id;
}
async function writeFile(dir, name, text) {
    const w = await (await dir.getFileHandle(name, { create: true })).createWritable();
    await w.write(text);
    await w.close();
}
// files: { "имя файла": "текст" }, client.json добавляется сам
export async function writeClient(c, files) {
    if (!ready())
        return null;
    c.folder = await folderFor(c);
    const dir = await state.handle.getDirectoryHandle(c.folder, { create: true });
    await writeFile(dir, "client.json", JSON.stringify(c, null, 2));
    for (const [name, text] of Object.entries(files || {}))
        await writeFile(dir, name, text);
    return c.folder;
}
export async function removeClient(c) {
    if (!ready() || !c.folder)
        return;
    const dir = (await subfolders()).get(c.folder.toLowerCase());
    const saved = dir && await readJSON(dir, "client.json");
    if (saved && saved.id === c.id)
        await state.handle.removeEntry(c.folder, { recursive: true });
}
export async function readAll() {
    const out = [];
    if (!ready())
        return out;
    for await (const [name, h] of state.handle.entries()) {
        if (h.kind !== "directory")
            continue;
        const c = await readJSON(h, "client.json");
        if (c && c.id && c.values) {
            c.folder = name;
            out.push(c);
        }
    }
    return out;
}
// Файлы анализов клиента: <папка>/<клиент>/файлы анализов/<имя файла>
const ATTACH_DIR = "файлы анализов";
async function attachDir(c, create) {
    if (!ready())
        return null;
    c.folder = await folderFor(c);
    const dir = create ? await state.handle.getDirectoryHandle(c.folder, { create: true }) : (await subfolders()).get(c.folder.toLowerCase());
    if (!dir)
        return null;
    if (create)
        return dir.getDirectoryHandle(ATTACH_DIR, { create: true });
    for await (const [name, h] of dir.entries())
        if (h.kind === "directory" && name === ATTACH_DIR)
            return h;
    return null;
}
// Возвращает имя, под которым файл записан (при совпадении добавляется « (2)»), или null, если папка не выбрана.
export async function writeAttachment(c, name, blob) {
    const dir = await attachDir(c, true);
    if (!dir)
        return null;
    const taken = new Set();
    for await (const [n] of dir.entries())
        taken.add(n.toLowerCase());
    const clean = safeName(name.replace(/\.[^.]*$/, "")), ext = (name.match(/\.[^.]*$/) || [""])[0].slice(0, 10);
    let fileName = clean + ext;
    for (let i = 2; taken.has(fileName.toLowerCase()); i++)
        fileName = `${clean} (${i})${ext}`;
    const w = await (await dir.getFileHandle(fileName, { create: true })).createWritable();
    await w.write(blob);
    await w.close();
    return fileName;
}
export async function removeAttachment(c, fileName) {
    const dir = await attachDir(c, false);
    if (dir)
        await dir.removeEntry(fileName).catch(() => undefined);
}
