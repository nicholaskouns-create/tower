#!/usr/bin/env python3
"""E47-Tower census: the Fibonacci-Lucas tower of Casimir-selected sectors (stdlib only).

For odd n with 3 not dividing n, put j = (F_n - 1)/2 and J = (L_n - 1)/2 (both integers
exactly when 3 does not divide n; n odd gives J(J+1) = 5 j(j+1)). In V_j^{(x)3}:

    n(j) = F_n,   n(J) = F_{n-2},   D = n(j)(2j+1) + n(J)(2J+1) = F_n^2 + F_{n-2} L_n,

and D/(2j+1)^2 -> 3/phi.  At n = 5: j = 2, J = 5, D = 5*5 + 2*11 = 47.

Multiplicities are computed directly from the weight census of V_j^{(x)3} (an exact
inclusion-exclusion count, so it works at any tower index), not from the closed forms, and then
compared against them. Optionally, for small j (j <= 2) the full (2j+1)^3 Casimir
C = (S_1 + S_2 + S_3)^2 is built with integer entries and the selector
K = (C - (mu - sigma) I)(C - (mu + sigma) I) is ranked exactly over the rationals.

Modes (PARAMS dict in the browser, or command-line flags):
    census  one tower index n                 --mode census --n 5 [--casimir]
    sweep   every tower index 5 <= n <= n_max  --mode sweep --n-max 31

The script sets RESULT (a JSON-serialisable dict) and prints a human-readable report
ending in "RESULT: k / k checks" and "PASS" (exit code 1 on any failed check).
"""
from __future__ import annotations

import json
import sys
from decimal import Decimal, getcontext
from fractions import Fraction

getcontext().prec = 60


def three_over_phi(digits: int) -> Decimal:
    """3/phi = 3(sqrt5 - 1)/2 to `digits` significant digits."""
    getcontext().prec = digits
    return 3 * (Decimal(5).sqrt() - 1) / 2

MAX_N = 199          # keeps integers modest; the census itself is O(1) per index
MAX_CASIMIR_J = 2    # (2j+1)^3 = 125 states: browser-fast exact rank


def F(n: int) -> int:
    if n < 0:                       # F_{-n} = (-1)^{n+1} F_n
        return (-1) ** (-n + 1) * F(-n)
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return a


def L(n: int) -> int:
    return F(n - 1) + F(n + 1)


def on_tower(n: int) -> bool:
    return n >= 5 and n % 2 == 1 and n % 3 != 0


def weight_count(j: int, M: int) -> int:
    """Number of states of V_j^{(x)3} with total S_z = M, counted exactly.

    Shift each m_a to x_a = m_a + j in [0, 2j]; we count x_1 + x_2 + x_3 = M + 3j by
    inclusion-exclusion over the upper bounds (stars and bars), so the count is O(1)
    in j and is independent of any Fibonacci closed form.
    """
    s = M + 3 * j
    w = 2 * j + 1
    total = 0
    for k, sign_binom in ((0, 1), (1, -3), (2, 3), (3, -1)):
        t = s - k * w
        if t >= 0:
            total += sign_binom * (t + 2) * (t + 1) // 2
    return total


def weight_count_bruteforce(j: int, M: int) -> int:
    """Literal enumeration (O(j^2)); used by the tests to cross-check weight_count."""
    return sum(1 for a in range(-j, j + 1) for b in range(-j, j + 1) if -j <= M - a - b <= j)


def multiplicity3(j: int, J: int) -> int:
    """Multiplicity of spin J in V_j^{(x)3}."""
    return weight_count(j, J) - weight_count(j, J + 1)


def census(n: int) -> dict:
    if not on_tower(n):
        raise ValueError(f"n={n} is not on the tower (need odd n >= 5 with 3 not dividing n)")
    Fn, Fn2, Ln = F(n), F(n - 2), L(n)
    j, J = (Fn - 1) // 2, (Ln - 1) // 2
    nj, nJ = multiplicity3(j, j), multiplicity3(j, J)
    D = nj * (2 * j + 1) + nJ * (2 * J + 1)
    ratio = Fraction(D, (2 * j + 1) ** 2)
    # the gap shrinks like phi^(-2n) ~ 10^(-0.418 n): carry n + 40 digits so it stays exact-enough
    target = three_over_phi(n + 40)
    ratio_dec = Decimal(ratio.numerator) / Decimal(ratio.denominator)
    gap = abs(ratio_dec - target)
    s2 = j * (j + 1)
    mu, sigma = 3 * s2, 2 * s2
    return {
        "n": n, "j": j, "J": J, "F_n": Fn, "F_n_minus_2": Fn2, "L_n": Ln,
        "n_j": nj, "n_J": nJ, "D": D, "dim_total": (2 * j + 1) ** 3,
        "mu": mu, "sigma": sigma,
        "ratio": str(ratio), "ratio_float": float(ratio),
        "gap_3_over_phi": float(gap), "gap_3_over_phi_str": f"{gap:.6E}",
        "nj_over_nJ": float(Fraction(nj, nJ)),
        "checks": {
            "n_j == F_n": nj == Fn,
            "n_J == F_(n-2)": nJ == Fn2,
            "J(J+1) == 5 j(j+1)": J * (J + 1) == 5 * s2,
            "D == F_n^2 + F_(n-2) L_n": D == Fn * Fn + Fn2 * Ln,
            "mu - sigma == j(j+1)": mu - sigma == s2,
            "mu + sigma == J(J+1)": mu + sigma == J * (J + 1),
        },
    }


