"""Typed result models shared by the Boolean Logic Engine and FastAPI."""

from __future__ import annotations

from pydantic import BaseModel, Field


class ImplementationInfo(BaseModel):
    """How the Boolean function was physically realized."""

    gates: str
    fan_in: int
    gate_count: int
    realized_as: str


class CircuitNode(BaseModel):
    """A gate in the serializable circuit graph."""

    id: str
    type: str
    inputs: list[str]


class CircuitEdge(BaseModel):
    """A directed connection in the circuit graph."""

    source: str
    target: str


class CircuitInfo(BaseModel):
    """Circuit artifacts returned to the API/frontend."""

    nodes: list[CircuitNode] = Field(default_factory=list)
    edges: list[CircuitEdge] = Field(default_factory=list)
    output: str | None = None
    image: str | None = None
    constant_value: int | None = None


class LogicResult(BaseModel):
    """Complete deterministic result produced by the Logic Engine."""

    expression: str
    variables: list[str]
    variable_count: int

    truth_table: list[dict[str, int]]

    minterms: list[int]
    maxterms: list[int]
    dont_care_terms: list[int] = Field(default_factory=list)

    canonical_sop: str
    canonical_pos: str
    simplified_sop: str
    simplified_pos: str

    implementation: ImplementationInfo
    circuit: CircuitInfo
    verified: bool
