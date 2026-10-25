// SPDX-License-Identifier: AGPL-3.0-or-later
// Сверка двух реализаций расчёта: TypeScript (src/engine.ts → docs/engine.js)
// и эталонной на Python (engine/electrodoctor.py). Должны давать одинаковые цифры.
// Запуск: npm test (или node --test tests/ после npm run build).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildReference, evaluate, parseCSV } from "../docs/engine.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PYTHON = process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");
const EPS = 1e-9;

const csv = Object.fromEntries(["parameters", "diagnoses", "links", "directions"]
  .map(n => [n, readFileSync(join(ROOT, "data", n + ".csv"), "utf8")]));
const ref = buildReference(csv);

function python(patients) {
  const out = execFileSync(PYTHON, [join(ROOT, "tests", "parity_helper.py")], { input: JSON.stringify(patients), encoding: "utf8" });
  return JSON.parse(out);
}

// Учебные пациенты из examples/ — так же, как их читает Python: только числовые значения.
function examples() {
  return readdirSync(join(ROOT, "examples")).filter(f => f.endsWith(".csv")).sort().map(f => {
    const p = {};
    for (const r of parseCSV(readFileSync(join(ROOT, "examples", f), "utf8"))) {
      const v = Number(r.value);
      if (r.value !== "" && !Number.isNaN(v)) p[r.code] = v;
    }
    return { name: f, patient: p };
  });
}

// Случайные пациенты: часть показателей пропущена, анализы — от сильно ниже до сильно выше нормы.
function randomPatients(n, seed) {
  let s = seed >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const params = Object.values(ref.parameters);
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = {};
    for (const par of params) {
      if (rnd() < 0.35) continue;   // не измеряли / не спрашивали
      if (par.type === "continuous") p[par.code] = Math.round(par.x0 * Math.exp((rnd() - 0.5) * 4) * 100) / 100;
      else p[par.code] = Math.floor(rnd() * (par.max + 1));
    }
    out.push({ name: "случайный №" + (i + 1), patient: p });
  }
  return out;
}

function compare(name, js, py) {
  assert.deepEqual(js.redFlags.map(d => d.code), py.redFlags, `${name}: красные флаги`);
  assert.deepEqual(Object.keys(js.deviations).sort(), Object.keys(py.deviations).sort(), `${name}: набор показателей`);
  for (const [code, d] of Object.entries(py.deviations)) {
    const j = js.deviations[code];
    assert.equal(j.direction, d.direction, `${name}: направление ${code}`);
    assert.ok(Math.abs(j.strength - d.strength) < EPS, `${name}: сила ${code}`);
    assert.ok(Math.abs(j.k - d.k) < EPS, `${name}: критичность ${code}`);
  }
  assert.deepEqual(js.ranked.map(r => r.code), py.ranked.map(r => r.code), `${name}: порядок диагнозов`);
  py.ranked.forEach((p, i) => {
    const j = js.ranked[i];
    assert.ok(Math.abs(j.probability - p.probability) < EPS, `${name}: вероятность ${p.code}: JS ${j.probability}, Python ${p.probability}`);
    assert.ok(Math.abs(j.score - p.score) < EPS, `${name}: балл ${p.code}`);
    assert.deepEqual(j.missing, p.missing, `${name}: что уточнить для ${p.code}`);
    const jc = Object.fromEntries(j.contributions.map(c => [c.param, c.value]));
    assert.deepEqual(Object.keys(jc).sort(), Object.keys(p.contributions).sort(), `${name}: вклады ${p.code}`);
    for (const [param, v] of Object.entries(p.contributions)) assert.ok(Math.abs(jc[param] - v) < EPS, `${name}: вклад ${param} в ${p.code}`);
  });
}

test("примеры из examples/ считаются одинаково в TypeScript и Python", () => {
  const cases = examples();
  assert.ok(cases.length > 0);
  const py = python(cases.map(c => c.patient));
  cases.forEach((c, i) => compare(c.name, evaluate(c.patient, ref), py[i]));
});

test("500 случайных пациентов считаются одинаково в TypeScript и Python", () => {
  const cases = randomPatients(500, 20261025);
  const py = python(cases.map(c => c.patient));
  cases.forEach((c, i) => compare(c.name, evaluate(c.patient, ref), py[i]));
});

test("в справочнике нет повторов пары «диагноз–показатель» (иначе реализации расходятся)", () => {
  const seen = new Set();
  for (const l of ref.links) {
    const key = l.diagnosis + "|" + l.param;
    assert.ok(!seen.has(key), "повтор в data/links.csv: " + key);
    seen.add(key);
  }
});