# ---- exact integer Casimir for small j -----------------------------------------------
def casimir_matrix(j: int, k: int = 3) -> list[list[int]]:
    """Integer (2j+1)^k Casimir, a diagonal similarity of the standard one (same spectrum)."""
    d = 2 * j + 1
    ms = list(range(j, -j - 1, -1))
    pos = {m: i for i, m in enumerate(ms)}
    N = d ** k

    def idx(t):
        r = 0
        for m in t:
            r = r * d + pos[m]
        return r

    import itertools
    C = [[0] * N for _ in range(N)]
    for t in itertools.product(ms, repeat=k):
        col = idx(t)
        C[col][col] += k * j * (j + 1)
        for a in range(k):
            for b in range(a + 1, k):
                ma, mb = t[a], t[b]
                C[col][col] += 2 * ma * mb
                if ma < j and mb > -j:
                    u = list(t); u[a] = ma + 1; u[b] = mb - 1
                    C[idx(u)][col] += (j - (mb - 1)) * (j + mb)
                if ma > -j and mb < j:
                    u = list(t); u[a] = ma - 1; u[b] = mb + 1
                    C[idx(u)][col] += (j - (ma - 1)) * (j + ma)
    return C


def exact_rank(A: list[list[int]]) -> int:
    M = [[Fraction(x) for x in row] for row in A]
    rk, rows, cols = 0, len(M), len(M[0])
    for c in range(cols):
        p = next((r for r in range(rk, rows) if M[r][c] != 0), None)
        if p is None:
            continue
        M[rk], M[p] = M[p], M[rk]
        piv = M[rk][c]
        for r in range(rows):
            if r != rk and M[r][c] != 0:
                f = M[r][c] / piv
                M[r] = [x - f * y for x, y in zip(M[r], M[rk])]
        rk += 1
    return rk


def shift(A, lam):
    n = len(A)
    return [[A[r][c] - (lam if r == c else 0) for c in range(n)] for r in range(n)]


def matmul(A, B):
    Bt = list(zip(*B))
    return [[sum(x * y for x, y in zip(r, c)) for c in Bt] for r in A]


def casimir_selector(j: int) -> dict:
    if j > MAX_CASIMIR_J:
        return {"skipped": True, "reason": f"j={j}: (2j+1)^3={(2*j+1)**3} states is too large for an exact in-browser rank (limit j<={MAX_CASIMIR_J})"}
    C = casimir_matrix(j)
    N = len(C)
    s2 = j * (j + 1)
    mu, sigma = 3 * s2, 2 * s2
    lo, hi = mu - sigma, mu + sigma
    e_lo = N - exact_rank(shift(C, lo))
    e_hi = N - exact_rank(shift(C, hi))
    rK = exact_rank(matmul(shift(C, lo), shift(C, hi)))
    trace = sum(C[i][i] for i in range(N))
    return {
        "skipped": False, "j": j, "states": N, "mu": mu, "sigma": sigma,
        "eig_mu_minus_sigma": lo, "eig_mu_plus_sigma": hi,
        "dim_E_lo": e_lo, "dim_E_hi": e_hi, "rank_K": rK, "dim_ker_K": N - rK,
        "Omega_c": str(Fraction(N - rK, N)), "trace_C": trace,
        "checks": {
            "trace C == N * mu": trace == N * mu,
            "dim ker K == dim E_lo + dim E_hi": N - rK == e_lo + e_hi,
        },
    }


