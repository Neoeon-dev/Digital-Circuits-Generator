"""SOP minimization API."""

from __future__ import annotations

from typing import Sequence

from logic.expressions.nodes import Term, product_text
from .quine_mccluskey import quine_mccluskey


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
