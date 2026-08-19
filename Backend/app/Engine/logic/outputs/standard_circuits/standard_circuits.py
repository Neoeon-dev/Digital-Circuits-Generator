"""Standard digital circuits built on the existing Logic Engine.

Every public function uses the same analysis pipeline as the normal
expression interface. Therefore each generated output has the same:
    - expression
    - variable order
    - truth table
    - minterms / maxterms
    - canonical SOP / POS
    - K-map
    - minimized SOP / POS
    - analysis JSON
    - circuit PNG

For multi-output circuits (adders/subtractors/multiplier), each Boolean
output is analyzed independently, while a single combined circuit PNG is
also produced for the complete circuit.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, List, Sequence

from Backend.app.Engine.logic.engine import run
from Backend.app.Engine.logic.outputs.standard_circuits_diagrmas import draw_circuit
from Backend.app.Engine.logic.truth_table.generator import build_truth_table
from Backend.app.Engine.logic.minimization.sop import minimal_sop
from Backend.app.Engine.logic.circuit.generator import build_netlist

OUTPUT_DIR = Path(__file__).resolve().parent


def _expression_from_minterms(
    variables: Sequence[str],
    minterms: Sequence[int],
) -> str:
    """Build a canonical SOP expression accepted by the existing parser."""
    if not minterms:
        return "0"

    terms = []
    for m in minterms:
        bits = format(m, f"0{len(variables)}b")
        term = ""
        for var, bit in zip(variables, bits):
            term += var if bit == "1" else f"{var}'"
        terms.append(term)

    return " + ".join(terms)


def _print_and_generate(
    circuit_name: str,
    output_name: str,
    expression: str,
    variables: Sequence[str],
) -> Dict[str, object]:
    """Run the exact normal Logic Engine analysis for one output."""
    safe = f"{circuit_name}_{output_name}".lower()
    image = OUTPUT_DIR / f"{safe}_circuit.png"
    data = OUTPUT_DIR / f"{safe}_data.json"

    print("\n" + "=" * 80)
    print(f"{circuit_name.upper()} — OUTPUT: {output_name}")
    print("=" * 80)

    # run() already prints:
    # truth table, minterms, maxterms, canonical forms, K-map,
    # minimized SOP/POS and circuit information.
    run(
        expression,
        gates="and_or",
        outfile=str(image),
        variable_order=list(variables),
        fan_in=2,
        json_outfile=str(data),
    )

    # Keep the original analysis JSON and add standard-circuit metadata
    # without changing the engine's existing fields.
    payload = json.loads(data.read_text(encoding="utf-8"))
    payload["standard_circuit"] = circuit_name
    payload["output"] = output_name
    data.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")

    return {
        "expression": expression,
        "variables": list(variables),
        "circuit": str(image),
        "data": str(data),
    }


def _generate_multi_output(
    circuit_name: str,
    variables: Sequence[str],
    output_expressions: Dict[str, str],
) -> Dict[str, object]:
    """Generate normal per-output analyses and one combined circuit PNG."""
    analyses = {}

    for output_name, expression in output_expressions.items():
        analyses[output_name] = _print_and_generate(
            circuit_name,
            output_name,
            expression,
            variables,
        )

    # Build one combined image from the same minimized netlists used by the
    # normal engine. This is only a presentation layer; analysis remains
    # completely identical to the original pipeline.
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from PIL import Image

    images = [Image.open(v["circuit"]).convert("RGB") for v in analyses.values()]
    widths = [im.width for im in images]
    heights = [im.height for im in images]

    padding = 30
    width = max(widths) + 2 * padding
    height = sum(heights) + padding * (len(images) + 1)

    canvas = Image.new("RGB", (width, height), "black")
    y = padding

    for image in images:
        x = (width - image.width) // 2
        canvas.paste(image, (x, y))
        y += image.height + padding

    combined = OUTPUT_DIR / f"{circuit_name}_circuit.png"
    canvas.save(combined)

    # One circuit-level JSON is useful to a caller, while each individual
    # output still has the exact original engine JSON.
    combined_data = OUTPUT_DIR / f"{circuit_name}_data.json"
    combined_payload = {
        "circuit": circuit_name,
        "variables": list(variables),
        "outputs": analyses,
    }
    combined_data.write_text(
        json.dumps(combined_payload, indent=2) + "\n",
        encoding="utf-8",
    )

    return {
        "circuit": str(combined),
        "data": str(combined_data),
        "outputs": analyses,
    }


def half_adder() -> Dict[str, object]:
    """Generate a half adder.

    Inputs: A, B
    Outputs: Sum, Carry
    """
    variables = ["A", "B"]

    # Truth-table-derived canonical expressions.
    # Sum = A'B + AB'
    # Carry = AB
    return _generate_multi_output(
        "half_adder",
        variables,
        {
            "Sum": "A'B + AB'",
            "Carry": "AB",
        },
    )


def half_subtractor() -> Dict[str, object]:
    """Generate a half subtractor.

    Inputs: A, B
    Outputs: Difference, Borrow
    """
    variables = ["A", "B"]

    # Difference = A'B + AB'
    # Borrow = A'B
    return _generate_multi_output(
        "half_subtractor",
        variables,
        {
            "Difference": "A'B + AB'",
            "Borrow": "A'B",
        },
    )


def full_adder() -> Dict[str, object]:
    """Generate a full adder.

    Inputs: A, B, C where C is Carry-in.
    Outputs: Sum, Cout
    """
    variables = ["A", "B", "C"]

    # Canonical SOP forms.
    # Sum = A'B'C + A'BC' + AB'C' + ABC
    # Cout = A'BC + AB'C + ABC' + ABC
    return _generate_multi_output(
        "full_adder",
        variables,
        {
            "Sum": "A'B'C + A'BC' + AB'C' + ABC",
            "Cout": "A'BC + AB'C + ABC' + ABC",
        },
    )


def full_subtractor() -> Dict[str, object]:
    """Generate a full subtractor.

    Inputs: A, B, C where C is Borrow-in.
    Outputs: Difference, Bout
    """
    variables = ["A", "B", "C"]

    # Difference = A'B'C + A'BC' + AB'C' + ABC
    # Bout = A'B'C + A'BC' + A'BC + ABC
    return _generate_multi_output(
        "full_subtractor",
        variables,
        {
            "Difference": "A'B'C + A'BC' + AB'C' + ABC",
            "Bout": "A'B'C + A'BC' + A'BC + ABC",
        },
    )


def multiplier_3bit() -> Dict[str, object]:
    """Generate a 3-bit unsigned multiplier.

    Inputs:
        A B C = first operand (A2 A1 A0)
        D E F = second operand (B2 B1 B0)

    Outputs:
        P5 P4 P3 P2 P1 P0

    Each product bit is analyzed independently using the same engine as
    an ordinary Boolean expression. The 64-row input space is therefore
    represented exactly in each output's truth table.
    """
    variables = ["A", "B", "C", "D", "E", "F"]

    # Derive each product-bit canonical SOP from the 64-row multiplier
    # truth table. This avoids hand-writing large expressions and guarantees
    # that the expressions correspond exactly to the truth table.
    from itertools import product

    minterms_by_output = {f"P{i}": [] for i in range(6)}

    for index, bits in enumerate(product((0, 1), repeat=6)):
        A, B, C, D, E, F = bits
        x = (A << 2) | (B << 1) | C
        y = (D << 2) | (E << 1) | F
        value = x * y

        for bit_position in range(6):
            output_name = f"P{5 - bit_position}"
            if (value >> bit_position) & 1:
                minterms_by_output[output_name].append(index)

    expressions = {
        name: _expression_from_minterms(variables, mins)
        for name, mins in minterms_by_output.items()
    }

    return _generate_multi_output(
        "multiplier_3bit",
        variables,
        expressions,
    )


def generate_all_standard_circuits() -> Dict[str, Dict[str, object]]:
    """Generate all requested standard circuits."""
    return {
        "half_adder": half_adder(),
        "half_subtractor": half_subtractor(),
        "full_adder": full_adder(),
        "full_subtractor": full_subtractor(),
        "multiplier_3bit": multiplier_3bit(),
    }


if __name__ == "__main__":
    generate_all_standard_circuits()
