// SPDX-License-Identifier: AGPL-3.0-or-later
// Тема сайта: light | dark. Хранится в localStorage, ставит html[data-theme].
// Кнопка: <button type="button" data-theme-toggle …> — подпись обновляется сама.
(function () {
  var KEY = "electrodoctor.theme";

  function systemDark() {
    try { return window.matchMedia("(prefers-color-scheme: dark)").matches; } catch (e) { return false; }
  }

  function stored() {
    try {
      var v = localStorage.getItem(KEY);
      return v === "light" || v === "dark" ? v : "";
    } catch (e) { return ""; }
  }

  function get() {
    return stored() || (systemDark() ? "dark" : "light");
  }

  function apply(theme) {
    var t = theme === "dark" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", t);
    var nav = document.getElementById("ed-sitenav");
    if (nav) nav.classList.toggle("dark", t === "dark");
    refreshButtons();
  }

  function set(theme) {
    var t = theme === "dark" ? "dark" : "light";
    try { localStorage.setItem(KEY, t); } catch (e) { /* */ }
    apply(t);
  }

  function toggle() {
    set(get() === "dark" ? "light" : "dark");
  }

  function icon(theme) {
    // в светлой теме показываем луну (переключить на тёмную), в тёмной — солнце
    return theme === "dark"
      ? '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>'
      : '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 14.5A8.5 8.5 0 1 1 9.5 3 7 7 0 0 0 21 14.5z"/></svg>';
  }

  function title(theme) {
    var dark = theme === "dark";
    var key = dark ? "theme.light" : "theme.dark";
    var fb = dark ? "Светлая тема" : "Тёмная тема";
    return window.EDLocale ? window.EDLocale.t(key, fb) : fb;
  }

  function buttonHtml(cls) {
    var t = get();
    return '<button type="button" class="' + (cls || "btn") + ' theme-toggle" data-theme-toggle title="' + title(t) + '" aria-label="' + title(t) + '">' + icon(t) + "</button>";
  }

  function refreshButtons() {
    var t = get();
    document.querySelectorAll("[data-theme-toggle]").forEach(function (b) {
      b.innerHTML = icon(t);
      b.title = title(t);
      b.setAttribute("aria-label", title(t));
    });
  }

  apply(get());

  document.addEventListener("click", function (e) {
    var b = e.target && e.target.closest && e.target.closest("[data-theme-toggle]");
    if (!b) return;
    e.preventDefault();
    toggle();
  });

  try {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function () {
      if (!stored()) apply(get());
    });
  } catch (e) { /* */ }

  window.addEventListener("storage", function (e) {
    if (e.key === KEY) apply(get());
  });

  window.EDTheme = { get: get, set: set, toggle: toggle, apply: apply, buttonHtml: buttonHtml, refreshButtons: refreshButtons };
})();
