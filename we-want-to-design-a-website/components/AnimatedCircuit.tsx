"use client";

import { useMemo, useRef, useState } from "react";

// -----------------------------------------------------------------------------
// Backend circuit shape used by LogicSolver.
// The backend may omit `output`, so this renderer deliberately treats it as
// optional and infers the output from graph sinks when needed.
// -----------------------------------------------------------------------------

type BackendNode = {
  id: string;
  type: string;
  inputs?: string[];
};

type BackendEdge = {
  source: string;
  target: string;
};

type Circuit = {
  nodes: BackendNode[];
  edges?: BackendEdge[];
  output?: string | null;
  image?: string | null;
  constant_value?: number | null;
};

type Props = {
  circuit: Circuit;
  variables: string[];
  probe: Record<string, number>;
  outputs: string[];
};

type Point = { x: number; y: number };

type NormalizedEdge = {
  id: string;
  source: string;
  target: string;
  slot: number;
};

type Layout = {
  width: number;
  height: number;
  nodes: Map<string, Point>;
  sourcePins: Map<string, Point>;
  targetPins: Map<string, Point>;
  inputPins: Map<string, Point>;
  outputPins: Map<string, Point>;
};

const CANVAS_W = 1400;
const MIN_CANVAS_H = 680;
const GATE_W = 150;
const GATE_H = 96;
const INPUT_W = 132;
const INPUT_H = 72;
const OUTPUT_W = 132;
const OUTPUT_H = 72;

const GATE_TYPES = new Set([
  "AND",
  "OR",
  "NOT",
  "NAND",
  "NOR",
  "XOR",
  "XNOR",
]);

function upper(type: string) {
  return type.trim().toUpperCase();
}

function isInputNode(node: BackendNode) {
  return upper(node.type) === "INPUT";
}

function isOutputNode(node: BackendNode) {
  const type = upper(node.type);
  return type === "OUTPUT" || type === "OUT";
}

function isGateNode(node: BackendNode) {
  return GATE_TYPES.has(upper(node.type));
}

