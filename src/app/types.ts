// SPDX-License-Identifier: AGPL-3.0-or-later
// Электродоктор — общие типы кабинета.

export type FieldType = "text" | "textarea" | "date" | "select" | "number" | "yesno" | "scale" | "table" | "files" | "aiimport";

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
}

export interface Section { id?: string; title: string; fold?: boolean; fields: Field[] }
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
}
// Анализы одной сдачи: дата, время и значения полей вкладки «Анализы»
export interface LabSet { id: string; date: string; time?: string; values: Record<string, Value>; savedAt: string }

export interface Store { version: 1; clients: Record<string, Client> }
