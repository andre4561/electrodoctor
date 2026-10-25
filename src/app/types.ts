// SPDX-License-Identifier: AGPL-3.0-or-later
// Электродоктор — общие типы кабинета.

export type FieldType = "text" | "textarea" | "date" | "select" | "number" | "yesno" | "scale" | "table" | "files";

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
}

export interface Store { version: 1; clients: Record<string, Client> }
