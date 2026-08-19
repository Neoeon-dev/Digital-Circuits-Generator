"""POS minimization API."""

from __future__ import annotations

from typing import List, Sequence

from logic.expressions.nodes import Term, sum_text
from .quine_mccluskey import quine_mccluskey
from .sop import pattern_to_product


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
        sum_terms.append([(var, not neg) for var, neg in term])

    text = "F = " + "".join(f"({sum_text(term)})" for term in sum_terms)
    return text, sum_terms
