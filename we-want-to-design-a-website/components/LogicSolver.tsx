"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import AnimatedCircuit from "./AnimatedCircuit";
import ExportPanel from "./ExportPanel";
import ImplementationPanel from "./ImplementationPanel";
import KMap from "./KMap";
import SignalGraph from "./SignalGraph";
import { minimizeSOP, type TruthRow } from "./logicAlgorithms";

export type InputKind = "Statement" | "Boolean expression" | "Truth table" | "Minterms / Maxterms" | "Dummy";
export type GateMode = "AND, OR & NOT" | "NAND only" | "NOR only";
type ResultTab = "overview" | "truth" | "kmap" | "circuit" | "signals" | "exports";

export type LogicResponse = {
  problem?: string;
  input_type?: string;
  input?: Record<string, unknown>;
  ai?: { inputs: string[]; outputs: string[]; expression: string; explanation: string };
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
    implementation: { gates: string; fan_in: number; gate_count: number; realized_as: string };
    circuit: { nodes: { id: string; type: string; inputs: string[] }[]; edges: { source: string; target: string }[]; output: string; image: string | null; constant_value: number | null };
    verified: boolean;
  };
};

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL || "https://digital-circuits-generator-3.onrender.com").replace(/\/+$/, "");
const inputHelp: Record<InputKind, { title: string; placeholder: string; helper: string }> = {
  Statement: { title: "Describe your logic problem", placeholder: "e.g. A bulb glows only if both switches A and B are on", helper: "Describe the real-world condition in plain language. The backend will identify the inputs, output, and Boolean logic." },
  "Boolean expression": { title: "Enter your Boolean expression", placeholder: "e.g. A'B + AC + BC'", helper: "Use + for OR, adjacency for AND, and ' for NOT." },
  "Truth table": { title: "Paste or build a truth table", placeholder: "A  B  C  |  F\n0  0  0  |  0\n0  0  1  |  1", helper: "Use columns for each variable and one output column." },
  "Minterms / Maxterms": { title: "Enter minterms or maxterms", placeholder: "e.g. Σm(1, 2) • variables: A, B  or  ΠM(0, 3) • variables: A, B", helper: "Use Σm(...) for minterms or ΠM(...) for maxterms and include the variable list." },
  Dummy: { title: "Dummy test input", placeholder: "variables: A, B minterms: 1, 2", helper: "Use variables and optional minterms to test the complete API pipeline." },
};
const modes: { name: GateMode; tag: string; description: string; tone: "cyan" | "violet" | "amber" }[] = [
  { name: "AND, OR & NOT", tag: "Basic", description: "Standard logic gates", tone: "cyan" },
  { name: "NAND only", tag: "Universal", description: "NAND gate implementation", tone: "violet" },
  { name: "NOR only", tag: "Universal", description: "NOR gate implementation", tone: "amber" },
];
const tabs: [ResultTab, string][] = [["overview", "Overview"], ["truth", "Truth table"], ["kmap", "K-Map"], ["circuit", "Circuit"], ["signals", "Signals"], ["exports", "Exports"]];

function cn(...values: Array<string | false | null | undefined>) { return values.filter(Boolean).join(" "); }
let solverAudioContext: AudioContext | null = null;

function beep(high = true) {
  try {
    const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = solverAudioContext ?? new AudioCtx();
    solverAudioContext = ctx;
    if (ctx.state === "suspended") void ctx.resume().catch(() => {});
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    osc.type = high ? "triangle" : "sine";
    osc.frequency.setValueAtTime(high ? 880 : 520, now);
    osc.frequency.exponentialRampToValueAtTime(high ? 1500 : 260, now + 0.04);
    gain.gain.setValueAtTime(0.04, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.04);
  } catch {}
}


function assertLogicResponse(value: unknown): LogicResponse {
  const data = value as Partial<LogicResponse> | null;
  const logic = data?.logic;
  if (!logic || typeof logic !== "object") throw new Error("Backend returned an invalid logic response.");
  if (!Array.isArray(logic.variables) || !Array.isArray(logic.truth_table)) {
    throw new Error("Backend response is missing the variable list or truth table.");
  }
  const circuit = (logic as LogicResponse["logic"]).circuit;
  if (!circuit || !Array.isArray(circuit.nodes) || !Array.isArray(circuit.edges)) {
    throw new Error("Backend response is missing the generated circuit graph.");
  }
  return data as LogicResponse;
}

