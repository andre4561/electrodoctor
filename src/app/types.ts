// SPDX-License-Identifier: AGPL-3.0-or-later
// Электродоктор — общие типы кабинета.

export type FieldType = "text" | "textarea" | "date" | "select" | "number" | "yesno" | "scale" | "slider" | "table" | "files" | "aiimport";

export interface Column { key: string; label: string; type: "text"; placeholder?: string }

export interface Field {
  code: string;
  label: string;
  type: FieldType;
  required?: boolean;
  hint?: string;
  unit?: string;
  min?: number;
  max?: number;
  step?: number | "any";
  options?: [string, string][];   // для select: [значение, подпись]
  columns?: Column[];             // для table
  computed?: "bmi";               // считается автоматически
  hidden?: boolean;               // поле есть в коде, но выключено: вместо него короткая пометка
  row?: string;                   // одинаковый id — соседние поля в одну строку (параметры)
  scaleFrom?: string;             // подпись у 0 для type: "slider"
  scaleTo?: string;               // подпись у 100 для type: "slider"
}

export interface Section {
  id?: string;
  title: string;
  fold?: boolean;
  note?: string;                  // пояснение под заголовком (черновик раздела и т.п.)
  fields: Field[];
}
export interface Step { id: string; title: string; sections: Section[] }

export type TableRow = Record<string, string>;
export interface FileRef {
  id: string;
  name: string;            // исходное имя файла
  size: number;
  type: string;
  addedAt: string;
  savedAs?: string;        // имя в подпапке «файлы анализов», если выбрана папка
}
export type Value = string | number | TableRow[] | FileRef[];

export interface Client {
  id: string;
  createdAt: string;
  updatedAt?: string;
  folder?: string;               // подпапка в выбранной папке на компьютере
  values: Record<string, Value | undefined>;
  norms?: Record<string, number>;   // нормы, изменённые у этого клиента (по умолчанию — из настроек «Нормы и веса»)
  curves?: Record<string, { L: number; R: number; pts: [number, number][]; linear?: boolean }>;   // свои кривые критичности клиента
  labs?: LabSet[];               // сохранённые анализы по датам
  labSel?: string;               // какой набор сейчас открыт на вкладке «Анализы»; "" — новый, ещё не сохранённый
  labMeta?: { date: string; time?: string };   // дата и время в строке «Сохранить» для открытого бланка
  params?: ParamSet[];           // замеры тела и жизненные показатели по датам
  paramSel?: string;             // какой снимок открыт на вкладке «Параметры»; "" — новый
  paramMeta?: { date: string; time?: string };
}
// Анализы одной сдачи: дата, время и значения полей вкладки «Анализы»
export interface LabSet { id: string; date: string; time?: string; values: Record<string, Value>; savedAt: string }
// Снимок параметров (вес, давление и т.п.) на дату; рост и генетика в снимки не входят
export interface ParamSet { id: string; date: string; time?: string; values: Record<string, Value>; savedAt: string }

export interface Store { version: 1; clients: Record<string, Client> }
