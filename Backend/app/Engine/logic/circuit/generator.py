"""Gate-netlist construction.

Supports AND/OR, all-NAND and all-NOR realizations with bounded fan-in.
The 2-input NAND path retains the optimized negative-polarity construction
from the original implementation.
"""

from __future__ import annotations

from typing import Dict, List, Sequence

from ..expressions.nodes import Node, Term
from .graph import Gate, reset_gate_ids


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
    if len(inputs) == 1:
        return inputs[0]

    level: List[Node] = []
    for i in range(0, len(inputs), fan_in):
        group = list(inputs[i:i + fan_in])
        if len(group) == 1:
            level.append(group[0])
        else:
            level.append(_nand_not(Gate("NAND", group)))

    return _nand_and(level, fan_in) if len(level) > 1 else level[0]


def _nand_or(inputs: Sequence[Node], fan_in: int) -> Node:
    if len(inputs) == 1:
        return inputs[0]

    level: List[Node] = []
    for i in range(0, len(inputs), fan_in):
        group = list(inputs[i:i + fan_in])
        if len(group) == 1:
            level.append(group[0])
        else:
            level.append(Gate("NAND", [_nand_not(x) for x in group]))

    return _nand_or(level, fan_in) if len(level) > 1 else level[0]


def _nand_negative_product_fanin2(
    term: Term,
    literal_cache: Dict[str, Node],
) -> Node:
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
        return _nand_not(literals[0]) if not term[0][1] else literals[0]

    if len(literals) == 2:
        return Gate("NAND", literals)

    left = _nand_and(literals[:-1], 2)
    return Gate("NAND", [left, literals[-1]])


def _nand_or_from_negative_terms_fanin2(
    negative_terms: Sequence[Node],
) -> Node:
    if not negative_terms:
        raise ValueError("At least one product term is required")

    if len(negative_terms) == 1:
        return _nand_not(negative_terms[0])

    result = Gate("NAND", [negative_terms[0], negative_terms[1]])
    for term in negative_terms[2:]:
        result = Gate("NAND", [_nand_not(result), term])
    return result


def _build_nand_sop_optimized_fanin2(terms: Sequence[Term]) -> Node:
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


def _nor_not(node: Node) -> Node:
    return Gate("NOR", [node, node])


def _nor_or(inputs: Sequence[Node], fan_in: int) -> Node:
    if len(inputs) == 1:
        return inputs[0]

    level: List[Node] = []
    for i in range(0, len(inputs), fan_in):
        group = list(inputs[i:i + fan_in])
        if len(group) == 1:
            level.append(group[0])
        else:
            level.append(_nor_not(Gate("NOR", group)))

    return _nor_or(level, fan_in) if len(level) > 1 else level[0]


def _nor_and(inputs: Sequence[Node], fan_in: int) -> Node:
    if len(inputs) == 1:
        return inputs[0]

    level: List[Node] = []
    for i in range(0, len(inputs), fan_in):
        group = list(inputs[i:i + fan_in])
        if len(group) == 1:
            level.append(group[0])
        else:
            level.append(Gate("NOR", [_nor_not(x) for x in group]))

    return _nor_and(level, fan_in) if len(level) > 1 else level[0]


def build_nand_sop(terms: Sequence[Term], fan_in: int) -> Node:
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
    if isinstance(node, str):
        return
    if len(node.inputs) > fan_in:
        raise RuntimeError(
            f"Internal error: {node.kind} gate {node.id} has "
            f"{len(node.inputs)} inputs; maximum is {fan_in}"
        )
    for child in node.inputs:
        _validate_fan_in(child, fan_in)


def build_netlist(terms: Sequence[Term], gate_lib: str, fan_in: int = 2) -> Node:
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
        output = build_nor_pos(terms, fan_in)
    else:
        raise ValueError("gate_lib must be 'and_or', 'nand', or 'nor'")

    _validate_fan_in(output, fan_in)
    return output
