"""Standard circuit diagram rendering using Wikimedia gate SVGs."""

from __future__ import annotations

from functools import lru_cache
from io import BytesIO
from pathlib import Path
import subprocess
from typing import Dict, List, Optional, Tuple

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from PIL import Image

from logic.circuit.graph import Gate, Node

WIRE_COLOR = "#ffffff"
GATE_EDGE = "#ffffff"
GATE_FILL = "#eef3fb"
SVG_GATE_DIR = Path(__file__).resolve().parent / "standard_circuits_images"

SVG_VIEWBOX_WIDTH = 100.0
SVG_VIEWBOX_HEIGHT = 50.0
SVG_INPUT_X = 12.0
SVG_OUTPUT_X = 88.0
SVG_TWO_INPUT_Y = (15.0, 35.0)


@lru_cache(maxsize=None)
def _gate_svg_image(kind: str) -> np.ndarray:
    svg = SVG_GATE_DIR / f"{kind}.svg"
    if not svg.is_file():
        raise FileNotFoundError(
            f"Missing gate SVG: {svg}. Put AND.svg, OR.svg, NAND.svg, NOR.svg "
            "and NOT.svg in the standard_circuits_images directory."
        )
    result = subprocess.run(
        ["magick", "-background", "none", str(svg), "-alpha", "background", "png:-"],
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    return np.asarray(Image.open(BytesIO(result.stdout)).convert("RGBA"))


def _svg_gate_width(height: float) -> float:
    return height * SVG_VIEWBOX_WIDTH / SVG_VIEWBOX_HEIGHT


def draw_svg_gate(ax, kind: str, x: float, y: float, h: float) -> None:
    w = _svg_gate_width(h)
    ax.imshow(
        _gate_svg_image(kind),
        extent=(x - w / 2, x + w / 2, y - h / 2, y + h / 2),
        zorder=4,
    )


def svg_input_y(gate_y: float, gate_h: float, input_index: int, input_count: int) -> float:
    if input_count == 1:
        fraction = 0.5
    elif input_count == 2:
        fraction = SVG_TWO_INPUT_Y[input_index] / SVG_VIEWBOX_HEIGHT
    else:
        fraction = 0.28 + 0.44 * input_index / (input_count - 1)
    return gate_y - gate_h / 2 + gate_h * fraction


def _depth(node: Node, memo=None) -> int:
    if isinstance(node, str):
        return 0
    if memo is None:
        memo = {}
    if node.id in memo:
        return memo[node.id]
    value = 1 + max((_depth(child, memo) for child in node.inputs), default=0)
    memo[node.id] = value
    return value


def _collect_variables(node: Node, result=None) -> List[str]:
    if result is None:
        result = []
    if isinstance(node, str):
        if node not in result:
            result.append(node)
        return result
    for child in node.inputs:
        _collect_variables(child, result)
    return result


def draw_circuit(output_gate: Node, title: str, outfile: str) -> str:
    """Draw a clean left-to-right DAG circuit with separated wires."""
    variables = _collect_variables(output_gate)
    nodes: Dict[int, Gate] = {}

    def collect(node: Node) -> None:
        if isinstance(node, str) or node.id in nodes:
            return
        nodes[node.id] = node
        for child in node.inputs:
            collect(child)

    collect(output_gate)

    depths = {node_id: _depth(node) for node_id, node in nodes.items()}
    max_depth = max(depths.values(), default=0)

    columns: Dict[int, List[Gate]] = {}
    for node in nodes.values():
        columns.setdefault(depths[node.id], []).append(node)

    var_gap = 1.6
    gate_gap = 1.25

    gate_y: Dict[int, float] = {}
    for depth in sorted(columns):
        gates = sorted(columns[depth], key=lambda g: g.id)
        centre = (len(gates) - 1) * gate_gap / 2
        for i, gate in enumerate(gates):
            gate_y[gate.id] = centre - i * gate_gap

    var_y: Dict[str, float] = {}

    def source_y(node: Node) -> float:
        return var_y[node] if isinstance(node, str) else gate_y[node.id]

    for _ in range(3):
        variable_targets: Dict[str, List[float]] = {v: [] for v in variables}
        for gate in nodes.values():
            for child in gate.inputs:
                if isinstance(child, str):
                    variable_targets[child].append(gate_y[gate.id])

        desired_vars = []
        for var in variables:
            ys = variable_targets[var]
            target = sum(ys) / len(ys) if ys else 0.0
            desired_vars.append((target, var))

        desired_vars.sort(key=lambda item: (-item[0], item[1]))
        for i, (_, var) in enumerate(desired_vars):
            var_y[var] = (len(variables) - 1 - i) * var_gap

        for depth in sorted(columns):
            gates = columns[depth]
            desired = []
            for gate in gates:
                child_ys = [source_y(child) for child in gate.inputs]
                target = sum(child_ys) / len(child_ys) if child_ys else 0.0
                desired.append((target, gate))

            desired.sort(key=lambda item: (item[0], item[1].id))
            placed: List[Tuple[float, Gate]] = []
            for target, gate in desired:
                y = max(target, placed[-1][0] + gate_gap) if placed else target
                placed.append((y, gate))

            if placed:
                centre = (placed[0][0] + placed[-1][0]) / 2
                desired_centre = sum(y for y, _ in desired) / len(desired)
                shift = desired_centre - centre
                placed = [(y + shift, gate) for y, gate in placed]

            for y, gate in placed:
                gate_y[gate.id] = y

    variable_targets = {v: [] for v in variables}
    for gate in nodes.values():
        for child in gate.inputs:
            if isinstance(child, str):
                variable_targets[child].append(gate_y[gate.id])

    ordered_vars = sorted(
        variables,
        key=lambda v: (
            -(sum(variable_targets[v]) / len(variable_targets[v])
              if variable_targets[v] else 0.0),
            v,
        ),
    )
    var_y = {
        var: (len(ordered_vars) - 1 - i) * var_gap
        for i, var in enumerate(ordered_vars)
    }

    output_y = gate_y[output_gate.id] if not isinstance(output_gate, str) else var_y[output_gate]

    x_gap = 2.8
    gate_x = {node_id: x_gap * depths[node_id] for node_id in nodes}

    height = max(4.8, 1.4 + 0.85 * max(len(variables), 2))
    fig, ax = plt.subplots(figsize=(14, height), facecolor="black")
    ax.set_facecolor("black")
    WIRE_LW = 1.5

    def gate_geometry(gate: Gate) -> Tuple[float, float, float, float]:
        x = gate_x[gate.id]
        y = gate_y[gate.id]
        h = max(0.72, min(2.0, 0.52 + 0.28 * len(gate.inputs)))
        if gate.kind not in {"AND", "OR", "NAND", "NOR", "NOT"}:
            raise ValueError(f"Unknown gate kind: {gate.kind}")
        w = _svg_gate_width(h)
        left = x - w / 2 + w * SVG_INPUT_X / SVG_VIEWBOX_WIDTH
        right = x - w / 2 + w * SVG_OUTPUT_X / SVG_VIEWBOX_WIDTH
        return left, right, y, h

    def node_output(node: Node) -> Tuple[float, float]:
        if isinstance(node, str):
            return 0.0, var_y[node]
        _, right, y, _ = gate_geometry(node)
        return right, y

    for var, y in var_y.items():
        ax.text(-0.55, y, var, fontsize=14, ha="right", va="center",
                fontweight="bold", color="white")
        ax.plot([-0.45, 0.0], [y, y], color=WIRE_COLOR, lw=WIRE_LW,
                solid_capstyle="round", zorder=1)

    fanout: Dict[str, int] = {}
    for gate in nodes.values():
        for child in gate.inputs:
            key = child if isinstance(child, str) else f"gate:{child.id}"
            fanout[key] = fanout.get(key, 0) + 1

    def draw_connection(child, parent, input_index, gate_h, gate_left):
        child_x, child_y = node_output(child)
        n = len(parent.inputs)
        target_y = svg_input_y(gate_y[parent.id], gate_h, input_index, n)
        route_x = gate_left - 0.32 - 0.12 * input_index

        ax.plot([child_x, route_x], [child_y, child_y], color=WIRE_COLOR,
                lw=WIRE_LW, solid_capstyle="round", zorder=1)
        if abs(child_y - target_y) > 1e-9:
            ax.plot([route_x, route_x], [child_y, target_y], color=WIRE_COLOR,
                    lw=WIRE_LW, solid_capstyle="round", zorder=1)
        ax.plot([route_x, gate_left], [target_y, target_y], color=WIRE_COLOR,
                lw=WIRE_LW, solid_capstyle="round", zorder=1)

        source_key = child if isinstance(child, str) else f"gate:{child.id}"
        if fanout.get(source_key, 0) > 1 and input_index == 0:
            ax.plot([child_x], [child_y], marker="o", markersize=3.8,
                    markerfacecolor=WIRE_COLOR, markeredgecolor=WIRE_COLOR, zorder=3)

    for depth in sorted(columns):
        for gate in sorted(columns[depth], key=lambda g: (gate_y[g.id], g.id)):
            x, y = gate_x[gate.id], gate_y[gate.id]
            _, _, _, h = gate_geometry(gate)
            draw_svg_gate(ax, gate.kind, x, y, h)
            expected_left, _, _, _ = gate_geometry(gate)
            for input_index, child in enumerate(gate.inputs):
                draw_connection(child, gate, input_index, h, expected_left)

    out_x, out_y = node_output(output_gate)
    ax.plot([out_x, out_x + 0.75], [out_y, out_y], color=WIRE_COLOR,
            lw=1.7, solid_capstyle="round", zorder=1)
    ax.text(out_x + 0.92, out_y, "F", fontsize=15, fontweight="bold",
            ha="left", va="center", color="white")

    all_y = list(var_y.values()) + list(gate_y.values()) or [0.0]
    ax.set_xlim(-1.0, x_gap * (max_depth + 1) + 1.5)
    ax.set_ylim(min(all_y) - 1.15, max(all_y) + 1.15)
    ax.set_aspect("equal")
    ax.axis("off")
    ax.set_title(title, fontsize=13, fontweight="bold", pad=16, color="white")
    fig.tight_layout()
    Path(outfile).parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(outfile, dpi=200, bbox_inches="tight")
    plt.close(fig)
    return outfile


def draw_constant_circuit(value: int, title: str, outfile: str) -> str:
    fig, ax = plt.subplots(figsize=(5, 2.4), facecolor="black")
    ax.set_facecolor("black")
    ax.axis("off")
    ax.text(0.18, 0.5, str(value), fontsize=20, fontweight="bold",
            ha="center", va="center",
            bbox=dict(boxstyle="round,pad=0.4", facecolor=GATE_FILL, edgecolor=GATE_EDGE))
    ax.plot([0.35, 0.75], [0.5, 0.5], color=WIRE_COLOR, lw=1.5)
    ax.text(0.9, 0.5, "F", fontsize=16, fontweight="bold",
            ha="center", va="center", color="white")
    ax.set_xlim(0, 1.1)
    ax.set_ylim(0, 1)
    ax.set_title(title, fontsize=11, fontweight="bold", color="white")
    fig.tight_layout()
    Path(outfile).parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(outfile, dpi=180, bbox_inches="tight")
    plt.close(fig)
    return outfile
