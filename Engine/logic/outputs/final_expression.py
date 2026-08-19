"""Human-readable expression output helpers."""

from __future__ import annotations

from typing import Sequence

from logic.expressions.nodes import Term, product_text, sum_text


def format_sop(terms: Sequence[Term]) -> str:
    return "F = " + " + ".join(product_text(t) for t in terms) if terms else "F = 0"


def format_pos(terms: Sequence[Term]) -> str:
    return "F = " + "".join(f"({sum_text(t)})" for t in terms) if terms else "F = 1"