# ---- entry points --------------------------------------------------------------------
def run(params: dict) -> dict:
    mode = params.get("mode", "census")
    checks: list[tuple[str, bool]] = []
    out: dict = {"mode": mode}
    if mode == "census":
        n = int(params.get("n", 5))
        row = census(n)
        print(f"Tower index n = {n}:  j = {row['j']},  J = {row['J']}")
        print(f"  F_n = {row['F_n']},  F_(n-2) = {row['F_n_minus_2']},  L_n = {row['L_n']}")
        print(f"  n(j) = {row['n_j']},  n(J) = {row['n_J']}   (direct weight census of V_j^3)")
        print(f"  D = n(j)(2j+1) + n(J)(2J+1) = {row['D']}  of  (2j+1)^3 = {row['dim_total']}")
        print(f"  D/(2j+1)^2 = {row['ratio']}  ~ {row['ratio_float']:.15f}")
        print(f"  |D/(2j+1)^2 - 3/phi| = {row['gap_3_over_phi_str']}")
        print(f"  mu = {row['mu']},  sigma = {row['sigma']},  mu-sigma = {row['mu']-row['sigma']},  mu+sigma = {row['mu']+row['sigma']}")
        for name, ok in row["checks"].items():
            checks.append((f"n={n}: {name}", ok))
        out["rows"] = [{k: v for k, v in row.items() if k != "checks"}]
        if params.get("casimir", True):
            cs = casimir_selector(row["j"])
            out["casimir"] = cs
            if cs["skipped"]:
                print(f"  Casimir: skipped ({cs['reason']})")
            else:
                print(f"  Casimir: {cs['states']}x{cs['states']} integer matrix, exact rank over Q")
                print(f"    dim E_{cs['eig_mu_minus_sigma']} = {cs['dim_E_lo']},  dim E_{cs['eig_mu_plus_sigma']} = {cs['dim_E_hi']}")
                print(f"    rank K = {cs['rank_K']},  dim ker K = {cs['dim_ker_K']},  Omega_c = {cs['Omega_c']}")
                for name, ok in cs["checks"].items():
                    checks.append((f"casimir j={cs['j']}: {name}", ok))
                checks.append((f"casimir j={cs['j']}: dim ker K == D", cs["dim_ker_K"] == row["D"]))
    elif mode == "sweep":
        n_max = int(params.get("n_max", 31))
        if n_max > MAX_N:
            raise ValueError(f"n_max={n_max} exceeds {MAX_N}")
        rows = [census(n) for n in range(5, n_max + 1) if on_tower(n)]
        print(f"Tower sweep 5 <= n <= {n_max}: {len(rows)} members")
        print(f"{'n':>4} {'j':>14} {'n(j)=F_n':>12} {'n(J)':>10} {'D/(2j+1)^2':>20} {'|gap to 3/phi|':>16}")
        for r in rows:
            print(f"{r['n']:>4} {r['j']:>14} {r['n_j']:>12} {r['n_J']:>10} {r['ratio_float']:>20.15f} {r['gap_3_over_phi_str']:>16}")
            for name, ok in r["checks"].items():
                checks.append((f"n={r['n']}: {name}", ok))
        gaps = [Decimal(r["gap_3_over_phi_str"]) for r in rows]
        checks.append(("gap to 3/phi strictly decreasing", all(b < a for a, b in zip(gaps, gaps[1:]))))
        out["rows"] = [{k: v for k, v in r.items() if k != "checks"} for r in rows]
        out["series"] = {"x": "n", "y": "gap_3_over_phi", "logy": True,
                         "title": "|D/(2j+1)^2 - 3/phi| along the tower"}
    else:
        raise ValueError(f"unknown mode {mode!r}")
    for name, ok in checks:
        print(f"[{'PASS' if ok else 'FAIL'}] {name}")
    passed = sum(ok for _, ok in checks)
    out["checks"] = {"pass": passed, "fail": len(checks) - passed, "total": len(checks)}
    print(f"RESULT: {passed} / {len(checks)} checks")
    print("PASS" if passed == len(checks) else "FAIL")
    return out


def _cli_params(argv: list[str]) -> dict:
    import argparse
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--mode", choices=["census", "sweep"], default="census")
    p.add_argument("--n", type=int, default=5)
    p.add_argument("--n-max", type=int, default=31)
    p.add_argument("--casimir", action="store_true", help="exact Casimir build (j <= 2)")
    p.add_argument("--json", action="store_true", help="also print RESULT as JSON")
    p.add_argument("--params", help="exact parameter JSON, as stored in an E47-Tower run record")
    a = p.parse_args(argv)
    if a.params:
        params = json.loads(a.params)
        params["_json"] = a.json
        return params
    return {"mode": a.mode, "n": a.n, "n_max": a.n_max, "casimir": a.casimir, "_json": a.json}


if __name__ == "__main__":
    try:
        PARAMS  # noqa: F821  (injected by the E47-Tower browser runner)
        _params = dict(PARAMS)  # noqa: F821
    except NameError:
        _params = _cli_params(sys.argv[1:])
    RESULT = run(_params)
    if _params.get("_json"):
        print(json.dumps(RESULT, indent=2))
    if RESULT["checks"]["fail"]:
        sys.exit(1)
