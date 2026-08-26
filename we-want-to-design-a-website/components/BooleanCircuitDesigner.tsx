"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { LogicResponse } from "./LogicSolver";
import ImplementationPanel from "./ImplementationPanel";
import ExportPanel from "./ExportPanel";

type GateType =
  | "AND"
  | "OR"
  | "NOT"
  | "NAND"
  | "NOR"
  | "XOR"
  | "XNOR";

type NodeType = "INPUT" | "GATE" | "OUTPUT";

type CircuitNode = {
  id: string;
  type: NodeType;
  gate?: GateType;
  label: string;
  x: number;
  y: number;
};

type Connection = {
  id: string;
  from: string;
  to: string;
  toSlot: number;
};

type Point = { x: number; y: number };
type TruthRow = Record<string, number>;
type BackendTab = "overview" | "truth" | "circuit" | "exports";

type BooleanCircuitDesignerProps = {
  className?: string;
};

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL ||
  "https://digital-circuits-generator-3.onrender.com"
).replace(/\/+$/, "");

const GATE_INPUT_COUNT: Record<GateType, number> = {
  AND: 2,
  OR: 2,
  NOT: 1,
  NAND: 2,
  NOR: 2,
  XOR: 2,
  XNOR: 2,
};

const GATE_META: Record<GateType, { icon: string; description: string }> = {
  AND: { icon: "&", description: "All inputs must be HIGH" },
  OR: { icon: "≥1", description: "Any input may be HIGH" },
  NOT: { icon: "1", description: "Invert one signal" },
  NAND: { icon: "⊼", description: "NOT of AND" },
  NOR: { icon: "≥1", description: "NOT of OR" },
  XOR: { icon: "⊕", description: "Odd parity" },
  XNOR: { icon: "⊙", description: "Even parity" },
};

const INITIAL_NODES: CircuitNode[] = [
  { id: "A", type: "INPUT", label: "A", x: 70, y: 150 },
  { id: "B", type: "INPUT", label: "B", x: 70, y: 330 },
  { id: "G1", type: "GATE", gate: "AND", label: "AND", x: 390, y: 220 },
  { id: "OUT1", type: "OUTPUT", label: "F", x: 820, y: 235 },
];

const INITIAL_CONNECTIONS: Connection[] = [
  { id: "c1", from: "A", to: "G1", toSlot: 0 },
  { id: "c2", from: "B", to: "G1", toSlot: 1 },
  { id: "c3", from: "G1", to: "OUT1", toSlot: 0 },
];

function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function evaluateGate(gate: GateType, values: boolean[]) {
  switch (gate) {
    case "AND":
      return values.length > 0 && values.every(Boolean);
    case "OR":
      return values.some(Boolean);
    case "NOT":
      return !values[0];
    case "NAND":
      return !(values.length > 0 && values.every(Boolean));
    case "NOR":
      return !values.some(Boolean);
    case "XOR":
      return values.filter(Boolean).length % 2 === 1;
    case "XNOR":
      return values.filter(Boolean).length % 2 === 0;
  }
}

function getIncoming(nodeId: string, connections: Connection[]) {
  return [...connections]
    .filter((connection) => connection.to === nodeId)
    .sort((a, b) => a.toSlot - b.toSlot);
}

function targetPortCount(node: CircuitNode) {
  if (node.type === "OUTPUT") return 1;
  if (node.type === "GATE" && node.gate) return GATE_INPUT_COUNT[node.gate];
  return 0;
}

function nodeWidth(node: CircuitNode) {
  if (node.type === "INPUT") return 132;
  if (node.type === "OUTPUT") return 138;
  return 170;
}

function nodeHeight(node: CircuitNode) {
  return node.type === "GATE" ? 92 : 72;
}

function portY(node: CircuitNode, slot: number) {
  if (node.type !== "GATE") return node.y + nodeHeight(node) / 2;
  const count = targetPortCount(node);
  if (count <= 1) return node.y + nodeHeight(node) / 2;
  const spread = Math.min(54, (count - 1) * 30);
  const step = spread / (count - 1);
  return node.y + nodeHeight(node) / 2 - spread / 2 + slot * step;
}

function outputExpressionFromTruthTable(
  variables: string[],
  rows: TruthRow[],
  outputKey: string,
) {
  const terms: string[] = [];

  for (const row of rows) {
    if (Number(row[outputKey] ?? 0) !== 1) continue;

    const term = variables
      .map((variable) => (Number(row[variable] ?? 0) ? variable : `${variable}'`))
      .join("");

    terms.push(term || "1");
  }

  if (terms.length === 0) return "0";
  if (terms.length === 2 ** variables.length) return "1";
  return terms.join(" + ");
}

