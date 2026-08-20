"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

type InputKind = "Statement" | "Boolean expression" | "Truth table" | "Minterms / Maxterms" | "Dummy";
type GateMode = "AND, OR & NOT" | "NAND only" | "NOR only";
type CircuitOperation = "Half adder" | "Full adder" | "Half subtractor" | "Full subtractor" | "3-bit multiplier";

type LogicResponse = {
  problem?: string;
  input_type?: string;
  input?: Record<string, unknown>;
  ai?: {
    inputs: string[];
    outputs: string[];
    expression: string;
    explanation: string;
  };
  logic: {
    expression: string;
    variables: string[];
    variable_count: number;
    truth_table: Record<string, number>[];
    minterms: number[];
    maxterms: number[];
    dont_care_terms: number[];
    canonical_sop: string;
    canonical_pos: string;
    simplified_sop: string;
    simplified_pos: string;
    implementation: {
      gates: string;
      fan_in: number;
      gate_count: number;
      realized_as: string;
    };
    circuit: {
      nodes: { id: string; type: string; inputs: string[] }[];
      edges: { source: string; target: string }[];
      output: string;
      image: string | null;
      constant_value: number | null;
    };
    verified: boolean;
  };
};

// Single source of truth for the backend base URL. Everything that talks to
// the API (the main generate() call and the "open source image" link) reads
// from this constant, so it can never drift out of sync again.
const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL ||
  "https://digital-circuits-generator-3.onrender.com"
).replace(/\/+$/, "");

const inputHelp: Record<InputKind, { title: string; placeholder: string; helper: string }> = {
  "Statement": {
    title: "Describe your logic problem",
    placeholder: "e.g. A bulb glows only if both switches A and B are on",
    helper: "Describe the real-world condition in plain language. The backend will identify the inputs, output, and Boolean logic.",
  },
  "Boolean expression": {
    title: "Enter your Boolean expression",
    placeholder: "e.g. A'B + AC + BC'",
    helper: "Use + for OR, adjacency for AND, and ' for NOT.",
  },
  "Truth table": {
    title: "Paste or build a truth table",
    placeholder: "A  B  C  |  F\n0  0  0  |  0\n0  0  1  |  1",
    helper: "Use columns for each variable and one output column.",
  },
  "Minterms / Maxterms": {
    title: "Enter minterms or maxterms",
    placeholder: "e.g. Σm(1, 2) • variables: A, B  or  ΠM(0, 3) • variables: A, B",
    helper: "Use Σm(...) for minterms or ΠM(...) for maxterms and include the variable list.",
  },
  "Dummy": {
    title: "Dummy test input",
    placeholder: "variables: A, B  minterms: 1, 2",
    helper: "Use variables and optional minterms to test the complete API → logic → circuit pipeline.",
  },
};

const modes: { name: GateMode; tag: string; description: string }[] = [
  { name: "AND, OR & NOT", tag: "Basic", description: "Standard logic gates" },
  { name: "NAND only", tag: "Universal", description: "NAND gate implementation" },
  { name: "NOR only", tag: "Universal", description: "NOR gate implementation" },
];

function CircuitPreview({ mode }: { mode: GateMode }) {
  const label = mode === "AND, OR & NOT" ? "AND" : mode === "NAND only" ? "NAND" : "NOR";
  const outputLabel = mode === "AND, OR & NOT" ? "OR" : label;
  return <svg viewBox="0 0 560 240" className="h-full w-full" aria-label="Circuit diagram preview">
    <path className="circuit-line" d="M22 58 H154 M22 118 H154 M22 178 H92 V152 H154 M278 88 H372 M278 152 H372" />
    <text x="20" y="48" className="fill-slate-500 text-[14px]">A</text><text x="20" y="108" className="fill-slate-500 text-[14px]">B</text><text x="20" y="168" className="fill-slate-500 text-[14px]">C</text>
    <path className="gate" d="M154 35 H205 C256 35 278 65 278 88 C278 111 256 141 205 141 H154Z" />
    <text x="183" y="93" className="fill-slate-700 text-[14px] font-bold">{label}</text>
    <path className="gate" d="M372 63 H423 C474 63 496 93 496 116 C496 139 474 169 423 169 H372Z" />
    <text x="401" y="121" className="fill-slate-700 text-[14px] font-bold">{outputLabel}</text>
    <path className="circuit-line" d="M496 116 H540" /><circle cx="548" cy="116" r="4" fill="#18B9C8" />
    <text x="531" y="104" className="fill-slate-700 text-[14px]">F</text>
  </svg>;
}


type CircuitEdge = LogicResponse["logic"]["circuit"]["edges"][number];

