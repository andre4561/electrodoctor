// SPDX-License-Identifier: AGPL-3.0-or-later
// Электродоктор — база IndexedDB этого браузера.
//   kv    — служебные значения (например, выбранная папка)
//   files — загруженные файлы анализов; ключ "<id клиента>/<id файла>", значение — Blob
const DB = "electrodoctor";
const VERSION = 2;
export type StoreName = "kv" | "files";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of ["kv", "files"]) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s);
    };
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
  });
}

export async function tx<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => { resolve(req ? req.result : (undefined as T)); db.close(); };
    t.onerror = () => { reject(t.error); db.close(); };
    t.onabort = () => { reject(t.error); db.close(); };
  });
}
