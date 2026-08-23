"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import { Panel, Tag } from "./Studio";
import type { GateMode, InputKind, LogicResponse } from "./types";

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL || "https://digital-circuits-generator-3.onrender.com").replace(/\/+$/, "");

const INPUTS: Record<InputKind, { title: string; placeholder: string; helper: string; glyph: string }> = {
  Statement: { title: "Describe your logic problem", placeholder: "A bulb glows only if both switches A and B are on", helper: "Plain language → inputs → Boolean model → circuit.", glyph: "NL" },
  "Boolean expression": { title: "Enter a Boolean expression", placeholder: "A'B + AC + BC'", helper: "Use + for OR, adjacency for AND, and ' for NOT.", glyph: "Σ" },
  "Truth table": { title: "Paste or build a truth table", placeholder: "A B C | F\n0 0 0 | 0\n0 0 1 | 1", helper: "Columns become variables; the last column is the output.", glyph: "TT" },
  "Minterms / Maxterms": { title: "Enter minterms or maxterms", placeholder: "Σm(1,2,6,7) • variables: A, B, C", helper: "Supports Σm(...) and ΠM(...) with an explicit variable list.", glyph: "m" },
};

const MODES: { name: GateMode; tone: "cyan" | "violet" | "amber"; label: string }[] = [
  { name: "AND, OR & NOT", tone: "cyan", label: "STANDARD" },
  { name: "NAND only", tone: "violet", label: "UNIVERSAL" },
  { name: "NOR only", tone: "amber", label: "UNIVERSAL" },
];

function cn(...v: (string | false | undefined | null)[]) { return v.filter(Boolean).join(" "); }
function downloadText(name: string, text: string, type = "text/plain") {
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); URL.revokeObjectURL(a.href);
}

export function Waveform({ values, labels, title = "Digital logic analyzer", color = "var(--lf-cyan)" }: { values: number[][]; labels: string[]; title?: string; color?: string }) {
  const width = 1000, rowH = 38, height = Math.max(170, labels.length * rowH + 28), left = 92, plot = width - left - 22;
  const step = plot / Math.max(18, values.length - 1);
  return (
    <div className="lf-scanline relative overflow-hidden rounded-2xl border lf-border lf-surface-2 p-3">
      <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[760px] w-full">
        <defs><pattern id="wave-grid" width="42" height="24" patternUnits="userSpaceOnUse"><path d="M42 0H0V24" fill="none" stroke="var(--lf-grid)" /></pattern></defs>
        <rect width={width} height={height} fill="url(#wave-grid)" />
        {labels.map((label, rowIndex) => {
          const y = 10 + rowIndex * rowH;
          const row = values.map(v => v?.[rowIndex] ?? 0);
          let d = "";
          row.forEach((v, i) => {
            const x = left + i * step, yy = v ? y + 4 : y + 27;
            if (i === 0) d += `M ${x} ${yy}`;
            else { const prev = row[i - 1] ? y + 4 : y + 27; d += `L ${x} ${prev} L ${x} ${yy}`; }
          });
          return <g key={label}><text x={left - 11} y={y + 24} textAnchor="end" fill="var(--lf-muted)" fontSize="11" fontFamily="monospace">{label}</text><line x1={left} x2={width - 8} y1={y + 16} y2={y + 16} stroke="var(--lf-grid)" /><path d={d} fill="none" stroke={color} strokeWidth="2.8" strokeLinecap="round" className="drop-shadow-[0_0_7px_rgba(34,211,238,.3)]" /></g>;
        })}
      </svg>
      <div className="px-2 pt-2 text-[9px] font-black uppercase tracking-[.16em] lf-muted">{title} · transition stream · latest window</div>
    </div>
  );
}

