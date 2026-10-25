// SPDX-License-Identifier: AGPL-3.0-or-later
// Электродоктор — фото и файлы анализов.
// Сами файлы лежат в IndexedDB этого браузера (хранилище files, ключ "<клиент>/<файл>"),
// в анкете клиента — только список: имя, размер, дата. Если выбрана папка на компьютере,
// копия файла пишется в подпапку клиента «файлы анализов».
// Распознавание (сервер, который вытащит значения из фото) подключится позже.
import { tx } from "./db.js";
export const ACCEPT = "image/*,application/pdf";
export const MAX_SIZE = 30 * 1024 * 1024; // 30 МБ на файл
const key = (clientId, fileId) => clientId + "/" + fileId;
const newFileId = () => "f" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
export function accepted(f) {
    return f.type.startsWith("image/") || f.type === "application/pdf";
}
export async function add(clientId, file) {
    const ref = { id: newFileId(), name: file.name || "картинка.png", size: file.size, type: file.type, addedAt: new Date().toISOString() };
    await tx("files", "readwrite", s => s.put(file, key(clientId, ref.id)));
    return ref;
}
export function get(clientId, fileId) {
    return tx("files", "readonly", s => s.get(key(clientId, fileId)));
}
export function remove(clientId, fileId) {
    return tx("files", "readwrite", s => { s.delete(key(clientId, fileId)); });
}
// Все файлы клиента: ключи от "<клиент>/" до "<клиент>/￿"
export function removeAll(clientId) {
    return tx("files", "readwrite", s => { s.delete(IDBKeyRange.bound(clientId + "/", clientId + "/￿")); });
}
export function sizeText(n) {
    if (n < 1024)
        return n + " Б";
    if (n < 1024 * 1024)
        return Math.round(n / 1024) + " КБ";
    return (n / 1024 / 1024).toFixed(1).replace(".", ",") + " МБ";
}
