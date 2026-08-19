"""Public Logic Engine orchestration layer.

The engine is responsible for deterministic Boolean analysis and circuit
construction. It returns a typed LogicResult for application code and can
optionally export JSON/PNG artifacts for CLI or debugging workflows.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Optional, Sequence

from .truth_table.generator import (
    build_truth_table,
    canonical_pos,
    canonical_sop,
    print_kmap,
    print_truth_table,
)
from .minimization.sop import minimal_sop
from .minimization.pos import minimal_pos
from .circuit.generator import build_netlist
from .circuit.graph import Gate, Node, count_gates
from .circuit.simulator import simulate
from .outputs.standard_circuits_diagrmas import draw_circuit, draw_constant_circuit
from .models import (
    CircuitEdge,
    CircuitInfo,
    CircuitNode,
    ImplementationInfo,
    LogicResult,
)



def _serialize_circuit(node: Node) -> CircuitInfo:
    """Convert the internal Gate DAG into JSON-safe circuit data."""

    if isinstance(node, str):
        return CircuitInfo(
            nodes=[],
            edges=[],
            output=node,
        )

    nodes: dict[str, CircuitNode] = {}
    edges: list[CircuitEdge] = []
    visited: set[int] = set()

    def walk(current: Node) -> str:
        if isinstance(current, str):
            return current

        current_id = f"g{current.id}"

        if current.id not in visited:
            visited.add(current.id)
            input_ids = [walk(child) for child in current.inputs]
            nodes[current_id] = CircuitNode(
                id=current_id,
                type=current.kind,
                inputs=input_ids,
            )
            edges.extend(
                CircuitEdge(source=child_id, target=current_id)
                for child_id in input_ids
            )
        else:
            # The nodes were already created, but their children may not be
            # reachable from a second reference in a future DAG shape.
            for child in current.inputs:
                walk(child)

        return current_id

    output_id = walk(node)

    return CircuitInfo(
        nodes=list(nodes.values()),
        edges=edges,
        output=output_id,
    )



def _verify_circuit(
    output: Node,
    variables: Sequence[str],
    rows,
) -> bool:
    """Verify the generated gate DAG against the truth-table results."""

    for values_tuple, expected in rows:
        values = dict(zip(variables, values_tuple))
        actual = int(simulate(output, values))
        if actual != int(expected):
            return False
    return True



def _build_truth_table_payload(variables: Sequence[str], rows) -> list[dict[str, int]]:
    return [
        {**dict(zip(variables, values)), "F": int(result)}
        for values, result in rows
    ]



def write_analysis_json(
    json_outfile: str,
    result: LogicResult,
) -> str:
    """Export the logic analysis as a JSON file."""

    path = Path(json_outfile)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(result.model_dump(mode="json"), indent=2) + "\n",
        encoding="utf-8",
    )
    return str(path)



def run(
    expression: str,
    gates: str = "and_or",
    outfile: str | None = None,
    variable_order: Optional[Sequence[str]] = None,
    fan_in: int = 2,
    json_outfile: Optional[str] = None,
) -> LogicResult:
    """Analyze a Boolean expression and optionally export a circuit image/JSON."""

    if gates not in {"and_or", "nand", "nor"}:
        raise ValueError("gates must be one of: and_or, nand, nor")
    if fan_in < 2:
        raise ValueError("fan_in must be at least 2")

    variables, _original_terms, rows, minterms, maxterms = build_truth_table(
        expression,
        variable_order=variable_order,
    )

    # Keep the existing CLI/debug output.
    print_truth_table(variables, rows)
    print("\nSum of minterms:")
    print(
        f"F = Σm({', '.join(map(str, minterms))})"
        if minterms
        else "F = 0"
    )
    print("\nProduct of maxterms:")
    print(
        f"F = ΠM({', '.join(map(str, maxterms))})"
        if maxterms
        else "F = 1"
    )

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

    truth_table = _build_truth_table_payload(variables, rows)
    total = 2 ** len(variables)

    # Constant functions do not require a gate DAG.
    if len(minterms) == 0 or len(minterms) == total:
        value = 1 if len(minterms) == total else 0

        circuit = CircuitInfo(
            nodes=[],
            edges=[],
            output="F",
            constant_value=value,
        )

        implementation = ImplementationInfo(
            gates=gates,
            fan_in=fan_in,
            gate_count=0,
            realized_as=f"Constant {value}",
        )

        result = LogicResult(
            expression=expression,
            variables=list(variables),
            variable_count=len(variables),
            truth_table=truth_table,
            minterms=list(minterms),
            maxterms=list(maxterms),
            canonical_sop=canonical_sop_text,
            canonical_pos=canonical_pos_text,
            simplified_sop=min_sop_text,
            simplified_pos=min_pos_text,
            implementation=implementation,
            circuit=circuit,
            verified=True,
        )

        if outfile is not None:
            Path(outfile).parent.mkdir(parents=True, exist_ok=True)
            draw_constant_circuit(
                value,
                f"F = {expression}   |   constant {value}",
                outfile,
            )
            result.circuit.image = outfile
            print(f"\nF is constant {value}; circuit saved to: {outfile}")

        if json_outfile is not None:
            write_analysis_json(json_outfile, result)
            print(f"\nAnalysis JSON saved to: {json_outfile}")

        return result

    # Build the requested implementation.
    if gates == "nor":
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

    gate_count = count_gates(output)
    if gates == "nand":
        print(f"\nNAND gate count: {gate_count}")

    circuit = _serialize_circuit(output)
    verified = _verify_circuit(output, variables, rows)

    implementation = ImplementationInfo(
        gates=gates,
        fan_in=fan_in,
        gate_count=gate_count,
        realized_as=realized_as,
    )

    result = LogicResult(
        expression=expression,
        variables=list(variables),
        variable_count=len(variables),
        truth_table=truth_table,
        minterms=list(minterms),
        maxterms=list(maxterms),
        canonical_sop=canonical_sop_text,
        canonical_pos=canonical_pos_text,
        simplified_sop=min_sop_text,
        simplified_pos=min_pos_text,
        implementation=implementation,
        circuit=circuit,
        verified=verified,
    )

    if outfile is not None:
        Path(outfile).parent.mkdir(parents=True, exist_ok=True)
        draw_circuit(
            output,
            f"F = {expression}   |   {realized_as}   |   max fan-in = {fan_in}",
            outfile,
        )
        result.circuit.image = outfile
        print(f"\nCircuit diagram saved to: {outfile}")

    if json_outfile is not None:
        write_analysis_json(json_outfile, result)
        print(f"\nAnalysis JSON saved to: {json_outfile}")

    return result