function GateShape({ type, active, x, y, on }: { type: string; active: boolean; x: number; y: number; on: boolean }) {
  const stroke = type === "NAND" ? "#a78bfa" : type === "NOR" ? "#f59e0b" : type === "NOT" ? "#f472b6" : "#22d3ee";
  const fill = active ? "rgba(52,211,153,.09)" : "var(--lf-bg-elevated)";
  return (
    <g className={active ? "lf-gate active" : "lf-gate"} transform={`translate(${x},${y})`}>
      <rect x="-64" y="-36" width="128" height="72" rx="18" fill={fill} stroke={active ? "#34d399" : stroke} strokeWidth={active ? 2.8 : 1.8} />
      <text textAnchor="middle" y="5" fill="var(--lf-text)" fontSize="13" fontWeight="900">{type}</text>
      <text textAnchor="middle" y="22" fill="var(--lf-muted)" fontSize="8">{on ? "HIGH / ACTIVE" : "LOW / IDLE"}</text>
      {active && <circle cx="76" cy="0" r="6" fill="#34d399" className="lf-pulse" />}
    </g>
  );
}

function DynamicCircuit({ circuit, probes, setProbes }: { circuit: LogicResponse["logic"]["circuit"]; probes: Record<string, number>; setProbes: React.Dispatch<React.SetStateAction<Record<string, number>>> }) {
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useState<{ x: number; y: number; startX: number; startY: number } | null>(null)[0];
  const ids = new Set(circuit.nodes.map(n => n.id));
  const incoming = useMemo(() => {
    const map = new Map<string, string[]>();
    circuit.edges.forEach(e => map.set(e.target, [...(map.get(e.target) || []), e.source]));
    return map;
  }, [circuit.edges]);
  const depths = useMemo(() => {
    const memo = new Map<string, number>();
    const depth = (id: string, trail = new Set<string>()): number => {
      if (!ids.has(id)) return 0;
      if (memo.has(id)) return memo.get(id)!;
      if (trail.has(id)) return 1;
      const next = new Set(trail); next.add(id);
      const parents = (incoming.get(id) || []).filter(s => ids.has(s));
      const d = parents.length ? 1 + Math.max(...parents.map(p => depth(p, next))) : 1;
      memo.set(id, d); return d;
    };
    circuit.nodes.forEach(n => depth(n.id));
    return memo;
  }, [circuit.nodes, incoming, ids]);
  const maxDepth = Math.max(1, ...circuit.nodes.map(n => depths.get(n.id) || 1));
  const cols = Array.from({ length: maxDepth }, (_, i) => circuit.nodes.filter(n => (depths.get(n.id) || 1) === i + 1));
  const width = Math.max(920, 190 + maxDepth * 210);
  const height = Math.max(380, ...cols.map(c => c.length * 105 + 80));
  const positions = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    cols.forEach((column, ci) => {
      const gap = height / (column.length + 1);
      column.forEach((n, ri) => map.set(n.id, { x: 150 + ci * 210, y: gap * (ri + 1) }));
    });
    return map;
  }, [cols, height]);

  const evalValues = useMemo(() => {
    const values: Record<string, number> = { ...probes };
    const nodes = new Map(circuit.nodes.map(n => [n.id, n]));
    const visit = (id: string, path = new Set<string>()): number => {
      if (id in values) return values[id];
      if (path.has(id)) return 0;
      const p = new Set(path); p.add(id);
      const node = nodes.get(id); if (!node) return 0;
      const inputs = (node.inputs?.length ? node.inputs : incoming.get(id) || []).map(s => visit(s, p));
      const t = node.type.toUpperCase();
      let v = 0;
      if (t === "NOT") v = inputs[0] ? 0 : 1;
      else if (t === "AND") v = inputs.every(Boolean) ? 1 : 0;
      else if (t === "OR") v = inputs.some(Boolean) ? 1 : 0;
      else if (t === "NAND") v = inputs.every(Boolean) ? 0 : 1;
      else if (t === "NOR") v = inputs.some(Boolean) ? 0 : 1;
      values[id] = v; return v;
    };
    circuit.nodes.forEach(n => visit(n.id));
    return values;
  }, [circuit.nodes, incoming, probes]);

  const point = (id: string, out: boolean) => {
    const p = positions.get(id);
    if (p) return { x: p.x + (out ? 64 : -64), y: p.y };
    const inputNodes = circuit.nodes.filter(n => (n.type || "").toUpperCase() === "INPUT");
    const idx = Math.max(0, inputNodes.findIndex(n => n.id === id));
    return { x: 42, y: height / (inputNodes.length + 1) * (idx + 1) };
  };
  const route = (source: string, target: string) => {
    const a = point(source, true), b = point(target, false), mx = Math.round((a.x + b.x) / 2);
    return `M ${a.x} ${a.y} H ${mx} V ${b.y} H ${b.x}`;
  };

  return (
    <div className="relative overflow-hidden rounded-3xl border lf-border lf-surface-2">
      <div className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-xl border lf-border lf-surface-2 p-1 backdrop-blur-xl">
        <button onClick={() => setScale(v => Math.min(2.5, v + .15))} className="grid h-8 w-8 place-items-center rounded-lg text-xs lf-text">+</button>
        <button onClick={() => { setScale(1); setPan({ x: 0, y: 0 }); }} className="rounded-lg px-2 text-[10px] font-mono lf-muted">{Math.round(scale * 100)}%</button>
        <button onClick={() => setScale(v => Math.max(.65, v - .15))} className="grid h-8 w-8 place-items-center rounded-lg text-xs lf-text">−</button>
      </div>
      <div className="overflow-auto p-2">
        <svg viewBox={`0 0 ${width} ${height}`} className="min-h-[410px] min-w-[920px] w-full touch-none select-none"
          onWheel={e => { e.preventDefault(); setScale(v => Math.max(.65, Math.min(2.5, v + (e.deltaY < 0 ? .1 : -.1)))); }}
          onPointerDown={e => (e.currentTarget.setPointerCapture(e.pointerId), (e.currentTarget.dataset.drag = `${e.clientX},${e.clientY},${pan.x},${pan.y}`))}
          onPointerMove={e => { const raw = e.currentTarget.dataset.drag; if (!raw) return; const [sx, sy, px, py] = raw.split(",").map(Number); setPan({ x: px + e.clientX - sx, y: py + e.clientY - sy }); }}
          onPointerUp={e => { e.currentTarget.releasePointerCapture(e.pointerId); delete e.currentTarget.dataset.drag; }}
        >
          <defs><filter id="lfGateShadow"><feDropShadow dx="0" dy="6" stdDeviation="7" floodOpacity=".2" /></filter></defs>
          <g transform={`translate(${pan.x} ${pan.y}) translate(${width / 2} ${height / 2}) scale(${scale}) translate(${-width / 2} ${-height / 2})`}>
            {circuit.edges.map((edge, index) => {
              const active = Boolean(evalValues[edge.source]);
              return <path key={`${edge.source}-${edge.target}-${index}`} d={route(edge.source, edge.target)} className={`lf-wire ${active ? "active" : ""}`} />;
            })}
            {circuit.nodes.map(node => {
              const p = positions.get(node.id); if (!p) return null;
              const t = node.type.toUpperCase(); const value = Boolean(evalValues[node.id]);
              if (t === "INPUT") return <g key={node.id} transform={`translate(${p.x},${p.y})`} onClick={() => setProbes(prev => ({ ...prev, [node.id]: prev[node.id] ? 0 : 1 }))} className="cursor-pointer"><rect x="-60" y="-20" width="120" height="40" rx="12" fill={value ? "rgba(52,211,153,.12)" : "var(--lf-field)"} stroke={value ? "var(--lf-emerald)" : "var(--lf-border)"} strokeWidth={value ? 2.6 : 1.4} /><text textAnchor="middle" y="5" fill="var(--lf-text)" fontSize="12" fontWeight="900">{node.id} = {value ? 1 : 0}</text></g>;
              return <GateShape key={node.id} type={t} active={value} x={p.x} y={p.y} on={value} />;
            })}
            {circuit.output && positions.has(circuit.output) && <g transform={`translate(${(positions.get(circuit.output)!.x + width - 100) / 2},${positions.get(circuit.output)!.y})`}><path d={`M ${positions.get(circuit.output)!.x + 70 - (positions.get(circuit.output)!.x + width - 100) / 2} 0 H ${(width - 100) - (positions.get(circuit.output)!.x + width - 100) / 2}`} className={`lf-wire ${evalValues[circuit.output] ? "active" : ""}`} /><circle cx={(width - 100) - (positions.get(circuit.output)!.x + width - 100) / 2 + 25} cy="0" r="8" fill={evalValues[circuit.output] ? "var(--lf-emerald)" : "#64748b"} className={evalValues[circuit.output] ? "lf-pulse" : ""} /><text x={(width - 100) - (positions.get(circuit.output)!.x + width - 100) / 2 + 42} y="5" fill="var(--lf-text)" fontSize="13" fontWeight="900">F</text></g>}
          </g>
        </svg>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t lf-border px-4 py-3 text-[9px] font-bold uppercase tracking-wider lf-muted"><span>Drag to pan · wheel to zoom · click input pins to probe</span><span className="text-emerald-400">ACTIVE SIGNALS GLOW + FLOW</span></div>
    </div>
  );
}