function evaluateOutput(
  outputId: string,
  nodes: CircuitNode[],
  connections: Connection[],
  inputValues: Record<string, boolean>,
) {
  const memo = new Map<string, boolean>();
  const visiting = new Set<string>();

  function visit(nodeId: string): boolean {
    if (memo.has(nodeId)) return memo.get(nodeId)!;
    if (visiting.has(nodeId)) throw new Error("Circuit contains a feedback cycle.");

    const node = nodes.find((item) => item.id === nodeId);
    if (!node) throw new Error(`Unknown node ${nodeId}.`);

    if (node.type === "INPUT") {
      const value = Boolean(inputValues[node.label]);
      memo.set(nodeId, value);
      return value;
    }

    visiting.add(nodeId);
    const incoming = getIncoming(nodeId, connections);

    if (node.type === "OUTPUT") {
      if (incoming.length !== 1) {
        throw new Error(`Output ${node.label} must have exactly one connection.`);
      }
      const value = visit(incoming[0].from);
      visiting.delete(nodeId);
      memo.set(nodeId, value);
      return value;
    }

    if (!node.gate) throw new Error(`Gate ${node.id} has no gate type.`);

    const expected = GATE_INPUT_COUNT[node.gate];
    if (incoming.length !== expected) {
      throw new Error(
        `${node.gate} ${node.id} needs ${expected} input${expected === 1 ? "" : "s"}.`,
      );
    }

    const values = incoming.map((connection) => visit(connection.from));
    const value = evaluateGate(node.gate, values);
    visiting.delete(nodeId);
    memo.set(nodeId, value);
    return value;
  }

  return visit(outputId);
}

function getCircuitError(nodes: CircuitNode[], connections: Connection[]) {
  const outputs = nodes.filter((node) => node.type === "OUTPUT");
  if (outputs.length === 0) return "Add at least one OUTPUT node.";

  for (const output of outputs) {
    const incoming = getIncoming(output.id, connections);
    if (incoming.length !== 1) {
      return `Output ${output.label} must have exactly one connection.`;
    }

    try {
      // Run with every input low to catch topology/cycle/gate errors.
      const inputValues = Object.fromEntries(
        nodes
          .filter((node) => node.type === "INPUT")
          .map((node) => [node.label, false]),
      );
      evaluateOutput(output.id, nodes, connections, inputValues);
    } catch (error) {
      return error instanceof Error ? error.message : "Invalid circuit.";
    }
  }

  return null;
}

function generateTruthTableForOutputs(
  variables: string[],
  outputNodes: CircuitNode[],
  nodes: CircuitNode[],
  connections: Connection[],
) {
  const rows: TruthRow[] = [];
  const total = 2 ** variables.length;

  for (let index = 0; index < total; index += 1) {
    const inputValues: Record<string, boolean> = {};
    const row: TruthRow = {};

    variables.forEach((variable, variableIndex) => {
      const bit = (index >> (variables.length - variableIndex - 1)) & 1;
      inputValues[variable] = bit === 1;
      row[variable] = bit;
    });

    for (const output of outputNodes) {
      row[output.label] = evaluateOutput(
        output.id,
        nodes,
        connections,
        inputValues,
      )
        ? 1
        : 0;
    }

    rows.push(row);
  }

  return rows;
}

function outputSignalMap(
  nodes: CircuitNode[],
  connections: Connection[],
  inputValues: Record<string, boolean>,
) {
  const signals = new Map<string, boolean>();

  for (const node of nodes) {
    try {
      if (node.type === "INPUT") {
        signals.set(node.id, Boolean(inputValues[node.label]));
      } else if (node.type === "OUTPUT") {
        signals.set(
          node.id,
          evaluateOutput(node.id, nodes, connections, inputValues),
        );
      } else {
        const incoming = getIncoming(node.id, connections);
        if (!node.gate || incoming.length !== GATE_INPUT_COUNT[node.gate]) continue;
        const values = incoming.map((connection) => {
          try {
            return evaluateOutput(connection.from, nodes, connections, inputValues);
          } catch {
            return false;
          }
        });
        signals.set(node.id, evaluateGate(node.gate, values));
      }
    } catch {
      // Keep unresolvable nodes LOW while the user is wiring.
    }
  }

  return signals;
}

function gateIcon(gate: GateType) {
  return GATE_META[gate].icon;
}

function safeNextOutputLabel(existing: string[]) {
  const candidates = [
    "F", "G", "H", "Y", "Z", "Q", "R", "S", "T",
  ];
  return candidates.find((candidate) => !existing.includes(candidate)) ?? `F${existing.length + 1}`;
}

