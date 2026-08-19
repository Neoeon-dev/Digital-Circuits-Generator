"""Parsing and Boolean evaluation for SOP expressions."""

from __future__ import annotations

import re
from itertools import product
from typing import Dict, List, Optional, Sequence, Tuple

from .nodes import Term

_VARIABLE_RE = re.compile(r"[A-Za-z]")


def get_variables(
    expression: str,
    variable_order: Optional[Sequence[str]] = None,
) -> List[str]:
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
    """Parse strict SOP syntax such as AB' + AC + B'C."""
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

            if (var, not neg) in term:
                term = []
                break
            if (var, neg) not in term:
                term.append((var, neg))

        if term:
            term.sort(key=lambda x: x[0])
            parsed.append(term)

    if function_is_one:
        return [[]]
    return parsed


def evaluate_term(term: Term, values: Dict[str, bool]) -> bool:
    """Evaluate one product term."""
    if not term:
        return True
    return all((not values[var]) if neg else values[var] for var, neg in term)


def evaluate_sop(terms: Sequence[Term], values: Dict[str, bool]) -> bool:
    """Evaluate the OR of all product terms."""
    return any(evaluate_term(term, values) for term in terms)
