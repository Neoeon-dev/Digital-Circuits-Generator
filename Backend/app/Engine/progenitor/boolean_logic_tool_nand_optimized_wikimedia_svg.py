"""Generic Boolean-logic toolkit.

Input format: SOP (sum of products), e.g. AB' + AC + BC'.

Features
--------
* Truth table, minterms and maxterms
* Canonical SOP/POS
* Text K-map for 2--5 variables
* Exact Quine-McCluskey minimization (with exact prime-implicant cover)
* AND/OR, all-NAND, or all-NOR circuit netlists
* Matplotlib circuit diagram

The implementation is intentionally independent of SymPy so that the
minimization and gate construction are explicit and easy to inspect.
"""

from __future__ import annotations

import argparse
from functools import lru_cache
from io import BytesIO
import json
import math
import re
import subprocess
from dataclasses import dataclass
from itertools import product
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Tuple, Union

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.patches import Circle, Polygon
from matplotlib.path import Path as MplPath
from matplotlib import patches as mpatches
from PIL import Image


Literal = Tuple[str, bool]                 # (variable, complemented?)
Term = List[Literal]
Node = Union[str, "Gate"]


# ============================================================================
# 1. PARSING / EVALUATION
# ============================================================================

_VARIABLE_RE = re.compile(r"[A-Za-z]")


def get_variables(expression: str, variable_order: Optional[Sequence[str]] = None) -> List[str]:
    """Return variables in the requested order, or alphabetical order."""
    found = set(_VARIABLE_RE.findall(expression))

    if variable_order is None:
        return sorted(found)

    order = list(variable_order)
    if len(order) != len(set(order)):
        raise ValueError("variable_order contains duplicate variables")
    if set(order) != found:
        missing = sorted(found - set(order))
        extra = sorted(set(order) - found)
        msg = []
        if missing:
            msg.append(f"missing variables: {', '.join(missing)}")
        if extra:
            msg.append(f"variables not present in expression: {', '.join(extra)}")
        raise ValueError("Invalid variable_order (" + "; ".join(msg) + ")")
    return order


def parse_sop(expression: str) -> List[Term]:
    """Parse a strict SOP expression.

    Supported syntax:
        AB' + AC + B'C
        A*B' + C
        A + 0
        A + 1

    A product term is a sequence of variables, optionally followed by '.
    Multiplication '*' is optional. Whitespace is ignored.
    """
    expr = re.sub(r"\s+", "", expression)
    if not expr:
        raise ValueError("Expression cannot be empty")

    raw_terms = expr.split("+")
    if any(t == "" for t in raw_terms):
        raise ValueError("Malformed SOP: empty term around '+'.")

    parsed: List[Term] = []
    function_is_one = False

    for raw in raw_terms:
        raw = raw.replace("*", "")
        if not raw:
            raise ValueError("Malformed product term")

        if raw == "1":
            function_is_one = True
            continue
        if raw == "0":
            continue

        # Scan instead of silently accepting arbitrary junk with re.findall().
        i = 0
        term: Term = []
        while i < len(raw):
            ch = raw[i]
            if not ch.isalpha():
                raise ValueError(
                    f"Invalid character {ch!r} in term {raw!r}. "
                    "Expected variables, optional '*', and apostrophe complements."
                )
            var = ch
            i += 1
            neg = False
            if i < len(raw) and raw[i] == "'":
                neg = True
                i += 1

            # Repeated identical literals are harmless; conflicting literals
            # (AA') make the whole product term zero.
            if (var, not neg) in term:
                # Existing A and current A' (or vice versa).
                term = []
                break
            if (var, neg) not in term:
                term.append((var, neg))

        if term:
            # Stable variable order inside each product.
            term.sort(key=lambda x: x[0])
            parsed.append(term)

    if function_is_one:
        return [[]]  # Empty product = logical 1.
    return parsed


def evaluate_term(term: Term, values: Dict[str, bool]) -> bool:
    """Evaluate one product term."""
    if not term:  # empty product = 1
        return True
    return all((not values[var]) if neg else values[var] for var, neg in term)


def evaluate_sop(terms: Sequence[Term], values: Dict[str, bool]) -> bool:
    """Evaluate the OR of all product terms."""
    return any(evaluate_term(term, values) for term in terms)


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


# ============================================================================
# 2. CANONICAL FORMS
# ============================================================================


def minterm_to_literals(variables: Sequence[str], index: int) -> Term:
    bits = format(index, f"0{len(variables)}b")
    return [(var, bit == "0") for var, bit in zip(variables, bits)]


def maxterm_to_literals(variables: Sequence[str], index: int) -> Term:
    # For a maxterm, a 0-valued variable appears uncomplemented and a 1-valued
    # variable appears complemented, so the sum is zero on that row.
    bits = format(index, f"0{len(variables)}b")
    return [(var, bit == "1") for var, bit in zip(variables, bits)]


def literal_text(lit: Literal) -> str:
    var, neg = lit
    return var + ("'" if neg else "")


def product_text(term: Term) -> str:
    return "".join(literal_text(lit) for lit in term) or "1"


def sum_text(term: Term) -> str:
    return " + ".join(literal_text(lit) for lit in term) or "0"


def canonical_sop(variables, minterms) -> str:
    if not minterms:
        return "F = 0"
    return "F = " + " + ".join(product_text(minterm_to_literals(variables, m)) for m in minterms)


