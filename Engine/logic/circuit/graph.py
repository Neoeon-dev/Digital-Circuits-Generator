"""Circuit graph primitives and gate-count utilities."""

from __future__ import annotations

from dataclasses import dataclass
from typing import List, Union, Optional, Set


@dataclass
class Gate:
    kind: str
    inputs: List["Node"]
    id: int = -1

    _counter = 0

    def __post_init__(self):
        if self.id == -1:
            self.id = Gate._counter
            Gate._counter += 1


Node = Union[str, Gate]


def reset_gate_ids() -> None:
    Gate._counter = 0


def count_gates(node: Node, seen: Optional[Set[int]] = None) -> int:
    """Count unique gates in the generated DAG."""
    if isinstance(node, str):
        return 0
    if seen is None:
        seen = set()
    if node.id in seen:
        return 0
    seen.add(node.id)
    return 1 + sum(count_gates(child, seen) for child in node.inputs)