function TruthTable({ rows, variables, activeIndex }: { rows: TruthRow[]; variables: string[]; activeIndex: number }) {
  return <div className="overflow-auto rounded-2xl border border-slate-200"><table className="w-full min-w-[420px] border-collapse text-center font-mono text-xs"><thead><tr className="bg-slate-50">{variables.map((v) => <th key={v} className="border-b border-slate-200 p-3 text-slate-500">{v}</th>)}<th className="border-b border-slate-200 bg-cyan/5 p-3 text-cyan">F</th></tr></thead><tbody>{rows.map((row, i) => <tr key={i} className={cn("border-b border-slate-100 transition", i === activeIndex && "bg-cyan/10")}>{row.inputs.map((v, j) => <td key={j} className="p-3 text-slate-600">{v}</td>)}<td className={cn("p-3 font-black", row.output ? "text-emerald-600" : "text-slate-400")}>{row.output}</td></tr>)}</tbody></table></div>;
}

function ProbeControls({
  variables,
  probe,
  onToggle,
  onReset,
}: {
  variables: string[];
  probe: Record<string, number>;
  onToggle: (variable: string) => void;
  onReset: () => void;
}) {
  const vector = variables.map((variable) => probe[variable] ?? 0).join("");
  return (
    <div className="result-probe-panel">
      <div className="result-probe-head">
        <div>
          <p className="result-probe-kicker">LIVE INPUT VECTOR</p>
          <p className="result-probe-title">Control the generated circuit</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="result-probe-vector">{vector || "—"}</span>
          <button type="button" onClick={onReset} className="result-probe-reset">Reset</button>
        </div>
      </div>
      <div className="result-probe-grid">
        {variables.map((variable) => {
          const high = Boolean(probe[variable]);
          return (
            <button key={variable} type="button" aria-pressed={high} onClick={() => onToggle(variable)} className={cn("result-probe-button", high && "is-high")}>
              <span className="result-probe-name">{variable}</span>
              <span className="result-probe-value">{high ? 1 : 0}</span>
              <span className="result-probe-rail" aria-hidden="true"><span /></span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function LogicSolver() {
  const [inputKind, setInputKind] = useState<InputKind>("Statement");
  const [mode, setMode] = useState<GateMode>("AND, OR & NOT");
  const [value, setValue] = useState("A bulb glows only if both switches A and B are on");
  const [result, setResult] = useState<LogicResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<ResultTab>("overview");
  const [probe, setProbe] = useState<Record<string, number>>({});
  const [history, setHistory] = useState<{ label: string; value: number }[]>([]);
  const [copied, setCopied] = useState(false);
  const requestRef = useRef<AbortController | null>(null);
  const help = inputHelp[inputKind];

  const rows: TruthRow[] = useMemo(() => result?.logic.truth_table.map((row) => ({ inputs: result.logic.variables.map((v) => Number(row[v] ?? 0)), output: Number(row[(result.ai?.outputs ?? ["F"])[0]] ?? row.F ?? 0) })) ?? [], [result]);
  const activeIndex = useMemo(() => result ? result.logic.variables.reduce((acc, variable, index) => acc | ((probe[variable] || 0) << (result.logic.variables.length - 1 - index)), 0) : -1, [probe, result]);
  const minimized = useMemo(() => {
    if (!result || result.logic.variables.length < 2 || result.logic.variables.length > 4) return { expression: result?.logic.simplified_sop ?? "", implicants: [] };
    return minimizeSOP(result.logic.minterms, result.logic.variables, result.logic.dont_care_terms);
  }, [result]);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        const button = document.getElementById("logic-generate-button") as HTMLButtonElement | null;
        button?.click();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  useEffect(() => () => { requestRef.current?.abort(); }, []);

  const reset = () => { setResult(null); setError(null); setTab("overview"); setProbe({}); setHistory([]); };
  const switchKind = (next: InputKind) => { setInputKind(next); reset(); setValue(next === "Dummy" ? "variables: A, B minterms: 1, 2" : ""); };

  const parseTruth = (input: string) => {
    const lines = input.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (lines.length < 2) throw new Error("Enter a truth table with a header row and at least one data row.");
    const header = lines[0].replace(/\|/g, " ").split(/\s+/).filter(Boolean);
    const output = header.at(-1)!;
    const truth_table = lines.slice(1).map((line, index) => {
      const values = line.replace(/\|/g, " ").split(/\s+/).filter(Boolean);
      if (values.length !== header.length) throw new Error(`Truth-table row ${index + 2} has ${values.length} values; expected ${header.length}.`);
      const row: Record<string, number> = {};
      values.forEach((value, i) => { if (value !== "0" && value !== "1") throw new Error("Truth table values must be 0 or 1."); row[header[i]] = Number(value); });
      return row;
    });
    return { truth_table, output };
  };

  const parseTerms = (input: string, kind: "minterms" | "maxterms") => {
    const re = kind === "minterms" ? /(?:Σ|sigma)\s*m\s*\(([^)]*)\)/i : /(?:Π|pi)\s*M\s*\(([^)]*)\)/i;
    const match = input.match(re);
    if (!match) throw new Error(`Could not find ${kind === "minterms" ? "Σm(...)" : "ΠM(...)"}.`);
    const terms = match[1].split(",").map((item) => Number(item.trim()));
    if (terms.some((term) => !Number.isInteger(term) || term < 0)) throw new Error("Indexed terms must be non-negative integers.");
    const vars = input.match(/variables?\s*:\s*([A-Za-z][A-Za-z0-9_]*(?:\s*,\s*[A-Za-z][A-Za-z0-9_]*)*)/i)?.[1];
    if (!vars) throw new Error("Please include variables: A, B, C.");
    return { terms, variables: vars.split(",").map((item) => item.trim()) };
  };

  async function generate() {
    if (!value.trim() || loading) return;
    setLoading(true); setError(null); beep(true);
    try {
      let endpoint = "/api/logic/generate"; let body: Record<string, unknown>;
      if (inputKind === "Statement") body = { problem: value.trim(), gate_mode: mode, fan_in: 2 };
      else if (inputKind === "Boolean expression") { endpoint = "/api/logic/expression"; body = { expression: value.trim(), gate_mode: mode, fan_in: 2 }; }
      else if (inputKind === "Truth table") { endpoint = "/api/logic/truth-table"; const parsed = parseTruth(value); body = { truth_table: parsed.truth_table, output: parsed.output, gate_mode: mode, fan_in: 2 }; }
      else if (inputKind === "Minterms / Maxterms") {
        const isMax = /(?:Π|pi)\s*M\s*\(/i.test(value); const parsed = parseTerms(value, isMax ? "maxterms" : "minterms"); endpoint = isMax ? "/api/logic/maxterms" : "/api/logic/minterms";
        body = { variables: parsed.variables, gate_mode: mode, fan_in: 2, ...(isMax ? { maxterms: parsed.terms } : { minterms: parsed.terms }) };
      } else {
        endpoint = "/api/logic/dummy";
        const vars = value.match(/variables?\s*:\s*([A-Za-z][A-Za-z0-9_]*(?:\s*,\s*[A-Za-z][A-Za-z0-9_]*)*)/i)?.[1];
        const mins = value.match(/minterms?\s*:\s*([0-9,\s]+)/i)?.[1];
        body = { variables: vars ? vars.split(",").map((s) => s.trim()) : ["A", "B"], minterms: mins ? mins.split(",").map(Number) : [1, 2], gate_mode: mode, fan_in: 2 };
      }
      requestRef.current?.abort();
      const controller = new AbortController();
      requestRef.current = controller;
      const timeout = window.setTimeout(() => controller.abort(), 30000);
      let response: Response;
      try {
        response = await fetch(`${API_BASE_URL}${endpoint}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } finally {
        window.clearTimeout(timeout);
      }
      if (!response.ok) {
        let message = `Request failed with status ${response.status}`;
        try { const data = await response.json(); if (typeof data?.detail === "string") message = data.detail; } catch {}
        throw new Error(message);
      }
      const data = assertLogicResponse(await response.json());
      setResult(data);
      setTab("overview");
      const initialProbe = Object.fromEntries(data.logic.variables.map((variable) => [variable, 0]));
      setProbe(initialProbe);
      const zeroRow = data.logic.truth_table.find((row) => data.logic.variables.every((variable) => Number(row[variable] ?? 0) === 0)) ?? data.logic.truth_table[0];
      const initialOutput = Number(zeroRow?.[data.ai?.outputs?.[0] ?? "F"] ?? zeroRow?.F ?? 0);
      setHistory([{ label: "initial", value: initialOutput }]);
      requestRef.current = null;
      beep(true);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") {
        setError("The backend request timed out or was replaced by a newer request. Try again.");
      } else {
        setError(caught instanceof Error ? caught.message : "Failed to generate logic design.");
      }
    } finally {
      requestRef.current = null;
      setLoading(false);
    }
  }

  const toggleProbe = (variable: string) => {
    const next = { ...probe, [variable]: probe[variable] ? 0 : 1 };
    setProbe(next); beep(Boolean(next[variable]));
    if (result) {
      const index = result.logic.variables.reduce((acc, name, i) => acc | ((next[name] || 0) << (result.logic.variables.length - 1 - i)), 0);
      const row = result.logic.truth_table[index];
      const output = Number(row?.[result.ai?.outputs?.[0] ?? "F"] ?? row?.F ?? 0);
      setHistory((current) => [...current.slice(-31), { label: `${variable}=${next[variable]}`, value: output }]);
    }
  };

  const resetProbes = () => {
    if (!result) return;
    const next = Object.fromEntries(result.logic.variables.map((variable) => [variable, 0]));
    const zeroRow = result.logic.truth_table.find((row) => result.logic.variables.every((variable) => Number(row[variable] ?? 0) === 0)) ?? result.logic.truth_table[0];
    const output = Number(zeroRow?.[result.ai?.outputs?.[0] ?? "F"] ?? zeroRow?.F ?? 0);
    setProbe(next);
    setHistory([{ label: "reset", value: output }]);
    beep(false);
  };

  return <section id="workspace" className="mx-auto max-w-7xl px-6 pb-16 lg:px-8">
    <div className="mb-7 max-w-3xl"><p className="text-sm font-bold text-cyan">01 / LOGIC SYNTHESIS</p><h1 className="mt-2 text-3xl font-bold tracking-tight text-ink sm:text-4xl">Define the problem. Then see the hardware.</h1><p className="mt-3 text-base leading-7 text-slate-600">Your original two-panel LogicFlow workflow stays intact. The right panel now hosts the deeper engineering views without crowding the input side.</p></div>
    <div className="grid items-start gap-6 xl:grid-cols-[1.06fr_.94fr]">
      <motion.div initial={{ opacity: 0, x: -15 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, amount: .1 }} transition={{ duration: .45 }} className="color-card color-card-cyan rounded-3xl border border-slate-200 bg-white p-5 shadow-panel sm:p-7">
        <div className="flex flex-col justify-between gap-4 border-b border-slate-100 pb-5 sm:flex-row sm:items-center"><div><p className="text-sm font-bold text-cyan">01 / DEFINE</p><h2 className="mt-1 text-xl font-bold">What are you solving?</h2></div><span className="w-fit rounded-full bg-mango/10 px-3 py-1 text-xs font-medium text-mango">{loading ? "Synthesizing…" : "Ready for input"}</span></div>
        <label className="mt-6 block text-sm font-semibold text-slate-700">Input format</label>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">{(Object.keys(inputHelp) as InputKind[]).map((option) => <button key={option} type="button" onClick={() => switchKind(option)} className={cn("rounded-xl border px-3 py-3 text-left text-sm font-semibold transition", inputKind === option ? "border-pink bg-pink/5 text-pink shadow-sm" : "border-slate-200 text-slate-600 hover:border-mango/70")}>{option}</button>)}</div>
        <div className="mt-6 flex items-end justify-between gap-4"><div><label className="block text-sm font-semibold text-slate-700">{help.title}</label><p className="mt-1 text-xs leading-5 text-slate-500">{help.helper}</p></div><span className="hidden rounded-md bg-slate-100 px-2 py-1 font-mono text-[10px] text-slate-500 sm:block">CTRL / ⌘ + ENTER</span></div>
        <textarea value={value} onChange={(event) => { setValue(event.target.value); setResult(null); }} placeholder={help.placeholder} className="mt-3 min-h-36 w-full resize-y rounded-xl border border-slate-200 bg-slate-50 p-4 font-mono text-sm leading-6 text-ink outline-none transition placeholder:text-slate-400 focus:border-cyan focus:bg-white focus:ring-4 focus:ring-cyan/10" />
        <div className="mt-6 border-t border-slate-100 pt-5"><p className="text-sm font-bold text-cyan">02 / IMPLEMENT</p><h3 className="mt-1 text-base font-bold">Choose a gate family</h3><div className="mt-3 grid gap-2 sm:grid-cols-3">{modes.map((item) => { const active = mode === item.name; const activeTone = item.tone === "cyan" ? "border-cyan bg-cyan/5 ring-1 ring-cyan" : item.tone === "violet" ? "border-violet bg-violet/5 ring-1 ring-violet" : "border-amber bg-amber/5 ring-1 ring-amber"; return <button key={item.name} type="button" onClick={() => { setMode(item.name); reset(); beep(true); }} className={cn("rounded-xl border p-3 text-left transition", active ? activeTone : "border-slate-200 hover:border-slate-300")}><span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold uppercase", active ? "bg-cyan text-white" : "bg-slate-100 text-slate-500")}>{item.tag}</span><p className="mt-2 text-sm font-bold">{item.name}</p><p className="mt-0.5 text-xs text-slate-500">{item.description}</p></button>; })}</div></div>
        <button id="logic-generate-button" type="button" onClick={generate} aria-busy={loading} disabled={!value.trim() || loading} className="mt-6 flex w-full items-center justify-between rounded-2xl bg-gradient-to-r from-coral via-pink to-violet px-5 py-4 text-sm font-bold text-white shadow-lg shadow-pink/20 transition hover:-translate-y-0.5 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"><span>{loading ? "Generating logic design…" : "Generate logic design"}</span><span aria-hidden>{loading ? "⟳" : "→"}</span></button>
        {error && <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm leading-5 text-red-600">{error}</div>}
      </motion.div>

      <motion.div initial={{ opacity: 0, x: 15 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, amount: .1 }} transition={{ duration: .45, delay: .05 }} className="color-card color-card-pink relative min-h-[620px] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-panel">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-5 sm:px-7"><div><p className="text-sm font-bold text-cyan">03 / RESULTS</p><h2 className="mt-1 text-xl font-bold">Logic implementation</h2></div>{result && <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-600">Generated</span>}</div>
        {!result ? <div className="grid min-h-[560px] place-items-center p-8 text-center"><div><div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-violet/10 text-3xl text-violet">⌘</div><h3 className="mt-5 text-lg font-bold">Your design will appear here</h3><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500">Enter an input, choose an implementation family, and generate. The result panel will open into truth tables, K-maps, a routed gate schematic, signal history and exports.</p></div></div> : <AnimatePresence mode="wait"><motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="p-5 sm:p-7">
          <div className="result-tab-row">{tabs.map(([id, label]) => <button key={id} type="button" onClick={() => { setTab(id); beep(true); }} className={cn("result-tab", tab === id && "is-active")}>{label}</button>)}</div>
          <ProbeControls variables={result.logic.variables} probe={probe} onToggle={toggleProbe} onReset={resetProbes} />
          {tab === "overview" && <div className="pt-5"><div className="rounded-2xl bg-ink p-5 text-white"><div className="flex items-center justify-between gap-3"><p className="text-xs font-bold uppercase tracking-wider text-cyan">Simplified expression</p><button type="button" onClick={async () => { try { if (!navigator.clipboard) throw new Error("Clipboard access is unavailable in this browser."); await navigator.clipboard.writeText(result.logic.simplified_sop); setCopied(true); window.setTimeout(() => setCopied(false), 1200); beep(true); } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not copy the expression."); } }} className="rounded-md bg-white/10 px-2.5 py-1 text-xs transition hover:bg-white/20">{copied ? "Copied" : "Copy"}</button></div><p className="mt-5 break-words font-mono text-2xl font-medium tracking-wide">{result.logic.simplified_sop}</p><p className="mt-2 text-xs text-slate-400">{result.logic.implementation.realized_as}</p></div><div className="mt-5 grid gap-3 sm:grid-cols-3">{[[result.logic.variable_count, "Variables"], [result.logic.implementation.fan_in, "Fan-in"], [result.logic.implementation.gate_count, "Gates used"]].map(([number, label]) => <div key={String(label)} className="rounded-xl bg-slate-50 p-3 text-center"><p className="text-lg font-bold">{number}</p><p className="text-[11px] text-slate-500">{label}</p></div>)}</div><div className="mt-5"><ImplementationPanel expression={result.logic.simplified_sop} gates={result.logic.implementation.gates} realizedAs={result.logic.implementation.realized_as} /></div><div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-bold text-slate-700">Backend explanation</p><p className="mt-2 text-sm leading-6 text-slate-600">{result.ai?.explanation ?? "Generated by the deterministic Boolean Logic Engine."}</p></div></div>}
          {tab === "truth" && <div className="pt-5"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-bold">Generated truth table</p><p className="text-xs text-slate-500">Toggle a probe to highlight the current input vector.</p></div><div className="flex flex-wrap gap-2">{result.logic.variables.map((variable) => <button key={variable} type="button" onClick={() => toggleProbe(variable)} className={cn("rounded-lg border px-3 py-2 text-xs font-bold", probe[variable] ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-500")}>{variable}: {probe[variable] || 0}</button>)}</div></div><TruthTable rows={rows} variables={result.logic.variables} activeIndex={activeIndex} /></div>}
          {tab === "kmap" && <div className="pt-5"><div className="mb-4"><p className="text-sm font-bold">Karnaugh map</p><p className="text-xs leading-5 text-slate-500">Gray-code ordering and implicant grouping are derived from the same minimization data.</p></div><KMap variables={result.logic.variables} rows={rows} implicants={minimized.implicants} /></div>}
          {tab === "circuit" && <div className="pt-5"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-bold">Generated gate schematic</p><p className="text-xs leading-5 text-slate-500">The visual language matches the interactive circuit lab: actual gate shapes, routed channels, glowing HIGH wires and active output probes.</p></div>{result.logic.circuit.image && <a href={`${API_BASE_URL}${result.logic.circuit.image}`} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-violet transition hover:border-violet/30 hover:bg-violet/5">Open source image ↗</a>}</div><AnimatedCircuit circuit={result.logic.circuit} variables={result.logic.variables} probe={probe} outputs={result.ai?.outputs ?? ["F"]} /></div>}
          {tab === "signals" && <div className="pt-5"><SignalGraph title="Output signal history" points={history} accent="#10B981" /><div className="mt-4 grid gap-2 sm:grid-cols-2">{result.logic.variables.map((variable) => <button key={variable} type="button" onClick={() => toggleProbe(variable)} className={cn("probe-card", probe[variable] ? "is-high" : "")}><div className="flex items-center justify-between"><span>Probe {variable}</span><strong>{probe[variable] || 0}</strong></div><div className="mt-2 h-1 rounded-full bg-slate-200"><div className="h-1 rounded-full bg-emerald-400 transition-all" style={{ width: probe[variable] ? "100%" : "10%" }} /></div></button>)}</div></div>}
          {tab === "exports" && <div className="pt-5"><ExportPanel result={result} rows={rows} /></div>}
        </motion.div></AnimatePresence>}
      </motion.div>
    </div>
  </section>;
}