def canonical_pos(variables, maxterms) -> str:
    if not maxterms:
        return "F = 1"
    return "F = " + "".join(
        f"({sum_text(maxterm_to_literals(variables, m))})" for m in maxterms
    )


# ============================================================================
# 3. K-MAP
# ============================================================================


def gray_code(bits: int) -> List[str]:
    if bits == 0:
        return [""]
    previous = gray_code(bits - 1)
    return ["0" + code for code in previous] + ["1" + code for code in reversed(previous)]


def _kmap_index(variables: Sequence[str], row_bits: str, col_bits: str,
                fixed: Optional[Tuple[str, int]] = None) -> int:
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
        # Standard 5-variable representation: two adjacent 4-variable maps.
        for fixed_value in (0, 1):
            print(f"\n--- {variables[0]} = {fixed_value} ---")
            _print_kmap_grid(variables, mins, fixed=(variables[0], fixed_value))
    else:
        _print_kmap_grid(variables, mins)


# ============================================================================
# 4. EXACT QUINE-MCCLUSKEY
# ============================================================================


def _combine(a: str, b: str) -> Optional[str]:
    """Combine implicants differing in exactly one non-dash position."""
    differences = 0
    result = []
    for x, y in zip(a, b):
        if x == y:
            result.append(x)
        elif x == "-" or y == "-":
            return None
        else:
            differences += 1
            result.append("-")
    return "".join(result) if differences == 1 else None


def _implicant_covers(pattern: str, minterm: int, n_vars: int) -> bool:
    bits = format(minterm, f"0{n_vars}b")
    return all(p == "-" or p == b for p, b in zip(pattern, bits))


def _prime_implicants(n_vars: int, minterms: Sequence[int]) -> List[str]:
    """Generate all prime implicants using iterative QM combining."""
    if not minterms:
        return []

    current = {format(m, f"0{n_vars}b") for m in sorted(set(minterms))}
    primes: set[str] = set()

    while current:
        groups: Dict[int, set[str]] = {}
        for pattern in current:
            groups.setdefault(pattern.count("1"), set()).add(pattern)

        used: set[str] = set()
        next_patterns: set[str] = set()
        keys = sorted(groups)

        for key in keys:
            for a in groups[key]:
                for b in groups.get(key + 1, ()):
                    combined = _combine(a, b)
                    if combined is not None:
                        used.add(a)
                        used.add(b)
                        next_patterns.add(combined)

        primes.update(current - used)
        if not next_patterns:
            break
        current = next_patterns

    return sorted(primes)


def _cover_cost(patterns: Sequence[str]) -> Tuple[int, int, Tuple[str, ...]]:
    """Primary cost = gate-level-friendly term count; tie-break by literals."""
    return (
        len(patterns),
        sum(p.count("0") + p.count("1") for p in patterns),
        tuple(sorted(patterns)),
    )


def _exact_cover(minterms: Sequence[int], prime_implicants: Sequence[str], n_vars: int) -> List[str]:
    """Find an exact minimum prime-implicant cover.

    This replaces the old greedy cover. The greedy method can produce a
    functionally correct SOP that is nevertheless not minimal. Branching on
    the uncovered minterm with the fewest choices gives an exact cover while
    remaining practical for the 2--5 variable K-map use case.
    """
    target = frozenset(minterms)
    if not target:
        return []

    coverage = {
        pi: frozenset(m for m in target if _implicant_covers(pi, m, n_vars))
        for pi in prime_implicants
    }
    chart: Dict[int, List[str]] = {m: [] for m in target}
    for pi, covered in coverage.items():
        for m in covered:
            chart[m].append(pi)

    # Essential prime implicants.
    chosen: set[str] = set()
    covered: set[int] = set()
    for m, options in chart.items():
        if len(options) == 1:
            chosen.add(options[0])

    for pi in chosen:
        covered.update(coverage[pi])

    remaining = target - frozenset(covered)
    if not remaining:
        return sorted(chosen, key=lambda p: (p.count("-"), p))

    best: Optional[List[str]] = None

    def search(uncovered: frozenset[int], selected: set[str]) -> None:
        nonlocal best
        if not uncovered:
            candidate = sorted(selected)
            if best is None or _cover_cost(candidate) < _cover_cost(best):
                best = candidate
            return

        # Lower bound: at least one implicant is needed. If the current number
        # of terms already cannot beat the best, prune.
        if best is not None and len(selected) >= len(best):
            return

        # Pick the hardest uncovered minterm first.
        m = min(
            uncovered,
            key=lambda x: sum(1 for pi in chart[x] if pi not in selected)
        )
        options = [pi for pi in chart[m] if pi not in selected]
        options.sort(key=lambda pi: (-(len(coverage[pi] & uncovered)), pi.count("-"), pi))

        for pi in options:
            new_uncovered = uncovered - coverage[pi]
            search(frozenset(new_uncovered), selected | {pi})

    search(frozenset(remaining), set(chosen))
    if best is None:
        raise RuntimeError("Failed to find a prime-implicant cover")
    return best


def quine_mccluskey(n_vars: int, minterms: Sequence[int]) -> List[str]:
    """Return an exact minimum SOP as implicant patterns."""
    mins = sorted(set(minterms))
    if not mins:
        return []
    if len(mins) == 2 ** n_vars:
        return ["-" * n_vars]

    primes = _prime_implicants(n_vars, mins)
    return _exact_cover(mins, primes, n_vars)


