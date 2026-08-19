"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

type InputKind = "Boolean expression" | "Truth table" | "Minterms / Maxterms";
type GateMode = "AND, OR & NOT" | "NAND only" | "NOR only";
type CircuitOperation = "Half adder" | "Full adder" | "Half subtractor" | "Full subtractor" | "3-bit multiplier";

const inputHelp: Record<InputKind, { title: string; placeholder: string; helper: string }> = {
  "Boolean expression": { title: "Enter your Boolean expression", placeholder: "e.g. A'B + AC + BC'", helper: "Use + for OR, adjacency for AND, and ' for NOT." },
  "Truth table": { title: "Paste or build a truth table", placeholder: "A  B  C  |  F\n0  0  0  |  0\n0  0  1  |  1", helper: "Use columns for each variable and one output column." },
  "Minterms / Maxterms": { title: "Enter minterms or maxterms", placeholder: "e.g. Σm(1, 3, 4, 6)  •  variables: A, B, C", helper: "Use Σm(...) for minterms or ΠM(...) for maxterms." },
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
  const [kind, setKind] = useState<InputKind>("Boolean expression");
  const [mode, setMode] = useState<GateMode>("AND, OR & NOT");
  const [value, setValue] = useState("A'B + AC + BC'");
  const [generated, setGenerated] = useState(false);
  const [copied, setCopied] = useState(false);
  const [dark, setDark] = useState(false);
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

  function switchKind(next: InputKind) { setKind(next); setValue(""); setGenerated(false); }
  function generate() { setGenerated(true); setCopied(false); }
  function copyExpression() { navigator.clipboard?.writeText("A'B + AC"); setCopied(true); }
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
          <div className="mt-6 border-t border-slate-100 pt-5"><p className="text-sm font-bold text-cyan">02 / IMPLEMENT</p><h3 className="mt-1 text-base font-bold">Choose a gate family</h3><div className="mt-3 grid gap-2 sm:grid-cols-3">{modes.map((item) => <button key={item.name} onClick={() => { setMode(item.name); setGenerated(false); }} className={`rounded-xl border p-3 text-left transition ${mode === item.name ? "border-cyan bg-cyan/5 ring-1 ring-cyan" : "border-slate-200 hover:border-slate-300"}`}><span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${mode === item.name ? "bg-cyan text-white" : "bg-slate-100 text-slate-500"}`}>{item.tag}</span><p className="mt-2 text-sm font-bold">{item.name}</p><p className="mt-0.5 text-xs text-slate-500">{item.description}</p></button>)}</div></div>
          <button onClick={generate} disabled={!value.trim()} className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-coral via-pink to-violet px-5 py-4 text-sm font-bold text-white shadow-lg shadow-pink/20 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"><span>Generate logic design</span><span aria-hidden>→</span></button>
        </motion.div>

        <motion.div initial={{ opacity: 0, x: 15 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.18 }} className="color-card color-card-pink relative overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-panel">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-5 sm:px-7"><div><p className="text-sm font-bold text-cyan">03 / RESULTS</p><h2 className="mt-1 text-xl font-bold">Logic implementation</h2></div>{generated && <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-600">Generated</span>}</div>
          <AnimatePresence mode="wait">{generated ? <motion.div key="result" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="p-5 sm:p-7"><div className="rounded-2xl bg-ink p-5 text-white"><div className="flex items-center justify-between"><p className="text-xs font-bold uppercase tracking-wider text-cyan">Simplified expression</p><button onClick={copyExpression} className="rounded-md bg-white/10 px-2.5 py-1 text-xs transition hover:bg-white/20">{copied ? "Copied" : "Copy"}</button></div><p className="mt-5 font-mono text-2xl font-medium tracking-wide">A&apos;B + AC</p><p className="mt-2 text-xs text-slate-400">Minimized sum-of-products form</p></div><div className="mt-5 grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-slate-200 p-3"><p className="text-xs font-bold text-slate-700">Generated truth table</p><div className="mt-2 grid grid-cols-4 gap-px overflow-hidden rounded-md bg-slate-200 text-center font-mono text-[10px]"><span className="bg-slate-100 p-1">A</span><span className="bg-slate-100 p-1">B</span><span className="bg-slate-100 p-1">C</span><span className="bg-cyan/10 p-1 font-bold">F</span>{["0","0","0","0","0","0","1","1","0","1","0","1","1","1","1","1"].map((cell, i) => <span key={i} className="bg-white p-1">{cell}</span>)}</div></div><div className="rounded-xl border border-slate-200 p-3"><p className="text-xs font-bold text-slate-700">Implementation</p><p className="mt-2 text-sm font-bold text-violet">{mode}</p><p className="mt-1 text-xs leading-5 text-slate-500">Gate netlist and diagram supplied by your synthesis service.</p></div></div><div className="mt-5 flex items-center justify-between"><div><p className="text-sm font-bold">Circuit preview</p><p className="text-xs text-slate-500">{mode} implementation</p></div><button className="text-sm font-bold text-violet hover:underline">Open diagram ↗</button></div><div className="grid-dots mt-3 h-64 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-4"><CircuitPreview mode={mode} /></div><div className="mt-5 grid grid-cols-3 gap-2 text-center"><div className="rounded-xl bg-slate-50 p-3"><p className="text-lg font-bold">3</p><p className="text-[11px] text-slate-500">Variables</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-lg font-bold">2</p><p className="text-[11px] text-slate-500">Gate levels</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-lg font-bold">4</p><p className="text-[11px] text-slate-500">Gates used</p></div></div></motion.div> : <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid min-h-[530px] place-items-center p-8 text-center"><div><div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-violet/10 text-3xl text-violet">⌘</div><h3 className="mt-5 text-lg font-bold">Your design will appear here</h3><p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-slate-500">Enter a logic problem, pick a gate family, then generate to see the simplified result and circuit diagram.</p><div className="mx-auto mt-7 flex max-w-xs items-center gap-2 text-left text-xs text-slate-500"><span className="grid h-6 w-6 place-items-center rounded-full bg-cyan text-white">1</span><span>Input</span><span className="h-px flex-1 bg-slate-200" /><span className="grid h-6 w-6 place-items-center rounded-full bg-slate-200">2</span><span>Generate</span></div></div></motion.div>}</AnimatePresence>
        </motion.div>
      </div>
    </section>
    <CircuitLab />
    <footer id="how-it-works" className="border-t border-slate-200 bg-white"><div className="mx-auto flex max-w-7xl flex-col justify-between gap-3 px-6 py-6 text-sm text-slate-500 sm:flex-row lg:px-8"><p>LogicFlow · Build, simplify, and understand digital logic.</p><p>Designed for digital logic exploration.</p></div></footer>
  </main>;
}
