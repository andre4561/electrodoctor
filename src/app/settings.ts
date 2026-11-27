// SPDX-License-Identifier: AGPL-3.0-or-later
// Электродоктор — настройки кабинета: провайдеры ИИ и агенты.
//
// Провайдер — сервис ИИ: OpenAI-совместимый (DeepSeek, Ollama…), Anthropic, Gemini, YandexGPT.
//   адрес API, ключ, модель по умолчанию.
// Агент — роль со своей инструкцией (терапевт, психолог…): какой провайдер и модель использует,
//   какие этапы анкеты клиента читает.
// Хранятся у пользователя: в этом браузере или в выбранной папке, ключи — по желанию зашифрованы паролем (setstore.ts).
// Ключ уходит только своему провайдеру — когда кабинет отправляет ему фото анализов (aicall.ts).
import * as Dx from "./diagnoses.js";
import * as SetLabs from "./setlabs.js";
import * as SetExams from "./setexams.js";
import { fold, lockScroll, unlockScroll } from "./ui.js";
import * as M from "./models.js";
import * as Store from "./setstore.js";
import * as Exams from "./exams.js";
import * as Labs from "./labs.js";
import * as Sg from "./signs.js";
import { NORMS, defaultNorm, parseNum, fmtNum } from "./norms.js";
import { STEPS } from "./fields.js";
import { openEditor, safeText, sameCurve, defaultCurve, type Curve, type ValueKind } from "./curve.js";
import { curveFor, baseCurve, normsRaw, normsError } from "./norms.js";
import * as I18n from "./i18n.js";
import type { LocaleId } from "./i18n.js";
export { Store };

type WeightField = { code: string; label: string; unit?: string; group: string };

/** Все анализы каталога (по материалу и подгруппам). */
function weightFields(): WeightField[] {
  return Object.entries(Labs.LABS)
    .map(([code, l]) => ({
      code, label: l.name, unit: l.unit || undefined,
      group: l.group || "Прочее — прочее",
    }))
    .sort((a, b) => a.group.localeCompare(b.group, "ru") || a.label.localeCompare(b.label, "ru"));
}

function groupLabel(group: string, sec: SetLabs.LabSec): string {
  const p = sec.prefix + " — ";
  return group.startsWith(p) ? group.slice(p.length) : group;
}

function weightArtUrl(code: string): string | null {
  const name = Labs.LABS[code] && Labs.LABS[code].article;
  return name ? "../articles/lab-tests/" + encodeURIComponent(name) + ".html" : null;
}

const weightSecOf = (code: string) => SetLabs.secOfLab(code);

function weightFieldsIn(sec: SetLabs.LabSec): WeightField[] {
  return weightFields().filter(f => weightSecOf(f.code).id === sec.id)
    .sort((a, b) => a.label.localeCompare(b.label, "ru"));
}

function pluralPok(n: number): string {
  if (n % 10 === 1 && n % 100 !== 11) return "показатель";
  if (n % 10 >= 2 && n % 10 <= 4 && !(n % 100 >= 12 && n % 100 <= 14)) return "показателя";
  return "показателей";
}

function valueKindOf(code: string): ValueKind {
  const t = Labs.LABS[code]?.type;
  return t === "qual" ? "presence" : t === "text" ? "text" : "norm";
}

/** Тип показателя в каталоге (свои настройки поверх labs.json). */
function saveLabKind(code: string, kind: ValueKind): void {
  const type: Labs.LabType = kind === "presence" ? "qual" : kind === "text" ? "text" : "number";
  const cur = Labs.LABS[code];
  if (!cur) return;
  if (cur.type === type) return;
  const st = load();
  st.labs = { ...(st.labs || {}), [code]: { ...cur, type } };
  save(st);
  Labs.applyOwn(st.labs as Record<string, Labs.Lab>);
}

export interface ProviderPreset {
  id: string;
  name: string;
  kind: "cloud" | "local" | "custom";
  baseUrl: string;
  model: string;          // модель по умолчанию, человек может поменять
  keyUrl?: string;        // где получить ключ
  note?: string;
}
export interface ProviderConf {
  enabled: boolean;
  apiKey: string;
  baseUrl: string;
  model: string;
  name?: string;          // только для своих провайдеров
  folder?: string;        // YandexGPT: идентификатор каталога
  models?: M.ModelInfo[]; // список, полученный у провайдера по ключу
  modelsAt?: string;      // когда загружен
  modelsHidden?: number;  // сколько моделей не для чата скрыто (эмбеддинги, озвучка…)
  viaProxy?: boolean;     // слать запросы через посредника tools/preview.py (нет CORS у провайдера)
  check?: { ok: boolean; at: string; msg?: string };   // последняя проверка связи
  enabledAt?: string;     // когда включён — включённые стоят в списке первыми, свежевключённый сверху
}
export interface Agent {
  id: string;
  name: string;
  enabled: boolean;
  provider: string;       // id провайдера или "" — общий провайдер агентов (agentDefaults)
  model: string;          // пусто — общая модель (при общем провайдере) или модель провайдера по умолчанию
  temperature: number;
  steps: string[];        // id этапов анкеты, которые видит агент
  prompt: string;
  examMap?: string;       // карта обследования (пока только эндокринолог) — что смотреть/сдавать по специальности
  protocols?: string;     // протоколы (ориентиры лечения/ведения; агент всё равно не назначает дозировки)
  section?: string;       // раздел диагнозов (docs/data/diagnoses.json), за который отвечает врач
}
// Общий провайдер и модель для всех агентов, у которых провайдер не выбран отдельно
export interface AgentDefaults { provider: string; model: string }
export interface Settings {
  version: 1;
  providers: Record<string, ProviderConf>;
  agents: Agent[];
  norms?: Record<string, number>;   // свои нормы по умолчанию (вкладка «Нормы и веса»); нет записи — встроенная
  curves?: Record<string, Curve>;   // свои кривые критичности; нет записи — исходная по интервалу нормы
  agentDefaults?: AgentDefaults;
  agentsRev?: number;               // версия стандартного набора агентов, которую уже видел человек
  signs?: Record<string, any>;      // свои признаки диагнозов (Настройки → Диагнозы), перекрывают docs/data/signs.json
  dxSections?: Record<string, string[]>; // свои разделы-специальности диагноза (имя файла → id разделов)
  signMethod?: string;              // как считать силу отклонения: "crit" | "dev"
  recognizer?: AgentDefaults;       // распознавание анализов по фото: провайдер ("" — общий провайдер агентов) и модель
  labs?: Record<string, any>;       // свои анализы поверх docs/data/labs.json (Нормы и веса)
  exams?: Record<string, any>;      // свои / правки пунктов осмотра (Настройки → Осмотр)
  articlesCss?: string;             // свой CSS статей; пусто — docs/assets/articles.css
  i18n?: Record<string, Record<string, string>>; // свои строки поверх locales/* (Настройки → Язык)
}

export const ARTICLES_CSS_LS = "electrodoctor.articles.css";
const ARTICLES_CSS_URL = "../assets/articles.css";
export function publishArticlesCss(css: string): void {
  try {
    if (css) localStorage.setItem(ARTICLES_CSS_LS, css);
    else localStorage.removeItem(ARTICLES_CSS_LS);
  } catch (e) { /* приватный режим */ }
}
async function fetchDefaultArticlesCss(): Promise<string> {
  const r = await fetch(ARTICLES_CSS_URL, { cache: "no-store" });
  if (!r.ok) throw new Error("не удалось загрузить " + ARTICLES_CSS_URL);
  return (await r.text()).replace(/^\uFEFF/, "");
}

