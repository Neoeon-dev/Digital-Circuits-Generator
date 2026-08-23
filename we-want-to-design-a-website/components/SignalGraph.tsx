"use client";
import { useMemo } from "react";

type Point = { label: string; value: number };

export default function SignalGraph({ title, points, accent = "#08B8D0" }: { title: string; points: Point[]; accent?: string }) {
  const normalized = useMemo(() => points.slice(-32), [points]);
  const width = 760, height = 190, left = 40, top = 22, right = 16, bottom = 28;
  const innerW = width - left - right, innerH = height - top - bottom;
  const path = normalized.length > 1
    ? normalized.map((p, i) => {
        const x = left + (i / (normalized.length - 1)) * innerW;
        const y = top + (p.value ? 12 : innerH - 10);
        if (i === 0) return `M ${x} ${y}`;
        const prev = normalized[i - 1];
        const py = top + (prev.value ? 12 : innerH - 10);
        return `${x !== left && py !== y ? `L ${x} ${py} ` : ""}L ${x} ${y}`;
      }).join(" ") : "";

  return <div className="signal-graph">
    <div className="signal-graph-head"><span>{title}</span><span>{normalized.length ? `${normalized.at(-1)?.value}` : "—"}</span></div>
    <div className="signal-graph-canvas">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title}>
        {[0,1].map(level => {
          const y = top + (level ? 12 : innerH - 10);
          return <g key={level}><line x1={left} x2={width-right} y1={y} y2={y} className="graph-grid-line"/><text x={8} y={y+4} className="graph-axis">{level}</text></g>;
        })}
        {Array.from({ length: Math.max(normalized.length, 1) }, (_, i) => {
          const x = left + (i / Math.max(normalized.length - 1, 1)) * innerW;
          return <line key={i} x1={x} x2={x} y1={top} y2={height-bottom} className="graph-grid-line vertical"/>;
        })}
        {path && <path d={path} className="signal-path" style={{ stroke: accent }} />}
        {normalized.map((p, i) => {
          const x = left + (i / Math.max(normalized.length - 1,1)) * innerW;
          const y = top + (p.value ? 12 : innerH - 10);
          return <circle key={`${p.label}-${i}`} cx={x} cy={y} r="3.5" className="signal-point" style={{ fill: accent }} />;
        })}
      </svg>
    </div>
  </div>;
}