def pattern_to_product(variables: Sequence[str], pattern: str) -> Term:
    return [
        (var, bit == "0")
        for var, bit in zip(variables, pattern)
        if bit != "-"
    ]


def minimal_sop(variables: Sequence[str], minterms: Sequence[int]):
    mins = sorted(set(minterms))
    if not mins:
        return "F = 0", []
    if len(mins) == 2 ** len(variables):
        return "F = 1", [[]]

    patterns = quine_mccluskey(len(variables), mins)
    terms = [pattern_to_product(variables, p) for p in patterns]
    text = "F = " + " + ".join(product_text(term) for term in terms)
    return text, terms


def minimal_pos(variables: Sequence[str], maxterms: Sequence[int]):
    """Minimize POS by minimizing F' in SOP and applying De Morgan."""
    maxs = sorted(set(maxterms))
    if not maxs:
        return "F = 1", []
    if len(maxs) == 2 ** len(variables):
        return "F = 0", [[]]

    complement_patterns = quine_mccluskey(len(variables), maxs)
    complement_terms = [pattern_to_product(variables, p) for p in complement_patterns]

    sum_terms: List[Term] = []
    for term in complement_terms:
        # If F' has product A'B, F has sum (A + B').
        sum_terms.append([(var, not neg) for var, neg in term])

    text = "F = " + "".join(f"({sum_text(term)})" for term in sum_terms)
    return text, sum_terms


# ============================================================================
# 5. GATE NETLIST
# ============================================================================


@dataclass
class Gate:
    kind: str
    inputs: List[Node]
    id: int = -1

    _counter = 0

    def __post_init__(self):
        if self.id == -1:
            self.id = Gate._counter
            Gate._counter += 1


def reset_gate_ids() -> None:
    Gate._counter = 0


def _literal_node(var: str, neg: bool, gate_lib: str) -> Node:
    if not neg:
        return var
    if gate_lib == "and_or":
        return Gate("NOT", [var])
    if gate_lib == "nand":
        return Gate("NAND", [var, var])
    if gate_lib == "nor":
        return Gate("NOR", [var, var])
    raise ValueError(f"Unsupported gate library: {gate_lib}")


def _chunked_gate(kind: str, inputs: Sequence[Node], fan_in: int) -> Node:
    """Build an associative AND/OR tree with at most fan_in inputs per gate."""
    if not inputs:
        raise ValueError(f"{kind} gate needs at least one input")
    if len(inputs) == 1:
        return inputs[0]

    level = list(inputs)
    while len(level) > 1:
        next_level: List[Node] = []
        for i in range(0, len(level), fan_in):
            group = level[i:i + fan_in]
            next_level.append(
                group[0] if len(group) == 1 else Gate(kind, list(group))
            )
        level = next_level
    return level[0]


def _nand_not(node: Node) -> Node:
    return Gate("NAND", [node, node])


def _nand_and(inputs: Sequence[Node], fan_in: int) -> Node:
    """AND using NAND gates only, respecting the maximum fan-in."""
    if len(inputs) == 1:
        return inputs[0]

    level: List[Node] = []
    for i in range(0, len(inputs), fan_in):
        group = list(inputs[i:i + fan_in])
        if len(group) == 1:
            level.append(group[0])
        else:
            # NAND(group) followed by NAND(x,x) = AND(group).
            level.append(_nand_not(Gate("NAND", group)))

    return _nand_and(level, fan_in) if len(level) > 1 else level[0]


def _nand_or(inputs: Sequence[Node], fan_in: int) -> Node:
    """OR using NAND gates only, respecting the maximum fan-in."""
    if len(inputs) == 1:
        return inputs[0]

    level: List[Node] = []
    for i in range(0, len(inputs), fan_in):
        group = list(inputs[i:i + fan_in])
        if len(group) == 1:
            level.append(group[0])
        else:
            # NAND(x1', ..., xk') = x1 + ... + xk.
            level.append(Gate("NAND", [_nand_not(x) for x in group]))

    return _nand_or(level, fan_in) if len(level) > 1 else level[0]


def _nand_negative_product_fanin2(term: Term, literal_cache: Dict[str, Node]) -> Node:
    """Return the complemented product term using only 2-input NAND gates.

    For P = L1*L2*...*Lk this builds P', which is the natural polarity
    for the first level of a NAND-NAND SOP implementation.
    """
    if not term:
        raise ValueError("Empty product is a constant 1 and needs special handling")

    def literal_node(var: str, neg: bool) -> Node:
        if not neg:
            return var
        if var not in literal_cache:
            literal_cache[var] = _nand_not(var)
        return literal_cache[var]

    literals = [literal_node(var, neg) for var, neg in term]

    if len(literals) == 1:
        # P' for P=A is A'; for P=A' it is A.
        return _nand_not(literals[0]) if not term[0][1] else literals[0]

    if len(literals) == 2:
        return Gate("NAND", literals)

    # Build the first k-1 literals as a positive AND, then use one NAND
    # for the final literal. This directly produces the complemented
    # k-input product and saves one inversion.
    left = _nand_and(literals[:-1], 2)
    return Gate("NAND", [left, literals[-1]])


