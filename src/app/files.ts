// SPDX-License-Identifier: AGPL-3.0-or-later
// Электродоктор — фото и файлы анализов.
// Сами файлы лежат в IndexedDB этого браузера (хранилище files, ключ "<клиент>/<файл>"),
// в анкете клиента — только список: имя, размер, дата. Если выбрана папка на компьютере,
// копия файла пишется в подпапку клиента «файлы анализов».
// Распознавание (сервер, который вытащит значения из фото) подключится позже.
import { tx } from "./db.js";
import type { FileRef } from "./types.js";

export const ACCEPT = "image/*,application/pdf";
export const MAX_SIZE = 30 * 1024 * 1024;   // 30 МБ на файл

const key = (clientId: string, fileId: string) => clientId + "/" + fileId;
const newFileId = () => "f" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export function accepted(f: File): boolean {
  return f.type.startsWith("image/") || f.type === "application/pdf";
}

export async function add(clientId: string, file: File): Promise<FileRef> {
  const ref: FileRef = { id: newFileId(), name: file.name || "картинка.png", size: file.size, type: file.type, addedAt: new Date().toISOString() };
  await tx("files", "readwrite", s => s.put(file, key(clientId, ref.id)));
  return ref;
}

export function get(clientId: string, fileId: string): Promise<Blob | undefined> {
  return tx<Blob | undefined>("files", "readonly", s => s.get(key(clientId, fileId)));
}

export function remove(clientId: string, fileId: string): Promise<void> {
  return tx<void>("files", "readwrite", s => { s.delete(key(clientId, fileId)); });
}

// Все файлы клиента: ключи от "<клиент>/" до "<клиент>/￿"
export function removeAll(clientId: string): Promise<void> {
  return tx<void>("files", "readwrite", s => { s.delete(IDBKeyRange.bound(clientId + "/", clientId + "/￿")); });
}

export function sizeText(n: number): string {
  if (n < 1024) return n + " Б";
  if (n < 1024 * 1024) return Math.round(n / 1024) + " КБ";
  return (n / 1024 / 1024).toFixed(1).replace(".", ",") + " МБ";
}
