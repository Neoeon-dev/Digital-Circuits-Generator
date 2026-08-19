"""Core expression and circuit node types.

The expression representation intentionally stays lightweight:
a Literal is (variable, complemented), and a Term is a list of literals.
The circuit layer extends Node with Gate.
"""

from __future__ import annotations

from typing import List, Tuple, Union, TYPE_CHECKING

Literal = Tuple[str, bool]       # (variable, complemented?)
Term = List[Literal]

if TYPE_CHECKING:
    from logic.circuit.graph import Gate

Node = Union[str, "Gate"]


def literal_text(lit: Literal) -> str:
    var, neg = lit
    return var + ("'" if neg else "")


def product_text(term: Term) -> str:
    return "".join(literal_text(lit) for lit in term) or "1"


def sum_text(term: Term) -> str:
    return " + ".join(literal_text(lit) for lit in term) or "0"