function DynamicCircuitDiagram({
  circuit,
  variables,
  outputs,
}: {
  circuit: LogicResponse["logic"]["circuit"];
  variables: string[];
  outputs: string[];
}) {
  const { nodes, edges, output } = circuit;
  const nodeIds = new Set(nodes.map((node) => node.id));

  const incoming = new Map<string, CircuitEdge[]>();

  for (const edge of edges) {
    const list = incoming.get(edge.target) ?? [];
    list.push(edge);
    incoming.set(edge.target, list);
  }

  const depthCache = new Map<string, number>();

  const getDepth = (id: string): number => {
    if (!nodeIds.has(id)) return 0;

    const cached = depthCache.get(id);
    if (cached !== undefined) return cached;

    const parents = (incoming.get(id) ?? [])
      .map((edge) => edge.source)
      .filter((source) => nodeIds.has(source));

    const depth =
      parents.length === 0
        ? 1
        : 1 + Math.max(...parents.map(getDepth));

    depthCache.set(id, depth);
    return depth;
  };

  const maxDepth = Math.max(
    1,
    ...nodes.map((node) => getDepth(node.id))
  );

  const columns = Array.from(
    { length: maxDepth },
    (_, index) =>
      nodes.filter(
        (node) => getDepth(node.id) === index + 1
      )
  );

  const width = Math.max(
    820,
    160 + maxDepth * 220
  );

  const height = Math.max(
    330,
    ...columns.map(
      (column) => column.length * 110 + 80
    )
  );

  const positions = new Map<
    string,
    { x: number; y: number }
  >();

  columns.forEach((column, columnIndex) => {
    const spacing = height / (column.length + 1);

    column.forEach((node, rowIndex) => {
      positions.set(node.id, {
        x: 155 + columnIndex * 220,
        y: spacing * (rowIndex + 1),
      });
    });
  });

  const inputNames = variables.filter((name) =>
    edges.some((edge) => edge.source === name)
  );

  const inputY = new Map<string, number>();

  inputNames.forEach((name, index) => {
    const target = edges.find(
      (edge) => edge.source === name
    )?.target;

    const targetPosition = target
      ? positions.get(target)
      : undefined;

    inputY.set(
      name,
      targetPosition?.y ??
        (height / (inputNames.length + 1)) *
          (index + 1)
    );
  });

  const startPoint = (source: string) => {
    const position = positions.get(source);

    if (position) {
      return {
        x: position.x + 65,
        y: position.y,
      };
    }

    return {
      x: 35,
      y: inputY.get(source) ?? height / 2,
    };
  };

  const endPoint = (target: string) => {
    const position = positions.get(target);

    return {
      x: position?.x
        ? position.x - 65
        : 0,
      y: position?.y ?? 0,
    };
  };

  return (
    <div className="h-full w-full overflow-auto rounded-xl bg-white">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="min-h-[330px] min-w-[820px] w-full"
        role="img"
        aria-label="Generated logic circuit"
      >
        <defs>
          <filter
            id="logicGateShadow"
            x="-30%"
            y="-30%"
            width="160%"
            height="160%"
          >
            <feDropShadow
              dx="0"
              dy="5"
              stdDeviation="6"
              floodOpacity="0.12"
            />
          </filter>
        </defs>

        {/* Wires */}
        {edges.map((edge, index) => {
          const source = startPoint(edge.source);
          const target = endPoint(edge.target);
          const bend = Math.max(
            35,
            (target.x - source.x) * 0.45
          );

          return (
            <path
              key={`${edge.source}-${edge.target}-${index}`}
              d={`M ${source.x} ${source.y}
                  C ${source.x + bend} ${source.y},
                    ${target.x - bend} ${target.y},
                    ${target.x} ${target.y}`}
              fill="none"
              stroke="#cbd5e1"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          );
        })}

        {/* Inputs */}
        {inputNames.map((name) => {
          const y =
            inputY.get(name) ?? height / 2;

          return (
            <g key={`input-${name}`}>
              <circle
                cx="35"
                cy={y}
                r="7"
                fill="#18b9c8"
              />
              <text
                x="53"
                y={y + 5}
                className="fill-slate-700 text-[16px] font-black"
              >
                {name}
              </text>
            </g>
          );
        })}

        {/* Gates */}
        {nodes.map((node) => {
          const position = positions.get(node.id);

          if (!position) return null;

          const gate =
            node.type.toUpperCase();

          const palette =
            gate === "NAND"
              ? {
                  fill: "#eef2ff",
                  stroke: "#6366f1",
                }
              : gate === "NOR"
                ? {
                    fill: "#fff7ed",
                    stroke: "#f97316",
                  }
                : {
                    fill: "#ecfeff",
                    stroke: "#06b6d4",
                  };

          return (
            <g
              key={node.id}
              transform={`translate(${position.x}, ${position.y})`}
              filter="url(#logicGateShadow)"
            >
              <rect
                x="-65"
                y="-36"
                width="130"
                height="72"
                rx="18"
                fill={palette.fill}
                stroke={palette.stroke}
                strokeWidth="2"
              />

              <text
                textAnchor="middle"
                y="6"
                className="fill-slate-800 text-[15px] font-black"
              >
                {gate}
              </text>

              <text
                textAnchor="middle"
                y="25"
                className="fill-slate-400 text-[10px] font-semibold"
              >
                {node.id}
              </text>
            </g>
          );
        })}

        {/* Output */}
        {output &&
          positions.has(output) && (
            <>
              <path
                d={`M ${
                  positions.get(output)!.x +
                  65
                } ${
                  positions.get(output)!.y
                } H ${width - 120}`}
                fill="none"
                stroke="#cbd5e1"
                strokeWidth="2.5"
                strokeLinecap="round"
              />

              <circle
                cx={width - 95}
                cy={positions.get(output)!.y}
                r="9"
                fill="#22c55e"
              />

              <text
                x={width - 72}
                y={
                  positions.get(output)!.y + 5
                }
                className="fill-slate-700 text-[16px] font-black"
              >
                {outputs[0] ?? "F"}
              </text>
            </>
          )}
      </svg>
    </div>
  );
}