def _nand_or_from_negative_terms_fanin2(negative_terms: Sequence[Node]) -> Node:
    """Combine complemented SOP products using only 2-input NAND gates."""
    if not negative_terms:
        raise ValueError("At least one product term is required")

    if len(negative_terms) == 1:
        return _nand_not(negative_terms[0])

    # NAND(P1', P2') = P1 + P2.
    result = Gate("NAND", [negative_terms[0], negative_terms[1]])

    # Each additional term needs one NAND to restore negative polarity
    # followed by one NAND to combine the next complemented product.
    for term in negative_terms[2:]:
        result = Gate("NAND", [_nand_not(result), term])

    return result


def _build_nand_sop_optimized_fanin2(terms: Sequence[Term]) -> Node:
    """Optimized all-NAND realization for the --fan-in 2 case.

    Product terms stay in complemented polarity until the final stage,
    avoiding unnecessary inversions. Complemented input literals are
    shared across product terms.
    """
    if not terms:
        raise ValueError("Cannot build a circuit for F=0 without a constant source")
    if len(terms) == 1 and not terms[0]:
        raise ValueError("Constant F=1 should be handled separately")

    literal_cache: Dict[str, Node] = {}
    negative_products = [
        _nand_negative_product_fanin2(term, literal_cache)
        for term in terms
    ]
    return _nand_or_from_negative_terms_fanin2(negative_products)


def _count_gates(node: Node, seen: Optional[set[int]] = None) -> int:
    """Count unique gates in the generated DAG."""
    if isinstance(node, str):
        return 0
    if seen is None:
        seen = set()
    if node.id in seen:
        return 0
    seen.add(node.id)
    return 1 + sum(_count_gates(child, seen) for child in node.inputs)


def _nor_not(node: Node) -> Node:
    return Gate("NOR", [node, node])


def _nor_or(inputs: Sequence[Node], fan_in: int) -> Node:
    """OR using NOR gates only, respecting the maximum fan-in."""
    if len(inputs) == 1:
        return inputs[0]

    level: List[Node] = []
    for i in range(0, len(inputs), fan_in):
        group = list(inputs[i:i + fan_in])
        if len(group) == 1:
            level.append(group[0])
        else:
            # NOR(group) followed by NOR(x,x) = OR(group).
            level.append(_nor_not(Gate("NOR", group)))

    return _nor_or(level, fan_in) if len(level) > 1 else level[0]


def _nor_and(inputs: Sequence[Node], fan_in: int) -> Node:
    """AND using NOR gates only, respecting the maximum fan-in."""
    if len(inputs) == 1:
        return inputs[0]

    level: List[Node] = []
    for i in range(0, len(inputs), fan_in):
        group = list(inputs[i:i + fan_in])
        if len(group) == 1:
            level.append(group[0])
        else:
            # NOR(x1', ..., xk') = x1 * ... * xk.
            level.append(Gate("NOR", [_nor_not(x) for x in group]))

    return _nor_and(level, fan_in) if len(level) > 1 else level[0]


def build_nand_sop(terms: Sequence[Term], fan_in: int) -> Node:
    """Build an SOP using NAND gates only with bounded fan-in."""
    if not terms:
        raise ValueError("Cannot build a circuit for F=0 without a constant source")
    if len(terms) == 1 and not terms[0]:
        raise ValueError("Constant F=1 should be handled separately")

    products: List[Node] = []
    for term in terms:
        literals = [_literal_node(v, neg, "nand") for v, neg in term]
        products.append(_nand_and(literals, fan_in))

    return _nand_or(products, fan_in)


def build_nor_pos(sum_terms: Sequence[Term], fan_in: int) -> Node:
    """Build a POS expression using NOR gates only with bounded fan-in."""
    if not sum_terms:
        raise ValueError("Cannot build a circuit for F=1 without a constant source")
    if len(sum_terms) == 1 and not sum_terms[0]:
        raise ValueError("Constant F=0 should be handled separately")

    sums: List[Node] = []
    for sum_term in sum_terms:
        literals = [_literal_node(v, neg, "nor") for v, neg in sum_term]
        sums.append(_nor_or(literals, fan_in))

    return _nor_and(sums, fan_in)


def _validate_fan_in(node: Node, fan_in: int) -> None:
    """Verify that every generated gate obeys the requested fan-in."""
    if isinstance(node, str):
        return
    if len(node.inputs) > fan_in:
        raise RuntimeError(
            f"Internal error: {node.kind} gate {node.id} has "
            f"{len(node.inputs)} inputs; maximum is {fan_in}"
        )
    for child in node.inputs:
        _validate_fan_in(child, fan_in)


def build_netlist(
    terms: Sequence[Term],
    gate_lib: str,
    fan_in: int = 2,
) -> Node:
    """Build a circuit with no gate exceeding fan_in inputs."""
    if fan_in < 2:
        raise ValueError("fan_in must be at least 2")

    reset_gate_ids()

    if gate_lib == "and_or":
        if not terms:
            raise ValueError("F=0 needs a constant source")
        if len(terms) == 1 and not terms[0]:
            raise ValueError("F=1 needs a constant source")

        product_nodes: List[Node] = []
        for term in terms:
            literals = [_literal_node(v, neg, "and_or") for v, neg in term]
            product_nodes.append(_chunked_gate("AND", literals, fan_in))

        output = _chunked_gate("OR", product_nodes, fan_in)

    elif gate_lib == "nand":
        output = (
            _build_nand_sop_optimized_fanin2(terms)
            if fan_in == 2
            else build_nand_sop(terms, fan_in)
        )

    elif gate_lib == "nor":
        # 'terms' passed here must be POS sum-terms.
        output = build_nor_pos(terms, fan_in)

    else:
        raise ValueError("gate_lib must be 'and_or', 'nand', or 'nor'")

    _validate_fan_in(output, fan_in)
    return output