function gateInputCount(type: string, fallback = 2) {
  switch (upper(type)) {
    case "NOT":
      return 1;
    case "AND":
    case "OR":
    case "NAND":
    case "NOR":
    case "XOR":
    case "XNOR":
      return fallback;
    default:
      return fallback;
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

function nodeWidth(node: BackendNode) {
  if (isInputNode(node)) return INPUT_W;
  if (isOutputNode(node)) return OUTPUT_W;
  return GATE_W;
}

function nodeHeight(node: BackendNode) {
  if (isInputNode(node) || isOutputNode(node)) return INPUT_H;
  return GATE_H;
}

function inputOffset(slot: number, count: number) {
  if (count <= 1) return 0;
  const spread = Math.min(52, Math.max(44, (count - 1) * 24));
  const step = spread / (count - 1);
  return -spread / 2 + slot * step;
}

function gateInputPoint(
  point: Point,
  node: BackendNode,
  slot: number,
  count: number,
): Point {
  return {
    x: point.x,
    y: point.y + GATE_H / 2 + inputOffset(slot, count),
  };
}

function gateOutputPoint(point: Point): Point {
  return {
    x: point.x + GATE_W,
    y: point.y + GATE_H / 2,
  };
}

function inputOutputPoint(point: Point, height: number, right = true): Point {
  return {
    x: point.x + (right ? INPUT_W : 0),
    y: point.y + height / 2,
  };
}

function normalizeCircuit(circuit: Circuit, variables: string[]) {
  // The backend can describe primary inputs only in `variables` / node.inputs
  // and omit physical INPUT nodes from circuit.nodes. Create virtual INPUT
  // nodes so the same canvas renderer can connect them normally.
  const backendNodes = circuit.nodes ?? [];
  const existingIds = new Set(backendNodes.map((node) => node.id));
  const virtualInputs: BackendNode[] = variables
    .filter((variable) => variable.trim() && !existingIds.has(variable))
    .map((variable) => ({
      id: variable,
      type: "INPUT",
      inputs: [],
    }));

  const nodes = [...virtualInputs, ...backendNodes];
  const explicitEdges = circuit.edges ?? [];
  const validIds = new Set(nodes.map((node) => node.id));
  const seen = new Set<string>();
  const edges: NormalizedEdge[] = [];

  // Keep explicit edges first.
  explicitEdges.forEach((edge, index) => {
    if (!validIds.has(edge.source) || !validIds.has(edge.target)) return;
    const targetNode = nodes.find((node) => node.id === edge.target);
    const targetInputs = targetNode?.inputs ?? [];
    const matchedSlot = targetInputs.indexOf(edge.source);
    const slot = matchedSlot >= 0 ? matchedSlot : index;
    const key = `${edge.source}::${edge.target}::${slot}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({
      id: `e-explicit-${index}`,
      source: edge.source,
      target: edge.target,
      slot,
    });
  });

  // If an edge is missing, reconstruct it from target.inputs.
  nodes.forEach((node) => {
    (node.inputs ?? []).forEach((sourceId, slot) => {
      if (!validIds.has(sourceId)) return;
      const key = `${sourceId}::${node.id}::${slot}`;
      if (seen.has(key)) return;
      seen.add(key);
      edges.push({
        id: `e-input-${sourceId}-${node.id}-${slot}`,
        source: sourceId,
        target: node.id,
        slot,
      });
    });
  });

  // Infer outputs when the backend omitted circuit.output.
  const explicitOutput =
    circuit.output && validIds.has(circuit.output)
      ? circuit.output
      : null;

  const declaredOutputs = nodes.filter(isOutputNode);
  const targets = new Set(edges.map((edge) => edge.target));
  const inferredSinks = nodes.filter(
    (node) => !isInputNode(node) && !targets.has(node.id),
  );

  const outputIds = explicitOutput
    ? [explicitOutput]
    : declaredOutputs.length
      ? declaredOutputs.map((node) => node.id)
      : inferredSinks.length
        ? inferredSinks.map((node) => node.id)
        : nodes.filter((node) => !isInputNode(node)).slice(-1).map((node) => node.id);

  return {
    nodes,
    edges,
    outputIds,
  };
}

function resolveSignals(
  nodes: BackendNode[],
  edges: NormalizedEdge[],
  variables: string[],
  probe: Record<string, number>,
) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const incoming = new Map<string, NormalizedEdge[]>();

  edges.forEach((edge) => {
    const current = incoming.get(edge.target) ?? [];
    current.push(edge);
    incoming.set(edge.target, current);
  });

  const inputIds = new Map<string, string>();
  nodes.forEach((node) => {
    if (isInputNode(node)) {
      inputIds.set(node.id, node.id);
      const cleanLabel = node.id.trim();
      if (cleanLabel) inputIds.set(cleanLabel, node.id);
    }
  });

  const values = new Map<string, number>();
  const visiting = new Set<string>();

  variables.forEach((variable) => {
    const direct = nodes.find(
      (node) => isInputNode(node) && node.id === variable,
    );
    const labelled = nodes.find(
      (node) => isInputNode(node) && upper(node.type) === "INPUT" && node.id === variable,
    );
    const node = direct ?? labelled;
    if (node) {
      values.set(node.id, Number(Boolean(probe[variable] ?? probe[node.id] ?? 0)));
    }
  });

  function resolve(id: string): number {
    if (values.has(id)) return values.get(id)!;
    if (visiting.has(id)) return 0;

    const node = nodeById.get(id);
    if (!node) return 0;

    if (isInputNode(node)) {
      const value = Number(Boolean(probe[node.id] ?? 0));
      values.set(id, value);
      return value;
    }

    visiting.add(id);
    const inputs = (incoming.get(id) ?? [])
      .slice()
      .sort((a, b) => a.slot - b.slot)
      .map((edge) => resolve(edge.source));

    let value = 0;
    if (isOutputNode(node)) {
      value = inputs[0] ?? 0;
    } else if (isGateNode(node)) {
      value = evalGate(node.type, inputs);
    } else {
      value = inputs[0] ?? 0;
    }

    visiting.delete(id);
    values.set(id, value);
    return value;
  }

  nodes.forEach((node) => resolve(node.id));

  return values;
}

function makeOrthogonalPath(source: Point, target: Point, bendX: number) {
  return `M ${source.x} ${source.y} H ${bendX} V ${target.y} H ${target.x}`;
}

function GateSvg({ type, high }: { type: string; high: boolean }) {
  const label = upper(type);
  const fill = high ? "#10332c" : "#0f1724";
  const stroke = high ? "#34d399" : "#94a3b8";
  const bubbleFill = high ? "#06251f" : "#0b1220";
  const glow = high ? "url(#logicflow-wire-glow)" : undefined;

  const terminal = (y: number, key: string) => (
    <circle
      key={key}
      cx="0"
      cy={y}
      r="3.8"
      fill={high ? "#34d399" : "#22d3ee"}
      stroke="#e2e8f0"
      strokeOpacity="0.35"
      strokeWidth="1.2"
      filter={glow}
    />
  );

  const output = (
    <circle
      cx="150"
      cy="48"
      r="4.2"
      fill={high ? "#34d399" : "#22d3ee"}
      stroke="#e2e8f0"
      strokeOpacity="0.4"
      strokeWidth="1.2"
      filter={glow}
    />
  );

  if (label === "NOT") {
    return (
      <svg viewBox="0 0 150 96" width="150" height="96" aria-hidden="true" overflow="visible">
        <line x1="0" y1="48" x2="16" y2="48" stroke={stroke} strokeWidth="3" strokeLinecap="round" />
        {terminal(48, "in")}
        <path
          d="M 16 16 L 16 80 L 124 48 Z"
          fill={fill}
          stroke={stroke}
          strokeWidth="2.6"
          strokeLinejoin="round"
          filter={glow}
        />
        <circle cx="132" cy="48" r="7" fill={bubbleFill} stroke={stroke} strokeWidth="2.4" />
        <line x1="139" y1="48" x2="150" y2="48" stroke={stroke} strokeWidth="3" strokeLinecap="round" />
        {output}
      </svg>
    );
  }

  const isOr = ["OR", "NOR", "XOR", "XNOR"].includes(label);
  const isXor = label === "XOR" || label === "XNOR";
  const inverted = label === "NAND" || label === "NOR" || label === "XNOR";

  if (isOr) {
    return (
      <svg viewBox="0 0 150 96" width="150" height="96" aria-hidden="true" overflow="visible">
        <line x1="0" y1="26" x2="18" y2="26" stroke={stroke} strokeWidth="3" strokeLinecap="round" />
        <line x1="0" y1="70" x2="18" y2="70" stroke={stroke} strokeWidth="3" strokeLinecap="round" />
        {terminal(26, "in1")}
        {terminal(70, "in2")}
        {isXor && (
          <path
            d="M 10 14 Q 27 48 10 82"
            fill="none"
            stroke={stroke}
            strokeWidth="2.6"
          />
        )}
        <path
          d="M 18 14 Q 62 48 18 82 Q 68 86 132 48 Q 68 10 18 14 Z"
          fill={fill}
          stroke={stroke}
          strokeWidth="2.6"
          strokeLinejoin="round"
          filter={glow}
        />
        {inverted ? (
          <>
            <circle cx="138" cy="48" r="7" fill={bubbleFill} stroke={stroke} strokeWidth="2.4" />
            <line x1="145" y1="48" x2="150" y2="48" stroke={stroke} strokeWidth="3" strokeLinecap="round" />
          </>
        ) : (
          <line x1="132" y1="48" x2="150" y2="48" stroke={stroke} strokeWidth="3" strokeLinecap="round" />
        )}
        {output}
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 150 96" width="150" height="96" aria-hidden="true" overflow="visible">
      <line x1="0" y1="26" x2="16" y2="26" stroke={stroke} strokeWidth="3" strokeLinecap="round" />
      <line x1="0" y1="70" x2="16" y2="70" stroke={stroke} strokeWidth="3" strokeLinecap="round" />
      {terminal(26, "in1")}
      {terminal(70, "in2")}
      <path
        d="M 16 14 H 68 Q 124 14 124 48 Q 124 82 68 82 H 16 Z"
        fill={fill}
        stroke={stroke}
        strokeWidth="2.6"
        strokeLinejoin="round"
        filter={glow}
      />
      {inverted ? (
        <>
          <circle cx="132" cy="48" r="7" fill={bubbleFill} stroke={stroke} strokeWidth="2.4" />
          <line x1="139" y1="48" x2="150" y2="48" stroke={stroke} strokeWidth="3" strokeLinecap="round" />
        </>
      ) : (
        <line x1="124" y1="48" x2="150" y2="48" stroke={stroke} strokeWidth="3" strokeLinecap="round" />
      )}
      {output}
    </svg>
  );
}

export default function AnimatedCircuit({
  circuit,
  variables,
  probe,
  outputs,
}: Props) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panRef = useRef({
    dragging: false,
    x: 0,
    y: 0,
    startX: 0,
    startY: 0,
  });

  const normalized = useMemo(
    () => normalizeCircuit(circuit, variables),
    [circuit, variables],
  );

  const nodeById = useMemo(
    () => new Map(normalized.nodes.map((node) => [node.id, node])),
    [normalized.nodes],
  );

  const signals = useMemo(
    () =>
      resolveSignals(
        normalized.nodes,
        normalized.edges,
        variables,
        probe,
      ),
    [normalized.nodes, normalized.edges, variables, probe],
  );

  const layout = useMemo<Layout>(() => {
    const incoming = new Map<string, NormalizedEdge[]>();
    normalized.edges.forEach((edge) => {
      const current = incoming.get(edge.target) ?? [];
      current.push(edge);
      incoming.set(edge.target, current);
    });

    const depth = new Map<string, number>();
    const visiting = new Set<string>();

    function visit(id: string): number {
      if (depth.has(id)) return depth.get(id)!;
      if (visiting.has(id)) return 1;

      visiting.add(id);
      const parents = (incoming.get(id) ?? []).map((edge) => edge.source);
      const parentDepth = parents.length
        ? Math.max(...parents.map(visit)) + 1
        : 1;
      visiting.delete(id);
      depth.set(id, parentDepth);
      return parentDepth;
    }

    normalized.nodes.forEach((node) => visit(node.id));

    const maxDepth = Math.max(1, ...depth.values());
    const columns = Array.from({ length: maxDepth }, (_, index) =>
      normalized.nodes.filter((node) => depth.get(node.id) === index + 1),
    );

    const left = 215;
    const columnGap = 250;
    const top = 82;
    const bottom = 90;
    const rowGap = 128;
    const outputExtra = normalized.outputIds.length > 1 ? normalized.outputIds.length * 25 : 0;

    const height = Math.max(
      MIN_CANVAS_H,
      Math.max(1, ...columns.map((column) => column.length)) * rowGap + top + bottom + outputExtra,
    );

    const width = Math.max(
      CANVAS_W,
      left + maxDepth * columnGap + 240,
    );

    const nodePoints = new Map<string, Point>();

    columns.forEach((column, columnIndex) => {
      const x = left + columnIndex * columnGap;
      const sorted = [...column].sort((a, b) => a.id.localeCompare(b.id));
      const available = height - top - bottom;
      const step = sorted.length <= 1 ? 0 : Math.max(118, available / (sorted.length - 1));

      sorted.forEach((node, row) => {
        const centerY = sorted.length <= 1 ? height / 2 : top + row * step;
        nodePoints.set(node.id, {
          x,
          y: centerY - nodeHeight(node) / 2,
        });
      });
    });

    // Inputs are always shown on the far left, even when the backend represents
    // them only through variables rather than explicit circuit nodes.
    const inputPins = new Map<string, Point>();
    variables.forEach((variable, index) => {
      const node = normalized.nodes.find((candidate) => candidate.id === variable && isInputNode(candidate));
      const point = node ? nodePoints.get(node.id) : undefined;
      inputPins.set(variable, {
        x: 54 + INPUT_W,
        y: point ? point.y + INPUT_H / 2 : 82 + index * 92,
      });
    });

    // If backend input nodes exist, force their visual positions to the far left.
    normalized.nodes.filter(isInputNode).forEach((node, index) => {
      const variableIndex = variables.indexOf(node.id);
      const y = variableIndex >= 0 ? inputPins.get(variables[variableIndex])?.y ?? 82 + index * 92 : 82 + index * 92;
      nodePoints.set(node.id, {
        x: 54,
        y: y - INPUT_H / 2,
      });
      inputPins.set(node.id, {
        x: 54 + INPUT_W,
        y,
      });
    });

    const sourcePins = new Map<string, Point>();
    const targetPins = new Map<string, Point>();
    const outputPins = new Map<string, Point>();

    normalized.nodes.forEach((node) => {
      const point = nodePoints.get(node.id);
      if (!point) return;

      if (isInputNode(node)) {
        sourcePins.set(node.id, {
          x: point.x + INPUT_W,
          y: point.y + INPUT_H / 2,
        });
        return;
      }

      if (isOutputNode(node)) {
        targetPins.set(`${node.id}:0`, {
          x: point.x,
          y: point.y + OUTPUT_H / 2,
        });
        outputPins.set(node.id, {
          x: point.x,
          y: point.y + OUTPUT_H / 2,
        });
        return;
      }

      sourcePins.set(node.id, gateOutputPoint(point));

      const count = Math.max(
        gateInputCount(node.type),
        (incoming.get(node.id) ?? []).length,
      );

      for (let slot = 0; slot < count; slot += 1) {
        targetPins.set(
          `${node.id}:${slot}`,
          gateInputPoint(point, node, slot, count),
        );
      }
    });

    normalized.outputIds.forEach((outputId, index) => {
      const point = nodePoints.get(outputId);
      if (!point) return;

      // For an inferred sink that is itself a gate, make a visible output pin
      // just to its right. This is what fixes backends that omit `output`.
      if (!isOutputNode(nodeById.get(outputId) ?? { id: outputId, type: "" })) {
        outputPins.set(outputId, {
          x: point.x + nodeWidth(nodeById.get(outputId)!) + 86,
          y: point.y + nodeHeight(nodeById.get(outputId)!) / 2,
        });
      }
    });

    return {
      width,
      height,
      nodes: nodePoints,
      sourcePins,
      targetPins,
      inputPins,
      outputPins,
    };
  }, [normalized, variables, nodeById]);

  const outputLabels = useMemo(() => {
    const labels = outputs.filter(Boolean);
    return normalized.outputIds.map((id, index) => labels[index] ?? (index === 0 ? "F" : `F${index + 1}`));
  }, [outputs, normalized.outputIds]);

  const sourcePointFor = (sourceId: string): Point | undefined => {
    return (
      layout.sourcePins.get(sourceId) ??
      layout.inputPins.get(sourceId)
    );
  };

  const beginPan = (event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button")) return;
    panRef.current = {
      dragging: true,
      x: event.clientX,
      y: event.clientY,
      startX: pan.x,
      startY: pan.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const movePan = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!panRef.current.dragging) return;
    setPan({
      x: panRef.current.startX + event.clientX - panRef.current.x,
      y: panRef.current.startY + event.clientY - panRef.current.y,
    });
  };

  const stopPan = () => {
    panRef.current.dragging = false;
  };

  return (
    <div
      className="overflow-hidden rounded-3xl border border-slate-700 bg-[#0b1020] shadow-2xl"
      style={{ position: "relative" }}
    >
      <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-[#101727] px-4 py-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[.16em] text-cyan-300">
            Generated circuit
          </p>
          <p className="mt-1 text-xs font-semibold text-slate-400">
            BooleanCircuitDesigner canvas · auto-routed implementation
          </p>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setZoom((value) => Math.max(0.55, Number((value - 0.1).toFixed(2))))}
            className="h-8 w-8 rounded-lg border border-white/10 bg-white/5 text-sm font-black text-slate-300 hover:bg-white/10"
          >
            −
          </button>
          <span className="min-w-[54px] text-center text-[11px] font-black text-slate-400">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setZoom((value) => Math.min(1.6, Number((value + 0.1).toFixed(2))))}
            className="h-8 w-8 rounded-lg border border-white/10 bg-white/5 text-sm font-black text-slate-300 hover:bg-white/10"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
            className="ml-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-black text-slate-300 hover:bg-white/10"
          >
            Fit
          </button>
        </div>
      </div>

      <div
        className="relative min-h-[610px] overflow-hidden bg-[#0b1020]"
        onPointerDown={beginPan}
        onPointerMove={movePan}
        onPointerUp={stopPan}
        onPointerCancel={stopPan}
        style={{ cursor: panRef.current.dragging ? "grabbing" : "grab" }}
      >
        <svg
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          className="block h-[610px] w-full select-none"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <pattern
              id="logicflow-grid"
              width="28"
              height="28"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 28 0 L 0 0 0 28"
                fill="none"
                stroke="rgba(148,163,184,.08)"
                strokeWidth="1"
              />
            </pattern>

            <filter id="logicflow-wire-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <rect width={layout.width} height={layout.height} fill="url(#logicflow-grid)" />

          <g transform={`translate(${pan.x / zoom} ${pan.y / zoom}) scale(${zoom})`}>
            <text x="26" y="32" fill="rgba(148,163,184,.5)" fontSize="10" fontWeight="900" letterSpacing="2">
              INPUTS
            </text>
            <text x="250" y="32" fill="rgba(148,163,184,.5)" fontSize="10" fontWeight="900" letterSpacing="2">
              LOGIC
            </text>
            <text x={layout.width - 260} y="32" fill="rgba(148,163,184,.5)" fontSize="10" fontWeight="900" letterSpacing="2">
              OUTPUT
            </text>

            {/* Reconstructed / backend-provided wires */}
            {normalized.edges.map((edge) => {
              const source = sourcePointFor(edge.source);
              const target = layout.targetPins.get(`${edge.target}:${edge.slot}`);
              if (!source || !target) return null;

              const bendX = source.x + Math.max(44, (target.x - source.x) * 0.5);
              const path = makeOrthogonalPath(source, target, bendX);
              const high = Boolean(signals.get(edge.source));

              return (
                <g key={edge.id}>
                  <path
                    d={path}
                    fill="none"
                    stroke={high ? "rgba(52,211,153,.50)" : "rgba(34,211,238,.11)"}
                    strokeWidth={high ? 12 : 9}
                    filter="url(#logicflow-wire-glow)"
                  />
                  <path
                    d={path}
                    fill="none"
                    stroke={high ? "#34d399" : "#22d3ee"}
                    strokeOpacity={high ? 1 : 0.68}
                    strokeWidth={high ? 3.5 : 2.5}
                  />
                  <circle
                    cx={target.x}
                    cy={target.y}
                    r={high ? 5 : 3.5}
                    fill={high ? "#34d399" : "#22d3ee"}
                    filter={high ? "url(#logicflow-wire-glow)" : undefined}
                  />
                </g>
              );
            })}

            {/* Inputs: use variables even if backend omitted physical input nodes. */}
            {variables.map((variable, index) => {
              const node = normalized.nodes.find(
                (candidate) => isInputNode(candidate) && candidate.id === variable,
              );
              const point = node
                ? layout.nodes.get(node.id)
                : { x: 54, y: 82 + index * 92 - INPUT_H / 2 };

              if (!point) return null;
              const high = Boolean(probe[variable]);
              const outputPin = node
                ? layout.sourcePins.get(node.id)
                : layout.inputPins.get(variable);

              return (
                <g key={`input-${variable}`}>
                  <rect
                    x={point.x}
                    y={point.y}
                    width={INPUT_W}
                    height={INPUT_H}
                    rx="18"
                    fill={high ? "#063b35" : "#111827"}
                    stroke={high ? "#34d399" : "rgba(148,163,184,.28)"}
                    strokeWidth={high ? 2.5 : 1.5}
                  />
                  <text x={point.x + 16} y={point.y + 21} fill="rgba(148,163,184,.62)" fontSize="9" fontWeight="900" letterSpacing="1.5">
                    INPUT
                  </text>
                  <text x={point.x + 16} y={point.y + 50} fill="white" fontSize="22" fontWeight="900">
                    {variable}
                  </text>
                  <rect
                    x={point.x + INPUT_W - 54}
                    y={point.y + 16}
                    width="40"
                    height="40"
                    rx="11"
                    fill={high ? "rgba(52,211,153,.22)" : "rgba(148,163,184,.08)"}
                    stroke={high ? "rgba(52,211,153,.7)" : "rgba(148,163,184,.18)"}
                  />
                  <text
                    x={point.x + INPUT_W - 34}
                    y={point.y + 43}
                    textAnchor="middle"
                    fill={high ? "#34d399" : "#64748b"}
                    fontSize="17"
                    fontWeight="900"
                  >
                    {high ? "1" : "0"}
                  </text>
                  {outputPin && (
                    <circle
                      cx={outputPin.x}
                      cy={outputPin.y}
                      r={high ? 6 : 5}
                      fill={high ? "#34d399" : "#22d3ee"}
                      filter={high ? "url(#logicflow-wire-glow)" : undefined}
                    />
                  )}
                </g>
              );
            })}

            {/* Real gate SVGs */}
            {normalized.nodes.filter(isGateNode).map((node) => {
              const point = layout.nodes.get(node.id);
              if (!point) return null;
              const high = Boolean(signals.get(node.id));
              const incoming = (normalized.edges.filter((edge) => edge.target === node.id)).length;
              const count = Math.max(gateInputCount(node.type), incoming);

              return (
                <g key={node.id} transform={`translate(${point.x} ${point.y})`}>
                  <g transform="translate(0 0)">
                    <GateSvg type={node.type} high={high} />
                  </g>

                  <text
                    x="75"
                    y="88"
                    textAnchor="middle"
                    fill={high ? "#6ee7b7" : "rgba(226,232,240,.82)"}
                    fontSize="9"
                    fontWeight="900"
                    letterSpacing="1.2"
                  >
                    {upper(node.type)}
                  </text>

                  {Array.from({ length: count }).map((_, slot) => {
                    const pin = layout.targetPins.get(`${node.id}:${slot}`);
                    if (!pin) return null;
                    return (
                      <circle
                        key={`${node.id}-in-${slot}`}
                        cx={pin.x - point.x}
                        cy={pin.y - point.y}
                        r="5"
                        fill="#1e293b"
                        stroke="#94a3b8"
                        strokeWidth="1.5"
                      />
                    );
                  })}

                  <circle
                    cx={GATE_W}
                    cy={GATE_H / 2}
                    r={high ? 6 : 5}
                    fill={high ? "#34d399" : "#22d3ee"}
                    stroke="#0f172a"
                    strokeWidth="1.5"
                    filter={high ? "url(#logicflow-wire-glow)" : undefined}
                  />
                </g>
              );
            })}

            {/* Explicit OUTPUT nodes from backend */}
            {normalized.nodes.filter(isOutputNode).map((node) => {
              const point = layout.nodes.get(node.id);
              if (!point) return null;
              const high = Boolean(signals.get(node.id));
              const label = node.id === normalized.outputIds[0] ? outputLabels[0] : outputLabels[normalized.outputIds.indexOf(node.id)] ?? "F";
              const inputPin = layout.outputPins.get(node.id) ?? layout.targetPins.get(`${node.id}:0`);

              return (
                <g key={node.id}>
                  <rect
                    x={point.x}
                    y={point.y}
                    width={OUTPUT_W}
                    height={OUTPUT_H}
                    rx="18"
                    fill="#111827"
                    stroke={high ? "#34d399" : "rgba(148,163,184,.28)"}
                    strokeWidth={high ? 2.5 : 1.5}
                  />
                  <text x={point.x + 16} y={point.y + 21} fill="rgba(148,163,184,.62)" fontSize="9" fontWeight="900" letterSpacing="1.5">
                    OUTPUT
                  </text>
                  <text x={point.x + 16} y={point.y + 50} fill="white" fontSize="22" fontWeight="900">
                    {label}
                  </text>
                  <text x={point.x + OUTPUT_W - 24} y={point.y + 43} textAnchor="middle" fill={high ? "#34d399" : "#64748b"} fontSize="16" fontWeight="900">
                    {high ? "1" : "0"}
                  </text>
                  {inputPin && (
                    <circle
                      cx={inputPin.x}
                      cy={inputPin.y}
                      r={high ? 6 : 5}
                      fill={high ? "#34d399" : "#22d3ee"}
                      filter={high ? "url(#logicflow-wire-glow)" : undefined}
                    />
                  )}
                </g>
              );
            })}

            {/* Inferred output cards for sink gates when backend has no output node/key. */}
            {normalized.outputIds.map((outputId, index) => {
              const node = nodeById.get(outputId);
              if (!node || isOutputNode(node)) return null;
              const point = layout.nodes.get(outputId);
              const outputPoint = layout.outputPins.get(outputId);
              if (!point || !outputPoint) return null;
              const high = Boolean(signals.get(outputId));
              const label = outputLabels[index] ?? (index === 0 ? "F" : `F${index + 1}`);
              const source = layout.sourcePins.get(outputId);
              if (!source) return null;

              const bendX = source.x + 42;
              const path = makeOrthogonalPath(source, outputPoint, bendX);

              return (
                <g key={`inferred-output-${outputId}`}>
                  <path
                    d={path}
                    fill="none"
                    stroke={high ? "rgba(52,211,153,.50)" : "rgba(34,211,238,.11)"}
                    strokeWidth={high ? 12 : 9}
                    filter="url(#logicflow-wire-glow)"
                  />
                  <path
                    d={path}
                    fill="none"
                    stroke={high ? "#34d399" : "#22d3ee"}
                    strokeOpacity={high ? 1 : 0.68}
                    strokeWidth={high ? 3.5 : 2.5}
                  />
                  <rect
                    x={outputPoint.x}
                    y={outputPoint.y - OUTPUT_H / 2}
                    width={OUTPUT_W}
                    height={OUTPUT_H}
                    rx="18"
                    fill="#111827"
                    stroke={high ? "#34d399" : "rgba(148,163,184,.28)"}
                    strokeWidth={high ? 2.5 : 1.5}
                  />
                  <text x={outputPoint.x + 16} y={outputPoint.y - 12} fill="rgba(148,163,184,.62)" fontSize="9" fontWeight="900" letterSpacing="1.5">
                    OUTPUT
                  </text>
                  <text x={outputPoint.x + 16} y={outputPoint.y + 17} fill="white" fontSize="22" fontWeight="900">
                    {label}
                  </text>
                  <text x={outputPoint.x + OUTPUT_W - 24} y={outputPoint.y + 11} textAnchor="middle" fill={high ? "#34d399" : "#64748b"} fontSize="16" fontWeight="900">
                    {high ? "1" : "0"}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 bg-[#101727] px-4 py-3 text-[10px] font-bold uppercase tracking-[.14em] text-slate-500">
        <span>
          <span className="mr-2 inline-block h-2 w-2 rounded-full bg-cyan-400 align-middle" />
          Routed wires · real SVG gates · inferred output
        </span>
        <span>
          {variables.length} input{variables.length === 1 ? "" : "s"} · {normalized.outputIds.length} output{normalized.outputIds.length === 1 ? "" : "s"} · {normalized.edges.length} wire{normalized.edges.length === 1 ? "" : "s"}
        </span>
      </div>
    </div>
  );
}