function ParticleField({ dark }: { dark: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    let frame = 0;
    let width = 0;
    let height = 0;
    let scale = 1;
    const pointer = { x: -9999, y: -9999 };
    const resize = () => {
      scale = Math.min(window.devicePixelRatio || 1, 1.5);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * scale);
      canvas.height = Math.floor(height * scale);
      context.setTransform(scale, 0, 0, scale, 0, 0);
    };
    const move = (event: PointerEvent) => { pointer.x = event.clientX; pointer.y = event.clientY; };
    const leave = () => { pointer.x = -9999; pointer.y = -9999; };
    const draw = (now: number) => {
      const time = now * 0.00055;
      const spacing = Math.max(22, Math.min(31, width / 56));
      context.clearRect(0, 0, width, height);
      for (let y = 14; y < height; y += spacing) {
        for (let x = 12; x < width; x += spacing) {
          const wave = Math.sin(x * 0.011 + time * 2.2) * 12 + Math.cos(y * 0.014 - time * 1.5) * 8;
          const distanceX = x - pointer.x;
          const distanceY = y + wave - pointer.y;
          const distance = Math.hypot(distanceX, distanceY);
          const influence = Math.max(0, 1 - distance / 190);
          const push = influence * influence * 26;
          const dotX = x + (distance ? (distanceX / distance) * push : 0);
          const dotY = y + wave + (distance ? (distanceY / distance) * push : 0);
          const radius = 0.7 + influence * 2.6 + (Math.sin(x * .08 + y * .05 + time) + 1) * .16;
          const paletteWave = Math.sin((x * .007) + (y * .011) + time * .7);
          const hue = paletteWave > .48 ? 332 : paletteWave < -.48 ? 34 : 188 + Math.sin(x * .006 + time) * 22 + influence * 35;
          context.beginPath();
          context.arc(dotX, dotY, radius, 0, Math.PI * 2);
          context.fillStyle = dark ? `hsla(${hue}, 96%, ${63 + influence * 18}%, ${.17 + influence * .7})` : `hsla(${hue}, 82%, ${42 + influence * 12}%, ${.06 + influence * .34})`;
          context.fill();
        }
      }
      frame = requestAnimationFrame(draw);
    };
    resize();
    frame = requestAnimationFrame(draw);
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerleave", leave);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("resize", resize); window.removeEventListener("pointermove", move); window.removeEventListener("pointerleave", leave); };
  }, [dark]);

  return <canvas ref={canvasRef} className="particle-field" aria-hidden="true" />;
}

const circuitOperations: { name: CircuitOperation; symbol: string; description: string }[] = [
  { name: "Half adder", symbol: "+", description: "Add two 1-bit values" },
  { name: "Full adder", symbol: "+", description: "Add with carry input" },
  { name: "Half subtractor", symbol: "−", description: "Subtract two 1-bit values" },
  { name: "Full subtractor", symbol: "−", description: "Subtract with borrow input" },
  { name: "3-bit multiplier", symbol: "×", description: "Multiply two 3-bit numbers" },
];

function LogicBlockDiagram({ operation }: { operation: CircuitOperation }) {
  const label = operation === "3-bit multiplier" ? "PARTIAL\nPRODUCTS" : operation.includes("adder") ? "XOR / AND" : "XOR / BORROW";
  return <svg viewBox="0 0 520 155" className="h-full w-full" aria-label={`${operation} circuit diagram`}>
    <path className="circuit-line" d="M28 42 H160 M28 112 H160 M356 77 H480" />
    <text x="27" y="32" className="fill-slate-500 text-[13px]">A</text><text x="27" y="102" className="fill-slate-500 text-[13px]">B</text>
    <rect x="160" y="28" width="196" height="99" rx="16" className="gate" />
    {label.split("\n").map((line, index) => <text key={line} x="258" y={index === 0 ? 70 : 90} textAnchor="middle" className="fill-slate-700 text-[13px] font-bold">{line}</text>)}
    <circle cx="485" cy="77" r="4" fill="#18B9C8" /><text x="463" y="64" className="fill-slate-700 text-[13px]">OUT</text>
  </svg>;
}

