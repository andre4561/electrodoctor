# SPDX-License-Identifier: AGPL-3.0-or-later
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "engine"))

import electrodoctor as ed  # noqa: E402


class TestExamples(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.ref = ed.load_reference()

    def run_case(self, name):
        patient = ed.read_patient(ROOT / "examples" / name)
        _, flags, ranked = ed.evaluate(patient, self.ref)
        return flags, {r.code: r for r in ranked}, ranked

    def test_anemia_matches_article(self):
        flags, res, ranked = self.run_case("patient_anemia.csv")
        self.assertEqual(ranked[0].code, "D50")
        self.assertAlmostEqual(res["D50"].probability, 0.925, places=3)
        self.assertAlmostEqual(res["D51"].probability, 0.020, places=3)
        self.assertEqual([f.code for f in flags], ["FERRITIN"])

    def test_chest_pain_points_to_angina(self):
        _, res, ranked = self.run_case("patient_chest_pain.csv")
        self.assertEqual(ranked[0].code, "I20")
        self.assertGreater(res["I20"].probability, ed.THRESHOLD)

    def test_missing_param_gives_zero_not_penalty(self):
        _, res, _ = self.run_case("patient_anemia.csv")
        self.assertAlmostEqual(res["I20"].probability, 0.02, places=6)
        self.assertEqual(len(res["I20"].missing), 5)

    def test_log_parabola_symmetric(self):
        p = ed.Parameter("X", "x", "continuous", x0=10, w=0, scale=1, a_low=1, a_high=1)
        self.assertAlmostEqual(ed.normalize(p, 40).k, ed.normalize(p, 2.5).k)


if __name__ == "__main__":
    unittest.main()
