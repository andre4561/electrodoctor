// SPDX-License-Identifier: AGPL-3.0-or-later
// Электродоктор — сохранение клиентов в выбранную папку на компьютере.
// Работает через File System Access API (Chrome, Edge, Яндекс.Браузер, Opera на компьютере).
// В выбранной папке у каждого клиента своя подпапка:
//   <папка>/<имя клиента>/client.json  — все данные (по нему кабинет загружает клиента обратно)
//                        /анкета.md    — для чтения
//                        /данные.csv   — для расчёта (engine/electrodoctor.py)
(function (root) {
  "use strict";

  const supported = typeof root.showDirectoryPicker === "function" && typeof indexedDB !== "undefined";
  const DB = "electrodoctor", STORE = "kv", HKEY = "folder";
  const state = { handle: null, name: "", granted: false };

  function idb(mode, fn) {
    return new Promise((resolve, reject) => {
      const open = indexedDB.open(DB, 1);
      open.onupgradeneeded = () => open.result.createObjectStore(STORE);
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const tx = open.result.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => { resolve(req && req.result); open.result.close(); };
        tx.onerror = () => { reject(tx.error); open.result.close(); };
      };
    });
  }

  async function permission(handle, ask) {
    if (!handle.queryPermission) return true;
    const opts = { mode: "readwrite" };
    if (await handle.queryPermission(opts) === "granted") return true;
    return ask ? await handle.requestPermission(opts) === "granted" : false;
  }

  async function init() {
    if (!supported) return state;
    try {
      const h = await idb("readonly", s => s.get(HKEY));
      if (h) { state.handle = h; state.name = h.name; state.granted = await permission(h, false); }
    } catch (e) { /* нет доступа к IndexedDB — работаем без папки */ }
    return state;
  }

  async function choose() {
    const h = await root.showDirectoryPicker({ id: "electrodoctor", mode: "readwrite" });
    if (!await permission(h, true)) throw new Error("Нет разрешения на запись в папку");
    await idb("readwrite", s => s.put(h, HKEY));
    Object.assign(state, { handle: h, name: h.name, granted: true });
    return state;
  }

  async function requestAccess() {
    if (!state.handle) return false;
    state.granted = await permission(state.handle, true);
    return state.granted;
  }

  async function disconnect() {
    try { await idb("readwrite", s => s.delete(HKEY)); } catch (e) { /* ничего */ }
    Object.assign(state, { handle: null, name: "", granted: false });
  }

  const ready = () => !!(state.handle && state.granted);
  const safeName = s => (String(s || "").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().replace(/[. ]+$/, "").slice(0, 60)) || "Без имени";

  async function readJSON(dir, name) {
    try { return JSON.parse(await (await (await dir.getFileHandle(name)).getFile()).text()); }
    catch (e) { return null; }
  }

  async function subfolders() {
    const names = new Map();
    for await (const [name, h] of state.handle.entries()) if (h.kind === "directory") names.set(name.toLowerCase(), h);
    return names;
  }

  // Подпапка клиента выбирается один раз и дальше не меняется (даже если имя исправят).
  async function folderFor(c) {
    if (c.folder) return c.folder;
    const base = safeName(c.values && c.values.NAME);
    const taken = await subfolders();
    for (let i = 1; i < 1000; i++) {
      const name = i === 1 ? base : `${base} (${i})`;
      const h = taken.get(name.toLowerCase());   // Windows не различает регистр
      if (!h) return name;
      const other = await readJSON(h, "client.json");
      if (other && other.id === c.id) return name;
    }
    return base + " " + c.id;
  }

  async function writeFile(dir, name, text) {
    const w = await (await dir.getFileHandle(name, { create: true })).createWritable();
    await w.write(text);
    await w.close();
  }

  // files: { "имя файла": "текст" }, client.json добавляется сам
  async function writeClient(c, files) {
    if (!ready()) return null;
    c.folder = await folderFor(c);
    const dir = await state.handle.getDirectoryHandle(c.folder, { create: true });
    await writeFile(dir, "client.json", JSON.stringify(c, null, 2));
    for (const [name, text] of Object.entries(files || {})) await writeFile(dir, name, text);
    return c.folder;
  }

  async function removeClient(c) {
    if (!ready() || !c.folder) return;
    const dir = (await subfolders()).get(c.folder.toLowerCase());
    const saved = dir && await readJSON(dir, "client.json");
    if (saved && saved.id === c.id) await state.handle.removeEntry(c.folder, { recursive: true });
  }

  async function readAll() {
    const out = [];
    if (!ready()) return out;
    for await (const [name, h] of state.handle.entries()) {
      if (h.kind !== "directory") continue;
      const c = await readJSON(h, "client.json");
      if (c && c.id && c.values) { c.folder = name; out.push(c); }
    }
    return out;
  }

  root.EDFolder = { supported, state, init, choose, requestAccess, disconnect, ready, writeClient, removeClient, readAll };
})(this);