function CircuitLab() {
  const [operation, setOperation] = useState<CircuitOperation>("Half adder");
  const [bits, setBits] = useState({ a: "0", b: "0", carry: "0" });
  const isMultiplier = operation === "3-bit multiplier";
  const hasCarry = operation === "Full adder" || operation === "Full subtractor";
  const a = isMultiplier ? parseInt(bits.a || "0", 2) : Number(bits.a[0]) || 0;
  const b = isMultiplier ? parseInt(bits.b || "0", 2) : Number(bits.b[0]) || 0;
  const carry = Number(bits.carry) || 0;
  const calculation = (() => {
    if (operation === "Half adder") return { primary: a ^ b, secondary: a & b, primaryLabel: "Sum", secondaryLabel: "Carry", expression: "S = A ⊕ B   ·   C = A · B" };
    if (operation === "Full adder") return { primary: a ^ b ^ carry, secondary: (a & b) | (carry & (a ^ b)), primaryLabel: "Sum", secondaryLabel: "Carry out", expression: "S = A ⊕ B ⊕ Cin" };
    if (operation === "Half subtractor") return { primary: a ^ b, secondary: (1 - a) & b, primaryLabel: "Difference", secondaryLabel: "Borrow", expression: "D = A ⊕ B   ·   Bᵒ = A' · B" };
    if (operation === "Full subtractor") return { primary: a ^ b ^ carry, secondary: ((1 - a) & b) | ((1 - a) & carry) | (b & carry), primaryLabel: "Difference", secondaryLabel: "Borrow out", expression: "D = A ⊕ B ⊕ Bin" };
    const product = a * b;
    return { primary: product.toString(2).padStart(6, "0"), secondary: product, primaryLabel: "Binary product", secondaryLabel: "Decimal", expression: "P = A × B  ·  3-bit partial-product circuit" };
  })();
  const setBit = (name: "a" | "b" | "carry", value: string) => {
    const normalized = isMultiplier && name !== "carry" ? value.replace(/[^01]/g, "").slice(-3) : value.replace(/[^01]/g, "").slice(-1);
    setBits((current) => ({ ...current, [name]: normalized }));
  };

  return <section id="circuits" className="mx-auto max-w-7xl px-6 pb-20 lg:px-8">
    <div className="mb-7 max-w-2xl"><p className="text-sm font-bold text-cyan">04 / INTERACTIVE CIRCUITS</p><h2 className="mt-2 text-3xl font-bold tracking-tight text-ink">Try essential digital logic blocks.</h2><p className="mt-3 text-slate-600">Choose a circuit, enter binary values, and see the calculated output with its implementation logic.</p></div>
    <div className="grid gap-6 xl:grid-cols-[.9fr_1.1fr]"><div className="color-card color-card-mango rounded-3xl border border-slate-200 bg-white p-5 shadow-panel sm:p-7"><p className="text-sm font-bold text-slate-700">Choose a circuit</p><div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">{circuitOperations.map((item, index) => { const accents = ["bg-cyan/10 text-cyan", "bg-emerald-50 text-emerald-600", "bg-orange-50 text-orange-500", "bg-pink-50 text-pink-500", "bg-violet/10 text-violet"]; return <button key={item.name} onClick={() => setOperation(item.name)} className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${operation === item.name ? "border-pink bg-pink/5 ring-1 ring-pink" : "border-slate-200 hover:border-mango/70"}`}><span className={`grid h-9 w-9 place-items-center rounded-lg text-lg font-bold ${operation === item.name ? "bg-pink text-white" : accents[index]}`}>{item.symbol}</span><span><span className="block text-sm font-bold">{item.name}</span><span className="block text-xs text-slate-500">{item.description}</span></span></button>; })}</div></div>
      <motion.div layout className="rounded-3xl border border-slate-200 bg-white p-5 shadow-panel sm:p-7"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-bold text-cyan">SIMULATOR</p><h3 className="mt-1 text-2xl font-bold">{operation}</h3></div><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-600">Live output</span></div><div className="mt-6 grid gap-3 sm:grid-cols-3"><label className="text-sm font-semibold text-slate-700">Input A<input value={bits.a} onChange={(event) => setBit("a", event.target.value)} inputMode="numeric" placeholder={isMultiplier ? "000" : "0"} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-lg font-bold text-ink outline-none focus:border-cyan focus:ring-4 focus:ring-cyan/10" /></label><label className="text-sm font-semibold text-slate-700">Input B<input value={bits.b} onChange={(event) => setBit("b", event.target.value)} inputMode="numeric" placeholder={isMultiplier ? "000" : "0"} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-lg font-bold text-ink outline-none focus:border-cyan focus:ring-4 focus:ring-cyan/10" /></label>{hasCarry ? <label className="text-sm font-semibold text-slate-700">{operation === "Full adder" ? "Carry in" : "Borrow in"}<input value={bits.carry} onChange={(event) => setBit("carry", event.target.value)} inputMode="numeric" placeholder="0" className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-lg font-bold text-ink outline-none focus:border-cyan focus:ring-4 focus:ring-cyan/10" /></label> : <div className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-500">{isMultiplier ? "Enter up to three binary digits in each input (000–111)." : "Enter one binary digit: 0 or 1."}</div>}</div><p className="mt-3 text-xs text-slate-500">Only binary values are accepted.</p><div className="mt-6 grid grid-cols-2 gap-3"><div className="rounded-2xl bg-ink p-4 text-white"><p className="text-xs font-bold uppercase tracking-wider text-cyan">{calculation.primaryLabel}</p><p className="mt-2 font-mono text-3xl font-bold">{calculation.primary}</p></div><div className="rounded-2xl border border-cyan/20 bg-cyan/5 p-4"><p className="text-xs font-bold uppercase tracking-wider text-cyan">{calculation.secondaryLabel}</p><p className="mt-2 font-mono text-3xl font-bold text-ink">{calculation.secondary}</p></div></div><div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="font-mono text-xs text-slate-600">{calculation.expression}</p></div><div className="grid-dots mt-5 h-40 rounded-2xl border border-slate-200 bg-slate-50 p-3"><LogicBlockDiagram operation={operation} /></div></motion.div></div>
  </section>;
}

