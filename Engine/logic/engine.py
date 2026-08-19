"""Public Logic Engine orchestration layer."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Optional, Sequence, Tuple

from logic.truth_table.generator import (
    build_truth_table,
    canonical_pos,
    canonical_sop,
    print_kmap,
    print_truth_table,
)
from logic.minimization.sop import minimal_sop
from logic.minimization.pos import minimal_pos
from logic.circuit.generator import build_netlist
from logic.circuit.graph import count_gates
from logic.outputs.standard_circuits_diagrmas import draw_circuit, draw_constant_circuit


def write_analysis_json(
    json_outfile: str,
    expression: str,
    variables: Sequence[str],
    rows,
    minterms,
    maxterms,
    canonical_sop_text: str,
    canonical_pos_text: str,
    simplified_sop_text: str,
    simplified_pos_text: str,
) -> str:
    truth_table = [
        {**dict(zip(variables, values)), "F": result}
        for values, result in rows
    ]
    payload = {
        "expression": expression,
        "variables": list(variables),
        "variable_count": len(variables),
        "truth_table": truth_table,
        "minterms": list(minterms),
        "maxterms": list(maxterms),
        "dont_care_terms": [],
        "canonical_sop": canonical_sop_text,
        "canonical_pos": canonical_pos_text,
        "simplified_sop": simplified_sop_text,
        "simplified_pos": simplified_pos_text,
    }
    path = Path(json_outfile)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return str(path)


def run(
    expression: str,
    gates: str = "and_or",
    outfile: str = "output/circuit.png",
    variable_order: Optional[Sequence[str]] = None,
    fan_in: int = 2,
    json_outfile: Optional[str] = None,
):
    """Analyze an SOP and optionally draw its minimized implementation."""
    if gates not in {"and_or", "nand", "nor"}:
        raise ValueError("gates must be one of: and_or, nand, nor")
    if fan_in < 2:
        raise ValueError("fan_in must be at least 2")

    variables, original_terms, rows, minterms, maxterms = build_truth_table(
        expression, variable_order=variable_order
    )

    print_truth_table(variables, rows)
    print("\nSum of minterms:")
    print(f"F = Σm({', '.join(map(str, minterms))})" if minterms else "F = 0")
    print("\nProduct of maxterms:")
    print(f"F = ΠM({', '.join(map(str, maxterms))})" if maxterms else "F = 1")

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

    # By default, keep the two primary artifacts together in output/.
    # The API/CLI can still override either path explicitly.
    json_path = json_outfile or str(Path(__file__).resolve().parent / "outputs" / "data.json")
    write_analysis_json(
        json_path, expression, variables, rows, minterms, maxterms,
        canonical_sop_text, canonical_pos_text, min_sop_text, min_pos_text,
    )
    print(f"\nAnalysis JSON saved to: {json_path}")

    total = 2 ** len(variables)
    if len(minterms) == 0 or len(minterms) == total:
        value = 1 if len(minterms) == total else 0
        draw_constant_circuit(value, f"F = {expression}   |   constant {value}", outfile)
        print(f"\nF is constant {value}; circuit saved to: {outfile}")
        return outfile

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

    if gates == "nand":
        print(f"\nNAND gate count: {count_gates(output)}")

    Path(outfile).parent.mkdir(parents=True, exist_ok=True)
    draw_circuit(
        output,
        f"F = {expression}   |   {realized_as}   |   max fan-in = {fan_in}",
        outfile,
    )
    print(f"\nCircuit diagram saved to: {outfile}")
    return outfile
