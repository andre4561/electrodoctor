# SPDX-License-Identifier: AGPL-3.0-or-later
"""Помощник для tests/parity.test.js: считает пациентов эталонным движком на Python.

Читает из stdin JSON-список пациентов ({код: число}), печатает JSON-список результатов.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "engine"))
import electrodoctor as ed  # noqa: E402


def main() -> None:
    ref = ed.load_reference()
    out = []
    for patient in json.load(sys.stdin):
        deviations, red_flags, ranked = ed.evaluate(patient, ref)
        out.append({
            "deviations": {c: {"strength": d.strength, "direction": d.direction, "k": d.k}
                           for c, d in deviations.items()},
            "redFlags": [d.code for d in red_flags],
            "ranked": [{"code": r.code, "score": r.score, "probability": r.probability,
                        "contributions": r.contributions, "missing": r.missing} for r in ranked],
        })
    json.dump(out, sys.stdout)


if __name__ == "__main__":
    main()
