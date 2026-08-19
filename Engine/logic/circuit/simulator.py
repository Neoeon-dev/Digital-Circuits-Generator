"""Digital simulation of a circuit DAG."""

from __future__ import annotations

from typing import Dict

from .graph import Gate, Node


def simulate(node: Node, values: Dict[str, bool]) -> bool:
    """Evaluate a generated gate netlist for one input assignment."""
    if isinstance(node, str):
        if node not in values:
            raise KeyError(f"Missing input value for variable {node!r}")
        return bool(values[node])

    inputs = [simulate(child, values) for child in node.inputs]

    if node.kind == "NOT":
        return not inputs[0]
    if node.kind == "AND":
        return all(inputs)
    if node.kind == "OR":
        return any(inputs)
    if node.kind == "NAND":
        return not all(inputs)
    if node.kind == "NOR":
        return not any(inputs)

    raise ValueError(f"Unsupported gate kind: {node.kind}")
