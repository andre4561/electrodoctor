// SPDX-License-Identifier: AGPL-3.0-or-later
// Электродоктор — база IndexedDB этого браузера.
//   kv    — служебные значения (например, выбранная папка)
//   files — загруженные файлы анализов; ключ "<id клиента>/<id файла>", значение — Blob
const DB = "electrodoctor";
const VERSION = 2;
function open() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB, VERSION);
        req.onupgradeneeded = () => {
            const db = req.result;
            for (const s of ["kv", "files"])
                if (!db.objectStoreNames.contains(s))
                    db.createObjectStore(s);
        };
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve(req.result);
    });
}
export async function tx(store, mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        t.oncomplete = () => { resolve(req ? req.result : undefined); db.close(); };
        t.onerror = () => { reject(t.error); db.close(); };
        t.onabort = () => { reject(t.error); db.close(); };
    });
}