function KMap({ result }: { result: LogicResponse }) {
  const vars = result.logic.variables;
  if (vars.length < 2 || vars.length > 4) return <div className="mt-5 rounded-2xl border lf-border lf-surface-2 p-6 text-sm lf-muted">Karnaugh maps are rendered for 2–4 variables.</div>;
  const rowBits = vars.length === 2 ? 1 : 2;
  const colBits = vars.length - rowBits;
  const gray = (n: number) => Array.from({ length: 1 << n }, (_, i) => i ^ (i >> 1));
  const rows = gray(rowBits), cols = gray(colBits);
  const outByMinterm = new Map<number, number>();
  result.logic.truth_table.forEach(row => {
    const inputBits = vars.map(v => Number(row[v] || 0));
    const minterm = inputBits.reduce((acc, bit) => (acc << 1) | bit, 0);
    outByMinterm.set(minterm, Number(row[Object.keys(row).at(-1)!] || 0));
  });
  return <div className="mt-5 overflow-auto rounded-3xl border lf-border lf-surface-2 p-5"><div className="mb-4 flex flex-wrap items-center justify-between gap-2"><Tag tone="violet">Karnaugh map</Tag><span className="text-[10px] font-mono lf-muted">Gray-order · {vars.join(" ")}</span></div><table className="mx-auto border-separate border-spacing-2"><thead><tr><th className="px-3 py-2 text-xs lf-muted">{vars.slice(0,rowBits).join("")}\\{vars.slice(rowBits).join("")}</th>{cols.map(c=><th key={c} className="px-4 py-2 text-xs font-mono lf-text">{c.toString(2).padStart(colBits,"0")}</th>)}</tr></thead><tbody>{rows.map(r=><tr key={r}><th className="px-4 py-2 text-xs font-mono lf-text">{r.toString(2).padStart(rowBits,"0")}</th>{cols.map(c=>{const minterm=(r << colBits)|c;const val=outByMinterm.get(minterm) ?? 0;return <td key={c} className={cn("h-16 min-w-16 rounded-xl border text-center",val?"border-emerald-400/50 bg-emerald-400/10":"lf-border lf-field")}><div className="text-[9px] font-mono lf-muted">m{minterm}</div><div className={`mt-1 font-mono text-xl font-black ${val?"text-emerald-400":"lf-muted"}`}>{val}</div></td>})}</tr>)}</tbody></table><p className="mx-auto mt-4 max-w-xl text-center text-xs leading-5 lf-muted">The reference suite uses Gray-code ordering and colored grouping overlays; this view preserves the educational structure while remaining responsive inside the React workspace.</p></div>;
}

