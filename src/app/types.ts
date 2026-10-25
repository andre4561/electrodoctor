// SPDX-License-Identifier: AGPL-3.0-or-later
// Электродоктор — общие типы кабинета.

export type FieldType = "text" | "textarea" | "date" | "select" | "number" | "yesno" | "scale" | "table";

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

export interface Section { title: string; fields: Field[] }
export interface Step { id: string; title: string; sections: Section[] }

export type TableRow = Record<string, string>;
export type Value = string | number | TableRow[];

export interface Client {
  id: string;
  createdAt: string;
  updatedAt?: string;
  folder?: string;               // подпапка в выбранной папке на компьютере
  values: Record<string, Value | undefined>;
}

export interface Store { version: 1; clients: Record<string, Client> }
