"use client";

import React, { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";

function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function ParticleField({ dark }: { dark: boolean }) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
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
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
    };
    const move = (event: PointerEvent) => {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
    };
    const draw = (now: number) => {
      const time = now * 0.00055;
      ctx.clearRect(0, 0, width, height);
      const spacing = Math.max(22, Math.min(31, width / 56));
      for (let y = 14; y < height; y += spacing) {
        for (let x = 12; x < width; x += spacing) {
          const wave = Math.sin(x * 0.011 + time * 2.2) * 12 + Math.cos(y * 0.014 - time * 1.5) * 8;
          const dx = x - pointer.x;
          const dy = y + wave - pointer.y;
          const distance = Math.hypot(dx, dy);
          const influence = Math.max(0, 1 - distance / 190);
          const push = influence * influence * 26;
          const px = x + (distance ? (dx / distance) * push : 0);
          const py = y + wave + (distance ? (dy / distance) * push : 0);
          const radius = 0.7 + influence * 2.6;
          const hue = 188 + Math.sin(x * 0.006 + time) * 30 + influence * 40;
          ctx.beginPath();
          ctx.arc(px, py, radius, 0, Math.PI * 2);
          ctx.fillStyle = dark
            ? `hsla(${hue},95%,70%,${0.12 + influence * 0.65})`
            : `hsla(${hue},80%,48%,${0.035 + influence * 0.28})`;
          ctx.fill();
        }
      }
      frame = requestAnimationFrame(draw);
    };
    resize();
    frame = requestAnimationFrame(draw);
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", move, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", move);
    };
  }, [dark]);
  return <canvas ref={canvasRef} className="particle-field" aria-hidden="true" />;
}

function KineticCursor() {
  const x = useMotionValue(-40);
  const y = useMotionValue(-40);
  const sx = useSpring(x, { stiffness: 650, damping: 35, mass: 0.3 });
  const sy = useSpring(y, { stiffness: 650, damping: 35, mass: 0.3 });
  const [hover, setHover] = useState(false);
  useEffect(() => {
    const move = (event: PointerEvent) => {
      x.set(event.clientX - 18);
      y.set(event.clientY - 18);
      setHover(Boolean((event.target as HTMLElement)?.closest("button,a,input,textarea,select")));
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => window.removeEventListener("pointermove", move);
  }, [x, y]);
  return <motion.div style={{ x: sx, y: sy }} className={cn("kinetic-cursor", hover && "is-hovering")}><span>✦</span></motion.div>;
}

function useSound() {
  const [enabled, setEnabled] = useState(true);
  const audioRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("logicflow-sound");
      if (saved !== null) setEnabled(saved !== "false");
    } catch {}
  }, []);

  useEffect(() => {
    try { localStorage.setItem("logicflow-sound", String(enabled)); } catch {}
  }, [enabled]);

  useEffect(() => () => {
    const ctx = audioRef.current;
    audioRef.current = null;
    if (ctx && ctx.state !== "closed") void ctx.close().catch(() => {});
  }, []);

  const click = useCallback((high = true) => {
    if (!enabled) return;
    try {
      const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = audioRef.current ?? new AudioCtx();
      audioRef.current = ctx;
      if (ctx.state === "suspended") void ctx.resume().catch(() => {});

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const now = ctx.currentTime;
      osc.type = high ? "triangle" : "sine";
      osc.frequency.setValueAtTime(high ? 880 : 520, now);
      osc.frequency.exponentialRampToValueAtTime(high ? 1500 : 260, now + 0.04);
      gain.gain.setValueAtTime(0.045, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.04);
    } catch {}
  }, [enabled]);

  const toggle = useCallback(() => setEnabled((value) => !value), []);
  return useMemo(() => ({ enabled, setEnabled, toggle, click }), [enabled, toggle, click]);
}

const navItems = [
  ["/workspace", "01", "Studio"],
  ["/logic-solver", "02", "Logic Solver"],
  ["/circuit-lab", "03", "Circuit Lab"],
  ["/seven-segment", "04", "8-Segment"],
] as const;

export default function StudioShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [dark, setDark] = useState<boolean>(() => {
    if (typeof document === "undefined") return true;
    const attr = document.documentElement.dataset.logicflowTheme;
    if (attr === "dark") return true;
    if (attr === "light") return false;
    try { return localStorage.getItem("logicflow-theme") !== "light"; } catch { return true; }
  });
  const sound = useSound();

  useEffect(() => {
    const theme = dark ? "dark" : "light";
    try {
      localStorage.setItem("logicflow-theme", theme);
      document.documentElement.dataset.logicflowTheme = theme;
      document.documentElement.style.colorScheme = theme;
      document.body.dataset.logicflowTheme = theme;
      document.body.style.backgroundColor = theme === "dark" ? "#080c14" : "#fff9f3";
      window.dispatchEvent(new CustomEvent("logicflow-theme-change", { detail: theme }));
    } catch {}
  }, [dark]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === "logicflow-theme" && (event.newValue === "dark" || event.newValue === "light")) {
        setDark(event.newValue === "dark");
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
      if (event.key.toLowerCase() === "t") setDark((value) => !value);
      if (event.key.toLowerCase() === "m") sound.setEnabled((value) => !value);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sound]);

  return (
    <main className={cn("colorful-ui custom-cursor relative min-h-screen overflow-hidden bg-paper text-ink transition-colors duration-300", dark ? "dark" : "light")}>
      <ParticleField dark={dark} />
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="circuit-grid absolute inset-0" />
        <div className="ambient-orb ambient-orb-one" />
        <div className="ambient-orb ambient-orb-two" />
        <div className="color-ribbon color-ribbon-one" />
        <div className="color-ribbon color-ribbon-two" />
      </div>
      <KineticCursor />

      <header className="site-nav mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-8">
        <Link href="/workspace" className="flex items-center gap-3" onClick={() => sound.click(true)}>
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-mango via-coral to-pink text-lg font-black text-white shadow-lg shadow-pink/25">L</div>
          <div><p className="text-lg font-bold tracking-tight">LogicFlow</p><p className="text-xs text-slate-500">Digital logic studio</p></div>
        </Link>
        <nav className="hidden items-center gap-2 md:flex" aria-label="Primary">
          {navItems.map(([href, number, label]) => {
            const active = pathname === href;
            return <Link key={href} href={href} onClick={() => sound.click(true)} aria-current={active ? "page" : undefined} className={cn("nav-link", active && "is-active")}><span>{number}</span>{label}</Link>;
          })}
        </nav>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => { sound.toggle(); sound.click(true); }} className="nav-tool-button" aria-label="Toggle sound">{sound.enabled ? "🔊" : "🔇"}</button>
          <button type="button" onClick={() => { setDark((value) => !value); sound.click(true); }} className="nav-tool-button" aria-label="Toggle theme">{dark ? "☀" : "◐"}</button>
        </div>
      </header>

      {children}

      <footer className="border-t border-slate-200 bg-white/80">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-3 px-6 py-6 text-sm text-slate-500 sm:flex-row lg:px-8">
          <p>LogicFlow · Build, simplify, probe, and understand digital logic.</p>
          <p>Your UI · Reference feature engine.</p>
        </div>
      </footer>
    </main>
  );
}

