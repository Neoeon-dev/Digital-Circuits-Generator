"use client";

import { motion } from "framer-motion";
import { useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import type { Tone, Workspace } from "./types";


const toneClasses: Record<Tone, string> = {
  cyan: "text-cyan-300 bg-cyan-400/10 border-cyan-300/20",
  violet: "text-violet-300 bg-violet-400/10 border-violet-300/20",
  pink: "text-pink-300 bg-pink-400/10 border-pink-300/20",
  amber: "text-amber-300 bg-amber-400/10 border-amber-300/20",
  emerald: "text-emerald-300 bg-emerald-400/10 border-emerald-300/20",
  blue: "text-blue-300 bg-blue-400/10 border-blue-300/20",
};

export function Tag({ children, tone = "cyan" }: { children: ReactNode; tone?: Tone }) {
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[.18em] ${toneClasses[tone]}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current shadow-[0_0_12px_currentColor]" />
      {children}
    </span>
  );
}

export function Panel({ children, className = "", tone = "cyan" }: { children: ReactNode; className?: string; tone?: Tone }) {
  const glow = {
    cyan: "lf-glow-cyan",
    violet: "lf-glow-violet",
    amber: "lf-glow-amber",
    pink: "lf-glow-violet",
    emerald: "lf-glow-cyan",
    blue: "lf-glow-cyan",
  }[tone];
  return <section className={`lf-panel ${glow} ${className}`}>{children}</section>;
}

