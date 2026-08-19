"""Truth-table, minterm/maxterm, canonical-form and K-map generation."""

from __future__ import annotations

from itertools import product
from typing import List, Optional, Sequence, Tuple

from ..expressions.nodes import Term, product_text, sum_text
from ..expressions.parser import (
    evaluate_sop,
    get_variables,
    parse_sop,
)


def build_truth_table(
    expression: str,
    variable_order: Optional[Sequence[str]] = None,
):
    variables = get_variables(expression, variable_order)
    terms = parse_sop(expression)
    rows = []
    minterms: List[int] = []
    maxterms: List[int] = []

    for index, combo in enumerate(product((0, 1), repeat=len(variables))):
        values = dict(zip(variables, combo))
        result = int(evaluate_sop(terms, values))
        rows.append((combo, result))
        (minterms if result else maxterms).append(index)

    return variables, terms, rows, minterms, maxterms


def print_truth_table(variables, rows) -> None:
    print("\nTruth Table")
    print("-" * (5 * len(variables) + 8))
    for var in variables:
        print(f"{var:^5}", end="")
    print(" | F")
    print("-" * (5 * len(variables) + 8))
    for combo, result in rows:
        for value in combo:
            print(f"{value:^5}", end="")
        print(f" | {result}")


def minterm_to_literals(variables: Sequence[str], index: int) -> Term:
    bits = format(index, f"0{len(variables)}b")
    return [(var, bit == "0") for var, bit in zip(variables, bits)]


def maxterm_to_literals(variables: Sequence[str], index: int) -> Term:
    bits = format(index, f"0{len(variables)}b")
    return [(var, bit == "1") for var, bit in zip(variables, bits)]


def canonical_sop(variables, minterms) -> str:
    if not minterms:
        return "F = 0"
    return "F = " + " + ".join(
        product_text(minterm_to_literals(variables, m)) for m in minterms
    )


def canonical_pos(variables, maxterms) -> str:
    if not maxterms:
        return "F = 1"
    return "F = " + "".join(
        f"({sum_text(maxterm_to_literals(variables, m))})" for m in maxterms
    )


def gray_code(bits: int) -> List[str]:
    if bits == 0:
        return [""]
    previous = gray_code(bits - 1)
    return ["0" + code for code in previous] + [
        "1" + code for code in reversed(previous)
    ]


def _kmap_index(
    variables: Sequence[str],
    row_bits: str,
    col_bits: str,
    fixed: Optional[Tuple[str, int]] = None,
) -> int:
    values = {}
    if fixed is not None:
        values[fixed[0]] = fixed[1]

    row_count = len(variables) if fixed is None else len(variables) - 1
    row_n = row_count // 2
    row_vars = list(variables[:row_n] if fixed is None else variables[1:1 + row_n])
    col_vars = list(variables[row_n:] if fixed is None else variables[1 + row_n:])

    values.update(zip(row_vars, map(int, row_bits)))
    values.update(zip(col_vars, map(int, col_bits)))
    return int("".join(str(values[v]) for v in variables), 2)


def _print_kmap_grid(variables: Sequence[str], minterms: set, fixed=None) -> None:
    if fixed is None:
        row_n = len(variables) // 2
        row_vars = list(variables[:row_n])
        col_vars = list(variables[row_n:])
    else:
        remaining = list(variables[1:])
        row_n = len(remaining) // 2
        row_vars = remaining[:row_n]
        col_vars = remaining[row_n:]

    row_codes = gray_code(len(row_vars))
    col_codes = gray_code(len(col_vars))

    print(f"Rows: {''.join(row_vars) or '-'}   Columns: {''.join(col_vars) or '-'}")
    print(f"{'':>8}", end="")
    for cc in col_codes:
        print(f"{cc:^7}", end="")
    print()

    for rc in row_codes:
        print(f"{rc:>8}", end="")
        for cc in col_codes:
            idx = _kmap_index(variables, rc, cc, fixed)
            print(f"{'1' if idx in minterms else '0':^7}", end="")
        print()


def print_kmap(variables: Sequence[str], minterms: Sequence[int]) -> None:
    n = len(variables)
    if n < 2 or n > 5:
        print(f"\nK-map visualization supports 2-5 variables (got {n}).")
        return

    mins = set(minterms)
    print("\nK-map")
    if n == 5:
        for fixed_value in (0, 1):
            print(f"\n--- {variables[0]} = {fixed_value} ---")
            _print_kmap_grid(variables, mins, fixed=(variables[0], fixed_value))
    else:
        _print_kmap_grid(variables, mins)