export default function BooleanCircuitDesigner({
  className,
}: BooleanCircuitDesignerProps) {
  const [nodes, setNodes] = useState<CircuitNode[]>(INITIAL_NODES);
  const [connections, setConnections] = useState<Connection[]>(INITIAL_CONNECTIONS);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [pendingSource, setPendingSource] = useState<string | null>(null);
  const [inputValues, setInputValues] = useState<Record<string, boolean>>({
    A: false,
    B: false,
  });
  const [gateMode, setGateMode] = useState<"AND, OR & NOT" | "NAND only" | "NOR only">(
    "AND, OR & NOT",
  );
  const [backendResults, setBackendResults] = useState<Record<string, LogicResponse>>({});
  const [activeOutputId, setActiveOutputId] = useState("OUT1");
  const [backendTab, setBackendTab] = useState<BackendTab>("overview");
  const [backendLoading, setBackendLoading] = useState(false);
  const [backendError, setBackendError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [dragging, setDragging] = useState<{
    id: string;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  const variables = useMemo(
    () => nodes.filter((node) => node.type === "INPUT").map((node) => node.label),
    [nodes],
  );

  const outputNodes = useMemo(
    () => nodes.filter((node) => node.type === "OUTPUT"),
    [nodes],
  );

  const circuitError = useMemo(
    () => getCircuitError(nodes, connections),
    [nodes, connections],
  );

  const truthTable = useMemo(() => {
    if (circuitError || variables.length === 0 || variables.length > 6) return [];
    try {
      return generateTruthTableForOutputs(
        variables,
        outputNodes,
        nodes,
        connections,
      );
    } catch {
      return [];
    }
  }, [circuitError, variables, outputNodes, nodes, connections]);

  const activeOutput =
    outputNodes.find((node) => node.id === activeOutputId) ?? outputNodes[0] ?? null;

  useEffect(() => {
    if (!activeOutput && outputNodes[0]) {
      setActiveOutputId(outputNodes[0].id);
    }
  }, [activeOutput, outputNodes]);

  const structuralSignature = useMemo(
    () =>
      JSON.stringify({
        nodes: nodes.map(({ id, type, gate, label }) => ({
          id,
          type,
          gate,
          label,
        })),
        connections,
      }),
    [nodes, connections],
  );

  const activeLocalOutput = useMemo(() => {
    if (!activeOutput || circuitError) return null;
    try {
      return evaluateOutput(activeOutput.id, nodes, connections, inputValues);
    } catch {
      return null;
    }
  }, [activeOutput, circuitError, nodes, connections, inputValues]);

  const nodeSignals = useMemo(
    () => outputSignalMap(nodes, connections, inputValues),
    [nodes, connections, inputValues],
  );

  const analyzeBackend = useCallback(async () => {
    if (circuitError) {
      setBackendError(circuitError);
      return;
    }

    if (!variables.length || !truthTable.length || !outputNodes.length) {
      setBackendError("Create inputs and at least one completed output path first.");
      return;
    }

    setBackendLoading(true);
    setBackendError(null);

    try {
      const results = await Promise.all(
        outputNodes.map(async (outputNode) => {
          const expression = outputExpressionFromTruthTable(
            variables,
            truthTable,
            outputNode.label,
          );

          const response = await fetch(`${API_BASE_URL}/api/logic/expression`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({
              expression,
              variable_order: variables,
              gate_mode: gateMode,
              fan_in: 2,
            }),
          });

          if (!response.ok) {
            let message = `Backend request failed (${response.status}).`;
            try {
              const body = await response.json();
              if (typeof body?.detail === "string") message = body.detail;
            } catch {}
            throw new Error(`${outputNode.label}: ${message}`);
          }

          const data = (await response.json()) as LogicResponse;
          return [outputNode.id, data] as const;
        }),
      );

      setBackendResults(Object.fromEntries(results));
      setActiveOutputId(outputNodes[0].id);
      setBackendTab("overview");
    } catch (error) {
      setBackendResults({});
      setBackendError(
        error instanceof Error
          ? error.message
          : "Could not reach the LogicFlow backend.",
      );
    } finally {
      setBackendLoading(false);
    }
  }, [circuitError, variables, truthTable, outputNodes, gateMode]);

  useEffect(() => {
    if (
      circuitError ||
      !truthTable.length ||
      !outputNodes.length ||
      variables.length > 6
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      void analyzeBackend();
    }, 700);

    return () => window.clearTimeout(timer);
  }, [structuralSignature, gateMode, circuitError, truthTable.length, outputNodes.length, analyzeBackend]);

  const addInput = useCallback(() => {
    const used = new Set(nodes.filter((node) => node.type === "INPUT").map((node) => node.label));
    const label = ["A", "B", "C", "D", "E", "F"].find((candidate) => !used.has(candidate));
    if (!label) return;

    const count = nodes.filter((node) => node.type === "INPUT").length;
    const node: CircuitNode = {
      id: `IN_${label}_${Date.now().toString(36)}`,
      type: "INPUT",
      label,
      x: 55,
      y: 90 + count * 105,
    };

    setNodes((current) => [...current, node]);
    setInputValues((current) => ({ ...current, [label]: false }));
    setSelectedNode(node.id);
  }, [nodes]);

  const addGate = useCallback((gate: GateType) => {
    setNodes((current) => {
      const count = current.filter((node) => node.type === "GATE").length;
      const node: CircuitNode = {
        id: `G${count + 1}_${Date.now().toString(36)}`,
        type: "GATE",
        gate,
        label: gate,
        x: 310 + (count % 3) * 230,
        y: 95 + (count % 3) * 150,
      };
      setSelectedNode(node.id);
      return [...current, node];
    });
  }, []);

  const addOutput = useCallback(() => {
    setNodes((current) => {
      const existingLabels = current
        .filter((node) => node.type === "OUTPUT")
        .map((node) => node.label);
      const label = safeNextOutputLabel(existingLabels);
      const count = current.filter((node) => node.type === "OUTPUT").length;
      const node: CircuitNode = {
        id: `OUT_${label}_${Date.now().toString(36)}`,
        type: "OUTPUT",
        label,
        x: 850,
        y: 120 + count * 150,
      };
      setSelectedNode(node.id);
      setActiveOutputId(node.id);
      return [...current, node];
    });
  }, []);

  const deleteNode = useCallback(() => {
    if (!selectedNode) return;

    setNodes((current) => current.filter((node) => node.id !== selectedNode));
    setConnections((current) =>
      current.filter(
        (connection) =>
          connection.from !== selectedNode && connection.to !== selectedNode,
      ),
    );
    setBackendResults((current) => {
      const next = { ...current };
      delete next[selectedNode];
      return next;
    });
    setSelectedNode(null);
    setPendingSource(null);
  }, [selectedNode]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT"
      ) {
        return;
      }

      if ((event.key === "Delete" || event.key === "Backspace") && selectedNode) {
        event.preventDefault();
        deleteNode();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedNode, deleteNode]);

  const connect = useCallback(
    (targetId: string, targetSlot: number) => {
      if (!pendingSource || pendingSource === targetId) return;

      const target = nodes.find((node) => node.id === targetId);
      const source = nodes.find((node) => node.id === pendingSource);
      if (!target || !source || target.type === "INPUT") return;

      const alreadyConnected = connections.find(
        (connection) =>
          connection.to === targetId && connection.toSlot === targetSlot,
      );

      setConnections((current) => [
        ...current.filter(
          (connection) =>
            !(connection.to === targetId && connection.toSlot === targetSlot),
        ),
        {
          id: `C_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          from: pendingSource,
          to: targetId,
          toSlot: targetSlot,
        },
      ]);

      if (alreadyConnected) {
        setBackendResults({});
      }

      setPendingSource(null);
    },
    [pendingSource, nodes, connections],
  );

  const removeConnection = useCallback((connectionId: string) => {
    setConnections((current) => current.filter((connection) => connection.id !== connectionId));
    setBackendResults({});
  }, []);

  const startDrag = (
    event: ReactPointerEvent,
    node: CircuitNode,
  ) => {
    if ((event.target as HTMLElement).dataset.port === "true") return;
    if ((event.target as HTMLElement).dataset.delete === "true") return;
    if ((event.target as HTMLElement).dataset.toggle === "true") return;

    const svg = document.getElementById("logicflow-canvas");
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 1200;
    const y = ((event.clientY - rect.top) / rect.height) * 650;

    setSelectedNode(node.id);
    setDragging({
      id: node.id,
      offsetX: x - node.x,
      offsetY: y - node.y,
    });
  };

  useEffect(() => {
    if (!dragging) return;

    const move = (event: PointerEvent) => {
      const svg = document.getElementById("logicflow-canvas");
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 1200;
      const y = ((event.clientY - rect.top) / rect.height) * 650;

      setNodes((current) =>
        current.map((node) =>
          node.id === dragging.id
            ? {
                ...node,
                x: Math.max(20, Math.min(1200 - nodeWidth(node) - 20, x - dragging.offsetX)),
                y: Math.max(45, Math.min(650 - nodeHeight(node) - 20, y - dragging.offsetY)),
              }
            : node,
        ),
      );
    };

    const up = () => setDragging(null);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [dragging]);

  const toggleInput = useCallback((nodeId: string) => {
    const node = nodes.find((item) => item.id === nodeId);
    if (!node || node.type !== "INPUT") return;

    setInputValues((current) => ({
      ...current,
      [node.label]: !current[node.label],
    }));
  }, [nodes]);

  const clearCanvas = useCallback(() => {
    const nodesReset: CircuitNode[] = [
      { id: "A", type: "INPUT", label: "A", x: 70, y: 150 },
      { id: "B", type: "INPUT", label: "B", x: 70, y: 330 },
      { id: "G1", type: "GATE", gate: "AND", label: "AND", x: 390, y: 220 },
      { id: "OUT1", type: "OUTPUT", label: "F", x: 820, y: 235 },
    ];

    setNodes(nodesReset);
    setConnections([
      { id: "c1", from: "A", to: "G1", toSlot: 0 },
      { id: "c2", from: "B", to: "G1", toSlot: 1 },
      { id: "c3", from: "G1", to: "OUT1", toSlot: 0 },
    ]);
    setInputValues({ A: false, B: false });
    setSelectedNode(null);
    setPendingSource(null);
    setBackendResults({});
    setActiveOutputId("OUT1");
    setBackendError(null);
    setBackendTab("overview");
  }, []);

  const copyExpression = async () => {
    const result = backendResults[activeOutput?.id ?? ""];
    const expression = result?.logic.simplified_sop;
    if (!expression) return;

    try {
      await navigator.clipboard.writeText(expression);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setBackendError("Clipboard access is unavailable in this browser.");
    }
  };

  const selectedBackendResult = activeOutput
    ? backendResults[activeOutput.id]
    : undefined;

  return (
    <section
      className={cn(
        "mx-auto max-w-[1540px] px-4 pb-20 lg:px-8",
        className,
      )}
    >
      <div className="mb-7 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-[.16em] text-cyan">
            05 / CIRCUIT DESIGNER
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-ink sm:text-4xl">
            Build the circuit. Let LogicFlow prove it.
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-500 sm:text-base">
            Place gates, toggle inputs, wire signal paths, and create multiple
            outputs. LogicFlow evaluates the canvas locally, generates a
            parenthesis-free Boolean SOP for each output, then sends those
            expressions to the backend for simplification and implementation analysis.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={addInput}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700 shadow-sm transition hover:border-cyan hover:text-cyan"
          >
            + Input
          </button>
          <button
            type="button"
            onClick={addOutput}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700 shadow-sm transition hover:border-pink hover:text-pink"
          >
            + Output
          </button>
          <button
            type="button"
            onClick={clearCanvas}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700 shadow-sm transition hover:border-red-300 hover:text-red-500"
          >
            Reset canvas
          </button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[270px_minmax(0,1fr)_440px]">
        <aside className="rounded-3xl border border-slate-200 bg-white p-4 shadow-panel sm:p-5">
          <div className="mb-4">
            <p className="text-xs font-black uppercase tracking-[.16em] text-slate-400">
              Component library
            </p>
            <p className="mt-1 text-sm font-bold text-ink">
              Logic building blocks
            </p>
          </div>

          <div className="space-y-2">
            {(Object.keys(GATE_META) as GateType[]).map((gate) => (
              <button
                key={gate}
                type="button"
                onClick={() => addGate(gate)}
                className="group flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-left transition hover:-translate-y-0.5 hover:border-cyan hover:bg-white hover:shadow-md"
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-900 font-mono text-xs font-black text-white shadow-lg">
                  {gateIcon(gate)}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-black text-ink">{gate}</span>
                  <span className="mt-0.5 block text-[11px] text-slate-500">
                    {GATE_META[gate].description}
                  </span>
                </span>
                <span className="ml-auto text-slate-300 transition group-hover:text-cyan">+</span>
              </button>
            ))}
          </div>

          <div className="mt-5 rounded-2xl border border-cyan/15 bg-cyan/[.04] p-4">
            <p className="text-[10px] font-black uppercase tracking-[.16em] text-cyan">
              Wiring workflow
            </p>
            <div className="mt-3 space-y-2 text-xs leading-5 text-slate-600">
              <p><b>1.</b> Click a source port.</p>
              <p><b>2.</b> Click a destination input port.</p>
              <p><b>3.</b> Drag nodes to organize the circuit.</p>
              <p><b>4.</b> Click an input card to toggle 0 / 1.</p>
              <p><b>5.</b> Delete selected nodes or press Delete.</p>
              <p><b>6.</b> Add multiple outputs for multi-output circuits.</p>
            </div>
          </div>

          {selectedNode && (
            <button
              type="button"
              onClick={deleteNode}
              className="mt-3 w-full rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs font-black text-red-600 transition hover:bg-red-100"
            >
              Delete selected component
            </button>
          )}
        </aside>

        <div className="min-w-0 rounded-3xl border border-slate-200 bg-slate-950 p-3 shadow-panel sm:p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 px-1">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[.16em] text-cyan">
                Live schematic
              </p>
              <p className="mt-1 text-sm font-bold text-white">
                {pendingSource ? "Choose a destination port" : "Connect the circuit"}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={gateMode}
                onChange={(event) => setGateMode(event.target.value as typeof gateMode)}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-slate-200 outline-none"
              >
                <option value="AND, OR & NOT">AND / OR / NOT</option>
                <option value="NAND only">NAND only</option>
                <option value="NOR only">NOR only</option>
              </select>

              <button
                type="button"
                onClick={() => void analyzeBackend()}
                disabled={backendLoading || Boolean(circuitError)}
                className="rounded-xl bg-gradient-to-r from-cyan-400 via-violet-500 to-pink-500 px-4 py-2 text-xs font-black text-white shadow-lg shadow-cyan/10 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {backendLoading ? "Analyzing…" : "Analyze circuit"}
              </button>
            </div>
          </div>

          <div className="overflow-auto rounded-2xl border border-white/10 bg-[#0b1020]">
            <svg
              id="logicflow-canvas"
              viewBox="0 0 1200 650"
              className="block min-h-[560px] w-full min-w-[1000px] select-none"
              onPointerDown={() => {
                setSelectedNode(null);
                setPendingSource(null);
              }}
            >
              <defs>
                <pattern id="logicflow-grid" width="32" height="32" patternUnits="userSpaceOnUse">
                  <path
                    d="M 32 0 L 0 0 0 32"
                    fill="none"
                    stroke="rgba(148,163,184,.08)"
                    strokeWidth="1"
                  />
                </pattern>
                <filter id="logicflow-glow" x="-30%" y="-30%" width="160%" height="160%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="logicflow-glow-strong" x="-40%" y="-40%" width="180%" height="180%">
                  <feGaussianBlur stdDeviation="7" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              <rect width="1200" height="650" fill="url(#logicflow-grid)" />

              <text x="28" y="34" fill="rgba(148,163,184,.42)" fontSize="11" fontWeight="800" letterSpacing="2">
                INPUTS
              </text>
              <text x="350" y="34" fill="rgba(148,163,184,.42)" fontSize="11" fontWeight="800" letterSpacing="2">
                LOGIC
              </text>
              <text x="825" y="34" fill="rgba(148,163,184,.42)" fontSize="11" fontWeight="800" letterSpacing="2">
                OUTPUTS
              </text>

              {connections.map((connection) => {
                const from = nodes.find((node) => node.id === connection.from);
                const to = nodes.find((node) => node.id === connection.to);
                if (!from || !to) return null;

                const x1 = from.x + nodeWidth(from);
                const y1 = portY(from, 0);
                const x2 = to.x;
                const y2 = portY(to, connection.toSlot);
                const midX = x1 + Math.max(55, (x2 - x1) * 0.52);
                const path = `M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`;
                const high = Boolean(nodeSignals.get(from.id));
                const selected = pendingSource === from.id;

                return (
                  <g key={connection.id}>
                    <path
                      d={path}
                      fill="none"
                      stroke={high ? "rgba(52,211,153,.55)" : "rgba(34,211,238,.12)"}
                      strokeWidth={high ? 12 : 10}
                      filter="url(#logicflow-glow)"
                      opacity={high ? 1 : 0.75}
                    />
                    <path
                      d={path}
                      fill="none"
                      stroke={high ? "#34d399" : selected ? "#f472b6" : "#22d3ee"}
                      strokeOpacity={high || selected ? 1 : 0.55}
                      strokeWidth={high ? 4 : 3}
                      filter={high ? "url(#logicflow-glow-strong)" : undefined}
                    />
                    <circle
                      cx={x2}
                      cy={y2}
                      r={high ? 5 : 3.5}
                      fill={high ? "#34d399" : "#22d3ee"}
                      filter={high ? "url(#logicflow-glow)" : undefined}
                    />
                    <g
                      className="cursor-pointer"
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        removeConnection(connection.id);
                      }}
                    >
                      <circle
                        cx={midX}
                        cy={y2}
                        r="9"
                        fill="transparent"
                      />
                    </g>
                  </g>
                );
              })}

              {nodes.map((node) => {
                const width = nodeWidth(node);
                const height = nodeHeight(node);
                const selected = selectedNode === node.id;
                const inputHigh = node.type === "INPUT" && Boolean(inputValues[node.label]);
                const outputHigh = node.type === "OUTPUT" && Boolean(nodeSignals.get(node.id));

                return (
                  <g
                    key={node.id}
                    transform={`translate(${node.x}, ${node.y})`}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      startDrag(event, node);
                    }}
                    className="cursor-grab active:cursor-grabbing"
                  >
                    {node.type === "INPUT" && (
                      <>
                        <rect
                          width={width}
                          height={height}
                          rx="18"
                          fill={inputHigh ? "#063b35" : "#111827"}
                          stroke={selected ? "#22d3ee" : "rgba(148,163,184,.24)"}
                          strokeWidth={selected ? 3 : 1.5}
                        />
                        <text x="17" y="21" fill="rgba(148,163,184,.6)" fontSize="9" fontWeight="800" letterSpacing="1.4">
                          INPUT
                        </text>
                        <text x="17" y="48" fill="white" fontSize="22" fontWeight="900">
                          {node.label}
                        </text>
                        <rect
                          x={width - 58}
                          y="16"
                          width="42"
                          height="40"
                          rx="12"
                          fill={inputHigh ? "rgba(52,211,153,.2)" : "rgba(148,163,184,.08)"}
                          stroke={inputHigh ? "rgba(52,211,153,.55)" : "rgba(148,163,184,.18)"}
                          data-toggle="true"
                          onPointerDown={(event) => {
                            event.stopPropagation();
                            toggleInput(node.id);
                          }}
                        />
                        <text
                          x={width - 37}
                          y="42"
                          textAnchor="middle"
                          fill={inputHigh ? "#34d399" : "#64748b"}
                          fontSize="17"
                          fontWeight="900"
                          data-toggle="true"
                          onPointerDown={(event) => {
                            event.stopPropagation();
                            toggleInput(node.id);
                          }}
                        >
                          {inputHigh ? "1" : "0"}
                        </text>
                      </>
                    )}

                    {node.type === "GATE" && node.gate && (
                      <>
                        <rect
                          width={width}
                          height={height}
                          rx="20"
                          fill="#121827"
                          stroke={selected ? "#a78bfa" : "rgba(148,163,184,.24)"}
                          strokeWidth={selected ? 3 : 1.5}
                        />
                        <rect x="14" y="16" width="48" height="48" rx="14" fill="rgba(124,58,237,.18)" />
                        <text x="38" y="48" textAnchor="middle" fill="#c4b5fd" fontSize="17" fontWeight="900">
                          {gateIcon(node.gate)}
                        </text>
                        <text x="78" y="31" fill="rgba(148,163,184,.6)" fontSize="8" fontWeight="900" letterSpacing="1.4">
                          GATE
                        </text>
                        <text x="78" y="53" fill="white" fontSize="16" fontWeight="900">
                          {node.gate}
                        </text>
                        {Array.from({ length: targetPortCount(node) }).map((_, slot) => {
                          const y = portY(node, slot) - node.y;
                          const connected = connections.some(
                            (connection) =>
                              connection.to === node.id && connection.toSlot === slot,
                          );
                          return (
                            <circle
                              key={`target-${slot}`}
                              cx="0"
                              cy={y}
                              r="8"
                              fill={connected ? "#22d3ee" : "#1e293b"}
                              stroke={pendingSource ? "#f472b6" : "rgba(148,163,184,.5)"}
                              strokeWidth="2"
                              data-port="true"
                              onPointerDown={(event) => {
                                event.stopPropagation();
                                if (pendingSource) {
                                  connect(node.id, slot);
                                } else if (connected) {
                                  const existing = connections.find(
                                    (connection) =>
                                      connection.to === node.id &&
                                      connection.toSlot === slot,
                                  );
                                  if (existing) removeConnection(existing.id);
                                }
                              }}
                            />
                          );
                        })}
                      </>
                    )}

                    {node.type === "OUTPUT" && (
                      <>
                        <rect
                          width={width}
                          height={height}
                          rx="18"
                          fill="#111827"
                          stroke={
                            outputHigh
                              ? "#34d399"
                              : selected
                                ? "#f472b6"
                                : "rgba(148,163,184,.24)"
                          }
                          strokeWidth={selected || outputHigh ? 3 : 1.5}
                        />
                        <text x="17" y="21" fill="rgba(148,163,184,.6)" fontSize="9" fontWeight="800" letterSpacing="1.4">
                          OUTPUT
                        </text>
                        <text x="17" y="49" fill="white" fontSize="22" fontWeight="900">
                          {node.label}
                        </text>
                        <text x={width - 31} y="43" textAnchor="middle" fill={outputHigh ? "#34d399" : "#64748b"} fontSize="16" fontWeight="900">
                          {outputHigh ? "1" : "0"}
                        </text>
                        <circle
                          cx="0"
                          cy={portY(node, 0) - node.y}
                          r="8"
                          fill={connections.some((connection) => connection.to === node.id) ? "#22d3ee" : "#1e293b"}
                          stroke={pendingSource ? "#f472b6" : "rgba(148,163,184,.5)"}
                          strokeWidth="2"
                          data-port="true"
                          onPointerDown={(event) => {
                            event.stopPropagation();
                            if (pendingSource) {
                              connect(node.id, 0);
                            }
                          }}
                        />
                      </>
                    )}

                    {node.type !== "OUTPUT" && (
                      <circle
                        cx={width}
                        cy={portY(node, 0) - node.y}
                        r="8"
                        fill={pendingSource === node.id ? "#f472b6" : "#22d3ee"}
                        stroke="#e2e8f0"
                        strokeOpacity=".35"
                        strokeWidth="2"
                        data-port="true"
                        onPointerDown={(event) => {
                          event.stopPropagation();
                          setPendingSource(pendingSource === node.id ? null : node.id);
                        }}
                      />
                    )}

                    {selected && (
                      <g
                        data-delete="true"
                        className="cursor-pointer"
                        onPointerDown={(event) => {
                          event.stopPropagation();
                          deleteNode();
                        }}
                      >
                        <circle cx={width - 12} cy="12" r="11" fill="#ef4444" />
                        <text x={width - 12} y="16" textAnchor="middle" fill="white" fontSize="12" fontWeight="900">
                          ×
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 px-1">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span
                className={cn(
                  "h-2.5 w-2.5 rounded-full",
                  circuitError ? "bg-red-400" : "bg-emerald-400",
                )}
              />
              {circuitError
                ? circuitError
                : backendLoading
                  ? "Backend analysis in progress…"
                  : "Circuit is structurally valid"}
            </div>
            <span className="text-[10px] font-bold uppercase tracking-[.15em] text-slate-500">
              {variables.length} input{variables.length === 1 ? "" : "s"} · {outputNodes.length} output{outputNodes.length === 1 ? "" : "s"} · {connections.length} wire{connections.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>

        <aside className="min-w-0 rounded-3xl border border-slate-200 bg-white p-4 shadow-panel sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[.16em] text-cyan">Analysis</p>
              <h2 className="mt-1 text-xl font-black text-ink">Truth + implementation</h2>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-slate-500">
              {selectedBackendResult ? "Backend ready" : "Waiting"}
            </span>
          </div>

          {backendError && (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-600">
              {backendError}
            </div>
          )}

          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[.16em] text-slate-400">
                  Frontend expression
                </p>
                <p className="mt-1 break-words font-mono text-sm font-black text-ink">
                  {activeOutput && truthTable.length
                    ? outputExpressionFromTruthTable(variables, truthTable, activeOutput.label)
                    : "Waiting for a valid circuit…"}
                </p>
              </div>
              <span
                className={cn(
                  "rounded-xl px-3 py-2 text-sm font-black",
                  activeLocalOutput
                    ? "bg-emerald-50 text-emerald-600"
                    : "bg-slate-200 text-slate-500",
                )}
              >
                {activeLocalOutput ? "TRUE" : "FALSE"}
              </span>
            </div>
          </div>

          {outputNodes.length > 1 && (
            <div className="mt-4 flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
              {outputNodes.map((output) => (
                <button
                  key={output.id}
                  type="button"
                  onClick={() => {
                    setActiveOutputId(output.id);
                    setBackendTab("overview");
                  }}
                  className={cn(
                    "shrink-0 rounded-lg px-3 py-2 text-[10px] font-black transition",
                    activeOutput?.id === output.id
                      ? "bg-white text-ink shadow-sm"
                      : "text-slate-500 hover:text-ink",
                  )}
                >
                  Output {output.label}
                </button>
              ))}
            </div>
          )}

          {truthTable.length > 0 && (
            <div className="mt-4 overflow-auto rounded-2xl border border-slate-200">
              <table className="w-full min-w-[300px] border-collapse text-center font-mono text-[11px]">
                <thead>
                  <tr className="bg-slate-50">
                    {variables.map((variable) => (
                      <th key={variable} className="border-b border-slate-200 px-3 py-2 text-slate-500">
                        {variable}
                      </th>
                    ))}
                    {outputNodes.map((output) => (
                      <th key={output.id} className="border-b border-slate-200 bg-cyan/5 px-3 py-2 text-cyan">
                        {output.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {truthTable.map((row, index) => (
                    <tr key={index} className="border-b border-slate-100 last:border-0">
                      {variables.map((variable) => (
                        <td key={variable} className="px-3 py-2 text-slate-600">
                          {row[variable]}
                        </td>
                      ))}
                      {outputNodes.map((output) => (
                        <td
                          key={output.id}
                          className={cn(
                            "px-3 py-2 font-black",
                            row[output.label] ? "text-emerald-600" : "text-slate-400",
                          )}
                        >
                          {row[output.label]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-4 flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
            {([
              ["overview", "overview"],
              ["truth", "truth"],
              ["circuit", "circuit"],
              ["exports", "exports"],
            ] as [BackendTab, string][]).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setBackendTab(id)}
                className={cn(
                  "flex-1 rounded-lg px-2 py-2 text-[10px] font-black transition",
                  backendTab === id
                    ? "bg-white text-ink shadow-sm"
                    : "text-slate-500 hover:text-ink",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {!selectedBackendResult ? (
            <div className="mt-4 grid min-h-[300px] place-items-center rounded-2xl border border-dashed border-slate-200 p-6 text-center">
              <div>
                <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-cyan/10 text-2xl text-cyan">
                  ∑
                </div>
                <p className="mt-4 text-sm font-black text-ink">Backend results appear here</p>
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  Each output is converted to a parenthesis-free Boolean SOP and sent to
                  <code className="mx-1">/api/logic/expression</code>.
                </p>
              </div>
            </div>
          ) : (
            <div className="mt-4">
              {backendTab === "overview" && (
                <div className="space-y-4">
                  <div className="rounded-2xl bg-slate-950 p-4 text-white">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[.16em] text-cyan">
                          Output {activeOutput?.label ?? "F"} · simplified expression
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={copyExpression}
                        className="rounded-lg bg-white/10 px-3 py-1.5 text-[10px] font-black text-slate-200 transition hover:bg-white/15"
                      >
                        {copied ? "Copied" : "Copy"}
                      </button>
                    </div>
                    <p className="mt-4 break-words font-mono text-xl font-bold leading-8">
                      {selectedBackendResult.logic.simplified_sop}
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {[
                      [selectedBackendResult.logic.variable_count, "Variables"],
                      [selectedBackendResult.logic.minterms.length, "Minterms"],
                      [selectedBackendResult.logic.implementation.gate_count, "Gates"],
                    ].map(([value, label]) => (
                      <div key={String(label)} className="rounded-xl bg-slate-50 p-3 text-center">
                        <p className="text-lg font-black text-ink">{value}</p>
                        <p className="text-[10px] text-slate-500">{label}</p>
                      </div>
                    ))}
                  </div>

                  <ImplementationPanel
                    expression={selectedBackendResult.logic.simplified_sop}
                    gates={selectedBackendResult.logic.implementation.gates}
                    realizedAs={selectedBackendResult.logic.implementation.realized_as}
                  />

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-[10px] font-black uppercase tracking-[.16em] text-slate-400">
                        Canonical SOP
                      </p>
                      <p className="mt-2 break-words font-mono text-xs leading-6 text-slate-700">
                        {selectedBackendResult.logic.canonical_sop}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-[10px] font-black uppercase tracking-[.16em] text-slate-400">
                        Canonical POS
                      </p>
                      <p className="mt-2 break-words font-mono text-xs leading-6 text-slate-700">
                        {selectedBackendResult.logic.canonical_pos}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {backendTab === "truth" && (
                <div className="overflow-auto rounded-2xl border border-slate-200">
                  <table className="w-full min-w-[340px] border-collapse text-center font-mono text-[10px]">
                    <thead>
                      <tr className="bg-slate-50">
                        {selectedBackendResult.logic.variables.map((variable) => (
                          <th key={variable} className="border-b border-slate-200 px-2 py-2 text-slate-500">
                            {variable}
                          </th>
                        ))}
                        <th className="border-b border-slate-200 px-2 py-2 text-cyan">
                          {activeOutput?.label ?? "F"}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedBackendResult.logic.truth_table.map((row, index) => (
                        <tr key={index} className="border-b border-slate-100 last:border-0">
                          {selectedBackendResult.logic.variables.map((variable) => (
                            <td key={variable} className="px-2 py-2 text-slate-600">
                              {row[variable]}
                            </td>
                          ))}
                          <td className={cn("px-2 py-2 font-black", row.F ? "text-emerald-600" : "text-slate-400")}>
                            {row.F}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {backendTab === "circuit" && (
                <div className="space-y-4">
                  {selectedBackendResult.logic.circuit.image ? (
                    <a
                      href={`${API_BASE_URL}${selectedBackendResult.logic.circuit.image}`}
                      target="_blank"
                      rel="noreferrer"
                      className="block overflow-hidden rounded-2xl border border-slate-200 bg-slate-50"
                    >
                      <img
                        src={`${API_BASE_URL}${selectedBackendResult.logic.circuit.image}`}
                        alt={`Generated backend circuit for ${activeOutput?.label ?? "output"}`}
                        className="h-auto w-full object-contain"
                      />
                    </a>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
                      Backend did not return a circuit image.
                    </div>
                  )}
                  <div className="rounded-2xl bg-slate-950 p-4">
                    <p className="text-[10px] font-black uppercase tracking-[.16em] text-cyan">
                      Implementation graph
                    </p>
                    <p className="mt-2 text-xs leading-5 text-slate-300">
                      {selectedBackendResult.logic.circuit.nodes.length} nodes · {selectedBackendResult.logic.circuit.edges.length} edges · output {selectedBackendResult.logic.circuit.output}
                    </p>
                  </div>
                </div>
              )}

              {backendTab === "exports" && (
                <ExportPanel
                  result={selectedBackendResult}
                  rows={selectedBackendResult.logic.truth_table.map((row) => ({
                    inputs: selectedBackendResult.logic.variables.map((variable) => Number(row[variable] ?? 0)),
                    output: Number(row.F ?? 0),
                  }))}
                />
              )}
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}