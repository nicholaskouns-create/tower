"""Tests for experiments/tower_census.py (stdlib unittest; run: python -m unittest discover -s tests -v)."""
import io
import json
import subprocess
import sys
import unittest
from contextlib import redirect_stdout
from fractions import Fraction
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "experiments"))
import tower_census as t  # noqa: E402

TOWER = [n for n in range(5, 80) if n % 2 and n % 3]


class Fibonacci(unittest.TestCase):
    def test_small_values(self):
        self.assertEqual([t.F(n) for n in range(10)], [0, 1, 1, 2, 3, 5, 8, 13, 21, 34])
        self.assertEqual([t.L(n) for n in range(1, 8)], [1, 3, 4, 7, 11, 18, 29])

    def test_tower_membership(self):
        self.assertEqual(TOWER[:8], [5, 7, 11, 13, 17, 19, 23, 25])
        for n in (1, 3, 4, 6, 9, 15, 21):
            self.assertFalse(t.on_tower(n), n)
        with self.assertRaises(ValueError):
            t.census(9)


class WeightCensus(unittest.TestCase):
    def test_matches_brute_force(self):
        for j in range(0, 9):
            for M in range(-3 * j - 2, 3 * j + 3):
                self.assertEqual(t.weight_count(j, M), t.weight_count_bruteforce(j, M), (j, M))

    def test_total_states(self):
        for j in range(0, 7):
            self.assertEqual(sum(t.weight_count(j, M) for M in range(-3 * j, 3 * j + 1)), (2 * j + 1) ** 3)

    def test_j2_multiplicities(self):
        self.assertEqual([t.multiplicity3(2, J) for J in range(7)], [1, 3, 5, 4, 3, 2, 1])


class Census(unittest.TestCase):
    def test_e47_at_n5(self):
        r = t.census(5)
        self.assertEqual((r["j"], r["J"], r["n_j"], r["n_J"], r["D"], r["dim_total"]), (2, 5, 5, 2, 47, 125))
        self.assertEqual((r["mu"], r["sigma"]), (18, 12))
        self.assertEqual(r["ratio"], "47/25")

    def test_fibonacci_identities_along_tower(self):
        for n in TOWER:
            r = t.census(n)
            self.assertEqual(r["n_j"], t.F(n), n)
            self.assertEqual(r["n_J"], t.F(n - 2), n)
            j, J = r["j"], r["J"]
            self.assertEqual(J * (J + 1), 5 * j * (j + 1), n)
            self.assertEqual(r["D"], t.F(n) ** 2 + t.F(n - 2) * t.L(n), n)
            self.assertEqual(r["mu"] + r["sigma"], J * (J + 1))
            self.assertEqual(r["mu"] - r["sigma"], j * (j + 1))
            self.assertTrue(all(r["checks"].values()), n)

    def test_gap_to_three_over_phi_decreases(self):
        from decimal import Decimal
        gaps = [Decimal(t.census(n)["gap_3_over_phi_str"]) for n in TOWER]
        self.assertTrue(all(b < a for a, b in zip(gaps, gaps[1:])))
        self.assertLess(gaps[TOWER.index(19)], Decimal("1e-6"))

    def test_ratio_limit(self):
        r = Fraction(t.census(61)["ratio"])
        self.assertAlmostEqual(float(r), 3 / ((1 + 5 ** 0.5) / 2), places=14)


class Casimir(unittest.TestCase):
    def test_selector_j2(self):
        c = t.casimir_selector(2)
        self.assertFalse(c["skipped"])
        self.assertEqual((c["states"], c["dim_E_lo"], c["dim_E_hi"], c["rank_K"], c["dim_ker_K"]), (125, 25, 22, 78, 47))
        self.assertEqual(c["Omega_c"], "47/125")
        self.assertTrue(all(c["checks"].values()))

    def test_selector_j1(self):
        c = t.casimir_selector(1)      # mu - sigma = 2 (J=1, n=3 copies); mu + sigma = 10 is not J(J+1)
        self.assertEqual((c["states"], c["dim_E_lo"], c["dim_E_hi"]), (27, 9, 0))

    def test_large_j_skipped(self):
        self.assertTrue(t.casimir_selector(6)["skipped"])


class EntryPoints(unittest.TestCase):
    def run_quiet(self, params):
        buf = io.StringIO()
        with redirect_stdout(buf):
            res = t.run(params)
        return res, buf.getvalue()

    def test_census_mode(self):
        res, out = self.run_quiet({"mode": "census", "n": 5, "casimir": True})
        self.assertEqual(res["checks"], {"pass": 9, "fail": 0, "total": 9})
        self.assertTrue(out.rstrip().endswith("PASS"))

    def test_sweep_mode(self):
        res, out = self.run_quiet({"mode": "sweep", "n_max": 31})
        self.assertEqual([r["n"] for r in res["rows"]], [n for n in TOWER if n <= 31])
        self.assertEqual(res["checks"]["fail"], 0)

    def test_cli_params_matches_browser_contract(self):
        p = subprocess.run([sys.executable, str(ROOT / "experiments/tower_census.py"), "--params", json.dumps({"mode": "census", "n": 5, "casimir": True})],
                           capture_output=True, text=True, check=True)
        self.assertIn("rank K = 78,  dim ker K = 47,  Omega_c = 47/125", p.stdout)
        self.assertEqual(p.stdout.strip().splitlines()[-1], "PASS")


if __name__ == "__main__":
    unittest.main()