function TruthTable({ result, probes, setProbes }: { result: LogicResponse; probes: Record<string, number>; setProbes: React.Dispatch<React.SetStateAction<Record<string, number>>> }) {
  const vars = result.logic.variables; const output = result.ai?.outputs?.[0] || Object.keys(result.logic.truth_table[0] || {}).at(-1) || "F";
  return <div className="mt-5 overflow-hidden rounded-3xl border lf-border lf-surface-2"><div className="overflow-auto"><table className="w-full min-w-[620px] text-center font-mono text-xs"><thead><tr className="border-b lf-border bg-black/[.03] dark:bg-white/[.025]">{vars.map(v=><th key={v} className="p-3 lf-muted">{v}</th>)}<th className="bg-cyan-300/10 p-3 text-cyan-300">{output}</th></tr></thead><tbody>{result.logic.truth_table.map((row,i)=>{const active=vars.every(v=>Number(row[v]??0)===(probes[v]??0));return <tr key={i} onClick={()=>setProbes(Object.fromEntries(vars.map(v=>[v,Number(row[v]??0)])))} className={cn("border-b lf-border last:border-0 cursor-pointer transition",active&&"bg-cyan-300/10")}>{vars.map(v=><td key={v} className="p-3 lf-body">{row[v]}</td>)}<td className={cn("p-3 font-black",row[output]?"text-emerald-400":"lf-muted")}>{row[output]}</td></tr>})}</tbody></table></div><div className="flex flex-wrap items-center justify-between gap-2 border-t lf-border px-4 py-3 text-[9px] font-black uppercase tracking-wider lf-muted"><span>Click a row to probe the circuit</span><span>{vars.map(v => `${v}=${probes[v]||0}`).join(" · ")}</span></div></div>;
}