# ============================================================================
# 6. CIRCUIT DRAWING
# ============================================================================

WIRE_COLOR = "#ffffff"
GATE_EDGE = "#ffffff"
GATE_FILL = "#eef3fb"
SVG_GATE_DIR = Path(__file__).resolve().parent / "wikimedia_gate_symbols"

# All downloaded symbols use a 100 x 50 view box.  Their signal leads run from
# x=5 to x=31 on the input side and x=70 to x=95 on the output side.  We land
# wires slightly inside those leads (x=12 / x=88), which creates a deliberate
# overlap after SVG rasterisation and prevents hairline gaps.
SVG_VIEWBOX_WIDTH = 100.0
SVG_VIEWBOX_HEIGHT = 50.0
SVG_INPUT_X = 12.0
SVG_OUTPUT_X = 88.0
SVG_TWO_INPUT_Y = (15.0, 35.0)


@lru_cache(maxsize=None)
def _gate_svg_image(kind: str) -> np.ndarray:
    """Render a vendored public-domain SVG to an RGBA image in memory."""
    svg = SVG_GATE_DIR / f"{kind}.svg"
    if not svg.is_file():
        raise FileNotFoundError(f"Missing gate SVG: {svg}")
    result = subprocess.run(
        ["magick", "-background", "none", str(svg), "-alpha", "background", "png:-"],
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    return np.asarray(Image.open(BytesIO(result.stdout)).convert("RGBA"))


def _svg_gate_width(height: float) -> float:
    return height * SVG_VIEWBOX_WIDTH / SVG_VIEWBOX_HEIGHT


def draw_svg_gate(ax, kind: str, x: float, y: float, h: float) -> None:
    """Draw a complete ANSI gate SVG, including its built-in lead segments."""
    w = _svg_gate_width(h)
    ax.imshow(
        _gate_svg_image(kind),
        extent=(x - w / 2, x + w / 2, y - h / 2, y + h / 2),
        zorder=4,
    )


def svg_input_y(gate_y: float, gate_h: float, input_index: int, input_count: int) -> float:
    """Return a wire landing point at an SVG input terminal.

    Two-input gates use their precise published pin positions.  For wider
    generated gates, evenly distribute the connections within the same pin
    band so diagrams remain readable.
    """
    if input_count == 1:
        fraction = 0.5
    elif input_count == 2:
        fraction = SVG_TWO_INPUT_Y[input_index] / SVG_VIEWBOX_HEIGHT
    else:
        fraction = 0.28 + 0.44 * input_index / (input_count - 1)
    return gate_y - gate_h / 2 + gate_h * fraction


def _depth(node: Node, memo=None) -> int:
    if isinstance(node, str):
        return 0
    if memo is None:
        memo = {}
    if node.id in memo:
        return memo[node.id]
    value = 1 + max((_depth(child, memo) for child in node.inputs), default=0)
    memo[node.id] = value
    return value


def _collect_variables(node: Node, result=None) -> List[str]:
    if result is None:
        result = []
    if isinstance(node, str):
        if node not in result:
            result.append(node)
        return result
    for child in node.inputs:
        _collect_variables(child, result)
    return result


def draw_circuit(output_gate: Node, title: str, outfile: str) -> str:
    """Draw a clean left-to-right DAG circuit with separated wires.

    The layout deliberately keeps:
      * inputs on the left,
      * gates aligned to logic depth,
      * gates at the same depth vertically separated,
      * orthogonal wires with small horizontal routing offsets,
      * labels above gates rather than on top of wires.

    This avoids the overlapping/crossing appearance of the older
    average-Y layout, especially for 2-input NAND circuits.
    """
    variables = _collect_variables(output_gate)

    # ------------------------------------------------------------------
    # 1. Collect the DAG and calculate gate depths.
    # ------------------------------------------------------------------
    nodes: Dict[int, Gate] = {}

    def collect(node: Node) -> None:
        if isinstance(node, str) or node.id in nodes:
            return
        nodes[node.id] = node
        for child in node.inputs:
            collect(child)

    collect(output_gate)

    depths = {node_id: _depth(node) for node_id, node in nodes.items()}
    max_depth = max(depths.values(), default=0)

    # Gates are placed in columns according to depth.
    columns: Dict[int, List[Gate]] = {}
    for node in nodes.values():
        columns.setdefault(depths[node.id], []).append(node)

    # ------------------------------------------------------------------
    # 2. Assign vertical positions using a small barycentric layout.
    #
    # The important detail is that variable order is NOT forced to be
    # alphabetical. A shared input is placed near the vertical centre of
    # the gates it feeds. For example, AB + AC naturally becomes:
    #
    #             B ----> [AB]
    #             A --+--> [AC]
    #             C --+
    #
    # rather than making A's fan-out wire cross B/C.
    # ------------------------------------------------------------------
    var_gap = 1.6
    gate_gap = 1.25

    # Initial gate positions: stable top-to-bottom order by gate ID.
    gate_y: Dict[int, float] = {}
    for depth in sorted(columns):
        gates = sorted(columns[depth], key=lambda g: g.id)
        centre = (len(gates) - 1) * gate_gap / 2
        for i, gate in enumerate(gates):
            gate_y[gate.id] = centre - i * gate_gap

    var_y: Dict[str, float] = {}

    def source_y(node: Node) -> float:
        if isinstance(node, str):
            return var_y[node]
        return gate_y[node.id]

    # Repeatedly move variables toward the gates they feed, then move
    # gates toward their inputs. Two or three passes are enough for this
    # DAG-style circuit layout and keep the result deterministic.
    for _ in range(3):
        variable_targets: Dict[str, List[float]] = {v: [] for v in variables}

        for gate in nodes.values():
            for child in gate.inputs:
                if isinstance(child, str):
                    variable_targets[child].append(gate_y[gate.id])

        # Shared variables naturally land between their consumers.
        desired_vars = []
        for var in variables:
            ys = variable_targets[var]
            target = sum(ys) / len(ys) if ys else 0.0
            desired_vars.append((target, var))

        desired_vars.sort(key=lambda item: (-item[0], item[1]))

        # Put variables on clean, evenly spaced rows while preserving the
        # barycentric ordering.
        for i, (_, var) in enumerate(desired_vars):
            var_y[var] = (len(variables) - 1 - i) * var_gap

        # Move every gate toward the centre of its inputs.
        for depth in sorted(columns):
            gates = columns[depth]
            desired = []
            for gate in gates:
                child_ys = [source_y(child) for child in gate.inputs]
                target = sum(child_ys) / len(child_ys) if child_ys else 0.0
                desired.append((target, gate))

            desired.sort(key=lambda item: (item[0], item[1].id))

            placed: List[Tuple[float, Gate]] = []
            for target, gate in desired:
                y = target
                if placed:
                    y = max(y, placed[-1][0] + gate_gap)
                placed.append((y, gate))

            if placed:
                centre = (placed[0][0] + placed[-1][0]) / 2
                desired_centre = sum(y for y, _ in desired) / len(desired)
                shift = desired_centre - centre
                placed = [(y + shift, gate) for y, gate in placed]

            for y, gate in placed:
                gate_y[gate.id] = y

    # Final variable ordering pass. This makes fan-out wires as short and
    # as non-crossing as possible while keeping labels neatly spaced.
    variable_targets = {v: [] for v in variables}
    for gate in nodes.values():
        for child in gate.inputs:
            if isinstance(child, str):
                variable_targets[child].append(gate_y[gate.id])

    ordered_vars = sorted(
        variables,
        key=lambda v: (
            -(sum(variable_targets[v]) / len(variable_targets[v])
              if variable_targets[v] else 0.0),
            v,
        ),
    )
    var_y = {
        var: (len(ordered_vars) - 1 - i) * var_gap
        for i, var in enumerate(ordered_vars)
    }

    # The final output gate should stay visually centered around its inputs.
    if not isinstance(output_gate, str):
        output_y = gate_y[output_gate.id]
    else:
        output_y = var_y[output_gate]

    # ------------------------------------------------------------------
    # 3. Drawing setup.
    # ------------------------------------------------------------------
    x_gap = 2.8
    gate_x = {
        node_id: x_gap * depths[node_id]
        for node_id in nodes
    }

    height = max(4.8, 1.4 + 0.85 * max(len(variables), 2))
    fig, ax = plt.subplots(figsize=(14, height), facecolor="black")
    ax.set_facecolor("black")

    # Draw wires first, then gates on top of them.
    WIRE_LW = 1.5

    def gate_geometry(gate: Gate) -> Tuple[float, float, float, float]:
        """Return (input port x, output port x, y, height) for a gate SVG."""
        x = gate_x[gate.id]
        y = gate_y[gate.id]
        h = max(0.72, min(2.0, 0.52 + 0.28 * len(gate.inputs)))
        if gate.kind not in {"AND", "OR", "NAND", "NOR", "NOT"}:
            raise ValueError(f"Unknown gate kind: {gate.kind}")
        w = _svg_gate_width(h)
        left = x - w / 2 + w * SVG_INPUT_X / SVG_VIEWBOX_WIDTH
        right = x - w / 2 + w * SVG_OUTPUT_X / SVG_VIEWBOX_WIDTH
        return left, right, y, h

    def node_output(node: Node) -> Tuple[float, float]:
        if isinstance(node, str):
            return 0.0, var_y[node]

        _, right, y, _ = gate_geometry(node)
        return right, y

    # ------------------------------------------------------------------
    # 4. Draw input labels and source wires.
    # ------------------------------------------------------------------
    for var, y in var_y.items():
        ax.text(
            -0.55, y, var,
            fontsize=14,
            ha="right",
            va="center",
            fontweight="bold",
            color="white",
        )
        ax.plot(
            [-0.45, 0.0], [y, y],
            color=WIRE_COLOR,
            lw=WIRE_LW,
            solid_capstyle="round",
            zorder=1,
        )

    # ------------------------------------------------------------------
    # 5. Draw orthogonal connections.
    #
    # Every gate input gets a distinct y-coordinate on the left edge of
    # the gate. A short vertical segment is used only when necessary.
    # ------------------------------------------------------------------
    # Count how many gate inputs each source drives. This lets us mark
    # genuine fan-out points without putting dots on ordinary wires.
    fanout: Dict[str, int] = {}
    for gate in nodes.values():
        for child in gate.inputs:
            if isinstance(child, str):
                fanout[child] = fanout.get(child, 0) + 1
            else:
                key = f"gate:{child.id}"
                fanout[key] = fanout.get(key, 0) + 1

    def draw_connection(
        child: Node,
        parent: Gate,
        input_index: int,
        gate_h: float,
        gate_left: float,
    ) -> None:
        child_x, child_y = node_output(child)

        n = len(parent.inputs)
        target_y = svg_input_y(gate_y[parent.id], gate_h, input_index, n)

        # Route just outside the gate body. The final segment ends at
        # gate_left, so there is no visual gap between wire and gate.
        route_x = gate_left - 0.32 - 0.12 * input_index

        ax.plot(
            [child_x, route_x], [child_y, child_y],
            color=WIRE_COLOR,
            lw=WIRE_LW,
            solid_capstyle="round",
            zorder=1,
        )

        if abs(child_y - target_y) > 1e-9:
            ax.plot(
                [route_x, route_x], [child_y, target_y],
                color=WIRE_COLOR,
                lw=WIRE_LW,
                solid_capstyle="round",
                zorder=1,
            )

        ax.plot(
            [route_x, gate_left], [target_y, target_y],
            color=WIRE_COLOR,
            lw=WIRE_LW,
            solid_capstyle="round",
            zorder=1,
        )

        # A junction dot indicates a real fan-out from this source.
        source_key = child if isinstance(child, str) else f"gate:{child.id}"
        if fanout.get(source_key, 0) > 1 and input_index == 0:
            ax.plot(
                [child_x], [child_y],
                marker="o",
                markersize=3.8,
                markerfacecolor=WIRE_COLOR,
                markeredgecolor=WIRE_COLOR,
                zorder=3,
            )

    # ------------------------------------------------------------------
    # 6. Draw gates from left to right.
    # ------------------------------------------------------------------
    for depth in sorted(columns):
        for gate in sorted(columns[depth], key=lambda g: (gate_y[g.id], g.id)):
            x = gate_x[gate.id]
            y = gate_y[gate.id]

            _, _, _, h = gate_geometry(gate)

            draw_svg_gate(ax, gate.kind, x, y, h)

            expected_left, _, _, _ = gate_geometry(gate)

            for input_index, child in enumerate(gate.inputs):
                draw_connection(child, gate, input_index, h, expected_left)

    # ------------------------------------------------------------------
    # 7. Output wire and label.
    # ------------------------------------------------------------------
    out_x, out_y = node_output(output_gate)

    ax.plot(
        [out_x, out_x + 0.75],
        [out_y, out_y],
        color=WIRE_COLOR,
        lw=1.7,
        solid_capstyle="round",
        zorder=1,
    )
    ax.text(
        out_x + 0.92, out_y,
        "F",
        fontsize=15,
        fontweight="bold",
        ha="left",
        va="center",
        color="white",
    )

    # ------------------------------------------------------------------
    # 8. Framing.
    # ------------------------------------------------------------------
    all_y = list(var_y.values()) + list(gate_y.values()) or [0.0]
    min_y = min(all_y)
    max_y = max(all_y)

    ax.set_xlim(-1.0, x_gap * (max_depth + 1) + 1.5)
    ax.set_ylim(min_y - 1.15, max_y + 1.15)
    ax.set_aspect("equal")
    ax.axis("off")
    ax.set_title(title, fontsize=13, fontweight="bold", pad=16, color="white")

    fig.tight_layout()
    fig.savefig(outfile, dpi=200, bbox_inches="tight")
    plt.close(fig)
    return outfile


def draw_constant_circuit(value: int, title: str, outfile: str) -> str:
    fig, ax = plt.subplots(figsize=(5, 2.4), facecolor="black")
    ax.set_facecolor("black")
    ax.axis("off")
    ax.text(0.18, 0.5, str(value), fontsize=20, fontweight="bold", ha="center", va="center", color="white",
            bbox=dict(boxstyle="round,pad=0.4", facecolor=GATE_FILL, edgecolor=GATE_EDGE))
    ax.plot([0.35, 0.75], [0.5, 0.5], color=WIRE_COLOR, lw=1.5)
    ax.text(0.9, 0.5, "F", fontsize=16, fontweight="bold", ha="center", va="center", color="white")
    ax.set_xlim(0, 1.1)
    ax.set_ylim(0, 1)
    ax.set_title(title, fontsize=11, fontweight="bold", color="white")
    fig.tight_layout()
    fig.savefig(outfile, dpi=180, bbox_inches="tight")
    plt.close(fig)
    return outfile


# ============================================================================
# 7. TOP-LEVEL API
# ============================================================================


def write_analysis_json(
    json_outfile: str,
    expression: str,
    variables: Sequence[str],
    rows: Sequence[Tuple[Sequence[int], int]],
    minterms: Sequence[int],
    maxterms: Sequence[int],
    canonical_sop_text: str,
    canonical_pos_text: str,
    simplified_sop_text: str,
    simplified_pos_text: str,
) -> str:
    """Save the Boolean-analysis results in a reusable JSON file."""
    truth_table = [
        {**dict(zip(variables, values)), "F": result}
        for values, result in rows
    ]
    payload = {
        "expression": expression,
        "variables": list(variables),
        "variable_count": len(variables),
        "truth_table": truth_table,
        "minterms": list(minterms),
        "maxterms": list(maxterms),
        "dont_care_terms": [],
        "canonical_sop": canonical_sop_text,
        "canonical_pos": canonical_pos_text,
        "simplified_sop": simplified_sop_text,
        "simplified_pos": simplified_pos_text,
    }
    path = Path(json_outfile)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return str(path)


def run(
    expression: str,
    gates: str = "and_or",
    outfile: str = "circuit.png",
    variable_order: Optional[Sequence[str]] = None,
    fan_in: int = 2,
    json_outfile: Optional[str] = None,
):
    """Analyze an SOP and optionally draw its minimized implementation."""
    if gates not in {"and_or", "nand", "nor"}:
        raise ValueError("gates must be one of: and_or, nand, nor")
    if fan_in < 2:
        raise ValueError("fan_in must be at least 2")

    variables, original_terms, rows, minterms, maxterms = build_truth_table(
        expression, variable_order=variable_order
    )

    print_truth_table(variables, rows)
    print("\nSum of minterms:")
    print(f"F = Σm({', '.join(map(str, minterms))})" if minterms else "F = 0")
    print("\nProduct of maxterms:")
    print(f"F = ΠM({', '.join(map(str, maxterms))})" if maxterms else "F = 1")

    canonical_sop_text = canonical_sop(variables, minterms)
    canonical_pos_text = canonical_pos(variables, maxterms)
    print("\nCanonical SOP:")
    print(canonical_sop_text)
    print("\nCanonical POS:")
    print(canonical_pos_text)

    print_kmap(variables, minterms)

    min_sop_text, min_sop_terms = minimal_sop(variables, minterms)
    min_pos_text, min_pos_terms = minimal_pos(variables, maxterms)
    print("\nMinimized SOP (exact Quine-McCluskey):")
    print(min_sop_text)
    print("\nMinimized POS (exact Quine-McCluskey on F'):")
    print(min_pos_text)

    json_path = json_outfile or str(Path(outfile).with_suffix(".json"))
    write_analysis_json(
        json_path,
        expression,
        variables,
        rows,
        minterms,
        maxterms,
        canonical_sop_text,
        canonical_pos_text,
        min_sop_text,
        min_pos_text,
    )
    print(f"\nAnalysis JSON saved to: {json_path}")

    total = 2 ** len(variables)
    if len(minterms) == 0 or len(minterms) == total:
        value = 1 if len(minterms) == total else 0
        draw_constant_circuit(value, f"F = {expression}   |   constant {value}", outfile)
        print(f"\nF is constant {value}; circuit saved to: {outfile}")
        return outfile

    if gates == "nor":
        # Minimal POS is already a list of sum terms.
        output = build_netlist(min_pos_terms, "nor", fan_in=fan_in)
        realized_as = "Minimized POS -> NOR-NOR (all-NOR)"
    else:
        output = build_netlist(min_sop_terms, gates, fan_in=fan_in)
        if gates == "nand":
            realized_as = (
                "Minimized SOP -> optimized 2-input NAND-NAND"
                if fan_in == 2
                else "Minimized SOP -> NAND-NAND (all-NAND)"
            )
        else:
            realized_as = "Minimized SOP -> AND-OR"

    if gates == "nand":
        print(f"\nNAND gate count: {_count_gates(output)}")

    Path(outfile).parent.mkdir(parents=True, exist_ok=True)
    draw_circuit(
        output,
        f"F = {expression}   |   {realized_as}   |   max fan-in = {fan_in}",
        outfile,
    )
    print(f"\nCircuit diagram saved to: {outfile}")
    return outfile


# ============================================================================
# 8. CLI
# ============================================================================


def _parse_variable_order(value: Optional[str]) -> Optional[List[str]]:
    if value is None:
        return None
    # Accept both "A D F H M" and "AD F H M"-style simple lists.
    tokens = re.findall(r"[A-Za-z]", value)
    if not tokens:
        raise argparse.ArgumentTypeError("variable order must contain letters")
    return tokens


def main() -> None:
    parser = argparse.ArgumentParser(description="Generic Boolean logic toolkit")
    parser.add_argument("--expr", type=str, help='SOP expression, e.g. "AB\' + AC + BC\'"')
    parser.add_argument("--gates", choices=["and_or", "nand", "nor"], default="and_or")
    parser.add_argument("--vars", type=str, default=None,
                        help='Variable order, e.g. "A D F H M" (important for minterm numbering/K-map)')
    parser.add_argument("--out", type=str, default="circuit.png")
    parser.add_argument(
        "--json-out",
        type=str,
        default=None,
        help="Analysis JSON path (default: same name as --out, with a .json extension)",
    )
    parser.add_argument(
        "--fan-in",
        type=int,
        default=2,
        dest="fan_in",
        help="Maximum number of inputs per gate (default: 2)",
    )
    args = parser.parse_args()

    expression = args.expr or input("Enter Boolean expression in SOP form: ")
    variable_order = _parse_variable_order(args.vars)
    run(
        expression,
        gates=args.gates,
        outfile=args.out,
        variable_order=variable_order,
        fan_in=args.fan_in,
        json_outfile=args.json_out,
    )


if __name__ == "__main__":
    main()