export default function Home() {
  const [kind, setKind] = useState<InputKind>("Statement");
  const [mode, setMode] = useState<GateMode>("AND, OR & NOT");
  const [value, setValue] = useState("A bulb glows only if both switches A and B are on");
  const [generated, setGenerated] = useState(false);
  const [copied, setCopied] = useState(false);
  const [dark, setDark] = useState(false);
  const [result, setResult] = useState<LogicResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const help = inputHelp[kind];

  useEffect(() => {
    setDark(localStorage.getItem("logicflow-theme") === "dark");
  }, []);

  useEffect(() => {
    let frame = 0;
    const trackPointer = (event: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        cursorRef.current?.style.setProperty("transform", `translate3d(${event.clientX - 18}px, ${event.clientY - 18}px, 0)`);
        glowRef.current?.style.setProperty("transform", `translate3d(${event.clientX - 220}px, ${event.clientY - 220}px, 0)`);
        const target = event.target as HTMLElement;
        cursorRef.current?.classList.toggle("is-hovering", Boolean(target.closest("button, a, input, textarea")));
      });
    };
    window.addEventListener("pointermove", trackPointer, { passive: true });
    return () => { window.removeEventListener("pointermove", trackPointer); cancelAnimationFrame(frame); };
  }, []);

  function toggleTheme() {
    setDark((current) => {
      const next = !current;
      localStorage.setItem("logicflow-theme", next ? "dark" : "light");
      return next;
    });
  }

  function switchKind(next: InputKind) {
    setKind(next);
    setGenerated(false);
    setResult(null);
    setError(null);

    if (next === "Dummy") {
      setValue("A bulb glows if exactly one of A or B is on");
      return;
    }

    setValue("");
  }

  function parseTruthTableInput(input: string) {
    const lines = input
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length < 2) {
      throw new Error(
        "Enter a truth table with a header row and at least one data row."
      );
    }

    const header = lines[0]
      .replace(/\|/g, " ")
      .split(/\s+/)
      .filter(Boolean);

    if (header.length < 2) {
      throw new Error(
        "Truth table needs at least one input variable and one output column."
      );
    }

    const output = header[header.length - 1];
    const truthTable: Record<string, number>[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i]
        .replace(/\|/g, " ")
        .split(/\s+/)
        .filter(Boolean);

      if (values.length !== header.length) {
        throw new Error(
          `Truth-table row ${i} has ${values.length} values; expected ${header.length}.`
        );
      }

      const row: Record<string, number> = {};

      values.forEach((raw, index) => {
        if (raw !== "0" && raw !== "1") {
          throw new Error(
            `Truth-table values must be 0 or 1. Found "${raw}" in row ${i}.`
          );
        }

        row[header[index]] = Number(raw);
      });

      truthTable.push(row);
    }

    return { truthTable, output };
  }

  function parseIndexedTerms(
    input: string,
    kind: "minterms" | "maxterms"
  ) {
    const pattern =
      kind === "minterms"
        ? /(?:Σ|sigma)\s*m\s*\(\s*([^)]*)\s*\)/i
        : /(?:Π|pi)\s*M\s*\(\s*([^)]*)\s*\)/i;

    const match = input.match(pattern);

    if (!match) {
      throw new Error(
        `Could not find ${
          kind === "minterms" ? "Σm(...)" : "ΠM(...)"
        } in the input.`
      );
    }

    const terms = match[1]
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .map(Number);

    if (
      terms.some(
        (term) => !Number.isInteger(term) || term < 0
      )
    ) {
      throw new Error(
        `${kind} must contain non-negative integer indices.`
      );
    }

    const variableMatch = input.match(
      /variables?\s*:\s*([A-Za-z][A-Za-z0-9_]*(?:\s*,\s*[A-Za-z][A-Za-z0-9_]*)*)/i
    );

    if (!variableMatch) {
      throw new Error(
        "Please include variables, for example: variables: A, B, C."
      );
    }

    const variables = variableMatch[1]
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    return { terms, variables };
  }

  async function generate() {
    if (!value.trim()) return;

    setLoading(true);
    setError(null);
    setGenerated(false);

    try {
      let endpoint = "/api/logic/generate";
      let body: Record<string, unknown>;

      if (kind === "Statement") {
        endpoint = "/api/logic/generate";

        body = {
          problem: value.trim(),
          gate_mode: mode,
          fan_in: 2,
        };
      } else if (kind === "Boolean expression") {
        endpoint = "/api/logic/expression";

        body = {
          expression: value.trim(),
          gate_mode: mode,
          fan_in: 2,
        };
      } else if (kind === "Truth table") {
        endpoint = "/api/logic/truth-table";

        const parsed = parseTruthTableInput(value);

        body = {
          truth_table: parsed.truthTable,
          output: parsed.output,
          gate_mode: mode,
          fan_in: 2,
        };
      } else if (kind === "Minterms / Maxterms") {
        const isMaxterm =
          /(?:Π|pi)\s*M\s*\(/i.test(value);

        if (isMaxterm) {
          endpoint = "/api/logic/maxterms";

          const parsed = parseIndexedTerms(
            value,
            "maxterms"
          );

          body = {
            maxterms: parsed.terms,
            variables: parsed.variables,
            gate_mode: mode,
            fan_in: 2,
          };
        } else {
          endpoint = "/api/logic/minterms";

          const parsed = parseIndexedTerms(
            value,
            "minterms"
          );

          body = {
            minterms: parsed.terms,
            variables: parsed.variables,
            gate_mode: mode,
            fan_in: 2,
          };
        }
      } else {
        endpoint = "/api/logic/dummy";

        const variableMatch = value.match(
          /variables?\s*:\s*([A-Za-z][A-Za-z0-9_]*(?:\s*,\s*[A-Za-z][A-Za-z0-9_]*)*)/i
        );

        const mintermMatch = value.match(
          /minterms?\s*:\s*([0-9,\s]+)/i
        );

        body = {
          variables: variableMatch
            ? variableMatch[1]
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean)
            : ["A", "B"],

          minterms: mintermMatch
            ? mintermMatch[1]
                .split(",")
                .map((item) => Number(item.trim()))
                .filter((item) =>
                  Number.isInteger(item)
                )
            : [1, 2],

          gate_mode: mode,
          fan_in: 2,
        };
      }

      const fullUrl = `${API_BASE_URL}${endpoint}`;

      console.log("[LogicFlow] API request:", {
        url: fullUrl,
        method: "POST",
        inputType: kind,
      });

      const response = await fetch(
        fullUrl,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        }
      );

      if (!response.ok) {
        let message =
          `Request failed with status ${response.status}`;

        try {
          const errorData =
            await response.json();

          if (
            typeof errorData?.detail ===
            "string"
          ) {
            message =
              errorData.detail;
          }
        } catch {
          // Keep the fallback HTTP message.
        }

        throw new Error(message);
      }

      const data: LogicResponse =
        await response.json();

      setResult(data);
      setGenerated(true);
      setCopied(false);
    } catch (err) {
      console.error(
        "Logic generation failed:",
        err
      );

      // A TypeError from fetch() (as opposed to an Error we threw ourselves
      // above) means the request never reached the server at all: a CORS
      // rejection, DNS failure, or a Render free-tier instance that's
      // asleep and taking too long to cold-start. Surface that distinction
      // instead of a generic message, since it's the difference between
      // "wait a bit and retry" and "fix the backend's CORS config."
      if (err instanceof TypeError) {
        setError(
          "Couldn't reach the backend. If it's been idle, Render's free tier can take up to a minute to wake up — try again shortly. If it still fails, check that the backend's CORS settings allow this site's origin."
        );
      } else {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to generate logic design."
        );
      }
    } finally {
      setLoading(false);
    }
  }

  async function copyExpression() {
    const expression = result?.logic.simplified_sop || result?.logic.expression || "";
    if (!expression) return;
    try {
      await navigator.clipboard?.writeText(expression);
      setCopied(true);
    } catch (err) {
      console.error("Failed to copy expression:", err);
    }
  }
  return <main className={`${dark ? "dark" : ""} custom-cursor colorful-ui relative min-h-screen overflow-hidden bg-paper transition-colors duration-300`}>
    <ParticleField dark={dark} />
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true"><div className="circuit-grid absolute inset-0" /><div ref={glowRef} className="ambient-orb ambient-orb-cursor" /><div className="ambient-orb ambient-orb-one" /><div className="ambient-orb ambient-orb-two" /><div className="ambient-orb ambient-orb-three" /><div className="color-ribbon color-ribbon-one" /><div className="color-ribbon color-ribbon-two" /></div>
    <div ref={cursorRef} className="kinetic-cursor" aria-hidden="true"><span>✦</span></div>
    <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-8">
      <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-mango via-coral to-pink text-lg font-black text-white shadow-lg shadow-pink/25">L</div><div><p className="text-lg font-bold tracking-tight">LogicFlow</p><p className="text-xs text-slate-500">Digital logic studio</p></div></div>
      <div className="flex items-center gap-3 text-sm font-medium text-slate-600 md:gap-7"><a href="#workspace" className="hidden text-ink transition hover:text-pink md:block">Workspace</a><a href="#circuits" className="hidden transition hover:text-cyan md:block">Circuits</a><a href="#how-it-works" className="hidden transition hover:text-coral md:block">How it works</a><button onClick={toggleTheme} aria-label={`Switch to ${dark ? "light" : "dark"} mode`} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 text-lg text-ink transition hover:border-pink" title={`Switch to ${dark ? "light" : "dark"} mode`}>{dark ? "☀" : "◐"}</button><button className="hidden rounded-lg border border-pink/30 bg-pink/5 px-4 py-2 text-pink transition hover:bg-pink hover:text-white md:block">Save project</button></div>
    </header>

    <section className="relative mx-auto max-w-7xl px-6 pb-10 pt-8 lg:px-8 lg:pt-16">
      <div className="absolute right-[-8rem] top-[-3rem] h-80 w-80 rounded-full bg-mango/20 blur-3xl" />
      <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="relative max-w-3xl">
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-pink/20 bg-pink/10 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-pink"><span className="h-1.5 w-1.5 rounded-full bg-pink" /> Logic synthesis workspace</div>
        <h1 className="text-4xl font-bold leading-[1.08] tracking-tight text-ink sm:text-6xl">From Boolean logic<br /><span className="rainbow-title">to working circuits.</span></h1>
        <p className="mt-5 max-w-xl text-base leading-7 text-slate-600 sm:text-lg">Describe your digital logic problem in the format you know. LogicFlow simplifies it, verifies it, and prepares every implementation your project needs.</p>
      </motion.div>
    </section>

    <section id="workspace" className="mx-auto max-w-7xl px-6 pb-16 lg:px-8">
      <div className="grid gap-6 xl:grid-cols-[1.06fr_.94fr]">
        <motion.div initial={{ opacity: 0, x: -15 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.12 }} className="color-card color-card-cyan rounded-3xl border border-slate-200 bg-white p-5 shadow-panel sm:p-7">
          <div className="flex flex-col justify-between gap-4 border-b border-slate-100 pb-5 sm:flex-row sm:items-center"><div><p className="text-sm font-bold text-cyan">01 / DEFINE</p><h2 className="mt-1 text-xl font-bold">What are you solving?</h2></div><span className="w-fit rounded-full bg-mango/10 px-3 py-1 text-xs font-medium text-mango">Ready for input</span></div>
          <label className="mt-6 block text-sm font-semibold text-slate-700">Input format</label>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">{(Object.keys(inputHelp) as InputKind[]).map((option) => <button key={option} onClick={() => switchKind(option)} className={`rounded-xl border px-3 py-3 text-left text-sm font-semibold transition ${kind === option ? "border-pink bg-pink/5 text-pink shadow-sm" : "border-slate-200 text-slate-600 hover:border-mango/70"}`}>{option}</button>)}</div>
          <div className="mt-6 flex items-end justify-between gap-4"><div><label className="block text-sm font-semibold text-slate-700">{help.title}</label><p className="mt-1 text-xs text-slate-500">{help.helper}</p></div><span className="hidden rounded-md bg-slate-100 px-2 py-1 font-mono text-[10px] text-slate-500 sm:block">INPUT</span></div>
          <textarea value={value} onChange={(event) => { setValue(event.target.value); setGenerated(false); }} placeholder={help.placeholder} className="mt-3 min-h-32 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-4 font-mono text-sm leading-6 text-ink outline-none transition placeholder:text-slate-400 focus:border-cyan focus:bg-white focus:ring-4 focus:ring-cyan/10" />
          <div className="mt-6 border-t border-slate-100 pt-5"><p className="text-sm font-bold text-cyan">02 / IMPLEMENT</p><h3 className="mt-1 text-base font-bold">Choose a gate family</h3><div className="mt-3 grid gap-2 sm:grid-cols-3">
              {modes.map((item) => (
                <button
                  key={item.name}
                  onClick={() => {
                    setMode(item.name);
                    setGenerated(false);
                    setResult(null);
                  }}
                  className={`rounded-xl border p-3 text-left transition ${
                    mode === item.name
                      ? "border-cyan bg-cyan/5 ring-1 ring-cyan"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                      mode === item.name
                        ? "bg-cyan text-white"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {item.tag}
                  </span>

                  <p className="mt-2 text-sm font-bold">
                    {item.name}
                  </p>

                  <p className="mt-0.5 text-xs text-slate-500">
                    {item.description}
                  </p>
                </button>
              ))}
            </div></div>
          <button onClick={generate} disabled={!value.trim() || loading} className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-coral via-pink to-violet px-5 py-4 text-sm font-bold text-white shadow-lg shadow-pink/20 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40">
            <span>{loading ? "Generating..." : "Generate logic design"}</span>
            <span aria-hidden>{loading ? "⟳" : "→"}</span>
          </button>
          {error && (
            <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm leading-5 text-red-600">
              {error}
            </div>
          )}
        </motion.div>

        <motion.div initial={{ opacity: 0, x: 15 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.18 }} className="color-card color-card-pink relative overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-panel">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-5 sm:px-7"><div><p className="text-sm font-bold text-cyan">03 / RESULTS</p><h2 className="mt-1 text-xl font-bold">Logic implementation</h2></div>{generated && <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-600">Generated</span>}</div>
          <AnimatePresence mode="wait">
            {generated && result ? (
              <motion.div key="result" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="p-5 sm:p-7">
                <div className="rounded-2xl bg-ink p-5 text-white">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-bold uppercase tracking-wider text-cyan">Simplified expression</p>
                    <button onClick={copyExpression} className="rounded-md bg-white/10 px-2.5 py-1 text-xs transition hover:bg-white/20">
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <p className="mt-5 break-words font-mono text-2xl font-medium tracking-wide">{result.logic.simplified_sop}</p>
                  <p className="mt-2 text-xs text-slate-400">Minimized sum-of-products form</p>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 p-3">
                    <p className="text-xs font-bold text-slate-700">Generated truth table</p>
                    <div className="mt-2 overflow-hidden rounded-md border border-slate-200">
                      <table className="w-full text-center font-mono text-[10px]">
                        <thead>
                          <tr className="bg-slate-100">
                            {result.logic.variables.map((variable) => <th key={variable} className="p-1.5">{variable}</th>)}
                            {(result.ai?.outputs ?? ["F"]).map((output) => <th key={output} className="bg-cyan/10 p-1.5 font-bold">{output}</th>)}
                          </tr>
                        </thead>
                        <tbody>
                          {result.logic.truth_table.map((row, index) => (
                            <tr key={index} className="border-t border-slate-100">
                              {result.logic.variables.map((variable) => <td key={variable} className="bg-white p-1.5">{row[variable]}</td>)}
                              {(result.ai?.outputs ?? ["F"]).map((output) => <td key={output} className="bg-cyan/5 p-1.5 font-bold">{row[output]}</td>)}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 p-3">
                    <p className="text-xs font-bold text-slate-700">Implementation</p>
                    <p className="mt-2 text-sm font-bold text-violet">{result.logic.implementation.gates}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{result.logic.implementation.realized_as}</p>
                    <div className="mt-3 space-y-1 text-xs text-slate-500">
                      <p>Fan-in: {result.logic.implementation.fan_in}</p>
                      <p>Gates: {result.logic.implementation.gate_count}</p>
                      <p>Verified: <span className={result.logic.verified ? "font-bold text-emerald-600" : "font-bold text-red-500"}>{result.logic.verified ? "Yes" : "No"}</span></p>
                    </div>
                  </div>
                </div>

                <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-bold text-slate-700">
                      {result.ai ? "AI explanation" : "Generation details"}
                    </p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                      {result.ai?.explanation ??
                        "Generated by the deterministic Boolean Logic Engine."}
                    </p>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 p-3">
                    <p className="text-xs font-bold text-slate-700">Canonical SOP</p>
                    <p className="mt-2 break-words font-mono text-xs text-slate-600">{result.logic.canonical_sop}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 p-3">
                    <p className="text-xs font-bold text-slate-700">Canonical POS</p>
                    <p className="mt-2 break-words font-mono text-xs text-slate-600">{result.logic.canonical_pos}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 p-3">
                    <p className="text-xs font-bold text-slate-700">Simplified POS</p>
                    <p className="mt-2 break-words font-mono text-xs text-slate-600">{result.logic.simplified_pos}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 p-3">
                    <p className="text-xs font-bold text-slate-700">Minterms / Maxterms</p>
                    <p className="mt-2 font-mono text-xs text-slate-600">Σm({result.logic.minterms.join(", ")})</p>
                    <p className="mt-1 font-mono text-xs text-slate-600">ΠM({result.logic.maxterms.join(", ")})</p>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold">
                      Generated circuit
                    </p>
                    <p className="text-xs text-slate-500">
                      {result.logic.implementation.realized_as}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold text-slate-500">
                      {result.logic.circuit.nodes.length} gates
                    </span>

                    {result.logic.circuit.image && (
                      <a
                        href={`${API_BASE_URL}${result.logic.circuit.image}`}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-violet transition hover:border-violet/30 hover:bg-violet/5"
                      >
                        Open source image ↗
                      </a>
                    )}
                  </div>
                </div>

                <div className="grid-dots mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
                  <div className="h-72 rounded-xl border border-slate-200 bg-white p-2 sm:h-80">
                    <DynamicCircuitDiagram
                      circuit={result.logic.circuit}
                      variables={result.logic.variables}
                      outputs={result.ai?.outputs ?? ["F"]}
                    />
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-lg font-bold">{result.logic.variable_count}</p>
                    <p className="text-[11px] text-slate-500">Variables</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-lg font-bold">{result.logic.implementation.fan_in}</p>
                    <p className="text-[11px] text-slate-500">Fan-in</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-lg font-bold">{result.logic.implementation.gate_count}</p>
                    <p className="text-[11px] text-slate-500">Gates used</p>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid min-h-[530px] place-items-center p-8 text-center">
                <div>
                  <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-violet/10 text-3xl text-violet">⌘</div>
                  <h3 className="mt-5 text-lg font-bold">Your design will appear here</h3>
                  <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-slate-500">Enter a logic problem, pick a gate family, then generate to see the simplified result and circuit diagram.</p>
                  <div className="mx-auto mt-7 flex max-w-xs items-center gap-2 text-left text-xs text-slate-500">
                    <span className="grid h-6 w-6 place-items-center rounded-full bg-cyan text-white">1</span>
                    <span>Input</span>
                    <span className="h-px flex-1 bg-slate-200" />
                    <span className="grid h-6 w-6 place-items-center rounded-full bg-slate-200">2</span>
                    <span>Generate</span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </section>
    <CircuitLab />
    <footer id="how-it-works" className="border-t border-slate-200 bg-white"><div className="mx-auto flex max-w-7xl flex-col justify-between gap-3 px-6 py-6 text-sm text-slate-500 sm:flex-row lg:px-8"><p>LogicFlow · Build, simplify, and understand digital logic.</p><p>Designed for digital logic exploration.</p></div></footer>
  </main>;
}