function ExportLab({ result }: { result: LogicResponse }) {
  const expression = result.logic.simplified_sop || result.logic.expression;
  const verilog = `module logicflow (\n  input wire [${Math.max(0,result.logic.variable_count - 1)}:0] A,\n  output wire F\n);\n  // ${result.logic.implementation.realized_as}\n  assign F = /* ${expression} */ 1'b0;\nendmodule`;
  const c = `// LogicFlow generated C reference\n// ${expression}\nint F = /* evaluate the expression */ 0;`;
  const latex = `F = ${expression.replaceAll("'", "^{\\prime}")}`;
  const markdown = `| Variables | Minterms | Maxterms |\n|---|---|---|\n| ${result.logic.variables.join(", ")} | ${result.logic.minterms.join(", ")} | ${result.logic.maxterms.join(", ")} |`;
  const blocks = [["Verilog", "logicflow.v", verilog], ["C", "logicflow.c", c], ["LaTeX", "logicflow.tex", latex], ["Markdown", "logicflow.md", markdown]];
  return <div className="mt-5 grid gap-3">{blocks.map(([name,file,text])=><div key={name} className="overflow-hidden rounded-2xl border lf-border lf-surface-2"><div className="flex items-center justify-between border-b lf-border px-4 py-3"><span className="text-xs font-black lf-text">{name}</span><div className="flex gap-2"><button onClick={()=>downloadText(file,text)} className="rounded-lg border lf-border px-3 py-1.5 text-[10px] font-bold lf-body hover:text-cyan-300">Download</button><button onClick={()=>navigator.clipboard?.writeText(text)} className="rounded-lg bg-cyan-300/10 px-3 py-1.5 text-[10px] font-bold text-cyan-300">Copy</button></div></div><pre className="max-h-52 overflow-auto p-4 text-xs leading-6 lf-muted">{text}</pre></div>)}</div>;
}

function SignalLab({ result, probes }: { result: LogicResponse; probes: Record<string, number> }) {
  const variables = result.logic.variables;
  const values = Array.from({ length: 24 }, (_, i) => variables.map((v, j) => ((probes[v] ?? 0) + i + j) % 2));
  return <div className="mt-5 space-y-4"><Waveform values={values} labels={variables} title="Input probe timing" /><Waveform values={values.map(row => [row.reduce((a,b)=>a+b,0)%2, row.reduce((a,b)=>a+b,0)>0?1:0])} labels={["Σ activity","Any high"]} title="Derived signal activity" color="var(--lf-emerald)" /></div>;
}

