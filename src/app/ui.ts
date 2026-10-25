// SPDX-License-Identifier: AGPL-3.0-or-later
// Электродоктор — общие элементы интерфейса кабинета.

const esc = (s: unknown) => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" } as Record<string, string>)[c]);

// Раскрывающийся блок.
// Пример: fold("store", "Где хранятся данные", "в этом браузере", "<p>…</p>")
//   title  — текст на широкой кнопке; status — короткое состояние рядом (HTML, уже экранированный);
//   body   — содержимое (HTML); opts.open — раскрыть принудительно; opts.warn — выделить состояние красным.
// Открыт блок или свёрнут — запоминается в этом браузере отдельно для каждого id.
const FOLD_KEY = "electrodoctor.fold.";
function foldOpen(id: string): boolean | null {
  try { const v = localStorage.getItem(FOLD_KEY + id); return v === null ? null : v === "1"; } catch (e) { return null; }
}
export function fold(id: string, title: string, status: string, body: string, opts: { open?: boolean; warn?: boolean } = {}): string {
  const open = opts.open || (foldOpen(id) ?? false);
  // forced: раскрыт программой, а не человеком — такое состояние не запоминаем
  const forced = opts.open && !foldOpen(id) ? ` data-forced="1"` : "";
  return `<details class="fold${opts.warn ? " warn" : ""}" data-fold="${esc(id)}"${open ? " open" : ""}${forced}>
    <summary><span class="fold-title">${esc(title)}</span>${status ? `<span class="fold-status">${status}</span>` : ""}<span class="fold-chev" aria-hidden="true"></span></summary>
    <div class="fold-body">${body}</div>
  </details>`;
}
document.addEventListener("toggle", ev => {
  const d = ev.target as HTMLElement;
  if (!(d instanceof HTMLDetailsElement) || !d.dataset.fold) return;
  if (d.dataset.forced) { delete d.dataset.forced; return; }   // это первое событие при показе блока
  try { localStorage.setItem(FOLD_KEY + d.dataset.fold, d.open ? "1" : "0"); } catch (e) { /* не страшно */ }
}, true);
