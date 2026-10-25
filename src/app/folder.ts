// SPDX-License-Identifier: AGPL-3.0-or-later
// Электродоктор — сохранение клиентов в выбранную папку на компьютере.
// Работает через File System Access API (Chrome, Edge, Яндекс.Браузер, Opera на компьютере).
// В выбранной папке у каждого клиента своя подпапка:
//   <папка>/<имя клиента>/client.json  — все данные (по нему кабинет загружает клиента обратно)
//                        /анкета.md    — для чтения
//                        /данные.csv   — для расчёта (engine/electrodoctor.py)
import type { Client } from "./types.js";
import { tx } from "./db.js";

type Dir = FileSystemDirectoryHandle;

export const supported = typeof window.showDirectoryPicker === "function" && typeof indexedDB !== "undefined";
const HKEY = "folder";

export const state: { handle: Dir | null; name: string; granted: boolean } = { handle: null, name: "", granted: false };

const idb = <T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>) => tx<T>("kv", mode, fn);

async function permission(handle: Dir, ask: boolean): Promise<boolean> {
  if (!handle.queryPermission) return true;
  const opts = { mode: "readwrite" as const };
  if (await handle.queryPermission(opts) === "granted") return true;
  return ask && !!handle.requestPermission ? await handle.requestPermission(opts) === "granted" : false;
}

export async function init(): Promise<typeof state> {
  if (!supported) return state;
  try {
    const h = await idb<Dir | undefined>("readonly", s => s.get(HKEY));
    if (h) { state.handle = h; state.name = h.name; state.granted = await permission(h, false); }
  } catch (e) { /* нет доступа к IndexedDB — работаем без папки */ }
  return state;
}

export async function choose(): Promise<typeof state> {
  const h = await window.showDirectoryPicker!({ id: "electrodoctor", mode: "readwrite" });
  if (!await permission(h, true)) throw new Error("Нет разрешения на запись в папку");
  await idb("readwrite", s => s.put(h, HKEY));
  Object.assign(state, { handle: h, name: h.name, granted: true });
  return state;
}

export async function requestAccess(): Promise<boolean> {
  if (!state.handle) return false;
  state.granted = await permission(state.handle, true);
  return state.granted;
}

export async function disconnect(): Promise<void> {
  try { await idb("readwrite", s => s.delete(HKEY)); } catch (e) { /* ничего */ }
  Object.assign(state, { handle: null, name: "", granted: false });
}

export const ready = (): boolean => !!(state.handle && state.granted);

const safeName = (s: unknown): string =>
  String(s || "").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().replace(/[. ]+$/, "").slice(0, 60) || "Без имени";

async function readJSON(dir: Dir, name: string): Promise<Client | null> {
  try { return JSON.parse(await (await (await dir.getFileHandle(name)).getFile()).text()); }
  catch (e) { return null; }
}

async function subfolders(): Promise<Map<string, Dir>> {
  const names = new Map<string, Dir>();
  for await (const [name, h] of state.handle!.entries()) if (h.kind === "directory") names.set(name.toLowerCase(), h as Dir);
  return names;
}

// Подпапка клиента выбирается один раз и дальше не меняется (даже если имя исправят).
async function folderFor(c: Client): Promise<string> {
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

async function writeFile(dir: Dir, name: string, text: string): Promise<void> {
  const w = await (await dir.getFileHandle(name, { create: true })).createWritable();
  await w.write(text);
  await w.close();
}

// files: { "имя файла": "текст" }, client.json добавляется сам
export async function writeClient(c: Client, files?: Record<string, string>): Promise<string | null> {
  if (!ready()) return null;
  c.folder = await folderFor(c);
  const dir = await state.handle!.getDirectoryHandle(c.folder, { create: true });
  await writeFile(dir, "client.json", JSON.stringify(c, null, 2));
  for (const [name, text] of Object.entries(files || {})) await writeFile(dir, name, text);
  return c.folder;
}

export async function removeClient(c: Client): Promise<void> {
  if (!ready() || !c.folder) return;
  const dir = (await subfolders()).get(c.folder.toLowerCase());
  const saved = dir && await readJSON(dir, "client.json");
  if (saved && saved.id === c.id) await state.handle!.removeEntry(c.folder, { recursive: true });
}

export async function readAll(): Promise<Client[]> {
  const out: Client[] = [];
  if (!ready()) return out;
  for await (const [name, h] of state.handle!.entries()) {
    if (h.kind !== "directory") continue;
    const c = await readJSON(h as Dir, "client.json");
    if (c && c.id && c.values) { c.folder = name; out.push(c); }
  }
  return out;
}

// Файлы анализов клиента: <папка>/<клиент>/файлы анализов/<имя файла>
const ATTACH_DIR = "файлы анализов";

async function attachDir(c: Client, create: boolean): Promise<Dir | null> {
  if (!ready()) return null;
  c.folder = await folderFor(c);
  const dir = create ? await state.handle!.getDirectoryHandle(c.folder, { create: true }) : (await subfolders()).get(c.folder.toLowerCase());
  if (!dir) return null;
  if (create) return dir.getDirectoryHandle(ATTACH_DIR, { create: true });
  for await (const [name, h] of dir.entries()) if (h.kind === "directory" && name === ATTACH_DIR) return h as Dir;
  return null;
}

// Возвращает имя, под которым файл записан (при совпадении добавляется « (2)»), или null, если папка не выбрана.
export async function writeAttachment(c: Client, name: string, blob: Blob): Promise<string | null> {
  const dir = await attachDir(c, true);
  if (!dir) return null;
  const taken = new Set<string>();
  for await (const [n] of dir.entries()) taken.add(n.toLowerCase());
  const clean = safeName(name.replace(/\.[^.]*$/, "")), ext = (name.match(/\.[^.]*$/) || [""])[0].slice(0, 10);
  let fileName = clean + ext;
  for (let i = 2; taken.has(fileName.toLowerCase()); i++) fileName = `${clean} (${i})${ext}`;
  const w = await (await dir.getFileHandle(fileName, { create: true })).createWritable();
  await w.write(blob);
  await w.close();
  return fileName;
}

export async function removeAttachment(c: Client, fileName: string): Promise<void> {
  const dir = await attachDir(c, false);
  if (dir) await dir.removeEntry(fileName).catch(() => undefined);
}
