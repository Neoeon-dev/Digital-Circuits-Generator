"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Node = { id: string; type: string; inputs: string[] };
type Edge = { source: string; target: string };
type Circuit = { nodes: Node[]; edges: Edge[]; output: string };
type Props = {
  circuit: Circuit;
  variables: string[];
  probe: Record<string, number>;
  outputs: string[];
};

type Point = { x: number; y: number };
type Layout = {
  width: number;
  height: number;
  nodes: Map<string, Point>;
  inputPins: Map<string, Point>;
  sourcePins: Map<string, Point>;
  targetPins: Map<number, Point>;
  lanes: Map<number, number>;
};

const COLORS = {
  bg: "#081421",
  grid: "#1d3449",
  wire: "#8299ae",
  wireHigh: "#9ddfff",
  gate: "#86b8eb",
  gateHigh: "#bfeeff",
  text: "#f3f8ff",
  muted: "#6f869c",
  dot: "#99afc2",
  active: "#8edcff",
};

function upper(type: string) {
  return type.toUpperCase();
}

function gateSize(type: string) {
  switch (upper(type)) {
    case "NOT":
      return { width: 92, height: 66 };
    case "XOR":
    case "XNOR":
      return { width: 148, height: 96 };
    default:
      return { width: 132, height: 92 };
  }
}

function evalGate(type: string, values: number[]) {
  switch (upper(type)) {
    case "NOT":
      return values[0] ? 0 : 1;
    case "AND":
      return values.length > 0 && values.every(Boolean) ? 1 : 0;
    case "OR":
      return values.some(Boolean) ? 1 : 0;
    case "NAND":
      return values.length > 0 && values.every(Boolean) ? 0 : 1;
    case "NOR":
      return values.some(Boolean) ? 0 : 1;
    case "XOR":
      return values.reduce((a, b) => a ^ b, 0);
    case "XNOR":
      return Number(!values.reduce((a, b) => a ^ b, 0));
    default:
      return values[0] ?? 0;
  }
}

function inputOffsets(count: number, height: number) {
  if (count <= 1) return [0];
  const spread = Math.min(height - 22, Math.max(46, (count - 1) * 36));
  const step = spread / (count - 1);
  return Array.from({ length: count }, (_, i) => -spread / 2 + i * step);
}

