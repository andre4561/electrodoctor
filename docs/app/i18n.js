// SPDX-License-Identifier: AGPL-3.0-or-later
// Мультиязычность кабинета. Встроенные словари + оверлей из настроек (Настройки → Язык).
// Выбор языка — docs/assets/locale.js (кнопка в шапке, ключ electrodoctor.locale).
import { ru } from "./locales/ru.js";
import { en } from "./locales/en.js";
export const LOCALE_IDS = ["ru", "en"];
export const LOCALE_LABEL = {
    ru: "Русский",
    en: "English",
};
/** Тот же ключ, что в docs/assets/locale.js */
export const LOCALE_LS_KEY = "electrodoctor.locale";
const BUILTIN = { ru, en };
/** Свои строки поверх встроенных: locale → ключ → текст. Пустая строка в оверлее = стереть встроенное. */
let own = {};
function readStored() {
    try {
        const v = localStorage.getItem(LOCALE_LS_KEY);
        if (v === "ru" || v === "en")
            return v;
    }
    catch { /* */ }
    return "ru";
}
let locale = readStored();
export function getLocale() {
    return locale;
}
/** Синхронизация с localStorage / locale.js (без записи). */
export function syncFromStorage() {
    locale = readStored();
    return locale;
}
/** Сменить язык: пишет localStorage и дергает EDLocale, если он есть. */
export function setLocale(id) {
    if (!BUILTIN[id])
        return;
    locale = id;
    const w = window;
    if (w.EDLocale)
        w.EDLocale.set(id);
    else {
        try {
            localStorage.setItem(LOCALE_LS_KEY, id);
        }
        catch { /* */ }
        document.documentElement.setAttribute("lang", id);
        document.documentElement.setAttribute("data-locale", id);
    }
}
/** Подставить оверлей из настроек (вызывать из load/save). */
export function applyOwn(overlay) {
    own = {};
    if (!overlay)
        return;
    for (const [loc, dict] of Object.entries(overlay)) {
        if (!dict || typeof dict !== "object")
            continue;
        const clean = {};
        for (const [k, v] of Object.entries(dict)) {
            if (typeof v === "string")
                clean[k] = v;
        }
        if (Object.keys(clean).length)
            own[loc] = clean;
    }
}
export function builtinDict(id) {
    return BUILTIN[id] || {};
}
/** Все ключи (объединение встроенных словарей), по алфавиту. */
export function allKeys() {
    const set = new Set();
    for (const id of LOCALE_IDS) {
        for (const k of Object.keys(BUILTIN[id] || {}))
            set.add(k);
    }
    for (const dict of Object.values(own)) {
        for (const k of Object.keys(dict || {}))
            set.add(k);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
}
/** Эффективный словарь: встроенный + оверлей. */
export function effectiveDict(id) {
    const base = { ...(BUILTIN[id] || {}) };
    const ov = own[id];
    if (ov) {
        for (const [k, v] of Object.entries(ov)) {
            if (v === "")
                delete base[k];
            else
                base[k] = v;
        }
    }
    return base;
}
/** Есть ли своя правка ключа (отличается от встроенного или ключ только в оверлее). */
export function hasOwn(id, key) {
    return !!(own[id] && Object.prototype.hasOwnProperty.call(own[id], key));
}
/**
 * Перевод по ключу.
 * @param key стабильный ключ (value.sex.M, brief.empty…)
 * @param fallback если ключа нет — эта строка (часто уже русский label из поля)
 * @param vars подстановка {name} в шаблоне
 */
export function t(key, fallback, vars) {
    const dict = effectiveDict(locale);
    let s = dict[key];
    if (s == null || s === "") {
        if (locale !== "ru") {
            const ruDict = effectiveDict("ru");
            if (ruDict[key])
                s = ruDict[key];
        }
    }
    if (s == null || s === "")
        s = fallback != null ? fallback : key;
    if (vars) {
        for (const [k, v] of Object.entries(vars)) {
            s = s.split("{" + k + "}").join(String(v));
        }
    }
    return s;
}
// кнопка в шапке / другая вкладка
if (typeof window !== "undefined") {
    window.addEventListener("electrodoctor-locale", () => { syncFromStorage(); });
    window.addEventListener("storage", e => {
        if (e.key === LOCALE_LS_KEY)
            syncFromStorage();
    });
}