export function Header({ workspace, setWorkspace, dark, toggleTheme, sound, toggleSound, savedCount, openShortcuts }: {
  workspace: Workspace;
  setWorkspace: Dispatch<SetStateAction<Workspace>>;
  dark: boolean;
  toggleTheme: () => void;
  sound: boolean;
  toggleSound: () => void;
  savedCount: number;
  openShortcuts: () => void;
}) {
  const items: [Workspace, string, string][] = [
    ["studio", "01", "Studio"],
    ["solver", "02", "Logic Solver"],
    ["circuits", "03", "Circuit Lab"],
    ["canvas", "04", "Canvas"],
    ["display", "05", "7-Segment"],
    ["docs", "06", "API / Docs"],
  ];
  return (
    <header className="sticky top-0 z-50 border-b lf-header backdrop-blur-2xl">
      <div className="mx-auto flex h-[72px] max-w-[1540px] items-center gap-4 px-4 lg:px-8">
        <button onClick={() => setWorkspace("studio")} className="mr-auto flex items-center gap-3 text-left">
          <span className="grid h-11 w-11 place-items-center rounded-2xl border lf-border bg-gradient-to-br from-cyan-300/10 via-violet-300/10 to-pink-300/10 text-sm font-black lf-text shadow-[0_0_35px_rgba(34,211,238,.12)]">L</span>
          <span className="hidden sm:block">
            <span className="block text-sm font-black lf-text">LogicFlow</span>
            <span className="block text-[9px] font-bold uppercase tracking-[.18em] lf-muted">Digital Logic Studio</span>
          </span>
        </button>

        <nav className="hidden rounded-2xl border lf-border bg-black/5 p-1.5 md:flex dark:bg-white/[.03]">
          {items.map(([id, index, label]) => (
            <button key={id} onClick={() => setWorkspace(id)} className={`rounded-xl px-3 py-2 text-[10px] font-black transition sm:px-3.5 ${workspace === id ? "bg-cyan-300/10 text-cyan-300" : "lf-muted hover:bg-black/5 hover:text-[var(--lf-text)] dark:hover:bg-white/[.04]"}`}>
              <span className="mr-1.5 font-mono text-[8px] opacity-60">{index}</span>{label}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-1.5">
          <button onClick={openShortcuts} className="grid h-10 w-10 place-items-center rounded-xl border lf-border lf-surface text-sm lf-text transition hover:border-cyan-300/30 hover:text-cyan-300" aria-label="Keyboard shortcuts">?</button>
          <button onClick={toggleSound} className="grid h-10 w-10 place-items-center rounded-xl border lf-border lf-surface text-sm transition hover:border-cyan-300/30" aria-label="Toggle sound">{sound ? "◉" : "○"}</button>
          <button onClick={toggleTheme} className="grid h-10 w-10 place-items-center rounded-xl border lf-border lf-surface text-sm transition hover:border-violet-300/30" aria-label="Toggle theme">{dark ? "☼" : "☾"}</button>
          <span className="hidden rounded-xl border lf-border bg-black/5 px-3 py-2 text-[9px] font-black uppercase tracking-wider lf-muted dark:bg-white/[.03] sm:block">{savedCount} saved</span>
        </div>
      </div>
    </header>
  );
}

function QuickGateLab() {
  const [a, setA] = useState(0);
  const [b, setB] = useState(0);
  const gates = [
    ["AND", a & b, "cyan"],
    ["OR", a | b, "blue"],
    ["XOR", a ^ b, "violet"],
    ["NAND", Number(!(a & b)), "pink"],
    ["NOR", Number(!(a | b)), "amber"],
  ] as const;
  return (
    <Panel className="p-5 lg:p-7" tone="violet">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Tag tone="violet">Live quick lab</Tag>
          <h3 className="mt-3 text-xl font-black lf-text">Probe five gate families.</h3>
          <p className="mt-1 text-sm lf-muted">A small interactive preview that makes the studio feel alive before you generate anything.</p>
        </div>
        <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-[9px] font-black uppercase tracking-wider text-emerald-400">Live</span>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3">
        {[
          { label: 'A', value: a, setter: setA },
          { label: 'B', value: b, setter: setB }
        ].map(({ label, value, setter }) => (
          <button key={label} onClick={() => setter(value === 0 ? 1 : 0)} className="rounded-2xl border lf-border lf-surface-2 p-4 text-left transition hover:-translate-y-0.5 hover:border-cyan-300/30">
            <span className="text-[10px] font-black uppercase tracking-wider lf-muted">Input {label}</span>
            <span className={`mt-3 block font-mono text-3xl font-black ${value ? "text-emerald-300 drop-shadow-[0_0_15px_rgba(52,211,153,.45)]" : "lf-text"}`}>{value}</span>
          </button>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-5 gap-2">
        {gates.map(([name, value, tone], i) => (
          <motion.div key={name} animate={{ scale: value ? 1.02 : 1 }} className={`rounded-xl border lf-border p-3 text-center ${value ? `bg-${tone}-400/10` : "lf-surface"}`}>
            <div className="text-[9px] font-black uppercase tracking-wider lf-muted">{name}</div>
            <div className={`mt-2 font-mono text-xl font-black ${value ? "text-emerald-300" : "lf-muted"}`}>{value}</div>
          </motion.div>
        ))}
      </div>
    </Panel>
  );
}

export function StudioHome({ onGo }: { onGo: (workspace: Workspace) => void }) {
  const cards: { tone: Tone; icon: string; title: string; description: string; target: Workspace }[] = [
    { tone: "cyan", icon: "Σ", title: "Logic Synthesis", description: "Truth tables · K-maps · live probes · generated schematics", target: "solver" },
    { tone: "violet", icon: "▦", title: "Circuit Lab", description: "18 combinational blocks · ripple signals · timing analyzer", target: "circuits" },
    { tone: "amber", icon: "8", title: "7-Segment Lab", description: "BCD · HEX · polarity · phosphor colors · clock analyzer", target: "display" },
    { tone: "emerald", icon: "⌘", title: "API Surface", description: "OpenAPI discovery · verified endpoints · backend contract", target: "docs" },
  ];

  return (
    <div className="relative mx-auto max-w-[1540px] px-4 pb-16 pt-12 lg:px-8 lg:pt-16">
      <div className="pointer-events-none absolute left-[-12%] top-20 h-80 w-80 rounded-full bg-cyan-300/10 blur-[120px]" />
      <div className="pointer-events-none absolute right-[-8%] top-16 h-96 w-96 rounded-full bg-violet-300/10 blur-[130px]" />
      <div className="grid items-end gap-8 xl:grid-cols-[1.05fr_.95fr]">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .55 }}>
          <Tag>Interactive digital hardware studio</Tag>
          <h1 className="mt-6 max-w-4xl text-5xl font-black leading-[.94] tracking-[-.05em] lf-text sm:text-7xl lg:text-[6.4rem]">Turn Boolean ideas into <span className="bg-gradient-to-r from-cyan-300 via-violet-400 to-pink-400 bg-clip-text text-transparent">working hardware.</span></h1>
          <p className="mt-7 max-w-2xl text-base leading-7 lf-body sm:text-lg">Your original workflow stays at the center. Around it: visual minimization, interactive schematics, signal probing, circuit experiments, timing diagrams, exports, and a hardware-style interface.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <button onClick={() => onGo("solver")} className="lf-button-primary rounded-2xl px-5 py-3 text-sm font-black transition hover:-translate-y-0.5">Open logic workspace →</button>
            <button onClick={() => onGo("circuits")} className="rounded-2xl border lf-border lf-surface px-5 py-3 text-sm font-black lf-text transition hover:-translate-y-0.5 hover:border-violet-300/30">Explore 18 circuits</button>
          </div>
        </motion.div>
        <motion.div initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: .6, delay: .12 }}>
          <QuickGateLab />
        </motion.div>
      </div>

      <div className="mt-14 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card, i) => (
          <motion.button key={card.title} onClick={() => onGo(card.target)} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .45, delay: .08 * i }} className="group text-left">
            <Panel className="h-full p-5 transition duration-300 group-hover:-translate-y-1 group-hover:shadow-[0_28px_90px_rgba(15,23,42,.18)]" tone={card.tone}>
              <span className={`grid h-11 w-11 place-items-center rounded-2xl border text-sm font-black ${toneClasses[card.tone]}`}>{card.icon}</span>
              <h3 className="mt-6 text-lg font-black lf-text">{card.title}</h3>
              <p className="mt-2 min-h-12 text-sm leading-6 lf-muted">{card.description}</p>
              <span className="mt-6 inline-flex text-xs font-black lf-body group-hover:text-cyan-300">Open workspace →</span>
            </Panel>
          </motion.button>
        ))}
      </div>

      <div className="mt-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border lf-border lf-surface px-4 py-3 text-[10px] font-black uppercase tracking-[.18em] lf-muted">
        <span>BUILD · PROBE · VERIFY · SYNTHESIZE</span>
        <span>DESIGNED FOR DIGITAL LOGIC EXPLORATION</span>
      </div>
    </div>
  );
}