export default function AnimatedCircuit({
  circuit,
  variables,
  probe,
  outputs,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const dragRef = useRef({ active: false, x: 0, y: 0, panX: 0, panY: 0 });

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const nodeById = useMemo(
    () => new Map(circuit.nodes.map((node) => [node.id, node])),
    [circuit.nodes],
  );

  const incoming = useMemo(() => {
    const map = new Map<string, number[]>();
    circuit.edges.forEach((edge, index) => {
      map.set(edge.target, [...(map.get(edge.target) ?? []), index]);
    });
    return map;
  }, [circuit.edges]);

  const values = useMemo(() => {
    const cache = new Map<string, number>();
    const visiting = new Set<string>();

    const resolve = (id: string): number => {
      if (Object.prototype.hasOwnProperty.call(probe, id)) return probe[id] ?? 0;
      if (cache.has(id)) return cache.get(id)!;
      if (visiting.has(id)) return 0;

      const node = nodeById.get(id);
      if (!node) return 0;

      visiting.add(id);
      const inputs = (incoming.get(id) ?? []).map((edgeIndex) =>
        resolve(circuit.edges[edgeIndex].source),
      );
      const value = evalGate(node.type, inputs);
      visiting.delete(id);
      cache.set(id, value);
      return value;
    };

    circuit.nodes.forEach((node) => resolve(node.id));
    return cache;
  }, [circuit.edges, circuit.nodes, incoming, nodeById, probe]);

  const layout = useMemo<Layout>(() => {
    const depth = new Map<string, number>();
    const active = new Set<string>();

    const visit = (id: string): number => {
      if (depth.has(id)) return depth.get(id)!;
      if (active.has(id)) return 1;

      active.add(id);
      const parents = (incoming.get(id) ?? [])
        .map((edgeIndex) => circuit.edges[edgeIndex].source)
        .filter((source) => nodeById.has(source));

      const value = parents.length ? Math.max(...parents.map(visit)) + 1 : 1;
      active.delete(id);
      depth.set(id, value);
      return value;
    };

    circuit.nodes.forEach((node) => visit(node.id));

    const maxDepth = Math.max(1, ...depth.values());
    const columns = Array.from({ length: maxDepth }, (_, i) =>
      circuit.nodes.filter((node) => depth.get(node.id) === i + 1),
    );

    const left = 250;
    const columnGap = 288;
    const right = 220;
    const top = 100;
    const bottom = 88;
    const rowGap = 176;

    const height = Math.max(
      500,
      Math.max(1, ...columns.map((column) => column.length)) * rowGap +
        top +
        bottom,
    );
    const width = Math.max(1120, left + maxDepth * columnGap + right);

    const nodes = new Map<string, Point>();

    columns.forEach((column, index) => {
      const x = left + index * columnGap;
      const sorted = [...column].sort((a, b) => {
        const averageY = (node: Node) => {
          const ys = (incoming.get(node.id) ?? [])
            .map((edgeIndex) => {
              const source = circuit.edges[edgeIndex].source;
              return nodes.get(source)?.y;
            })
            .filter((value): value is number => value !== undefined);

          return ys.length
            ? ys.reduce((sum, value) => sum + value, 0) / ys.length
            : Number.MAX_SAFE_INTEGER;
        };
        return averageY(a) - averageY(b);
      });

      const step = sorted.length <= 1
        ? 0
        : Math.max(158, (height - top - bottom) / (sorted.length - 1));

      sorted.forEach((node, row) => {
        const y = sorted.length === 1 ? height / 2 : top + row * step;
        nodes.set(node.id, { x, y });
      });
    });

    const targetPins = new Map<number, Point>();
    const sourcePins = new Map<string, Point>();

    circuit.nodes.forEach((node) => {
      const point = nodes.get(node.id);
      if (!point) return;

      const size = gateSize(node.type);
      sourcePins.set(node.id, {
        x: point.x + size.width / 2,
        y: point.y,
      });

      const slots = inputOffsets(Math.max(1, node.inputs.length), size.height);

      (incoming.get(node.id) ?? []).forEach((edgeIndex, occurrence) => {
        const edge = circuit.edges[edgeIndex];
        const exact = node.inputs.findIndex((input) => input === edge.source);
        const slot = exact >= 0 ? exact : occurrence;
        targetPins.set(edgeIndex, {
          x: point.x - size.width / 2,
          y: point.y + (slots[slot] ?? 0),
        });
      });
    });

    const inputPins = new Map<string, Point>();
    const minimumGap = Math.max(160, rowGap - 4);

    variables.forEach((variable, index) => {
      const targetYs = circuit.edges
        .map((edge, edgeIndex) => ({ edge, edgeIndex }))
        .filter(({ edge }) => edge.source === variable)
        .map(({ edgeIndex }) => targetPins.get(edgeIndex)?.y)
        .filter((value): value is number => value !== undefined);

      const natural = targetYs.length
        ? targetYs.reduce((sum, value) => sum + value, 0) / targetYs.length
        : top + index * minimumGap;

      inputPins.set(variable, {
        x: 92,
        y: Math.max(50, Math.min(height - 50, natural)),
      });
    });

    // Re-space inputs in their visual order so A/B/C never collapse together.
    const orderedInputs = variables
      .map((variable) => ({
        variable,
        y: inputPins.get(variable)!.y,
      }))
      .sort((a, b) => a.y - b.y);

    let cursor = 52;
    for (const item of orderedInputs) {
      const y = Math.max(item.y, cursor);
      const clamped = Math.min(height - 52, y);
      inputPins.set(item.variable, { x: 92, y: clamped });
      cursor = clamped + minimumGap;
    }

    const lanes = new Map<number, number>();
    const used = new Map<string, number>();

    circuit.edges.forEach((edge, index) => {
      const source =
        sourcePins.get(edge.source) ??
        inputPins.get(edge.source) ??
        ({ x: 125, y: height / 2 } as Point);
      const target =
        targetPins.get(index) ??
        ({ x: source.x + 120, y: source.y } as Point);

      const key = `${Math.round(source.x)}-${Math.round(target.x)}`;
      const count = used.get(key) ?? 0;
      used.set(key, count + 1);

      lanes.set(
        index,
        source.x + (target.x - source.x) * 0.5 + (count - 1) * 36,
      );
    });

    return {
      width,
      height,
      nodes,
      inputPins,
      sourcePins,
      targetPins,
      lanes,
    };
  }, [circuit.edges, circuit.nodes, incoming, nodeById, variables]);

  const outputValue = values.get(circuit.output) ?? 0;

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);

    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, rect.width, rect.height);

    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);

    // Engineering grid.
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.38;
    for (let x = 0; x <= layout.width; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, layout.height);
      ctx.stroke();
    }
    for (let y = 0; y <= layout.height; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(layout.width, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Input labels and short input rails.
    variables.forEach((variable) => {
      const point = layout.inputPins.get(variable);
      if (!point) return;
      const high = Boolean(probe[variable]);

      ctx.fillStyle = COLORS.text;
      ctx.font = "900 20px Arial";
      ctx.textBaseline = "middle";
      ctx.fillText(variable, 48, point.y);

      ctx.strokeStyle = high ? COLORS.wireHigh : COLORS.wire;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(point.x, point.y);
      ctx.lineTo(155, point.y);
      ctx.stroke();

      ctx.fillStyle = high ? COLORS.active : COLORS.dot;
      ctx.beginPath();
      ctx.arc(155, point.y, 5, 0, Math.PI * 2);
      ctx.fill();
    });

    const trace = (edge: Edge, edgeIndex: number) => {
      const source =
        layout.sourcePins.get(edge.source) ??
        layout.inputPins.get(edge.source) ??
        ({ x: 155, y: layout.height / 2 } as Point);
      const target =
        layout.targetPins.get(edgeIndex) ??
        ({ x: layout.width - 200, y: layout.height / 2 } as Point);
      const lane = layout.lanes.get(edgeIndex) ?? (source.x + target.x) / 2;

      const high =
        Object.prototype.hasOwnProperty.call(probe, edge.source)
          ? Boolean(probe[edge.source])
          : Boolean(values.get(edge.source));

      ctx.save();

      ctx.strokeStyle = "#020910";
      ctx.lineWidth = 8;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(source.x, source.y);
      ctx.lineTo(lane, source.y);
      ctx.lineTo(lane, target.y);
      ctx.lineTo(target.x, target.y);
      ctx.stroke();

      ctx.strokeStyle = high ? COLORS.wireHigh : COLORS.wire;
      ctx.lineWidth = high ? 3.4 : 3.1;
      ctx.beginPath();
      ctx.moveTo(source.x, source.y);
      ctx.lineTo(lane, source.y);
      ctx.lineTo(lane, target.y);
      ctx.lineTo(target.x, target.y);
      ctx.stroke();

      ctx.fillStyle = high ? COLORS.active : COLORS.dot;
      ctx.beginPath();
      ctx.arc(lane, source.y, 4.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(target.x, target.y, 3.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();

      ctx.restore();
    };

    circuit.edges.forEach(trace);

    const drawGate = (node: Node) => {
      const point = layout.nodes.get(node.id);
      if (!point) return;

      const type = upper(node.type);
      const size = gateSize(type);
      const hw = size.width / 2;
      const hh = size.height / 2;
      const high = Boolean(values.get(node.id));
      const inverted = type === "NOT" || type === "NAND" || type === "NOR" || type === "XNOR";
      const bubbleR = 6;
      const bubbleGap = inverted ? bubbleR * 2 + 3 : 0;
      const tipX = hw - bubbleGap;

      ctx.save();
      ctx.translate(point.x, point.y);

      ctx.shadowColor = high ? "rgba(142,220,255,.38)" : "rgba(0,0,0,.34)";
      ctx.shadowBlur = high ? 18 : 9;
      ctx.shadowOffsetY = 6;

      ctx.fillStyle = high ? "#10283a" : "#0b1827";
      ctx.strokeStyle = high ? COLORS.gateHigh : COLORS.gate;
      ctx.lineWidth = 2.6;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";

      ctx.beginPath();

      // Gate bodies are built from the exact (hw, hh) box used to place the
      // pins, so the wires always land flush on the silhouette instead of
      // floating short of (or past) the drawn shape.
      if (type === "NOT") {
        ctx.moveTo(-hw, -hh * 0.82);
        ctx.lineTo(tipX, 0);
        ctx.lineTo(-hw, hh * 0.82);
        ctx.closePath();
      } else if (type === "OR" || type === "NOR" || type === "XOR" || type === "XNOR") {
        const isXor = type === "XOR" || type === "XNOR";
        const backX = isXor ? -hw + 12 : -hw;
        const midX = -hw * 0.16;
        ctx.moveTo(backX, -hh);
        ctx.quadraticCurveTo(backX + hw * 0.42, 0, backX, hh);
        ctx.quadraticCurveTo(midX, hh * 0.86, tipX, 0);
        ctx.quadraticCurveTo(midX, -hh * 0.86, backX, -hh);
        ctx.closePath();
      } else {
        const arcR = hh;
        const arcCenterX = tipX - arcR;
        ctx.moveTo(-hw, -hh);
        ctx.lineTo(arcCenterX, -hh);
        ctx.arc(arcCenterX, 0, arcR, -Math.PI / 2, Math.PI / 2);
        ctx.lineTo(-hw, hh);
        ctx.closePath();
      }

      ctx.fill();
      ctx.stroke();

      if (type === "XOR" || type === "XNOR") {
        ctx.beginPath();
        ctx.moveTo(-hw, -hh);
        ctx.quadraticCurveTo(-hw + hw * 0.42, 0, -hw, hh);
        ctx.stroke();
      }

      if (inverted) {
        ctx.fillStyle = "#0b1827";
        ctx.strokeStyle = "#b6cbe0";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(hw - bubbleR, 0, bubbleR, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;

      ctx.fillStyle = COLORS.text;
      ctx.font = "900 13px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(type, 0, 1);

      ctx.fillStyle = COLORS.muted;
      ctx.font = "800 10px monospace";
      ctx.fillText(node.id, 0, hh + 20);

      if (high) {
        ctx.fillStyle = COLORS.active;
        ctx.shadowColor = COLORS.active;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(0, -hh - 14, 4, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    };

    circuit.nodes.forEach(drawGate);

    const outputNode = layout.nodes.get(circuit.output);
    const outputGate = gateSize(nodeById.get(circuit.output)?.type ?? "AND");

    if (outputNode) {
      ctx.strokeStyle = outputValue ? COLORS.wireHigh : COLORS.wire;
      ctx.lineWidth = outputValue ? 3.2 : 3;
      ctx.beginPath();
      ctx.moveTo(outputNode.x + outputGate.width / 2, outputNode.y);
      ctx.lineTo(layout.width - 170, outputNode.y);
      ctx.stroke();

      ctx.fillStyle = outputValue ? COLORS.active : COLORS.dot;
      ctx.beginPath();
      ctx.arc(layout.width - 170, outputNode.y, 6, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = COLORS.text;
      ctx.font = "900 17px monospace";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(`${outputs[0] || "F"} = ${outputValue}`, layout.width - 145, outputNode.y);
    }

    ctx.restore();
  }, [circuit, layout, nodeById, outputs, pan, probe, variables, values, zoom]);

  useEffect(() => {
    const render = () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      draw();
    };

    render();

    const observer = new ResizeObserver(render);
    if (canvasRef.current?.parentElement) observer.observe(canvasRef.current.parentElement);

    return () => {
      observer.disconnect();
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [draw]);

  return (
    <div className="logic-canvas-reference">
      <div className="logic-canvas-reference-head">
        <div>
          <span>GENERATED CIRCUIT</span>
          <small>ENGINEERING VIEW · HIGH-DPI CANVAS RENDERER</small>
        </div>
        <div className="logic-canvas-reference-actions">
          <button type="button" onClick={() => setZoom((z) => Math.max(0.7, +(z - 0.1).toFixed(2)))}>−</button>
          <button type="button" onClick={() => setZoom((z) => Math.min(1.5, +(z + 0.1).toFixed(2)))}>+</button>
          <button type="button" onClick={resetView}>Fit</button>
        </div>
      </div>

      <div
        className={`logic-canvas-reference-stage${dragRef.current.active ? " is-dragging" : ""}`}
        onPointerDown={(event) => {
          if ((event.target as HTMLElement).closest("button")) return;
          dragRef.current = {
            active: true,
            x: event.clientX,
            y: event.clientY,
            panX: pan.x,
            panY: pan.y,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!dragRef.current.active) return;
          setPan({
            x: dragRef.current.panX + event.clientX - dragRef.current.x,
            y: dragRef.current.panY + event.clientY - dragRef.current.y,
          });
        }}
        onPointerUp={() => {
          dragRef.current.active = false;
        }}
        onPointerCancel={() => {
          dragRef.current.active = false;
        }}
      >
        <canvas ref={canvasRef} aria-label="Generated gate schematic" role="img" />
      </div>

      <div className="logic-canvas-reference-foot">
        <span><i /> ROUTED WIRES · SPACED INPUTS · REAL GATE GEOMETRY</span>
        <span>OUTPUT <strong>{outputValue}</strong></span>
      </div>
    </div>
  );
}