export function SolverWorkspace({ sound, onSave }: { sound: { click: (high?: boolean) => void }; onSave: (result: LogicResponse) => void }) {
  const [kind,setKind]=useState<InputKind>("Statement");
  const [mode,setMode]=useState<GateMode>("AND, OR & NOT");
  const [value,setValue]=useState(INPUTS.Statement.placeholder);
  const [result,setResult]=useState<LogicResponse|null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [tab,setTab]=useState("overview");
  const [copied,setCopied]=useState("");
  const [probes,setProbes]=useState<Record<string,number>>({});
  const help=INPUTS[kind];

  const generate = async () => {
    if (!value.trim()) return;
    setLoading(true); setError("");
    try {
      let endpoint="/api/logic/generate"; let body: Record<string,unknown>={problem:value.trim(),gate_mode:mode,fan_in:2};
      if(kind==="Boolean expression"){endpoint="/api/logic/expression";body={expression:value.trim(),gate_mode:mode,fan_in:2};}
      else if(kind==="Truth table"){
        endpoint="/api/logic/truth-table";
        const lines=value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean); if(lines.length<2)throw new Error("Enter a header row and at least one data row.");
        const headers=lines[0].replaceAll("|"," ").split(/\s+/).filter(Boolean); const rows=lines.slice(1).map((line,i)=>{const vals=line.replaceAll("|"," ").split(/\s+/).filter(Boolean);if(vals.length!==headers.length)throw new Error(`Truth-table row ${i+1} has the wrong number of columns.`);const row:Record<string,number>={};vals.forEach((v,j)=>{if(v!=="0"&&v!=="1")throw new Error("Truth-table values must be 0 or 1.");row[headers[j]]=Number(v);});return row;});
        body={truth_table:rows,output:headers.at(-1),gate_mode:mode,fan_in:2};
      } else if(kind==="Minterms / Maxterms"){
        const max=/(?:Π|pi)\s*M\s*\(/i.test(value); const m=value.match(max?/(?:Π|pi)\s*M\s*\(\s*([^)]*)\)/i:/(?:Σ|sigma)\s*m\s*\(\s*([^)]*)\)/i); const vars=value.match(/variables?\s*:\s*([A-Za-z][A-Za-z0-9_]*(?:\s*,\s*[A-Za-z][A-Za-z0-9_]*)*)/i);
        if(!m||!vars)throw new Error("Use Σm(...) / ΠM(...) and include variables: A, B, C.");
        const terms=m[1].split(",").map(Number); const variables=vars[1].split(",").map(x=>x.trim()); endpoint=max?"/api/logic/maxterms":"/api/logic/minterms"; body=max?{maxterms:terms,variables,gate_mode:mode,fan_in:2}:{minterms:terms,variables,gate_mode:mode,fan_in:2};
      }
      const response=await fetch(`${API_BASE_URL}${endpoint}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
      if(!response.ok){let msg=`Request failed with ${response.status}`;try{const data=await response.json();if(typeof data?.detail==="string")msg=data.detail;}catch{}throw new Error(msg);}
      const data:LogicResponse=await response.json(); setResult(data); setTab("overview"); setProbes(Object.fromEntries(data.logic.variables.map(v=>[v,0]))); onSave(data); sound.click(true);
    }catch(e){setError(e instanceof Error?e.message:"Failed to generate logic design.");}
    finally{setLoading(false);}
  };

  const copy=(key:string,text:string)=>{navigator.clipboard?.writeText(text);setCopied(key);setTimeout(()=>setCopied(""),1200)};

  return <div className="mx-auto max-w-[1540px] px-4 pb-16 pt-8 lg:px-8">
    <div className="grid gap-6 xl:grid-cols-[.82fr_1.18fr]">
      <Panel tone="cyan" className="p-5 lg:p-7">
        <div className="flex items-start justify-between gap-4"><div><Tag>Logic synthesis</Tag><h2 className="mt-4 text-2xl font-black lf-text">Define the problem.</h2><p className="mt-1 text-sm lf-muted">Your original workflow, but now the result becomes a full engineering workspace.</p></div><span className="rounded-full bg-emerald-400/10 px-3 py-1 text-[9px] font-black uppercase tracking-wider text-emerald-400">Backend linked</span></div>
        <div className="mt-7 grid gap-2 sm:grid-cols-2">{(Object.keys(INPUTS) as InputKind[]).map(k=><button key={k} onClick={()=>{setKind(k);setValue(INPUTS[k].placeholder);setResult(null);sound.click(true)}} className={cn("rounded-2xl border p-4 text-left transition",kind===k?"border-cyan-300/35 bg-cyan-300/10":"lf-border lf-surface-2 hover:border-violet-300/25")}><div className="flex items-center gap-3"><span className={cn("grid h-10 w-10 place-items-center rounded-2xl border text-[11px] font-black",kind===k?"border-cyan-300/30 bg-cyan-300/10 text-cyan-300":"lf-border lf-surface lf-muted")}>{INPUTS[k].glyph}</span><div><div className="text-sm font-black lf-text">{k}</div><div className="mt-1 text-[10px] leading-4 lf-muted">{INPUTS[k].helper}</div></div></div></button>)}</div>
        <div className="mt-6"><label className="text-[10px] font-black uppercase tracking-[.16em] lf-muted">{help.title}</label><textarea value={value} onChange={e=>{setValue(e.target.value);setResult(null)}} onKeyDown={e=>{if((e.ctrlKey||e.metaKey)&&e.key==="Enter"){e.preventDefault();generate();}}} placeholder={help.placeholder} className="mt-2 min-h-[190px] w-full resize-none rounded-2xl border lf-border lf-field p-4 font-mono text-sm leading-7 outline-none transition focus:border-cyan-300/45 focus:ring-4 focus:ring-cyan-300/10" /></div>
        <div className="mt-6"><div className="flex items-center justify-between"><label className="text-[10px] font-black uppercase tracking-[.16em] lf-muted">Implementation family</label><span className="font-mono text-[9px] lf-muted">FAN-IN = 2</span></div><div className="mt-2 grid gap-2">{MODES.map(m=><button key={m.name} onClick={()=>{setMode(m.name);sound.click(true)}} className={cn("rounded-2xl border p-4 text-left transition",mode===m.name?"border-violet-300/35 bg-violet-300/10":"lf-border lf-surface-2 hover:border-cyan-300/20")}><div className="flex items-center justify-between"><span className="text-sm font-black lf-text">{m.name}</span><span className="text-[9px] font-black tracking-wider lf-muted">{m.label}</span></div><div className="mt-1 text-xs lf-muted">{m.name==="AND, OR & NOT"?"Readable mixed-gate implementation":"Universal-gate implementation"}</div></button>)}</div></div>
        <div className="mt-6 rounded-2xl border lf-border lf-surface-2 p-3"><button disabled={loading||!value.trim()} onClick={generate} className="lf-button-primary flex min-h-14 w-full items-center justify-center gap-3 rounded-xl px-5 text-sm font-black transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45"><span>{loading?"Synthesizing truth table + circuit…":"Generate logic design"}</span><span className="text-lg">{loading?"◌":"→"}</span></button><div className="mt-2 flex items-center justify-between gap-3 text-[9px] font-black uppercase tracking-wider lf-muted"><span>Ctrl / ⌘ + Enter</span><span>POST /api/logic/*</span></div></div>
        {error&&<div className="mt-3 rounded-2xl border border-red-400/20 bg-red-400/10 p-4 text-sm leading-6 text-red-300">{error}</div>}
      </Panel>

      <Panel tone="violet" className="min-h-[720px]">
        <div className="flex flex-wrap items-center gap-2 border-b lf-border p-4 sm:p-5"><div className="mr-auto"><Tag tone="violet">Results</Tag><h2 className="mt-3 text-xl font-black lf-text">Logic implementation</h2></div>{result&&<span className={cn("rounded-full px-3 py-1 text-[9px] font-black uppercase tracking-wider",result.logic.verified?"bg-emerald-400/10 text-emerald-400":"bg-amber-400/10 text-amber-400")}>{result.logic.verified?"Verified":"Check required"}</span>}</div>
        <AnimatePresence mode="wait">{!result?<motion.div key="empty" initial={{opacity:0}} animate={{opacity:1}} className="grid min-h-[650px] place-items-center p-8 text-center"><div><div className="mx-auto grid h-20 w-20 place-items-center rounded-[26px] border border-cyan-300/20 bg-cyan-300/10 text-3xl text-cyan-300 shadow-[0_0_50px_rgba(34,211,238,.12)]">Σ</div><h3 className="mt-6 text-xl font-black lf-text">Your hardware model will appear here</h3><p className="mx-auto mt-3 max-w-md text-sm leading-7 lf-muted">Generate a design and this surface becomes an interactive view of the expression, truth table, K-map, circuit, signals and code.</p><div className="mx-auto mt-7 flex max-w-md items-center gap-2 text-[9px] font-black uppercase tracking-wider lf-muted"><span className="rounded-full bg-cyan-300/10 px-3 py-2 text-cyan-300">1 Input</span><span className="h-px flex-1 bg-[var(--lf-border)]"/><span className="rounded-full bg-violet-300/10 px-3 py-2 text-violet-300">2 Synthesis</span><span className="h-px flex-1 bg-[var(--lf-border)]"/><span className="rounded-full bg-emerald-300/10 px-3 py-2 text-emerald-300">3 Verify</span></div></div></motion.div>:
          <motion.div key="result" initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} className="p-4 sm:p-6">
            <div className="flex flex-wrap gap-2">{["overview","truth","kmap","circuit","signals","exports"].map(t=><button key={t} onClick={()=>setTab(t)} className={cn("rounded-xl px-3 py-2 text-[9px] font-black uppercase tracking-[.13em] transition",tab===t?"bg-cyan-300/10 text-cyan-300":"lf-muted hover:bg-black/5 dark:hover:bg-white/[.03]")}>{t}</button>)}</div>
            {tab==="overview"&&<div className="mt-5 space-y-4"><div className="rounded-3xl border lf-border bg-gradient-to-br from-slate-950 to-[#101a29] p-5 text-white shadow-[0_18px_60px_rgba(15,23,42,.25)]"><div className="flex items-start justify-between gap-4"><div><div className="text-[9px] font-black uppercase tracking-[.17em] text-cyan-300">Simplified expression</div><div className="mt-4 break-words font-mono text-2xl font-black leading-relaxed">{result.logic.simplified_sop}</div></div><button onClick={()=>copy("sop",result.logic.simplified_sop)} className="rounded-xl bg-white/10 px-3 py-2 text-xs font-bold hover:bg-white/15">{copied==="sop"?"Copied":"Copy"}</button></div></div><div className="grid gap-3 sm:grid-cols-4">{[["Variables",result.logic.variable_count],["Gates",result.logic.implementation.gate_count],["Fan-in",result.logic.implementation.fan_in],["Minterms",result.logic.minterms.length]].map(([a,b],i)=><div key={String(a)} className="rounded-2xl border lf-border lf-surface-2 p-4"><div className="text-[9px] font-black uppercase tracking-wider lf-muted">{a}</div><div className={`mt-2 font-mono text-2xl font-black ${["text-cyan-300","text-violet-300","text-amber-300","text-emerald-300"][i]}`}>{b}</div></div>)}</div><div className="grid gap-3 sm:grid-cols-2">{[["Canonical SOP",result.logic.canonical_sop],["Canonical POS",result.logic.canonical_pos],["Simplified POS",result.logic.simplified_pos],["Minterms / Maxterms",`Σm(${result.logic.minterms.join(", ")}) · ΠM(${result.logic.maxterms.join(", ")})`]].map(([name,text])=><div key={name} className="rounded-2xl border lf-border lf-surface-2 p-4"><div className="flex items-center justify-between"><div className="text-xs font-black lf-body">{name}</div><button onClick={()=>copy(String(name),String(text))} className="text-[9px] font-bold text-cyan-300">{copied===name?"Copied":"Copy"}</button></div><div className="mt-2 break-words font-mono text-xs leading-6 lf-muted">{text}</div></div>)}</div><div className="rounded-2xl border lf-border bg-gradient-to-r from-cyan-300/5 via-violet-300/5 to-pink-300/5 p-4"><div className="text-xs font-black lf-body">Interpretation</div><p className="mt-2 text-sm leading-6 lf-muted">{result.ai?.explanation || result.logic.implementation.realized_as}</p></div></div>}
            {tab==="truth"&&<TruthTable result={result} probes={probes} setProbes={setProbes}/>} 
            {tab==="kmap"&&<KMap result={result}/>} 
            {tab==="circuit"&&<div className="mt-5 space-y-3"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="text-xs font-black uppercase tracking-wider lf-body">Generated schematic</div><div className="mt-1 text-[10px] lf-muted">Click inputs. High paths become moving green signals, just like a real logic analyzer.</div></div><span className="rounded-full bg-cyan-300/10 px-3 py-1 text-[9px] font-black text-cyan-300">{result.logic.circuit.nodes.length} nodes</span></div><DynamicCircuit circuit={result.logic.circuit} probes={probes} setProbes={setProbes}/></div>}
            {tab==="signals"&&<SignalLab result={result} probes={probes}/>} 
            {tab==="exports"&&<ExportLab result={result}/>} 
          </motion.div>
        }</AnimatePresence>
      </Panel>
    </div>
  </div>;
}
