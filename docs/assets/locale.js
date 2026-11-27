// SPDX-License-Identifier: AGPL-3.0-or-later
// Язык сайта: ru | en. Хранится в localStorage, ставит html[lang] и html[data-locale].
// Кнопка: <button type="button" data-locale-toggle …> — подпись обновляется сама.
// Подписи шапки: t("nav.*") и элементы [data-i18n="nav.home"].
// Те же ключи nav.* — в src/app/locales/{ru,en}.ts (кабинет / Настройки → Язык).
// Подключать рядом с theme.js (до sitenav.js).
(function () {
  var KEY = "electrodoctor.locale";
  var IDS = ["ru", "en"];

  // Шапка и главная (дублирует ключи из locales/*.ts — держать синхронно).
  var DICTS = {
    ru: {
      "nav.brand": "Электродоктор",
      "nav.home": "Главная",
      "nav.clients": "Клиенты",
      "nav.settings": "Настройки",
      "nav.info": "Информация",
      "nav.help": "Помощь",
      "nav.sections": "Разделы сайта",
      "home.title": "Электродоктор",
      "home.lead": "Открытая система поддержки диагностики: анализы и жалобы на входе — прозрачный расчёт — вероятные диагнозы и следующий самый полезный анализ.",
      "home.choices": "Разделы",
      "home.app.title": "Приложение",
      "home.app.body": "Кабинет: клиенты, анкеты по этапам, анализы и подсказки расчёта. Данные хранятся только у вас — в браузере или в выбранной папке.",
      "home.app.go": "Открыть приложение",
      "home.note": "Исследовательский проект, не медицинское изделие. Не для самодиагностики.",
      "home.github": "Репозиторий на GitHub",
      "home.footer": "Код — GNU AGPL v3, данные — CC BY-SA 4.0.",
      "articles.title": "Статьи",
      "articles.lead": "{n} {word} в {sections} разделах. Выберите раздел, чтобы открыть список статей.",
      "articles.word.one": "статья",
      "articles.word.few": "статьи",
      "articles.word.many": "статей",
      "articles.sec.diagnoses": "Диагнозы",
      "articles.sec.diagnoses.desc": "Болезни: причины, диагностика, лечение",
      "articles.sec.lab-tests": "Анализы",
      "articles.sec.lab-tests.desc": "Показатели крови и других тестов",
      "articles.sec.exams": "Осмотры",
      "articles.sec.exams.desc": "Как провести и оценить признак осмотра",
      "articles.sec.supplements": "БАДы",
      "articles.sec.supplements.desc": "Витамины, минералы, растения",
      "articles.sec.peptides": "Пептиды",
      "articles.sec.peptides.desc": "Регуляторные и исследуемые пептиды",
      "articles.sec.probiotics": "Пробиотики",
      "articles.sec.probiotics.desc": "Штаммы бактерий и дрожжей",
      "articles.sec.drugs": "Лекарства",
      "articles.sec.drugs.desc": "Препараты и их действие",
      "articles.sec.general": "Общие статьи",
      "articles.sec.general.desc": "Клетка, метаболизм, долголетие",
      "articles.sec.therapy": "Терапия",
      "articles.sec.therapy.desc": "Физические и клеточные методы",
      "articles.sec.practices": "Философия и практики",
      "articles.sec.practices.desc": "Дыхание, питание, энергия",
      "articles.sec.education": "Образование",
      "articles.sec.education.desc": "Обзоры групп заболеваний"
    },
    en: {
      "nav.brand": "Electrodoctor",
      "nav.home": "Home",
      "nav.clients": "Clients",
      "nav.settings": "Settings",
      "nav.info": "Information",
      "nav.help": "Help",
      "nav.sections": "Site sections",
      "home.title": "Electrodoctor",
      "home.lead": "An open diagnostic support system: labs and symptoms in — transparent calculation — likely diagnoses and the next most useful test.",
      "home.choices": "Sections",
      "home.app.title": "App",
      "home.app.body": "Cabinet: clients, multi-step forms, labs, and calculation hints. Your data stays only with you — in the browser or a folder you choose.",
      "home.app.go": "Open the app",
      "home.note": "Research project, not a medical device. Not for self-diagnosis.",
      "home.github": "GitHub repository",
      "home.footer": "Code — GNU AGPL v3, data — CC BY-SA 4.0.",
      "articles.title": "Articles",
      "articles.lead": "{n} {word} in {sections} sections. Choose a section to open the list.",
      "articles.word.one": "article",
      "articles.word.few": "articles",
      "articles.word.many": "articles",
      "articles.sec.diagnoses": "Diagnoses",
      "articles.sec.diagnoses.desc": "Diseases: causes, diagnosis, treatment",
      "articles.sec.lab-tests": "Lab tests",
      "articles.sec.lab-tests.desc": "Blood markers and other tests",
      "articles.sec.exams": "Exams",
      "articles.sec.exams.desc": "How to perform and score exam findings",
      "articles.sec.supplements": "Supplements",
      "articles.sec.supplements.desc": "Vitamins, minerals, herbs",
      "articles.sec.peptides": "Peptides",
      "articles.sec.peptides.desc": "Regulatory and research peptides",
      "articles.sec.probiotics": "Probiotics",
      "articles.sec.probiotics.desc": "Bacterial and yeast strains",
      "articles.sec.drugs": "Drugs",
      "articles.sec.drugs.desc": "Medicines and how they work",
      "articles.sec.general": "General",
      "articles.sec.general.desc": "Cell, metabolism, longevity",
      "articles.sec.therapy": "Therapy",
      "articles.sec.therapy.desc": "Physical and cellular methods",
      "articles.sec.practices": "Philosophy & practices",
      "articles.sec.practices.desc": "Breathing, nutrition, energy",
      "articles.sec.education": "Education",
      "articles.sec.education.desc": "Overviews of disease groups"
    }
  };

  function stored() {
    try {
      var v = localStorage.getItem(KEY);
      return IDS.indexOf(v) >= 0 ? v : "";
    } catch (e) { return ""; }
  }

  function get() {
    return stored() || "ru";
  }

  function t(key, fallback, vars) {
    var loc = get();
    var dict = DICTS[loc] || DICTS.ru;
    var s = dict[key];
    if (s == null || s === "") s = (DICTS.ru && DICTS.ru[key]) || fallback || key;
    if (vars) {
      Object.keys(vars).forEach(function (k) {
        s = String(s).split("{" + k + "}").join(String(vars[k]));
      });
    }
    return s;
  }

  function ruPlural(n) {
    var abs = Math.abs(n) % 100, d = abs % 10;
    if (abs > 10 && abs < 20) return "many";
    if (d === 1) return "one";
    if (d >= 2 && d <= 4) return "few";
    return "many";
  }

  function articleWord(n) {
    return t("articles.word." + ruPlural(n), n === 1 ? "статья" : "статей");
  }

  function refreshI18n() {
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      var key = el.getAttribute("data-i18n");
      if (!key) return;
      if (key === "articles.lead") {
        var n = +(el.getAttribute("data-n") || 0);
        var sections = el.getAttribute("data-sections") || "";
        el.textContent = t(key, "", { n: n, sections: sections, word: articleWord(n) });
        return;
      }
      el.textContent = t(key);
    });
    document.querySelectorAll("[data-i18n-count]").forEach(function (el) {
      var n = +(el.getAttribute("data-i18n-count") || 0);
      el.textContent = n + " " + articleWord(n);
    });
    document.querySelectorAll("[data-i18n-aria]").forEach(function (el) {
      var key = el.getAttribute("data-i18n-aria");
      if (key) el.setAttribute("aria-label", t(key));
    });
    var titleKey = document.documentElement.getAttribute("data-i18n-title");
    if (titleKey) document.title = t(titleKey);
    var help = helpFile(get());
    document.querySelectorAll("[data-help-link]").forEach(function (a) {
      var prefix = a.getAttribute("data-help-link") || "";
      a.setAttribute("href", prefix + help);
    });
  }

  function apply(id) {
    var loc = IDS.indexOf(id) >= 0 ? id : "ru";
    document.documentElement.setAttribute("lang", loc);
    document.documentElement.setAttribute("data-locale", loc);
    refreshButtons();
    refreshI18n();
  }

  /** Имя файла помощи для языка (длинный текст — отдельные страницы, не locale-словарь). */
  function helpFile(loc) {
    return (loc || get()) === "en" ? "help.en.html" : "help.ru.html";
  }

  function onHelpPage() {
    return /\/help(\.(ru|en))?\.html$/i.test((location.pathname || "").replace(/\\/g, "/"));
  }

  function set(id) {
    var loc = IDS.indexOf(id) >= 0 ? id : "ru";
    var wasHelp = onHelpPage();
    try { localStorage.setItem(KEY, loc); } catch (e) { /* */ }
    apply(loc);
    try {
      window.dispatchEvent(new CustomEvent("electrodoctor-locale", { detail: { locale: loc } }));
    } catch (e) { /* */ }
    // длинная помощь — отдельные файлы; при смене языка открыть парную страницу
    if (wasHelp) {
      var next = helpFile(loc);
      var cur = (location.pathname || "").split("/").pop() || "";
      if (cur.toLowerCase() !== next.toLowerCase()) {
        location.assign(next + (location.hash || ""));
      }
    }
  }

  function toggle() {
    set(get() === "en" ? "ru" : "en");
  }

  // как у темы: на кнопке — куда переключимся
  function label(loc) {
    return loc === "en" ? "RU" : "EN";
  }

  function title(loc) {
    return loc === "en" ? "Русский" : "English";
  }

  function buttonHtml(cls) {
    var loc = get();
    // только data-locale-toggle: клик ловит document-listener ниже (как у theme.js).
    // inline onclick + listener = два toggle подряд → язык «не меняется».
    return '<button type="button" class="' + (cls || "btn") + ' locale-toggle" data-locale-toggle title="' + title(loc) + '" aria-label="' + title(loc) + '">' + label(loc) + "</button>";
  }

  function refreshButtons() {
    var loc = get();
    document.querySelectorAll("[data-locale-toggle]").forEach(function (b) {
      b.textContent = label(loc);
      b.title = title(loc);
      b.setAttribute("aria-label", title(loc));
    });
  }

  apply(get());

  document.addEventListener("click", function (e) {
    var b = e.target && e.target.closest && e.target.closest("[data-locale-toggle]");
    if (!b) return;
    e.preventDefault();
    toggle();
  });

  window.addEventListener("storage", function (e) {
    if (e.key === KEY) apply(get());
  });

  window.EDLocale = {
    get: get, set: set, toggle: toggle, apply: apply, t: t, helpFile: helpFile,
    buttonHtml: buttonHtml, refreshButtons: refreshButtons, refreshI18n: refreshI18n, KEY: KEY
  };
})();