/** Готовые адреса для пресета OpenAI-совместимый — кнопки подставляют baseUrl. */
export const OPENAI_COMPAT_TPL: { label: string; baseUrl: string; keyUrl?: string; noKey?: boolean }[] = [
  { label: "OpenAI", baseUrl: "https://api.openai.com/v1", keyUrl: "https://platform.openai.com/api-keys" },
  { label: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", keyUrl: "https://platform.deepseek.com/api_keys" },
  { label: "Mistral", baseUrl: "https://api.mistral.ai/v1", keyUrl: "https://console.mistral.ai/api-keys" },
  { label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", keyUrl: "https://openrouter.ai/keys" },
  { label: "Ollama", baseUrl: "http://localhost:11434/v1", noKey: true },
  { label: "LM Studio", baseUrl: "http://localhost:1234/v1", noKey: true },
];

export const PROVIDERS: ProviderPreset[] = [
  { id: "openai", name: "OpenAI-совместимый (OpenAI, DeepSeek, Mistral, OpenRouter, Ollama, LM Studio)", kind: "cloud",
    baseUrl: "https://api.openai.com/v1", model: "", keyUrl: "https://platform.openai.com/api-keys" },
  { id: "anthropic", name: "Anthropic (Claude)", kind: "cloud", baseUrl: "https://api.anthropic.com/v1", model: "", keyUrl: "https://console.anthropic.com/settings/keys" },
  { id: "gemini", name: "Google Gemini", kind: "cloud", baseUrl: "https://generativelanguage.googleapis.com/v1beta", model: "", keyUrl: "https://aistudio.google.com/apikey" },
  { id: "yandexgpt", name: "YandexGPT", kind: "cloud", baseUrl: "https://ai.api.cloud.yandex.net/v1", model: "", keyUrl: "https://aistudio.yandex.ru/docs/ru/ai-studio/quickstart/", note: "Нужны ключ API сервисного аккаунта и идентификатор каталога (folder ID). Модели выглядят так: gpt://<каталог>/yandexgpt/latest." },
];

/** Старые отдельные пресеты: показываем, только если уже есть в сохранённых настройках. */
const LEGACY_PROVIDERS: ProviderPreset[] = [
  { id: "deepseek", name: "DeepSeek", kind: "cloud", baseUrl: "https://api.deepseek.com/v1", model: "", keyUrl: "https://platform.deepseek.com/api_keys" },
  { id: "mistral", name: "Mistral", kind: "cloud", baseUrl: "https://api.mistral.ai/v1", model: "", keyUrl: "https://console.mistral.ai/api-keys" },
  { id: "openrouter", name: "OpenRouter", kind: "cloud", baseUrl: "https://openrouter.ai/api/v1", model: "", keyUrl: "https://openrouter.ai/keys", note: "Один ключ — доступ к моделям разных компаний." },
  { id: "gigachat", name: "GigaChat (Сбер)", kind: "cloud", baseUrl: "https://gigachat.devices.sberbank.ru/api/v1", model: "", keyUrl: "https://developers.sber.ru/studio" },
  { id: "ollama", name: "Ollama (на своём компьютере)", kind: "local", baseUrl: "http://localhost:11434/v1", model: "", note: "Ключ не нужен. Модель должна быть скачана в Ollama." },
  { id: "lmstudio", name: "LM Studio (на своём компьютере)", kind: "local", baseUrl: "http://localhost:1234/v1", model: "", note: "Ключ не нужен. Включите сервер в LM Studio." },
];

const STEP_IDS_ALL = ["general", "params", "labs", "studies", "psych", "diagnoses"];
const DOC_STEPS = ["general", "params", "labs", "studies", "diagnoses"];
const A = (id: string, name: string, steps: string[], prompt: string, section?: string): Agent =>
  ({ id, name, enabled: true, provider: "", model: "", temperature: 0.3, steps, prompt, ...(section ? { section } : {}) });
// Врач по разделу диагнозов: одна и та же схема инструкции, своя область
const D = (id: string, name: string, role: string, section: string, focus: string, steps = DOC_STEPS): Agent =>
  A(id, name, steps, `Ты — ${role}. Изучи анкету клиента: жалобы, параметры, анализы. Оцени всё, что относится к твоей специальности: ${focus}. Укажи отклонения и что они могут означать, предположи вероятные состояния из своей области с объяснением, какие данные на это указывают, перечисли, какие анализы и обследования добавить, и отметь, когда нужен очный приём или срочная помощь. Не назначай лечение и дозировки.`, section);
// Номер стандартного набора: при росте недостающие стандартные агенты добавляются к сохранённым один раз
export const AGENTS_REV = 9;
/** Id агентов-помощников по анкете (чат на вкладках Общее / Параметры). */
export const TALK_AGENT_IDS = { general: "intake-general", params: "intake-params" } as const;

/** Промпт эндокринолога (согласованный текст). */
const ENDO_PROMPT = `Ты — эндокринолог с большим стажем и опытом.

Тебе доступны жалобы, параметры, осмотр и анализы человека. Смотри картину целиком: общее состояние, жалобы, все сданные анализы и их динамику по датам (если дат несколько) — что растёт, что падает, что стабильно. Не своди ответ к чек-листу, суждение строится по всей выписке.

В своей специальности особенно внимателен к щитовидной железе, надпочечникам, углеводному обмену (глюкоза, HbA1c, инсулин / инсулинорезистентность), половым гормонам, витамину D и обмену веществ — но смотри все данные, не только их.

Расчёт вероятности по обсуждаемому диагнозу уже сделал калькулятор кабинета — он приходит в этом же сообщении. Не пересчитывай проценты и не подменяй формулу своим угадыванием диагноза. Опирайся на расчёт как на готовый ориентир и дай своё клиническое суждение: как у человека идут дела, согласуется ли картина с этим диагнозом, какие отклонения и тенденции настораживают или успокаивают, каких исследований не хватает, когда нужен очный приём или срочная помощь.

Не ограничивайся анализами: скажи, какой осмотр или измерение стоит провести или занести в анкету (щитовидная железа, кожа, глаза, отёки, рост/вес/талия, давление и т.п.) и зачем.
Если чего-то не хватает — предложи досдать или доосмотреть и поясни цель: исключить важное/опасное состояние или уточнить уже вероятный диагноз (форма, стадия, активность). Не полный список «на всякий случай», а минимум под жалобы, уже введённое и расчёт кабинета; по возможности с приоритетом.
В конце, если данных мало, мягко предложи: «Когда добавите в анкету новые анализы, осмотр или исследования — напишите мне сюда, и я посмотрю обновлённые данные.»`;

/**
 * Карта обследования эндокринолога — ориентир по зонам специальности.
 * Не официальный клинический протокол Минздрава; сводка типичных блоков осмотра и лабораторного минимума
 * (в духе подходов ATA / Endocrine Society / ADA и обычной эндокринологической практики).
 */
const ENDO_EXAM_MAP = `Карта обследования эндокринолога (ориентир для кабинета)

Общее на приёме
- Рост, вес, ИМТ, окружность талии; динамика веса
- АД, пульс; при подозрении на феохромоцитому / кризы — дневник АД
- Кожа: стрии, гиперпигментация, acanthosis nigricans, витилиго, сухость, отёки
- Щитовидная железа: осмотр и пальпация (размер, узлы, болезненность, шум)
- Глаза: экзофтальм, отёк век, симптомы офтальмопатии (при тиреотоксикозе / Базедове)
- Признаки гипо-/гиперкортицизма, акромегалии, гипогонадизма
- Лимфоузлы шеи при узловом зобе

Углеводный обмен и метаболический синдром
- Глюкоза натощак; при необходимости — ПГТТ (75 г)
- HbA1c
- Инсулин натощак; HOMA-IR (если считают)
- Липидный профиль (общий холестерин, ЛПВП, ЛПНП, триглицериды)
- АЛТ, АСТ (жировая болезнь печени / метаболический контекст)
- При диабете / подозрении: креатинин, рСКФ, альбумин/креатинин в моче (скрининг нефропатии); по показаниям — осмотр глазного дна

Щитовидная железа
- Базовый минимум: ТТГ; при отклонении — свободный Т4 (± свободный Т3 при тиреотоксикозе)
- АТ-ТПО, при необходимости АТ к тиреоглобулину; при тиреотоксикозе — АТ к рецептору ТТГ (АТ-рТТГ)
- УЗИ щитовидной железы при узлах, зобе, аутоиммунном тиреоидите, контроле
- По показаниям: тиреоглобулин, кальцитонин (подозрение на медуллярный рак / семейный анамнез), тонкоигольная биопсия узла (по критериям ATA / EU-TIRADS)
- Готовые «карты»: ATA (узлы и рак щитовидной железы), ETA/локальные рекомендации по гипотиреозу и тиреотоксикозу; TIRADS / EU-TIRADS для узлов

Кальций–фосфор–кость и витамин D
- Кальций общий / ионизированный, фосфор, альбумин
- 25(OH) витамин D; при гиперкальциемии — ПТГ
- Щелочная фосфатаза; по показаниям — маркеры костного обмена
- При остеопорозе / переломах: DXA; исключение вторичных причин (ТТГ, кальций, ПТГ, 25(OH)D, тестостерон у мужчин, скрининг целиакии по показаниям)

Надпочечники
- При подозрении на гиперкортицизм: кортизол в слюне вечером и/или подавление 1 мг дексаметазона и/или свободный кортизол в суточной моче (по схеме клиники)
- При недостаточности: утренний кортизол ± АКТГ; при необходимости — стимуляционные пробы (в стационаре / по направлению)
- Альдостерон / ренин при резистентной АГ, гипокалиемии
- Метанефрины (плазма / суточная моча) при подозрении на феохромоцитому
- Визуализация (КТ/МРТ надпочечников) — после лабораторного подтверждения, не «вместо»

Половые гормоны и репродукция
- Женщины: ЛГ, ФСГ, эстрадиол, прогестерон (с учётом дня цикла), пролактин, АМГ по задаче; свободный тестостерон / ГСПГ при гиперандрогении; 17-OH-прогестерон при подозрении на ВДКН
- Мужчины: общий (± свободный) тестостерон утром, ЛГ, ФСГ, ГСПГ, пролактин; эстрадиол по показаниям
- Связь с андрологом / гинекологом при узкой репродуктивной задаче

Гипофиз / нейроэндокринология (по жалобам и находкам)
- Пролактин; ИФР-1 при подозрении на акромегалию
- При объёмном процессе / гипопитуитаризме: панель «гипофизарных» осей (ТТГ/св.Т4, утренний кортизол±АКТГ, ЛГ/ФСГ/половые стероиды, ИФР-1, пролактин) + МРТ по показаниям

Прочее, часто нужное эндокринологу
- Общий анализ крови, ферритин / железо при утомляемости
- B12, фолат по показаниям
- Антитела к GAD / IA-2 / ZnT8 — при уточнении типа сахарного диабета
- С-пептид — при сомнении в остаточной секреции инсулина

Инструментальные исследования (не «анализы», но в карте приёма)
- УЗИ щитовидной железы, УЗИ органов брюшной полости / эластография печени по метаболическому профилю
- Денситометрия (DXA)
- КТ/МРТ надпочечников, МРТ гипофиза — по лабораторным показаниям
- ЭКГ / холтер / СМАД — при кризах АД, тиреотоксикозе, феохромоцитоме (совместно с кардиологом)

Как пользоваться этой картой в кабинете
- Не назначай всё сразу: сначала минимум под жалобу и расчёт кабинета, затем досдать целевое
- Учитывай пол, возраст, беременность, уже сданные даты и динамику
- Это ориентир практики, не замена очному протоколу учреждения и не юридический стандарт`;
export const DEFAULT_AGENTS: Agent[] = [
  A("therapist", "Терапевт", STEP_IDS_ALL,
    "Ты — врач-терапевт. Изучи анкету клиента целиком: жалобы, параметры, анализы. Выдели отклонения, предположи 3–4 вероятных состояния с объяснением, какие показатели на это указывают, и перечисли, какие анализы или осмотры стоит сделать дальше. Не назначай лечение и дозировки."),
  A("psychologist", "Психолог", ["general", "psych", "diagnoses"],
    "Ты — психолог. По ответам клиента оцени эмоциональное состояние, уровень стресса, сон и поведенческие факторы, которые могут влиять на здоровье. Пиши бережно и без диагнозов психиатрического уровня; отметь, когда стоит обратиться к специалисту очно."),
  A("nutritionist", "Нутрициолог", ["general", "params", "labs", "studies", "diagnoses"],
    "Ты — нутрициолог. По параметрам тела и анализам оцени питание и возможные дефициты (железо, витамины, минералы). Дай общие рекомендации по рациону и образу жизни. Не назначай БАДы и дозировки."),
  // помощники чата «Помощник по анкете» на вкладках Общее и Параметры (talk.ts)
  A("intake-general", "Помощник (Общее)", ["general"],
    `Ты помощник кабинета «Электродоктор». Твоя роль — спокойно собрать жалобы и базовые сведения о человеке для анкеты. Ты не врач на приёме: не ставь диагноз, не назначай лечение и дозировки, не пугай. Уточняй недостающее простыми словами.

Дополнительно к общим правилам формата ответа:
4. Неизвестное или то, чему нет кода — в COMPLAINTS_OTHER или NOTES текстом; новые коды не выдумывай.
5. Для жалобы «боль в груди»: сначала PAIN_CHEST=1, затем атрибуты (PRESSING, STABBING, IRRAD_LARM, EXERTION, RELIEF_REST) и PAIN_CHEST_NRS 0–100, описание — PAIN_CHEST_NOTE.
6. Интенсивность боли: если человек сказал «6 из 10» — пиши 60 в шкале 0–100.
7. Если новых правок нет — "set": [], "clear": []. Всё равно заполни "say".
8. Не копируй в анкету ФИО из документов, адреса, телефоны — для имени достаточно псевдонима, если человек его дал.`),
  A("intake-params", "Помощник (Параметры)", ["params"],
    `Ты помощник кабинета «Электродоктор». Твоя роль — спокойно собрать параметры тела, жизненные показатели и данные осмотра для анкеты. Ты не врач на приёме: не ставь диагноз, не назначай лечение и дозировки, не пугай. Уточняй недостающее простыми словами.

Дополнительно к общим правилам формата ответа:
4. Неизвестное или то, чему нет кода — в GEN_NOTES текстом; новые коды не выдумывай. Таблицу генетических тестов (GEN_TESTS) не заполняй через этот чат.
5. Давление: если человек сказал «120 на 80» — BP_SYS=120, BP_DIA=80.
6. Рост обычно в см (170), вес в кг. Если назвали рост в метрах (1,7) — переведи в см (170).
7. Пункты осмотра — только коды из списка полей ниже (из справочника Настройки → Осмотр).
8. Если новых правок нет — "set": [], "clear": []. Всё равно заполни "say".
9. Не копируй в анкету ФИО из документов, адреса, телефоны.`),
  // врачи — по разделам диагнозов (Настройки → Диагнозы)
  D("cardiologist", "Кардиолог", "кардиолог", "cardio", "давление, пульс, липидный профиль, маркеры воспаления, сердечно-сосудистые риски"),
  D("pulmonologist", "Пульмонолог", "пульмонолог", "pulmo", "дыхание, кашель, одышка, сатурация, воспалительные маркеры"),
  D("gastroenterologist", "Гастроэнтеролог", "гастроэнтеролог", "gastro", "пищеварение, печёночные пробы (АЛТ, АСТ, ГГТ, билирубин), поджелудочная железа, копрограмма, кальпротектин"),
  { ...A("endocrinologist", "Эндокринолог", DOC_STEPS, ENDO_PROMPT, "endo"), examMap: ENDO_EXAM_MAP },
  D("neurologist", "Невролог", "невролог", "neuro", "головные боли, головокружение, онемение, судороги, сон, память, B12 и другие показатели, влияющие на нервную систему"),
  D("psychiatrist", "Психиатр", "психиатр-психотерапевт", "psych", "настроение, тревога, сон, стресс, зависимости, признаки, при которых нужна очная консультация", ["general", "params", "labs", "studies", "psych", "diagnoses"]),
  D("urologist", "Нефролог-уролог", "нефролог и уролог", "nephro", "креатинин, мочевина, мочевая кислота, общий анализ мочи, анализ по Нечипоренко, суточная моча"),
  D("gynecologist", "Гинеколог", "гинеколог и акушер", "gyn", "менструальный цикл, половые гормоны (ЛГ, ФСГ, эстрадиол, прогестерон, пролактин, АМГ), беременность, молочные железы"),
  D("andrologist", "Андролог", "андролог", "andro", "тестостерон, ГСПГ, ПСА, предстательная железа, мужское и сексуальное здоровье"),
  D("hematologist", "Гематолог", "гематолог", "hemat", "общий анализ крови, эритроцитарные индексы, железо и ферритин, свёртываемость (коагулограмма), лимфоузлы"),
  D("rheumatologist", "Ревматолог", "ревматолог", "rheum", "боли и отёки суставов, СОЭ, СРБ, ревматоидный фактор, АСЛО, антинуклеарный фактор, мочевая кислота"),
  D("orthopedist", "Травматолог-ортопед", "травматолог-ортопед", "ortho", "кости, суставы, мышцы, осанка, травмы, кальций, фосфор, витамин D"),
  D("dermatologist", "Дерматолог", "дерматолог", "derma", "кожа, волосы, ногти, сыпь, зуд, связь кожных проявлений с анализами и питанием"),
  D("ophthalmologist", "Офтальмолог", "офтальмолог", "ophth", "зрение, глаза, глазные проявления диабета и гипертонии"),
  D("ent", "ЛОР", "оториноларинголог", "ent", "ухо, горло, нос, пазухи, слух, хронические воспаления верхних дыхательных путей"),
  D("dentist", "Стоматолог", "стоматолог", "dent", "зубы, дёсны, полость рта, связь с общими болезнями"),
  D("infectionist", "Инфекционист", "инфекционист", "infect", "температура, лейкоцитарная формула, СРБ, гепатиты, ВИЧ, сифилис, Helicobacter pylori, прививки"),
  D("immunologist", "Аллерголог-иммунолог", "аллерголог-иммунолог", "immuno", "аллергия, IgE, эозинофилы, иммуноглобулины, частые инфекции"),
  D("oncologist", "Онколог", "онколог", "onco", "онкомаркеры, необъяснимые изменения веса и анализов, онкологические риски; без пугающих формулировок"),
  D("geneticist", "Генетик", "врач-генетик", "genetic", "результаты генетических исследований, наследственные и врождённые состояния, семейный анамнез"),
  A("coordinator", "Координатор", STEP_IDS_ALL,
    "Ты — координатор. Собери выводы других агентов в одно заключение для клиента: главное — коротко, отдельно — что сделать в первую очередь и к какому специалисту идти. Если выводы агентов расходятся, укажи это."),
];

const copyAgent = (a: Agent): Agent => ({ ...a, steps: [...a.steps] });
/** Подтянуть стандартный промпт и карту обследования эндокринолога, если ещё старые/пустые. */
function migrateEndocrinologist(a: Agent, def?: Agent): void {
  if (a.id !== "endocrinologist" || !def) return;
  const oldFocus = "гормоны щитовидной железы и надпочечников, глюкоза, HbA1c, инсулинорезистентность, обмен веществ, витамин D";
  if (!a.prompt.trim() || a.prompt.includes(oldFocus) || a.prompt.trim() === ENDO_PROMPT.trim()) a.prompt = def.prompt;
  if (!(a.examMap || "").trim()) a.examMap = def.examMap;
}
function blank(): Settings {
  return { version: 1, providers: {}, agents: DEFAULT_AGENTS.map(copyAgent), norms: {}, curves: {}, agentDefaults: { provider: "", model: "" }, agentsRev: AGENTS_REV };
}
// load() отдаёт копию: её можно менять и передавать в save()
export function load(): Settings {
  const d = Store.getData();
  if (!d) return blank();
  const s: Settings = JSON.parse(JSON.stringify({ version: 1, providers: d.providers || {}, agents: d.agents || [], norms: d.norms || {}, curves: d.curves || {},
    agentDefaults: d.agentDefaults || { provider: "", model: "" }, agentsRev: d.agentsRev || 1, signs: d.signs || {}, dxSections: d.dxSections || {}, signMethod: d.signMethod, recognizer: d.recognizer || { provider: "", model: "" }, labs: d.labs || {}, exams: d.exams || {}, articlesCss: d.articlesCss || "", i18n: d.i18n || {} }));
  // В набор добавились новые стандартные агенты (врачи по разделам) — дописать недостающих один раз; удалённые потом не возвращаются
  if ((s.agentsRev || 1) < AGENTS_REV) {
    const have = new Set(s.agents.map(a => a.id));
    const coord = s.agents.findIndex(a => a.id === "coordinator");
    const add = DEFAULT_AGENTS.filter(a => !have.has(a.id)).map(copyAgent);
    for (const a of s.agents) { const def = DEFAULT_AGENTS.find(x => x.id === a.id); if (def && def.section && !a.section) a.section = def.section; }
    if (coord >= 0) s.agents.splice(coord, 0, ...add); else s.agents.push(...add);
    // rev 5: промпт + карта обследования эндокринолога
    if ((s.agentsRev || 1) < 5) {
      const endo = s.agents.find(x => x.id === "endocrinologist");
      if (endo) migrateEndocrinologist(endo, DEFAULT_AGENTS.find(x => x.id === "endocrinologist"));
    }
    // rev 6: у всех, кроме помощников анкеты, этап «Диагнозы» (расчёт кабинета)
    if ((s.agentsRev || 1) < 6) {
      for (const a of s.agents) {
        if (a.id === TALK_AGENT_IDS.general || a.id === TALK_AGENT_IDS.params) continue;
        if (!a.steps.includes("diagnoses")) a.steps = [...a.steps, "diagnoses"];
      }
    }
    // rev 7–8: инструкция эндокринолога (согласованный текст; 8 — досдать/осмотр/напишите мне)
    if ((s.agentsRev || 1) < 8) {
      const endo = s.agents.find(x => x.id === "endocrinologist");
      const def = DEFAULT_AGENTS.find(x => x.id === "endocrinologist");
      if (endo && def) {
        endo.prompt = def.prompt;
        if (!(endo.examMap || "").trim() && def.examMap) endo.examMap = def.examMap;
      }
    }
    // rev 8–9: этап «Исследования» у врачей и общих агентов (кроме помощников анкеты)
    if ((s.agentsRev || 1) < 9) {
      for (const a of s.agents) {
        if (a.id === TALK_AGENT_IDS.general || a.id === TALK_AGENT_IDS.params) continue;
        if (!a.steps.includes("studies")) {
          const i = a.steps.indexOf("labs");
          a.steps = i >= 0
            ? [...a.steps.slice(0, i + 1), "studies", ...a.steps.slice(i + 1)]
            : [...a.steps, "studies"];
        }
      }
    }
    s.agentsRev = AGENTS_REV;
    // сразу записать, иначе в Store останется старый промпт
    Store.setData({
      providers: s.providers, agents: s.agents, norms: s.norms || {}, curves: s.curves || {},
      agentDefaults: s.agentDefaults, agentsRev: s.agentsRev, signs: s.signs || {},
      dxSections: s.dxSections || {}, signMethod: s.signMethod, recognizer: s.recognizer,
      labs: s.labs || {}, exams: s.exams || {}, articlesCss: s.articlesCss || "",
      i18n: s.i18n || {},
    });
  }
  // Пустая карта у эндокринолога — подставить стандартную (без затирания правок)
  {
    const endo = s.agents.find(x => x.id === "endocrinologist");
    const def = DEFAULT_AGENTS.find(x => x.id === "endocrinologist");
    if (endo && def && !(endo.examMap || "").trim() && def.examMap) endo.examMap = def.examMap;
  }
  publishArticlesCss(s.articlesCss || "");
  Exams.applyOwn(s.exams);
  I18n.applyOwn(s.i18n);
  return s;
}
export function save(s: Settings): void {
  s.articlesCss = (s.articlesCss || "").trim() ? s.articlesCss! : "";
  Store.setData({ providers: s.providers, agents: s.agents, norms: s.norms || {}, curves: s.curves || {}, agentDefaults: s.agentDefaults, agentsRev: s.agentsRev || AGENTS_REV, signs: s.signs || {}, dxSections: s.dxSections || {}, signMethod: s.signMethod, recognizer: s.recognizer, labs: s.labs || {}, exams: s.exams || {}, articlesCss: s.articlesCss || "", i18n: s.i18n || {} });
  publishArticlesCss(s.articlesCss || "");
  Exams.applyOwn(s.exams);
  I18n.applyOwn(s.i18n);
}
// Чем распознаются анализы по фото: свой провайдер распознавания или общий провайдер агентов
export function recognizerRuntime(s: Settings = load()): { preset?: ProviderPreset; conf?: ProviderConf; model: string; shared: boolean } {
  const r = s.recognizer || { provider: "", model: "" }, def = s.agentDefaults || { provider: "", model: "" };
  const shared = !r.provider;
  const preset = allProviders(s).find(p => p.id === (r.provider || def.provider));
  const conf = preset ? providerConf(s, preset) : undefined;
  return { preset, conf, model: r.model || (shared ? def.model : "") || (conf ? conf.model : ""), shared };
}
// Чем на самом деле будет работать агент: свой провайдер или общий; своя модель, общая или модель провайдера
export function agentRuntime(s: Settings, a: Agent): { preset?: ProviderPreset; conf?: ProviderConf; model: string; shared: boolean } {
  const def = s.agentDefaults || { provider: "", model: "" };
  const shared = !a.provider;
  const pid = a.provider || def.provider;
  const preset = allProviders(s).find(p => p.id === pid);
  const conf = preset ? providerConf(s, preset) : undefined;
  const model = a.model || (shared ? def.model : "") || (conf ? conf.model : "");
  return { preset, conf, model, shared };
}
/** Врачи из настроек по разделам диагноза (порядок разделов сохраняется, без дублей). */
export function agentsForSections(sections: string[], s: Settings = load()): Agent[] {
  const out: Agent[] = [];
  for (const sec of sections) {
    const a = s.agents.find(x => x.enabled && x.section === sec);
    if (a && !out.some(o => o.id === a.id)) out.push(a);
  }
  return out;
}
/** Агент-помощник вкладки Общее или Параметры (чат заполнения анкеты). */
export function talkAgent(stepId: "general" | "params", s: Settings = load()): Agent {
  const id = TALK_AGENT_IDS[stepId];
  return s.agents.find(a => a.id === id) || DEFAULT_AGENTS.find(a => a.id === id)!;
}
// Ключи пока недоступны: зашифрованы и пароль не введён, или нет доступа к папке настроек
export const blocked = () => Store.state.locked || (Store.state.where === "folder" && !Store.state.loaded);

export function providerConf(s: Settings, p: ProviderPreset): ProviderConf {
  return s.providers[p.id] || { enabled: false, apiKey: "", baseUrl: p.baseUrl, model: p.model };
}
// Свои провайдеры (совместимые с OpenAI API) хранятся с id "custom-…".
export function allProviders(s: Settings): ProviderPreset[] {
  const custom = Object.entries(s.providers).filter(([id]) => id.startsWith("custom-")).map(([id, c]): ProviderPreset =>
    ({ id, name: c.name || "Свой провайдер", kind: "custom", baseUrl: c.baseUrl, model: c.model, note: "Любой сервис, совместимый с OpenAI API." }));
  const legacy = LEGACY_PROVIDERS.filter(p => !!s.providers[p.id]);
  return [...PROVIDERS, ...legacy, ...custom];
}
export const needsApiKey = (p: ProviderPreset, c: ProviderConf) =>
  p.kind !== "local" && !M.isLocalUrl(c.baseUrl || p.baseUrl);
export const isReady = (p: ProviderPreset, c: ProviderConf) =>
  c.enabled && !!c.baseUrl.trim() && (!needsApiKey(p, c) || !!c.apiKey.trim()) && (p.id !== "yandexgpt" || !!(c.folder || "").trim());
// Переключатель «вкл/выкл» вместо галочки
export const switchHtml = (name: string, on: boolean, label: string) =>
  `<label class="sw"><input type="checkbox" role="switch" name="${name}"${on ? " checked" : ""} aria-label="${label}"><span class="sw-track" aria-hidden="true"><span class="sw-knob"></span></span></label>`;
// Записать результат проверки связи (вызывается и после распознавания анализов)
export function setCheck(id: string, ok: boolean, msg = ""): void {
  const st = load();
  const c = st.providers[id]; if (!c) return;
  c.check = { ok, at: new Date().toISOString(), msg: msg || undefined };
  save(st);
}
function connHtml(c: ProviderConf): string {
  const k = c.check;
  if (!k) return `<span class="conn"><i class="dot"></i>не проверено</span>`;
  const t = new Date(k.at).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  return k.ok ? `<span class="conn ok"><i class="dot"></i>связь есть · ${t}</span>`
    : `<span class="conn bad" title="${esc(k.msg || "")}"><i class="dot"></i>нет связи · ${t}</span>`;
}
const fmtWhen = (iso?: string) => iso ? new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
function modelsStatus(c: ProviderConf): string {
  if (!c.models) return "список не загружен";
  return `моделей: ${c.models.length}${c.modelsHidden ? ` (ещё ${c.modelsHidden} не для чата скрыто)` : ""} · ${fmtWhen(c.modelsAt)}`;
}

// ---------- страница ----------
const esc = (s: unknown) => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" } as Record<string, string>)[c]);
const q = <T extends HTMLElement = HTMLElement>(root: ParentNode, s: string) => root.querySelector(s) as T;
const newId = (p: string) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

export interface StepInfo { id: string; title: string }

export function render(view: HTMLElement, tab: string, steps: StepInfo[]): void {
  // старые закладки #/settings/labs → нормы и веса
  if (tab === "labs") {
    location.replace(location.hash.replace(/^#\/settings\/labs/, "#/settings/weights"));
    return;
  }
  const t = tab === "agents" ? "agents" : tab === "storage" ? "storage" : tab === "weights" ? "weights" : tab === "exam" ? "exam" : tab === "diagnoses" ? "diagnoses" : tab === "council" ? "council" : tab === "lang" ? "lang" : tab === "misc" ? "misc" : "providers";
  view.innerHTML = `
    <h1>${esc(I18n.t("set.title", "Настройки"))}</h1>
    <p class="muted set-lead">${esc(whereText())} Ключ API отправляется только своему провайдеру. <a href="#/settings/storage">Где хранить →</a></p>
    <div class="set">
      <aside class="set-side" aria-label="${esc(I18n.t("set.side", "Разделы настроек"))}">
        <a class="set-tab${t === "providers" ? " on" : ""}" href="#/settings/providers">${esc(I18n.t("set.tab.providers", "Провайдеры"))}</a>
        <a class="set-tab${t === "agents" ? " on" : ""}" href="#/settings/agents">${esc(I18n.t("set.tab.agents", "Врачи"))}</a>
        <a class="set-tab${t === "council" ? " on" : ""}" href="#/settings/council">${esc(I18n.t("set.tab.council", "Консилиум"))}</a>
        <a class="set-tab${t === "weights" ? " on" : ""}" href="#/settings/weights">${esc(I18n.t("set.tab.weights", "Нормы и веса"))}</a>
        <a class="set-tab${t === "exam" ? " on" : ""}" href="#/settings/exam">${esc(I18n.t("set.tab.exam", "Осмотр"))}</a>
        <a class="set-tab${t === "diagnoses" ? " on" : ""}" href="#/settings/diagnoses">${esc(I18n.t("set.tab.diagnoses", "Диагнозы"))}</a>
        <a class="set-tab${t === "lang" ? " on" : ""}" href="#/settings/lang">${esc(I18n.t("set.tab.lang", "Язык"))}</a>
        <a class="set-tab${t === "storage" ? " on" : ""}" href="#/settings/storage">${esc(I18n.t("set.tab.storage", "Хранение"))}</a>
        <a class="set-tab${t === "misc" ? " on" : ""}" href="#/settings/misc">${esc(I18n.t("set.tab.misc", "Прочее"))}</a>
      </aside>
      <section class="set-main" id="setmain"></section>
    </div>`;
  const main = q(view, "#setmain");
  const redraw = () => render(view, t, steps);
  if (t === "storage") { drawStorage(main, redraw); return; }
  if (t === "lang") {
    if (Store.state.where === "folder" && !Store.state.loaded) { main.innerHTML = gateHtml(); bindGate(main, redraw); return; }
    drawLang(main); return;
  }
  if (t === "misc") { drawMisc(main); return; }
  if (t === "exam") {
    if (Store.state.where === "folder" && !Store.state.loaded) { main.innerHTML = gateHtml(); bindGate(main, redraw); return; }
    SetExams.draw(main); return;
  }
  if (t === "diagnoses") {
    if (Store.state.where === "folder" && !Store.state.loaded) { main.innerHTML = gateHtml(); bindGate(main, redraw); return; }
    Dx.draw(main); return;
  }
  if (t === "council") {   // пока пусто
    main.innerHTML = `<div class="set-head"><h2>Консилиум</h2></div><div class="card"><p class="muted">Раздел в разработке.</p></div>`;
    return;
  }
  if (t === "weights") {
    if (Store.state.where === "folder" && !Store.state.loaded) { main.innerHTML = gateHtml(); bindGate(main, redraw); return; }
    drawWeights(main); return;
  }
  const gate = gateHtml();
  if (gate) {
    main.innerHTML = gate;
    bindGate(main, redraw);
    if (Store.state.where === "folder" && !Store.state.loaded) return;   // без папки нечего показывать
    const rest = document.createElement("div"); main.appendChild(rest);
    if (t === "providers") drawProviders(rest); else drawAgents(rest, steps);
    return;
  }
  if (t === "providers") drawProviders(main); else drawAgents(main, steps);
}

/** `#/settings/agents/<id>` — сразу раскрыть и подсветить агента (как строка анализа в Нормах и весах). */
function agentFocusId(): string {
  const parts = location.hash.replace(/^#\/?/, "").split("/");
  if (parts[0] === "settings" && parts[1] === "agents" && parts[2]) {
    try { return decodeURIComponent(parts[2]); } catch { return parts[2]; }
  }
  return "";
}
function focusAgentCard(main: HTMLElement, id: string): void {
  if (!id) return;
  const d = main.querySelector<HTMLDetailsElement>(`details[data-fold="agent-${CSS.escape(id)}"]`);
  if (!d) return;
  d.open = true;
  requestAnimationFrame(() => {
    d.scrollIntoView({ block: "center", behavior: "smooth" });
    d.classList.add("moved");
    window.setTimeout(() => d.classList.remove("moved"), 1200);
  });
}

function savedFlash(el: Element | null): void {
  if (!el) return;
  el.textContent = "Сохранено";
  window.setTimeout(() => { if (el.textContent === "Сохранено") el.textContent = ""; }, 1500);
}

// Порядок на странице: включённые сверху (последний включённый — первым), затем выключенные в исходном порядке
function ordered(s: Settings): ProviderPreset[] {
  const all = allProviders(s);
  const on = all.filter(p => providerConf(s, p).enabled)
    .sort((a, b) => (providerConf(s, b).enabledAt || "").localeCompare(providerConf(s, a).enabledAt || ""));
  return [...on, ...all.filter(p => !providerConf(s, p).enabled)];
}

function drawProviders(main: HTMLElement, focus = ""): void {
  const s = load();
  const list = ordered(s);
  const ready = list.filter(p => isReady(p, providerConf(s, p))).length;
  main.innerHTML = `
    <div class="set-head"><h2>Провайдеры ИИ</h2><span class="muted" id="provcount">${provCount(ready)}</span></div>
    <p class="muted set-hint">Провайдер — сервис, к которому будут обращаться агенты. Включите нужные, вставьте ключ и укажите модель.</p>
    <div class="set-list">${list.map(p => providerBlock(s, p)).join("")}</div>
    <div class="grp set-add"><button class="btn" id="addprov">Добавить свой провайдер</button></div>`;

  main.querySelectorAll<HTMLElement>("[data-prov]").forEach(box => {
    const id = box.dataset.prov!;
    const p = list.find(x => x.id === id)!;
    const store = () => {
      const st = load();
      const prev = st.providers[id] || {};
      const c: ProviderConf = {
        ...prev,
        enabled: q<HTMLInputElement>(box, "[name=enabled]").checked,
        apiKey: q<HTMLInputElement>(box, "[name=apiKey]").value.trim(),
        baseUrl: q<HTMLInputElement>(box, "[name=baseUrl]").value.trim(),
        model: q<HTMLInputElement>(box, "[name=model]").value.trim(),
      };
      const nm = box.querySelector<HTMLInputElement>("[name=pname]");
      if (nm) c.name = nm.value.trim();
      const fd = box.querySelector<HTMLInputElement>("[name=folder]");
      if (fd) c.folder = fd.value.trim();
      const vp = box.querySelector<HTMLInputElement>("[name=viaProxy]");
      if (vp) c.viaProxy = vp.checked;
      if (c.enabled && !prev.enabled) c.enabledAt = new Date().toISOString();
      if (prev.check && (prev.apiKey !== c.apiKey || prev.baseUrl !== c.baseUrl || prev.folder !== c.folder || prev.viaProxy !== c.viaProxy)) delete c.check;
      const cr = box.querySelector<HTMLElement>("[data-conn]"); if (cr) cr.innerHTML = connHtml(c);
      st.providers[id] = c;
      save(st);
      const status = box.closest("details")?.querySelector(".fold-status");
      if (status) status.innerHTML = provStatus(p, c);
      savedFlash(box.querySelector(".set-saved"));
      const cnt = main.querySelector("#provcount");
      if (cnt) cnt.textContent = provCount(allProviders(st).filter(x => isReady(x, providerConf(st, x))).length);
    };
    const syncKeyRow = () => {
      const row = box.querySelector<HTMLElement>("[data-keyrow]");
      if (!row) return;
      const url = q<HTMLInputElement>(box, "[name=baseUrl]").value.trim();
      const need = p.kind !== "local" && !M.isLocalUrl(url);
      row.hidden = !need;
    };
    box.querySelectorAll("input").forEach(i => i.addEventListener("change", () => { store(); syncKeyRow(); }));
    // включили или выключили — перестраиваем список, блок едет на своё место и остаётся на виду
    q<HTMLInputElement>(box, "[name=enabled]").addEventListener("change", () => {
      try { localStorage.setItem("electrodoctor.fold.prov-" + id, "1"); } catch (e) { /* не страшно */ }
      window.setTimeout(() => drawProviders(main, id), 220);
    });
    box.querySelectorAll<HTMLButtonElement>("[data-oa-tpl]").forEach(btn => {
      btn.onclick = () => {
        const url = btn.dataset.oaTpl || "";
        q<HTMLInputElement>(box, "[name=baseUrl]").value = url;
        const link = box.querySelector<HTMLAnchorElement>("[data-keylink]");
        if (link) {
          const ku = btn.dataset.oaKeyurl || "";
          if (ku) { link.href = ku; link.hidden = false; }
          else link.hidden = true;
        }
        store();
        syncKeyRow();
      };
    });
    const picker = box.querySelector<HTMLElement>("[data-mp]")!;
    M.bindPicker(picker, () => providerConf(load(), p).models);
    const loadBtn = box.querySelector<HTMLButtonElement>("[data-act=models]")!;
    const mstat = box.querySelector<HTMLElement>("[data-mstat]")!;
    const connBox = box.querySelector<HTMLElement>("[data-conn]")!;
    const checkBtn = box.querySelector<HTMLButtonElement>("[data-act=check]")!;
    const showConn = () => {
      const c = providerConf(load(), p);
      connBox.innerHTML = connHtml(c);
      const status = box.closest("details")?.querySelector(".fold-status");
      if (status) status.innerHTML = provStatus(p, c);
      const err = box.querySelector<HTMLElement>("[data-connerr]")!;
      err.textContent = c.check && !c.check.ok ? c.check.msg || "" : "";
    };
    // Проверка связи = запрос списка моделей: дешёвый и требует того же ключа, адреса и каталога
    const probe = async (openList: boolean) => {
      store();
      loadBtn.disabled = checkBtn.disabled = true;
      connBox.innerHTML = `<span class="conn wait"><i class="dot"></i>проверяю…</span>`;
      if (openList) { mstat.className = "muted"; mstat.textContent = "Загружаю список…"; }
      try {
        const r = await M.fetchModels(p, providerConf(load(), p));
        const st = load();
        const c = st.providers[id] || providerConf(st, p);
        c.models = r.models; c.modelsHidden = r.hidden; c.modelsAt = new Date().toISOString();
        c.check = { ok: true, at: new Date().toISOString() };
        st.providers[id] = c; save(st);
        mstat.className = "muted"; mstat.textContent = modelsStatus(c);
        loadBtn.textContent = "Обновить список";
        (picker as any)._mpRefresh?.();
        if (openList && r.models.length) picker.querySelector<HTMLButtonElement>("[data-mp-open]")!.click();
      } catch (e) {
        const msg = (e instanceof Error && e.message) || String(e);
        setCheck(id, false, msg);
        if (openList) { mstat.className = "err"; mstat.textContent = msg; }
      } finally { loadBtn.disabled = checkBtn.disabled = false; showConn(); }
    };
    loadBtn.onclick = () => probe(true);
    checkBtn.onclick = () => probe(false);
    const show = box.querySelector<HTMLButtonElement>("[data-act=show]");
    if (show) show.onclick = () => {
      const k = q<HTMLInputElement>(box, "[name=apiKey]");
      k.type = k.type === "password" ? "text" : "password";
      show.textContent = k.type === "password" ? "Показать" : "Скрыть";
    };
    const del = box.querySelector<HTMLButtonElement>("[data-act=del]");
    if (del) del.onclick = () => {
      if (!confirm("Удалить этот провайдер?")) return;
      const st = load();
      delete st.providers[id];
      st.agents.forEach(a => { if (a.provider === id) a.provider = ""; });
      save(st);
      drawProviders(main);
    };
  });
  if (focus) {
    const d = main.querySelector<HTMLElement>(`details[data-fold="prov-${focus}"]`);
    if (d) {
      d.scrollIntoView({ block: "nearest", behavior: "smooth" });
      d.classList.add("moved");
      window.setTimeout(() => d.classList.remove("moved"), 1200);
    }
  }
  q<HTMLButtonElement>(main, "#addprov").onclick = () => {
    const st = load();
    const id = newId("custom-");
    st.providers[id] = { enabled: true, apiKey: "", baseUrl: "", model: "", name: "Свой провайдер", enabledAt: new Date().toISOString() };
    save(st);
    try { localStorage.setItem("electrodoctor.fold.prov-" + id, "1"); } catch (e) { /* не страшно */ }
    drawProviders(main, id);
  };
}

const provCount = (n: number) => n ? `настроено: ${n}` : "пока ни один не настроен";

function provStatus(p: ProviderPreset, c: ProviderConf): string {
  if (!c.enabled) return "выключен";
  if (isReady(p, c)) {
    const k = c.check;
    const conn = !k ? `<span class="conn"><i class="dot"></i>связь не проверена</span>` : k.ok ? `<span class="conn ok"><i class="dot"></i>связь есть</span>` : `<span class="conn bad"><i class="dot"></i>нет связи</span>`;
    return `включён · ${conn}${c.model ? " · " + esc(c.model) : ""}`;
  }
  return `<span class="err">${!c.baseUrl ? "нет адреса" : needsApiKey(p, c) && !c.apiKey ? "нет ключа" : "нет каталога"}</span>`;
}

function providerBlock(s: Settings, p: ProviderPreset): string {
  const c = providerConf(s, p);
  const custom = p.kind === "custom";
  const wantKey = needsApiKey(p, c);
  const tpls = p.id === "openai"
    ? `<p class="muted set-tpls">Подставить адрес: ${OPENAI_COMPAT_TPL.map(t =>
      `<button type="button" class="btn" data-oa-tpl="${esc(t.baseUrl)}"${t.keyUrl ? ` data-oa-keyurl="${esc(t.keyUrl)}"` : ""}>${esc(t.label)}</button>`).join(" ")}</p>`
    : "";
  const body = `<div class="set-form" data-prov="${esc(p.id)}">
    ${p.note ? `<p class="muted">${esc(p.note)}</p>` : ""}
    ${tpls}
    <div class="set-row"><span>Включён</span><span>${switchHtml("enabled", c.enabled, "Включён")}</span></div>
    <div class="set-row"><span>Связь с провайдером<small class="err" data-connerr>${esc(c.check && !c.check.ok ? c.check.msg || "" : "")}</small></span><span class="mp-row"><span data-conn>${connHtml(c)}</span><button type="button" class="btn" data-act="check">Проверить связь</button></span></div>
    ${custom ? `<label class="set-row"><span>Название</span><input type="text" name="pname" value="${esc(c.name || "")}"></label>` : ""}
    ${p.kind === "local" ? "" : `<label class="set-row" data-keyrow${wantKey ? "" : " hidden"}><span>Ключ API${p.keyUrl ? ` <a href="${esc(p.keyUrl)}" target="_blank" rel="noopener" data-keylink>где взять</a>` : `<a href="#" target="_blank" rel="noopener" data-keylink hidden>где взять</a>`}</span>
      <span class="ctl"><input type="password" name="apiKey" value="${esc(c.apiKey)}" autocomplete="off" spellcheck="false"${Store.state.locked ? ' disabled placeholder="зашифрован — введите пароль"' : ""}><button class="btn" type="button" data-act="show">Показать</button></span></label>`}
    ${p.kind === "local" ? `<input type="hidden" name="apiKey" value="">` : ""}
    ${p.id === "yandexgpt" ? `<label class="set-row"><span>Каталог (folder ID)<small>в консоли Yandex Cloud, вида b1g…</small></span><input type="text" name="folder" value="${esc(c.folder || "")}" spellcheck="false" placeholder="b1g…"></label>` : ""}
    ${M.proxyAllowed(p) ? `<div class="set-row"><span>Через посредника<small>для сервисов, которые не принимают запросы прямо из браузера (YandexGPT). Работает, когда кабинет открыт через tools/preview.py</small></span><span>${switchHtml("viaProxy", M.proxyOn(p, c), "Через посредника")}</span></div>` : ""}
    <label class="set-row"><span>Адрес API</span><input type="text" name="baseUrl" value="${esc(c.baseUrl)}" spellcheck="false" placeholder="https://…"></label>
    <div class="set-row"><span>Модель по умолчанию<small data-mstat class="muted">${esc(modelsStatus(c))}</small></span>
      <span class="mp-row">${M.pickerHtml("model", c.model, c.models, "название модели у провайдера")}<button type="button" class="btn" data-act="models">${c.models ? "Обновить список" : "Загрузить список моделей"}</button></span></div>
    <div class="set-foot"><span class="set-saved ok"></span>${custom ? `<button class="btn danger" type="button" data-act="del">Удалить</button>` : ""}</div>
  </div>`;
  return fold("prov-" + p.id, p.name, provStatus(p, c), body);
}

function drawAgents(main: HTMLElement, steps: StepInfo[]): void {
  const s = load();
  const provs = allProviders(s);
  const focusId = agentFocusId();
  if (focusId) {
    try { localStorage.setItem("electrodoctor.fold.agent-" + focusId, "1"); } catch (e) { /* */ }
  }
  main.innerHTML = `
    <div class="set-head"><h2>Врачи</h2><span class="muted" id="agentcount">${s.agents.filter(a => a.enabled).length} из ${s.agents.length} включены</span></div>
    <p class="muted set-hint">Агент — роль со своей инструкцией. Провайдер и модель задаются один раз ниже — для всех агентов; у отдельного агента их можно заменить своими.</p>
    ${sharedBlock(s, provs)}
    ${recognizerBlock(s, provs)}
    ${agentGroups(s, provs, steps)}
    <div class="grp set-add"><button class="btn" id="addagent">Добавить агента</button><button class="btn" id="resetagents">Вернуть стандартных</button></div>`;

  // Общий провайдер и модель для всех агентов
  const sh = main.querySelector<HTMLElement>("[data-shared]")!;
  const storeShared = () => {
    const st = load();
    st.agentDefaults = { provider: q<HTMLSelectElement>(sh, "[name=provider]").value, model: q<HTMLInputElement>(sh, "[name=model]").value.trim() };
    save(st);
    drawAgents(main, steps);   // у всех агентов меняются подписи «общий — …»
  };
  sh.querySelectorAll("input, select").forEach(i => i.addEventListener("change", storeShared));
  M.bindPicker(sh.querySelector<HTMLElement>("[data-mp]")!, () => {
    const pid = q<HTMLSelectElement>(sh, "[name=provider]").value;
    const pr = allProviders(load()).find(x => x.id === pid);
    return pr ? providerConf(load(), pr).models : undefined;
  });
  const clr = sh.querySelector<HTMLButtonElement>("button[data-act=clearown]");
  if (clr) clr.onclick = () => {
    const st = load(); const own = st.agents.filter(a => a.provider || a.model).length;
    if (!own || !confirm(`Убрать свои провайдеры и модели у агентов (${own}) — все будут работать на общем?`)) return;
    for (const a of st.agents) { a.provider = ""; a.model = ""; }
    save(st); drawAgents(main, steps);
  };

  // Распознавание анализов по фото
  const rb = main.querySelector<HTMLElement>("[data-recognizer]")!;
  rb.querySelectorAll("input, select").forEach(i => i.addEventListener("change", () => {
    const st = load();
    st.recognizer = { provider: q<HTMLSelectElement>(rb, "[name=provider]").value, model: q<HTMLInputElement>(rb, "[name=model]").value.trim() };
    save(st);
    const sel = (i as HTMLElement).matches("[name=provider]");
    if (sel) drawAgents(main, steps); else savedFlash(rb.querySelector(".set-saved"));
  }));
  M.bindPicker(rb.querySelector<HTMLElement>("[data-mp]")!, () => { const r = recognizerRuntime(load()); return r.conf ? r.conf.models : undefined; });

  main.querySelectorAll<HTMLElement>("[data-agent]").forEach(box => {
    const id = box.dataset.agent!;
    const store = () => {
      const st = load();
      const a = st.agents.find(x => x.id === id); if (!a) return;
      a.name = q<HTMLInputElement>(box, "[name=name]").value.trim() || "Без названия";
      a.enabled = q<HTMLInputElement>(box, "[name=enabled]").checked;
      a.provider = q<HTMLSelectElement>(box, "[name=provider]").value;
      (box.querySelector("[data-mp]") as any)?._mpRefresh?.();
      const mh = agentModelHint(st, provs, a.provider);
      q<HTMLInputElement>(box, "[name=model]").placeholder = mh.placeholder;
      q<HTMLSelectElement>(box, "[name=provider]").classList.toggle("ready", mh.ready);
      a.model = q<HTMLInputElement>(box, "[name=model]").value.trim();
      const tv = Number(q<HTMLInputElement>(box, "[name=temperature]").value);
      a.temperature = isFinite(tv) ? Math.min(2, Math.max(0, tv)) : 0.3;
      a.steps = [...box.querySelectorAll<HTMLInputElement>("[name=step]:checked")].map(i => i.value);
      save(st);
      const d = box.closest("details");
      const title = d?.querySelector(".fold-title"); if (title) title.textContent = a.name;
      const status = d?.querySelector(".fold-status"); if (status) status.innerHTML = agentStatus(a, provs, st);
      savedFlash(box.querySelector(".set-saved"));
      const cnt = main.querySelector("#agentcount");
      if (cnt) cnt.textContent = `${st.agents.filter(x => x.enabled).length} из ${st.agents.length} включены`;
    };
    box.querySelectorAll("input, select, textarea").forEach(i => i.addEventListener("change", store));
    M.bindPicker(box.querySelector<HTMLElement>("[data-mp]")!, () => {
      const st = load();
      const pid = q<HTMLSelectElement>(box, "[name=provider]").value || (st.agentDefaults || { provider: "" }).provider;
      const pr = allProviders(st).find(x => x.id === pid);
      return pr ? providerConf(st, pr).models : undefined;
    });
    q<HTMLButtonElement>(box, "[data-act=del]").onclick = () => {
      if (!confirm("Удалить агента?")) return;
      const st = load();
      st.agents = st.agents.filter(x => x.id !== id);
      save(st);
      drawAgents(main, steps);
    };
    box.querySelectorAll<HTMLButtonElement>("[data-edit]").forEach(btn => {
      btn.onclick = () => {
        const field = btn.dataset.edit as "prompt" | "examMap" | "protocols";
        const title = field === "examMap" ? "Карта обследования"
          : field === "protocols" ? "Протоколы"
          : "Инструкция агенту";
        openAgentTextEditor({
          agentId: id,
          field,
          title,
          onSaved: () => {
            savedFlash(box.querySelector(".set-saved"));
          },
        });
      };
    });
  });
  q<HTMLButtonElement>(main, "#addagent").onclick = () => {
    const st = load();
    const id = newId("a");
    st.agents.push({ id, name: "Новый агент", enabled: true, provider: "", model: "", temperature: 0.3, steps: steps.map(x => x.id), prompt: "" });
    save(st);
    try { localStorage.setItem("electrodoctor.fold.agent-" + id, "1"); } catch (e) { /* не страшно */ }
    drawAgents(main, steps);
  };
  q<HTMLButtonElement>(main, "#resetagents").onclick = () => {
    if (!confirm("Вернуть стандартный набор агентов? Ваши изменения в агентах пропадут; провайдеры останутся.")) return;
    const st = load();
    st.agents = blank().agents;
    save(st);
    drawAgents(main, steps);
  };
  focusAgentCard(main, focusId);
}

function agentStatus(a: Agent, provs: ProviderPreset[], s: Settings): string {
  if (!a.enabled) return "выключен";
  const r = agentRuntime(s, a);
  const tag = r.shared ? "общий · " : "";
  if (!r.preset) return `<span class="err">${r.shared ? "общий провайдер не выбран" : "провайдер не выбран"}</span>`;
  return isReady(r.preset, r.conf!) ? `${tag}${esc(r.preset.name)}${r.model ? " · " + esc(r.model) : ""}` : `<span class="err">${tag}${esc(r.preset.name)} не настроен</span>`;
}
// Блок «Общий провайдер» над списком агентов
function sharedBlock(s: Settings, provs: ProviderPreset[]): string {
  const def = s.agentDefaults || { provider: "", model: "" };
  const p = provs.find(x => x.id === def.provider), c = p ? providerConf(s, p) : undefined;
  const ready = !!(p && c && isReady(p, c));
  const users = s.agents.filter(a => !a.provider).length;
  const own = s.agents.filter(a => a.provider || a.model).length;
  return `<div class="card set-shared" data-shared>
    <div class="set-shared-head"><b>Общий провайдер для агентов</b><span class="muted">на нём работают ${users} из ${s.agents.length}</span></div>
    <label class="set-row"><span>Провайдер</span><select name="provider" class="prov-sel${ready ? " ready" : ""}">${providerOptions(s, provs, def.provider)}</select></label>
    <div class="set-row"><span>Модель<small>${c && c.model ? `если пусто — модель провайдера: ${esc(c.model)}` : "если пусто — модель провайдера по умолчанию"}</small></span>${M.pickerHtml("model", def.model, c ? c.models : undefined, (c && c.model) || "модель провайдера")}</div>
    <div class="set-foot"><span class="muted">${own ? `Свой провайдер или модель — у ${own} ${own % 10 === 1 && own % 100 !== 11 ? "агента" : "агентов"}.` : "Своих провайдеров у агентов нет — все работают на общем."}</span>${own ? `<button class="btn" type="button" data-act="clearown">Всех — на общий</button>` : ""}</div>
  </div>`;
}
// Блок «Распознавание анализов по фото»: провайдер и модель, которые понимают изображения
function recognizerBlock(s: Settings, provs: ProviderPreset[]): string {
  const r = s.recognizer || { provider: "", model: "" }, def = s.agentDefaults || { provider: "", model: "" };
  const dp = provs.find(x => x.id === def.provider);
  const rt = recognizerRuntime(s);
  const ready = !!(rt.preset && rt.conf && isReady(rt.preset, rt.conf));
  const m = rt.conf && (rt.conf.models || []).find(x => x.id === rt.model);
  const warn = m && !m.caps.includes("vision") ? `<small class="err">У модели «${esc(rt.model)}» нет пометки «понимает фото» — выберите другую.</small>` : "";
  return `<div class="card set-shared set-rec" data-recognizer>
    <div class="set-shared-head"><b>Распознавание анализов по фото</b><span class="muted">${ready ? `${esc(rt.preset!.name)}${rt.model ? " · " + esc(rt.model) : ""}` : `<span class="err">не настроено</span>`}</span></div>
    <p class="muted set-hint">Этим провайдером кабинет читает фото и PDF бланков на вкладке «Анализы». Нужна модель, которая понимает изображения.</p>
    <label class="set-row"><span>Провайдер</span><select name="provider" class="prov-sel${ready ? " ready" : ""}">${providerOptions(s, provs, r.provider, dp ? `Общий — ${dp.name}` : "Общий — не выбран")}</select></label>
    <div class="set-row"><span>Модель<small>${rt.conf && (rt.shared ? def.model : rt.conf.model) ? `если пусто — ${rt.shared && def.model ? "общая" : "модель провайдера"}: ${esc(rt.shared && def.model ? def.model : rt.conf.model)}` : "с поддержкой изображений"}</small></span><span>${M.pickerHtml("model", r.model, rt.conf ? rt.conf.models : undefined, rt.model || "модель с поддержкой изображений")}${warn}</span></div>
    <div class="set-foot"><span class="set-saved ok"></span></div>
  </div>`;
}
// Агенты: помощники анкеты, прочие общие роли, врачи по разделам
function agentGroups(s: Settings, provs: ProviderPreset[], steps: StepInfo[]): string {
  const intakeIds = new Set<string>(Object.values(TALK_AGENT_IDS));
  const intake = s.agents.filter(a => intakeIds.has(a.id));
  const docs = s.agents.filter(a => a.section);
  const rest = s.agents.filter(a => !a.section && !intakeIds.has(a.id));
  const list = (xs: Agent[]) => `<div class="set-list">${xs.map(a => agentBlock(a, provs, s, steps)).join("")}</div>`;
  return (intake.length ? `<h3 class="set-group">Помощники по анкете <span class="muted">${intake.length}</span></h3>${list(intake)}` : "")
    + (rest.length ? `<h3 class="set-group">Общие <span class="muted">${rest.length}</span></h3>${list(rest)}` : "")
    + (docs.length ? `<h3 class="set-group">Врачи по разделам диагнозов <span class="muted">${docs.length}</span></h3>${list(docs)}` : "");
}

// Выбор провайдера у агента: настроенные — отдельной группой сверху, с галочкой и состоянием связи
function providerOptions(s: Settings, provs: ProviderPreset[], selected: string, empty = "— не выбран —"): string {
  const opt = (p: ProviderPreset) => {
    const c = providerConf(s, p);
    const ready = isReady(p, c);
    const conn = !ready ? "" : !c.check ? " — связь не проверена" : c.check.ok ? " — связь есть" : " — нет связи";
    return `<option value="${esc(p.id)}"${p.id === selected ? " selected" : ""}${ready ? ' class="opt-ready"' : ""}>${ready ? "✓ " : ""}${esc(p.name)}${conn}</option>`;
  };
  const ready = provs.filter(p => isReady(p, providerConf(s, p)));
  const rest = provs.filter(p => !ready.includes(p));
  return `<option value="">${esc(empty)}</option>`
    + (ready.length ? `<optgroup label="Настроены">${ready.map(opt).join("")}</optgroup>` : "")
    + `<optgroup label="${ready.length ? "Не настроены" : "Ни один провайдер ещё не настроен"}">${rest.map(opt).join("")}</optgroup>`;
}
// Подсказка под полем «Своя модель»: какая модель будет использована, если поле пустое
function agentModelHint(s: Settings, provs: ProviderPreset[], pid: string): { hint: string; placeholder: string; ready: boolean } {
  const def = s.agentDefaults || { provider: "", model: "" };
  const shared = !pid;
  const p = provs.find(x => x.id === (pid || def.provider));
  if (!p) return { hint: shared ? "необязательно — сначала выберите общий провайдер вверху" : "необязательно — сначала выберите провайдера", placeholder: "модель провайдера", ready: false };
  const c = providerConf(s, p);
  const fallback = (shared ? def.model : "") || c.model;
  return {
    hint: fallback ? `необязательно — если пусто, берётся ${shared && def.model ? "общая модель" : "модель провайдера"}: ${fallback}` : "необязательно — у провайдера модель по умолчанию не указана",
    placeholder: fallback || "модель провайдера", ready: isReady(p, c),
  };
}
function agentBlock(a: Agent, provs: ProviderPreset[], s: Settings, steps: StepInfo[]): string {
  const def = s.agentDefaults || { provider: "", model: "" };
  const dp = provs.find(x => x.id === def.provider);
  const opts = providerOptions(s, provs, a.provider, dp ? `Общий — ${dp.name}` : "Общий — не выбран");
  const mh = agentModelHint(s, provs, a.provider);
  const mp = provs.find(x => x.id === (a.provider || def.provider));
  const body = `<div class="set-form" data-agent="${esc(a.id)}">
    <div class="set-row"><span>Включён</span><span>${switchHtml("enabled", a.enabled, "Включён")}</span></div>
    <label class="set-row"><span>Название</span><input type="text" name="name" value="${esc(a.name)}"></label>
    <label class="set-row"><span>Провайдер</span><select name="provider" class="prov-sel${mh.ready ? " ready" : ""}">${opts}</select></label>
    <div class="set-row"><span>Модель</span>${M.pickerHtml("model", a.model, mp ? providerConf(s, mp).models : undefined, mh.placeholder)}</div>
    <label class="set-row"><span>Температура <span class="muted">(0 — строго, 1 — свободнее)</span></span><input type="number" name="temperature" min="0" max="2" step="0.1" value="${esc(a.temperature)}"></label>
    <div class="set-row"><span>Читает этапы анкеты</span><span class="set-checks">${steps.map(st =>
      `<label><input type="checkbox" name="step" value="${esc(st.id)}"${a.steps.includes(st.id) ? " checked" : ""}> ${esc(st.title)}</label>`).join("")}</span></div>
    <div class="set-row wide set-agent-text-row"><span class="grp set-agent-texts">
      <button type="button" class="btn" data-edit="prompt">Инструкция агенту</button>
      ${a.id === "endocrinologist" ? `<button type="button" class="btn" data-edit="examMap">Карта обследования</button>` : ""}
      <button type="button" class="btn" data-edit="protocols">Протоколы</button>
    </span></div>
    <div class="set-foot"><span class="set-saved ok"></span><button class="btn danger" type="button" data-act="del">Удалить агента</button></div>
  </div>`;
  return fold("agent-" + a.id, a.name, agentStatus(a, provs, s), body);
}

/** Редактор длинного текста агента (инструкция / карта / протоколы) во всплывающем окне. */
function openAgentTextEditor(opts: {
  agentId: string;
  field: "prompt" | "examMap" | "protocols";
  title: string;
  onSaved: () => void;
}): void {
  const st0 = load();
  const a0 = st0.agents.find(x => x.id === opts.agentId);
  if (!a0) return;
  const initial = opts.field === "examMap" ? (a0.examMap || "")
    : opts.field === "protocols" ? (a0.protocols || "")
    : a0.prompt;
  const ov = document.createElement("div");
  ov.className = "cv-overlay";
  ov.innerHTML = `<div class="cv-dialog agent-text-dlg" role="dialog" aria-modal="true" aria-labelledby="agent-text-title">
    <div class="cv-head"><b id="agent-text-title">${esc(opts.title)} · ${esc(a0.name)}</b>
      <button type="button" class="btn cv-x" data-close aria-label="закрыть">✕</button></div>
    <textarea class="agent-text-ta" spellcheck="true">${esc(initial)}</textarea>
    <div class="grp">
      <button type="button" class="btn primary" data-save>Сохранить</button>
      <button type="button" class="btn" data-close>Отмена</button>
    </div>
  </div>`;
  document.body.appendChild(ov);
  lockScroll();
  const ta = q<HTMLTextAreaElement>(ov, "textarea.agent-text-ta");
  const close = () => {
    document.removeEventListener("keydown", onKey);
    ov.remove();
    unlockScroll();
  };
  const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  ov.addEventListener("click", e => { if (e.target === ov) close(); });
  ov.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", close));
  q<HTMLButtonElement>(ov, "[data-save]").onclick = () => {
    const st = load();
    const a = st.agents.find(x => x.id === opts.agentId);
    if (!a) { close(); return; }
    if (opts.field === "examMap") a.examMap = ta.value;
    else if (opts.field === "protocols") a.protocols = ta.value;
    else a.prompt = ta.value;
    save(st);
    opts.onSaved();
    close();
  };
  setTimeout(() => { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }, 0);
}

// ---------- хранение ----------
function whereText(): string {
  const st = Store.state;
  const w = st.where === "folder" ? `Настройки хранятся в папке «${st.folderName}» на этом компьютере.` : "Настройки хранятся в этом браузере.";
  return w + (st.encrypted ? " Ключи зашифрованы паролем." : "");
}
// Плашка над провайдерами и агентами (и во вкладке распознавания): нужен пароль или доступ к папке
export function gateHtml(): string {
  const st = Store.state;
  if (st.where === "folder" && !st.loaded) return `<div class="note gate">
      <b>Нет доступа к папке настроек «${esc(st.folderName)}».</b> Браузер спрашивает разрешение заново после перезапуска.
      <div class="grp"><button type="button" class="btn primary" data-gate="grant">Разрешить доступ к папке</button></div>
      ${st.error ? `<div class="err">${esc(st.error)}</div>` : ""}</div>`;
  if (st.locked) return `<form class="note gate" data-gate-form>
      <b>Ключи API зашифрованы.</b> Введите пароль, чтобы ими пользоваться в этой вкладке.
      <div class="grp"><input type="password" name="pw" autocomplete="current-password" placeholder="пароль" aria-label="пароль"><button type="submit" class="btn primary">Открыть</button></div>
      <div class="err" data-gate-err></div></form>`;
  return st.error ? `<div class="note gate err">${esc(st.error)}</div>` : "";
}
export function bindGate(root: HTMLElement, after: () => void): void {
  const g = root.querySelector<HTMLButtonElement>('[data-gate="grant"]');
  if (g) g.onclick = () => Store.grant().then(after).catch(e => alert((e instanceof Error && e.message) || e));
  const f = root.querySelector<HTMLFormElement>("[data-gate-form]");
  if (f) f.onsubmit = ev => {
    ev.preventDefault();
    const pw = f.querySelector<HTMLInputElement>("[name=pw]")!.value;
    const err = f.querySelector<HTMLElement>("[data-gate-err]")!;
    err.textContent = "Проверяю…";
    Store.unlock(pw).then(after).catch(e => { err.textContent = (e instanceof Error && e.message) || String(e); });
  };
}

function articlesCssStatusText(): string {
  return load().articlesCss ? "Свой CSS в этом браузере." : "Исходный CSS из репозитория.";
}

function openArticlesCssEditor(onDone: () => void): void {
  const own = load().articlesCss || "";
  const ov = document.createElement("div");
  ov.className = "cv-overlay";
  ov.innerHTML = `<div class="cv-dialog articles-css-dlg" role="dialog" aria-modal="true" aria-labelledby="articles-css-title">
    <div class="cv-head"><b id="articles-css-title">Стили статей</b>
      <button type="button" class="btn cv-x" data-close aria-label="закрыть">✕</button></div>
    <p class="muted small">Правки только в этом браузере. Для всех посетителей меняйте <code>docs/assets/articles.css</code> в репозитории и выгружайте сайт. Кабинет этими стилями не трогаем.</p>
    <textarea class="articles-css" spellcheck="false" disabled>Загрузка…</textarea>
    <p class="muted small" data-css-hint></p>
    <div class="grp">
      <button type="button" class="btn primary" data-css="save" disabled>Сохранить</button>
      <button type="button" class="btn" data-css="reset" disabled>Сбросить к исходному</button>
      <button type="button" class="btn" data-close>Отмена</button>
      <span class="muted" data-css-flash></span>
    </div>
  </div>`;
  document.body.appendChild(ov);
  lockScroll();
  const ta = q<HTMLTextAreaElement>(ov, "textarea.articles-css");
  const hint = q(ov, "[data-css-hint]");
  const flash = q(ov, "[data-css-flash]");
  const saveBtn = q<HTMLButtonElement>(ov, '[data-css="save"]');
  const resetBtn = q<HTMLButtonElement>(ov, '[data-css="reset"]');
  let defaultCss = "";
  let dirty = false;
  const norm = (t: string) => t.replace(/\r\n/g, "\n").trimEnd() + "\n";
  const refreshHint = () => {
    const saved = load().articlesCss || "";
    const cur = norm(ta.value);
    const def = defaultCss ? norm(defaultCss) : "";
    const savedN = saved ? norm(saved) : "";
    if (def && cur === def && !saved) hint.textContent = "Исходный CSS.";
    else if (savedN && cur === savedN) hint.textContent = "Свой CSS (сохранён в этом браузере).";
    else if (def && cur === def && saved) hint.textContent = "В поле исходник; в браузере ещё свой — «Сбросить» или «Сохранить».";
    else hint.textContent = "Изменён — нажмите «Сохранить», чтобы применить в этом браузере.";
  };
  const close = () => {
    document.removeEventListener("keydown", onKey);
    ov.remove();
    unlockScroll();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "Escape") return;
    if (dirty && !confirm("Закрыть без сохранения?")) return;
    close();
  };
  document.addEventListener("keydown", onKey);
  ov.addEventListener("click", e => {
    if (e.target !== ov) return;
    if (dirty && !confirm("Закрыть без сохранения?")) return;
    close();
  });
  ov.querySelectorAll<HTMLButtonElement>("[data-close]").forEach(b => {
    b.onclick = () => {
      if (dirty && !confirm("Закрыть без сохранения?")) return;
      close();
    };
  });
  fetchDefaultArticlesCss().then(def => {
    defaultCss = norm(def);
    ta.value = own || defaultCss;
    ta.disabled = false;
    saveBtn.disabled = false;
    resetBtn.disabled = false;
    refreshHint();
    ta.focus();
  }).catch(e => {
    ta.value = own || "";
    ta.disabled = false;
    saveBtn.disabled = false;
    resetBtn.disabled = !own;
    hint.innerHTML = `<span class="err">${esc((e && (e as Error).message) || "не удалось загрузить исходный CSS")}</span>`;
    ta.focus();
  });
  ta.oninput = () => { dirty = true; refreshHint(); };
  saveBtn.onclick = () => {
    const text = ta.value;
    const st = load();
    if (!defaultCss || norm(text) !== norm(defaultCss)) st.articlesCss = text;
    else st.articlesCss = "";
    save(st);
    dirty = false;
    refreshHint();
    savedFlash(flash);
    onDone();
  };
  resetBtn.onclick = () => {
    if (!defaultCss) return;
    ta.value = defaultCss;
    const st = load();
    st.articlesCss = "";
    save(st);
    dirty = false;
    refreshHint();
    savedFlash(flash);
    onDone();
  };
}

/** `#/settings/lang` или `#/settings/lang/en` — какой словарь открыт. */
function langFocusId(): LocaleId {
  const parts = location.hash.replace(/^#\/?/, "").split("/");
  if (parts[0] === "settings" && parts[1] === "lang" && parts[2]) {
    const id = parts[2] as LocaleId;
    if (I18n.LOCALE_IDS.includes(id)) return id;
  }
  return "ru";
}

/** JSON словаря с ключами по алфавиту — удобно копировать целиком в переводчик. */
function langDictText(dict: Record<string, string>): string {
  const sorted: Record<string, string> = {};
  for (const k of Object.keys(dict).sort((a, b) => a.localeCompare(b))) sorted[k] = dict[k];
  return JSON.stringify(sorted, null, 2);
}

/** Разобрать JSON объекта строк; иначе ошибка. */
function parseLangDict(raw: string): Record<string, string> {
  const j = JSON.parse(raw);
  if (!j || typeof j !== "object" || Array.isArray(j)) throw new Error("нужен JSON-объект вида { \"ключ\": \"текст\" }");
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(j as Record<string, unknown>)) {
    if (typeof v !== "string") throw new Error(`значение «${k}» должно быть строкой`);
    out[k] = v;
  }
  return out;
}

/** Оверлей = только отличия от встроенного словаря. */
function langOverlayDiff(builtin: Record<string, string>, next: Record<string, string>): Record<string, string> {
  const ov: Record<string, string> = {};
  for (const [k, v] of Object.entries(next)) {
    if ((builtin[k] ?? "") !== v) ov[k] = v;
  }
  // ключ был во встроенном, в новом тексте его нет — считаем удалением (пустая строка в оверлее)
  for (const k of Object.keys(builtin)) {
    if (!Object.prototype.hasOwnProperty.call(next, k)) ov[k] = "";
  }
  return ov;
}

/** Настройки → Язык: одно общее JSON-поле словаря (удобно копировать на перевод). Без переключения UI. */
function drawLang(main: HTMLElement): void {
  const paint = () => {
    const loc = langFocusId();
    const builtin = I18n.builtinDict(loc);
    const eff = I18n.effectiveDict(loc);
    const ownCount = Object.keys(load().i18n?.[loc] || {}).length;
    const chips = I18n.LOCALE_IDS.map(id =>
      `<a class="dx-chip${id === loc ? " on" : ""}" href="#/settings/lang/${id}">${esc(I18n.LOCALE_LABEL[id])}</a>`
    ).join("");
    const text = langDictText(eff);
    main.innerHTML = `<div class="set-head"><h2>Язык</h2><span class="muted">правки — только в этом браузере / файле настроек; в репозиторий из кабинета не пишутся</span></div>
      <p class="muted">Словарь подписей для выписки и (позже) интерфейса — один JSON на язык. Скопируйте целиком в переводчик или ИИ, вставьте обратно и сохраните. Ключи не переименовывайте. Переключатель языка интерфейса — отдельным шагом.</p>
      <div class="dx-chips" role="tablist" aria-label="Словарь">${chips}</div>
      <div class="card i18n-card">
        <div class="grp">
          <button type="button" class="btn primary" data-i18n-save>Сохранить</button>
          <button type="button" class="btn" data-i18n-reload>Вернуть сохранённое</button>
          <button type="button" class="btn" data-i18n-reset${ownCount ? "" : " disabled"}>Сбросить к встроенному${ownCount ? ` (${ownCount})` : ""}</button>
          <span class="muted" data-i18n-flash></span>
        </div>
        <p class="err" data-i18n-err hidden></p>
        <textarea class="i18n-ta" data-i18n-ta spellcheck="true" aria-label="словарь ${esc(I18n.LOCALE_LABEL[loc])}">${esc(text)}</textarea>
      </div>`;

    const ta = q<HTMLTextAreaElement>(main, "[data-i18n-ta]");
    const errEl = q(main, "[data-i18n-err]");
    const flash = q(main, "[data-i18n-flash]");
    const showErr = (msg: string) => {
      if (!errEl) return;
      if (!msg) { errEl.hidden = true; errEl.textContent = ""; return; }
      errEl.hidden = false;
      errEl.textContent = msg;
    };

    q<HTMLButtonElement>(main, "[data-i18n-save]").onclick = () => {
      try {
        const next = parseLangDict(ta.value);
        const ov = langOverlayDiff(builtin, next);
        const st = load();
        if (!st.i18n) st.i18n = {};
        if (Object.keys(ov).length) st.i18n[loc] = ov;
        else delete st.i18n[loc];
        save(st);
        showErr("");
        paint();
        savedFlash(q(main, "[data-i18n-flash]"));
      } catch (e) {
        showErr((e instanceof Error && e.message) || String(e));
      }
    };
    q<HTMLButtonElement>(main, "[data-i18n-reload]").onclick = () => {
      ta.value = langDictText(I18n.effectiveDict(loc));
      showErr("");
    };
    const resetBtn = q<HTMLButtonElement>(main, "[data-i18n-reset]");
    if (resetBtn) resetBtn.onclick = () => {
      if (!ownCount) return;
      if (!confirm(`Сбросить словарь «${I18n.LOCALE_LABEL[loc]}» к встроенному?`)) return;
      const st = load();
      if (st.i18n) delete st.i18n[loc];
      save(st);
      paint();
      savedFlash(q(main, "[data-i18n-flash]"));
    };
  };
  paint();
}

function drawMisc(main: HTMLElement): void {
  const paint = () => {
    main.innerHTML = `<div class="set-head"><h2>Прочее</h2></div>
    <div class="card store-card">
      <h2>Счётчики сайта</h2>
      <p class="muted">Яндекс.Метрику, Google Analytics и другой код шапки вставляйте в <code>docs/assets/site-inject.html</code> в репозитории (или на хостинге), затем выгружайте сайт. Из кабинета это не пишется — на статическом хосте нет защиты от правок гостей.</p>
    </div>
    <div class="card store-card">
      <h2>Стили статей</h2>
      <p class="muted">CSS страниц статей и шапки. Правки здесь — только в этом браузере; для всех посетителей меняйте <code>docs/assets/articles.css</code> в репозитории.</p>
      <p class="muted small" data-css-status>${esc(articlesCssStatusText())}</p>
      <div class="grp">
        <button type="button" class="btn primary" data-css="edit">Редактировать</button>
        <button type="button" class="btn" data-css="reset-card"${load().articlesCss ? "" : " disabled"}>Сбросить к исходному</button>
        <span class="muted" data-css-flash></span>
      </div>
    </div>
    <div class="card store-card">
      <h2>Аудит проекта</h2>
      <p class="muted">Проверка кода и данных без правок: инструкция для ИИ — файл <code>AUDIT.md</code> в корне репозитория. Заключения складывайте в <code>audit/reports/</code> по шаблону <code>audit/REPORT_TEMPLATE.md</code>, потом по ним чините в IDE.</p>
    </div>`;
    q<HTMLButtonElement>(main, '[data-css="edit"]').onclick = () => openArticlesCssEditor(paint);
    const resetCard = q<HTMLButtonElement>(main, '[data-css="reset-card"]');
    resetCard.onclick = () => {
      if (!load().articlesCss) return;
      if (!confirm("Сбросить свой CSS статей в этом браузере к исходному из репозитория?")) return;
      const st = load();
      st.articlesCss = "";
      save(st);
      paint();
      savedFlash(q(main, "[data-css-flash]"));
    };
  };
  paint();
}

function drawStorage(main: HTMLElement, redraw: () => void): void {
  const st = Store.state;
  const folderCard = `<div class="card store-card">
      <h2>Где хранить настройки</h2>
      <p class="muted">Провайдеры, ключи API, агенты — всё, что есть в настройках, хранится одним файлом у вас. На сервер ничего не уходит.</p>
      <p><b>Сейчас:</b> ${st.where === "folder" ? `в папке «${esc(st.folderName)}», файл <code>${Store.FILE}</code>${st.loaded ? "" : ' — <span class="err">нет доступа</span>'}` : "в этом браузере"}.</p>
      ${Store.folderSupported ? `<div class="grp">
        <button type="button" class="btn primary" data-st="folder">${st.where === "folder" ? "Выбрать другую папку" : "Хранить в папке на компьютере"}</button>
        ${st.where === "folder" && !st.loaded ? `<button type="button" class="btn" data-gate="grant">Разрешить доступ к папке</button>` : ""}
        ${st.where === "folder" ? `<button type="button" class="btn" data-st="browser">Хранить в браузере</button>` : ""}
      </div>
      <p class="muted small">В папке настройки переживут очистку браузера, и их легко перенести на другой компьютер. После перезапуска браузер может один раз спросить разрешение на доступ к папке. Выберите отдельную папку — не ту, где лежат клиенты.</p>`
      : `<p class="muted">Этот браузер не умеет работать с папками на компьютере — нужен Chrome, Edge, Яндекс.Браузер или Opera. Настройки можно переносить файлом (ниже).</p>`}
    </div>`;
  const encCard = `<div class="card store-card">
      <h2>Шифрование ключей паролем</h2>
      <div class="set-row"><span>Шифровать ключи API<small>если кто-то получит доступ к компьютеру или папке, ключи без пароля бесполезны</small></span><span>${switchHtml("enc", st.encrypted, "Шифровать ключи API")}</span></div>
      <form class="enc-form" data-enc-on hidden>
        <p class="muted small">Пароль нигде не сохраняется. После перезагрузки страницы кабинет попросит его снова. <b>Если пароль забыть, ключи придётся ввести заново.</b></p>
        <div class="grp"><input type="password" name="p1" autocomplete="new-password" placeholder="новый пароль" aria-label="новый пароль"><input type="password" name="p2" autocomplete="new-password" placeholder="ещё раз" aria-label="повтор пароля"><button type="submit" class="btn primary">Зашифровать</button><button type="button" class="btn" data-enc-cancel>Отмена</button></div>
      </form>
      ${st.locked ? `<p class="muted small">Сейчас ключи закрыты — введите пароль на вкладке «Провайдеры» или здесь:</p>${gateHtml()}` : ""}
      <div class="err" data-enc-err></div>
    </div>`;
  const fileCard = `<div class="card store-card">
      <h2>Перенос настроек файлом</h2>
      <p class="muted">Чтобы перенести настройки на другой компьютер, в другой браузер или в будущее приложение.${st.encrypted ? " Ключи в файле останутся зашифрованными — понадобится тот же пароль." : ""}</p>
      <div class="grp"><button type="button" class="btn" data-st="export">Сохранить настройки в файл</button><label class="btn">Загрузить из файла<input type="file" data-st-import accept=".json,application/json" hidden></label></div>
    </div>`;
  main.innerHTML = `<div class="set-head"><h2>Хранение настроек</h2><span class="muted">${esc(whereText())}</span></div>
    ${st.error ? `<div class="note err">${esc(st.error)}</div>` : ""}
    ${folderCard}${encCard}${fileCard}`;
  bindGate(main, redraw);
  const fail = (e: unknown) => { if (e instanceof DOMException && e.name === "AbortError") return; alert((e instanceof Error && e.message) || String(e)); };

  const fb = main.querySelector<HTMLButtonElement>('[data-st="folder"]');
  if (fb) fb.onclick = () => Store.chooseFolder(name =>
    confirm(`В папке «${name}» уже есть файл настроек ${Store.FILE}.\n\nOK — взять настройки из этого файла.\nОтмена — заменить его текущими настройками.`)).then(redraw).catch(fail);
  const bb = main.querySelector<HTMLButtonElement>('[data-st="browser"]');
  if (bb) bb.onclick = () => {
    if (!confirm("Перенести настройки обратно в браузер? Файл в папке останется, но кабинет перестанет его обновлять.")) return;
    Store.toBrowser().then(redraw).catch(fail);
  };

  const sw = main.querySelector<HTMLInputElement>("[name=enc]")!;
  const onForm = main.querySelector<HTMLFormElement>("[data-enc-on]")!;
  const encErr = main.querySelector<HTMLElement>("[data-enc-err]")!;
  sw.addEventListener("change", () => {
    encErr.textContent = "";
    if (sw.checked && !st.encrypted) { onForm.hidden = false; onForm.querySelector<HTMLInputElement>("[name=p1]")!.focus(); return; }
    if (!sw.checked && st.encrypted) {
      if (st.locked) { sw.checked = true; encErr.textContent = "Сначала введите пароль — иначе ключи не расшифровать."; return; }
      if (!confirm("Выключить шифрование? Ключи будут храниться открытым текстом.")) { sw.checked = true; return; }
      Store.disableEncryption().then(redraw).catch(fail);
    }
  });
  main.querySelector<HTMLButtonElement>("[data-enc-cancel]")!.onclick = () => { onForm.hidden = true; sw.checked = false; };
  onForm.onsubmit = ev => {
    ev.preventDefault();
    const p1 = onForm.querySelector<HTMLInputElement>("[name=p1]")!.value, p2 = onForm.querySelector<HTMLInputElement>("[name=p2]")!.value;
    if (p1.length < 6) { encErr.textContent = "Пароль — не короче 6 символов."; return; }
    if (p1 !== p2) { encErr.textContent = "Пароли не совпадают."; return; }
    encErr.textContent = "Шифрую…";
    Store.enableEncryption(p1).then(redraw).catch(fail);
  };

  main.querySelector<HTMLButtonElement>('[data-st="export"]')!.onclick = async () => {
    if (!st.encrypted && Object.values(load().providers).some(c => c && c.apiKey)
      && !confirm("Ключи API попадут в файл открытым текстом. Храните файл в надёжном месте (или сначала включите шифрование). Сохранить?")) return;
    const text = await Store.exportText();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    a.download = "electrodoctor-settings-" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const imp = main.querySelector<HTMLInputElement>("[data-st-import]")!;
  imp.onchange = async () => {
    const f = imp.files && imp.files[0]; imp.value = ""; if (!f) return;
    if (!confirm("Заменить текущие настройки настройками из файла «" + f.name + "»?")) return;
    try { await Store.importText(await f.text()); redraw(); } catch (e) { fail(e); }
  };
}

// ---------- нормы и веса ----------
// Все числовые показатели анализов (качественные «обнаружено / не обнаружено» не считаются).
// Норма — значение по умолчанию для всех клиентов (у клиента её можно изменить в анкете).
// Кривая критичности — отклонение от нормы в % → 0–100; безопасный диапазон считается по ней.
function weightsOwnCounts(): string {
  const st = load();
  const nn = Object.keys(st.norms || {}).filter(k => NORMS[k]).length;
  const nc = Object.keys(st.curves || {}).filter(k => NORMS[k]).length;
  return nn || nc ? `изменено норм: ${nn}, кривых: ${nc}` : "всё исходное";
}

function bindWeightsFiles(main: HTMLElement): void {
  const download = (name: string, text: string) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const today = () => new Date().toISOString().slice(0, 10);
  q<HTMLButtonElement>(main, "#wdlbase").onclick = () => {
    if (!normsRaw) { alert(normsError || "Исходные нормы не загружены."); return; }
    download("norms.json", normsRaw);
  };
  q<HTMLButtonElement>(main, "#wdlcur").onclick = () => {
    if (!normsRaw) { alert(normsError || "Исходные нормы не загружены."); return; }
    const j = JSON.parse(normsRaw), st = load();
    for (const [code, it] of Object.entries<any>(j.items || {})) {
      const nv = (st.norms || {})[code], cv = (st.curves || {})[code];
      if (typeof nv === "number") it.norm = nv;
      if (cv) it.curve = { L: cv.L, R: cv.R, pts: cv.pts, ...(cv.linear ? { linear: true } : {}) };
      if (it.source) delete it.source;
    }
    j.updated = today();
    download("norms-" + today() + ".json", JSON.stringify(j, null, 2));
  };
  const imp = q<HTMLInputElement>(main, "#wimport");
  imp.onchange = async () => {
    const file = imp.files && imp.files[0]; imp.value = ""; if (!file) return;
    let j: any;
    try { j = JSON.parse(await file.text()); } catch (e) { alert("Файл не читается как JSON."); return; }
    if (!j || j.format !== "electrodoctor-norms" || !j.items) { alert("Это не файл норм Электродоктора (нужен format: \"electrodoctor-norms\")."); return; }
    const st = load(); const norms = { ...(st.norms || {}) }, cs = { ...(st.curves || {}) };
    let nN = 0, nC = 0, skip = 0;
    for (const [code, it] of Object.entries<any>(j.items)) {
      if (!NORMS[code]) { skip++; continue; }
      if (typeof it.norm === "number" && isFinite(it.norm)) {
        if (it.norm === NORMS[code].v) delete norms[code]; else { norms[code] = it.norm; nN++; }
      }
      const c = it.curve;
      if (c && Array.isArray(c.pts) && c.pts.length >= 2 && typeof c.L === "number" && typeof c.R === "number") {
        const cur: Curve = { L: c.L, R: c.R, pts: c.pts, linear: !!c.linear };
        if (sameCurve(cur, baseCurve(code)!)) delete cs[code]; else { cs[code] = cur; nC++; }
      }
    }
    if (!confirm(`Применить файл «${file.name}» как свои нормы и кривые?\nОтличается от исходного: норм — ${nN}, кривых — ${nC}.${skip ? `\nНеизвестных показателей пропущено: ${skip}.` : ""}`)) return;
    st.norms = norms; st.curves = cs; save(st); drawWeights(main);
  };
  q<HTMLButtonElement>(main, "#wresetall").onclick = () => {
    if (!confirm("Вернуть исходные нормы и кривые критичности для всех показателей? Нормы, изменённые у отдельных клиентов, останутся.")) return;
    const st = load(); st.norms = {}; st.curves = {}; save(st); drawWeights(main);
  };
}

function bindWeightsTable(main: HTMLElement, fields: WeightField[], onChanged?: () => void, skipSearch = false): void {
  const byCode = new Map(fields.map(f => [f.code, f]));
  const safeCell = (code: string, unit: string) => {
    if (valueKindOf(code) !== "norm" || !NORMS[code]) {
      return `<span class="muted">${esc(weightKindLabel(code))}</span>`;
    }
    const nv = defaultNorm(code)!, c = curveFor(code)!, mine = typeof (load().norms || {})[code] === "number";
    const nb = `<b class="${mine ? "own" : ""}" title="${mine ? "норма изменена; встроенная " + fmtNum(NORMS[code].v) : "встроенная норма"}">${fmtNum(nv)}</b>`;
    if (nv === 0) return `${nb}<small>кривая не применяется — норма 0</small>`;
    return `${nb}<small>безопасно ${esc(safeText(c, nv, unit).range)}</small>`;
  };
  const setNorm = (code: string, v: number | null) => {
    if (!NORMS[code]) return;
    const st = load(); const norms = { ...(st.norms || {}) };
    if (v === null || v === NORMS[code].v) delete norms[code]; else norms[code] = v;
    st.norms = norms; save(st);
  };
  const dummyCurve = () => defaultCurve(1, "до 1");
  main.querySelectorAll<HTMLTableRowElement>("tr[data-w]").forEach(tr => {
    const code = tr.dataset.w!;
    const f = byCode.get(code); if (!f) return;
    const safe = tr.querySelector<HTMLElement>("[data-safe]")!;
    const show = () => {
      const st = load();
      const changed = typeof (st.norms || {})[code] === "number" || !!(st.curves || {})[code];
      safe.innerHTML = safeCell(code, f.unit || "");
      const cb = tr.querySelector<HTMLButtonElement>("[data-curve]")!;
      cb.classList.toggle("own", changed);
      const tag = tr.querySelector(".w-own");
      if (changed && !tag) cb.insertAdjacentHTML("afterend", '<span class="w-own" title="норма или кривая изменены">своя</span>');
      if (!changed && tag) tag.remove();
      onChanged && onChanged();
    };
    tr.querySelector<HTMLButtonElement>("[data-curve]")!.onclick = () => {
      const hasN = !!NORMS[code];
      const base = hasN ? baseCurve(code)! : dummyCurve();
      openEditor({
        title: f.label, unit: f.unit || "",
        norm: hasN ? defaultNorm(code)! : 1,
        normBase: hasN ? NORMS[code].v : 1,
        curve: hasN ? curveFor(code)! : dummyCurve(),
        base,
        showKind: true, kind: valueKindOf(code),
        onClose: (c, isBase, nv, kind) => {
          saveLabKind(code, kind);
          if (kind === "norm" && hasN) {
            setNorm(code, nv);
            const st = load(); const cs = { ...(st.curves || {}) };
            if (isBase) delete cs[code]; else cs[code] = c;
            st.curves = cs; save(st);
          }
          show();
          tr.querySelector<HTMLButtonElement>("[data-curve]")!.focus();
        },
      });
    };
  });
  if (skipSearch) return;
  const qi = main.querySelector<HTMLInputElement>("#wq");
  if (!qi) return;
  qi.addEventListener("input", () => {
    const k = qi.value.trim().toLowerCase();
    let any = false;
    main.querySelectorAll<HTMLTableRowElement>("tr[data-w]").forEach(tr => {
      const ok = !k || (tr.dataset.k || "").includes(k);
      tr.hidden = !ok; if (ok) any = true;
    });
    const empty = main.querySelector<HTMLElement>("#wempty");
    if (empty) empty.hidden = any;
  });
}

function weightKindLabel(code: string): string {
  const k = valueKindOf(code);
  return k === "presence" ? "наличие" : k === "text" ? "текст" : "норма";
}

function weightRowHtml(f: WeightField): string {
  const own = load().norms || {}, curves = load().curves || {};
  const kind = valueKindOf(f.code);
  const n = NORMS[f.code], mine = typeof own[f.code] === "number", myCurve = !!curves[f.code];
  const art = weightArtUrl(f.code);
  const artLink = art ? `<a class="dx-art" href="${esc(art)}" target="_blank" rel="noopener" title="статья об анализе" aria-label="статья">↗</a>` : "";
  const unit = f.unit ? `<span class="lab-unit">${esc(f.unit)}</span>` : "";
  const dxN = Dx.diagnosesUsingLab(f.code).length;
  const refsBtn = dxN
    ? `<button type="button" class="lab-refs" data-refs="${esc(f.code)}" title="в скольких диагнозах используется">${dxN}</button>`
    : `<span class="lab-refs zero" title="нет в признаках диагнозов">0</span>`;
  const search = ((Labs.LABS[f.code]?.aliases || []).join(" ") + " " + f.label + " " + f.code).toLowerCase();
  let mid: string;
  if (kind !== "norm" || !n) {
    mid = `<span class="muted">${esc(weightKindLabel(f.code))}</span>`;
  } else {
    const nv = defaultNorm(f.code)!, c = curveFor(f.code)!;
    const nb = `<b class="${mine ? "own" : ""}" title="${mine ? "норма изменена; встроенная " + fmtNum(NORMS[f.code].v) : "встроенная норма"}">${fmtNum(nv)}</b>`;
    mid = nv === 0 ? `${nb}<small>кривая не применяется — норма 0</small>`
      : `${nb}<small>безопасно ${esc(safeText(c, nv, f.unit || "").range)}</small>`;
  }
  const tip = n
    ? `норма и безопасный диапазон; интервал ${esc(n.range)}`
    : `тип: ${esc(weightKindLabel(f.code))}`;
  return `<tr data-w="${esc(f.code)}" data-g="${esc(f.group)}" data-k="${esc(search)}">
    <td><span class="lab-name"><b>${esc(f.label)}</b>${artLink}${unit}${refsBtn}</span><small>${esc(f.code)}${n && n.note ? " · " + esc(n.note) : ""}</small></td>
    <td class="w-safe" title="${tip}" data-safe>${mid}</td>
    <td><span class="w-curvecell"><button type="button" class="btn w-curve${myCurve || mine ? " own" : ""}" data-curve>Настроить</button>${myCurve || mine ? '<span class="w-own" title="норма или кривая изменены">своя</span>' : ""}</span></td>
  </tr>`;
}

function openDxRefsPopup(code: string, label: string): void {
  const list = Dx.diagnosesUsingLab(code);
  const ov = document.createElement("div");
  ov.className = "cv-overlay";
  const body = list.length
    ? `<ul class="w-dxrefs">${list.map(d => {
      const href = d.section
        ? `#/settings/diagnoses/${encodeURIComponent(d.section)}/${encodeURIComponent(d.file)}`
        : Dx.articleUrl(d.file);
      return `<li><a href="${esc(href)}" target="_blank" rel="noopener">${esc(d.title)}</a></li>`;
    }).join("")}</ul>`
    : `<p class="muted">Этот анализ пока не входит в признаки ни одного диагноза.</p>`;
  ov.innerHTML = `<div class="cv-dialog w-dxrefs-dlg" role="dialog" aria-modal="true" aria-labelledby="w-dxrefs-title">
    <div class="cv-head"><b id="w-dxrefs-title">${esc(label)} · в диагнозах (${list.length})</b>
      <button type="button" class="btn cv-x" data-close aria-label="закрыть">✕</button></div>
    ${body}
    <div class="grp" style="margin-top:12px"><button type="button" class="btn" data-close>Закрыть</button></div>
  </div>`;
  document.body.appendChild(ov);
  lockScroll();
  const close = () => {
    document.removeEventListener("keydown", onKey);
    ov.remove(); unlockScroll();
  };
  const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  ov.addEventListener("click", e => { if (e.target === ov) close(); });
  ov.querySelectorAll<HTMLButtonElement>("[data-close]").forEach(b => b.onclick = close);
  ov.querySelector<HTMLButtonElement>("[data-close]")?.focus();
}

function drawWeightsSection(main: HTMLElement, sec: SetLabs.LabSec, focusCode = ""): void {
  Labs.applyOwn(load().labs as Record<string, Labs.Lab> | undefined);
  const fields = weightFieldsIn(sec);
  const counts = new Map<string, number>();
  for (const f of fields) counts.set(f.group, (counts.get(f.group) || 0) + 1);
  const groups = [...counts.keys()].sort((a, b) => (counts.get(b)! - counts.get(a)!)
    || groupLabel(a, sec).localeCompare(groupLabel(b, sec), "ru"));
  const chip = (g: string, label: string, n: number, on = false) =>
    `<button type="button" class="dx-chip${on ? " on" : ""}" data-g="${esc(g)}">${esc(label)} <span class="dx-chip-n">${n}</span></button>`;
  main.innerHTML = `<div class="dx-secbar">
      <a href="#/settings/weights">← Все разделы</a>
      ${SetLabs.secIcon(sec, 32)}
      <h2>${esc(sec.title)}</h2>
      <span class="muted" id="wcount">${fields.length} ${pluralPok(fields.length)}</span>
      <button type="button" class="btn primary" id="lab-new">+ Добавить анализ</button>
      <input type="search" id="wq" placeholder="Поиск по названию, коду, синониму" aria-label="поиск показателя">
    </div>
    <div class="lab-chips" role="group" aria-label="Группы">
      ${chip("", "Все", fields.length, true)}
      ${groups.map(g => chip(g, groupLabel(g, sec), counts.get(g) || 0)).join("")}
    </div>
    <div class="lab-newform card" id="labnewform" hidden>
      <div class="lab-newgrid">
        <label>Название <input name="name" required placeholder="например, Витамин B12"></label>
        <label>Код <input name="code" required placeholder="B12" pattern="[A-Za-z][A-Za-z0-9_]*" title="латиница, цифры, подчёркивание"></label>
        <label>Единица <input name="unit" placeholder="пмоль/л"></label>
        <label>Тип <select name="type"><option value="number">норма (число)</option><option value="qual">наличие</option><option value="text">текст</option></select></label>
        <label>Группа <select name="group">${groups.map(g => `<option value="${esc(g)}">${esc(groupLabel(g, sec))} (${counts.get(g) || 0})</option>`).join("")}
          <option value="${esc(sec.prefix + " — прочее")}">прочее</option></select></label>
      </div>
      <p class="muted">Анализ попадёт в справочник и станет доступен в кабинете и признаках диагнозов.</p>
      <div class="grp"><button type="button" class="btn primary" data-lab-save>Сохранить</button><button type="button" class="btn" data-lab-cancel>Отмена</button><span class="err" data-lab-err></span></div>
    </div>
    <p class="muted set-hint">Тип показателя — «Настроить». Цифра у названия — в скольких диагнозах анализ в признаках (клик — список со ссылками на статьи).</p>
    ${normsError ? `<div class="note err">${esc(normsError)}</div>` : ""}
    <div class="card tblwrap w-card"><table class="w-table">
      <thead><tr><th>Показатель</th><th>Норма / тип</th><th></th></tr></thead>
      <tbody>${fields.map(weightRowHtml).join("")}</tbody>
    </table>
    <p class="muted empty" id="wempty"${fields.length ? " hidden" : ""}>${fields.length ? "Ничего не найдено" : "В этом разделе пока нет анализов."}</p></div>`;

  const form = main.querySelector<HTMLElement>("#labnewform")!;
  let group = "";
  const applyFilter = () => {
    const s = (main.querySelector<HTMLInputElement>("#wq")?.value || "").trim().toLowerCase();
    let n = 0;
    main.querySelectorAll<HTMLElement>("tr[data-w]").forEach(tr => {
      const ok = (!group || tr.dataset.g === group) && (!s || (tr.dataset.k || "").includes(s));
      tr.hidden = !ok; if (ok) n++;
    });
    const empty = main.querySelector<HTMLElement>("#wempty");
    if (empty) {
      empty.hidden = n > 0;
      empty.textContent = fields.length ? "Ничего не найдено" : "В этом разделе пока нет анализов.";
    }
    const wc = main.querySelector("#wcount");
    if (wc) wc.textContent = `${n} ${pluralPok(n)}${n !== fields.length ? " из " + fields.length : ""}`;
  };
  main.querySelectorAll<HTMLButtonElement>(".lab-chips .dx-chip").forEach(b => b.addEventListener("click", () => {
    group = b.dataset.g || "";
    main.querySelectorAll(".lab-chips .dx-chip").forEach(x => x.classList.toggle("on", x === b));
    const gs = form.querySelector<HTMLSelectElement>("[name=group]");
    if (gs && group) gs.value = group;
    applyFilter();
  }));
  main.querySelector<HTMLButtonElement>("#lab-new")!.onclick = () => {
    form.hidden = false;
    const gs = form.querySelector<HTMLSelectElement>("[name=group]");
    if (gs && group) gs.value = group;
    form.querySelector<HTMLInputElement>("[name=name]")!.focus();
  };
  form.querySelector<HTMLButtonElement>("[data-lab-cancel]")!.onclick = () => {
    form.hidden = true;
    form.querySelector<HTMLElement>("[data-lab-err]")!.textContent = "";
  };
  form.querySelector<HTMLButtonElement>("[data-lab-save]")!.onclick = () => {
    const err = form.querySelector<HTMLElement>("[data-lab-err]")!;
    const name = form.querySelector<HTMLInputElement>("[name=name]")!.value.trim();
    let code = form.querySelector<HTMLInputElement>("[name=code]")!.value.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_");
    const unit = form.querySelector<HTMLInputElement>("[name=unit]")!.value.trim();
    const type = form.querySelector<HTMLSelectElement>("[name=type]")!.value as Labs.LabType;
    const g = form.querySelector<HTMLSelectElement>("[name=group]")!.value || `${sec.prefix} — прочее`;
    if (!name) { err.textContent = "Укажите название."; return; }
    if (!code || !/^[A-Z][A-Z0-9_]*$/.test(code)) { err.textContent = "Код: латиница, можно цифры и _ , начинается с буквы."; return; }
    Labs.applyOwn(load().labs as Record<string, Labs.Lab> | undefined);
    if (Labs.has(code)) { err.textContent = `Код ${code} уже есть в справочнике.`; return; }
    const lab: Labs.Lab = { name, aliases: [], type, unit, group: g, inForm: false, refs: 0 };
    const st = load();
    st.labs = { ...(st.labs || {}), [code]: lab };
    save(st);
    Labs.applyOwn(st.labs as Record<string, Labs.Lab>);
    drawWeightsSection(main, sec);
  };
  bindWeightsTable(main, fields, undefined, true);
  main.querySelector<HTMLInputElement>("#wq")?.addEventListener("input", applyFilter);
  main.querySelectorAll<HTMLButtonElement>("[data-refs]").forEach(b => {
    b.onclick = ev => {
      ev.preventDefault();
      ev.stopPropagation();
      const code = b.dataset.refs!;
      const f = fields.find(x => x.code === code);
      openDxRefsPopup(code, (f && f.label) || code);
    };
  });
  // переход из кабинета: #/settings/weights/<раздел>/<КОД> — прокрутить к строке и подсветить
  if (focusCode) {
    const tr = main.querySelector<HTMLTableRowElement>(`tr[data-w="${CSS.escape(focusCode)}"]`);
    if (tr) {
      const g = tr.dataset.g || "";
      if (g) {
        const chipBtn = [...main.querySelectorAll<HTMLButtonElement>(".lab-chips .dx-chip")].find(b => b.dataset.g === g);
        if (chipBtn) chipBtn.click();
      }
      tr.classList.add("w-focus");
      requestAnimationFrame(() => tr.scrollIntoView({ block: "center", behavior: "smooth" }));
      const btn = tr.querySelector<HTMLButtonElement>("[data-curve]");
      if (btn) btn.focus();
    }
  }
}

let weightsDxReady = false;

function drawWeights(main: HTMLElement): void {
  if (!Object.keys(Labs.LABS).length) {
    main.innerHTML = `<p class="muted">Загружаю каталог анализов…</p>`;
    Labs.loadLabs().then(() => { Labs.applyOwn(load().labs as Record<string, Labs.Lab> | undefined); drawWeights(main); });
    return;
  }
  Labs.applyOwn(load().labs as Record<string, Labs.Lab> | undefined);
  if (!weightsDxReady) {
    main.innerHTML = `<p class="muted">Загружаю признаки диагнозов…</p>`;
    Promise.all([Sg.loadSigns(), Dx.loadDiagnoses()]).then(() => { weightsDxReady = true; drawWeights(main); });
    return;
  }
  const parts = location.hash.replace(/^#\/?/, "").split("/");
  const sub = decodeURIComponent(parts[2] || "");
  const focusCode = decodeURIComponent(parts[3] || "");
  const sec = SetLabs.SECS.find(s => s.id === sub);
  if (sec) { drawWeightsSection(main, sec, focusCode); return; }

  const all = weightFields();
  const counts = SetLabs.SECS.map(s => ({ s, n: weightFieldsIn(s).length }));
  main.innerHTML = `
    <div class="set-head"><h2>Нормы и веса</h2><span class="muted" id="wcount">${weightsOwnCounts()}</span></div>
    <p class="muted set-hint">Каталог анализов по материалу. Внутри раздела — подгруппы, добавление анализа, тип (норма / наличие / текст) и нормы. Новый код также доступен в кабинете.</p>
    ${normsError ? `<div class="note err">${esc(normsError)}</div>` : ""}
    <div class="w-bar"><span class="muted">${all.length} ${pluralPok(all.length)} в каталоге</span>
      <span class="grp w-files">
        <button type="button" class="btn" id="wdlbase" title="файл docs/data/norms.json как есть">Скачать исходные</button>
        <button type="button" class="btn" id="wdlcur" title="тот же формат, но с вашими нормами и кривыми">Скачать текущие</button>
        <label class="btn" title="применить нормы и кривые из файла как свои">Загрузить из файла<input type="file" id="wimport" accept=".json,application/json" hidden></label>
        <button type="button" class="btn" id="wresetall">Вернуть всё исходное</button>
      </span></div>
    <div class="dx-grid">${counts.map(({ s, n }) =>
      `<a class="dx-card" href="#/settings/weights/${esc(s.id)}">${SetLabs.secIcon(s)}<span class="dx-name">${esc(s.title)}</span><span class="dx-desc">${esc(s.desc)}</span><span class="dx-count">${n} ${pluralPok(n)}</span></a>`
    ).join("")}</div>`;
  bindWeightsFiles(main);
}
