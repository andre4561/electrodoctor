# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Electrodoctor contributors
"""Электродоктор — эталонная реализация расчёта.

Намеренно простая, без внешних зависимостей: ясность важнее скорости.
Запуск:  python engine/electrodoctor.py examples/patient_anemia.csv
"""

from __future__ import annotations

import csv
import math
import sys
from dataclasses import dataclass, field
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "data"

THRESHOLD = 0.10       # порог выдачи диагноза
RED_FLAG_K = 1.0       # критичность, начиная с которой показатель срочный


# ---------- справочники ----------

def _read_csv(path: Path) -> list[dict]:
    with open(path, encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def _num(s: str) -> float | None:
    return float(s) if s not in ("", None) else None


@dataclass
class Parameter:
    code: str
    name: str
    type: str                  # continuous | binary | ordinal
    x0: float | None = None    # идеал
    w: float | None = None     # ширина зоны нормы (в ln)
    scale: float | None = None # отклонение (в ln) за зоной нормы, равное силе 1
    a_low: float | None = None
    a_high: float | None = None
    max: float | None = None   # максимум шкалы для binary/ordinal


@dataclass
class Link:
    diagnosis: str
    param: str
    expected: str   # down | up
    weight: float
    penalty: float


@dataclass
class Reference:
    parameters: dict[str, Parameter]
    diagnoses: dict[str, dict]
    links: list[Link]
    directions: dict[str, list[str]]


def load_reference(data_dir: Path = DATA_DIR) -> Reference:
    params = {}
    for r in _read_csv(data_dir / "parameters.csv"):
        params[r["code"]] = Parameter(
            code=r["code"], name=r["name"], type=r["type"],
            x0=_num(r["x0"]), w=_num(r["w"]), scale=_num(r["scale"]),
            a_low=_num(r["a_low"]), a_high=_num(r["a_high"]), max=_num(r["max"]),
        )
    diagnoses = {r["code"]: {"name": r["name"], "prior": float(r["prior"])}
                 for r in _read_csv(data_dir / "diagnoses.csv")}
    links = [Link(r["diagnosis"], r["param"], r["expected"],
                  float(r["weight"]), float(r["penalty"]))
             for r in _read_csv(data_dir / "links.csv")]
    directions: dict[str, list[str]] = {}
    for r in _read_csv(data_dir / "directions.csv"):
        directions.setdefault(r["diagnosis"], []).append(r["direction"])
    return Reference(params, diagnoses, links, directions)


# ---------- шаг 1: нормализация ----------

@dataclass
class Deviation:
    code: str
    value: float
    d: float | None      # ln(x/x0), только для continuous
    strength: float      # сила отклонения
    direction: str       # down | up | normal
    k: float             # критичность (парабола от логарифма)


def normalize(p: Parameter, value: float) -> Deviation:
    if p.type == "continuous":
        d = math.log(value / p.x0)
        strength = max(0.0, abs(d) - p.w) / p.scale
        direction = "normal" if strength == 0 else ("down" if d < 0 else "up")
        a = p.a_low if d < 0 else p.a_high
        k = a * strength ** 2
        return Deviation(p.code, value, d, strength, direction, k)
    # binary / ordinal: сила = доля от максимума шкалы
    strength = value / p.max
    direction = "up" if value > 0 else "normal"
    return Deviation(p.code, value, None, strength, direction, 0.0)


# ---------- шаги 2–3: вклады и вероятности ----------

@dataclass
class DiagnosisResult:
    code: str
    name: str
    prior: float
    contributions: dict[str, float] = field(default_factory=dict)
    missing: list[str] = field(default_factory=list)

    @property
    def score(self) -> float:
        return math.log(self.prior / (1 - self.prior)) + sum(self.contributions.values())

    @property
    def probability(self) -> float:
        return 1 / (1 + math.exp(-self.score))


def contribution(link: Link, dev: Deviation) -> float:
    if dev.direction == "normal":
        return link.penalty
    sign = 1 if dev.direction == link.expected else -1
    return sign * link.weight * dev.strength


def evaluate(patient: dict[str, float], ref: Reference):
    deviations = {code: normalize(ref.parameters[code], v)
                  for code, v in patient.items() if code in ref.parameters}
    red_flags = [dv for dv in deviations.values() if dv.k >= RED_FLAG_K]

    results = {code: DiagnosisResult(code, d["name"], d["prior"])
               for code, d in ref.diagnoses.items()}
    for link in ref.links:
        res = results[link.diagnosis]
        dev = deviations.get(link.param)
        if dev is None:
            res.missing.append(link.param)   # не спрашивали — кандидат «что досдать»
        else:
            res.contributions[link.param] = contribution(link, dev)

    ranked = sorted(results.values(), key=lambda r: r.probability, reverse=True)
    return deviations, red_flags, ranked


def read_patient(path: Path) -> dict[str, float]:
    patient = {}
    for r in _read_csv(path):
        try:
            patient[r["code"]] = float(r["value"])
        except ValueError:
            pass  # нечисловые поля паспорта (пол) пока не участвуют в расчёте
    return patient


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("Использование: python engine/electrodoctor.py <пациент.csv>")
        return 2
    ref = load_reference()
    _, red_flags, ranked = evaluate(read_patient(Path(argv[1])), ref)

    if red_flags:
        print("Красные флаги: " + ", ".join(f"{d.code} (k={d.k:.2f})" for d in red_flags))
    else:
        print("Красных флагов нет")
    for r in ranked:
        mark = "выдать" if r.probability >= THRESHOLD else ""
        miss = f"не хватает параметров: {len(r.missing)}" if r.missing else ""
        print(f"{r.code:<4} {r.name:<28} {r.probability:6.1%}  {mark} {miss}".rstrip())
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
