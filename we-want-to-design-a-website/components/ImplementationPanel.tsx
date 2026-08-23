"use client";

type Props = {
  expression: string;
  gates: string;
  realizedAs?: string;
  title?: string;
  compact?: boolean;
};

export default function ImplementationPanel({ expression, gates, realizedAs, title = "Logic implementation", compact = false }: Props) {
  return (
    <div className={`implementation-panel ${compact ? "implementation-panel-compact" : ""}`}>
      <div className="implementation-panel-head">
        <div>
          <p className="implementation-kicker">IMPLEMENTATION</p>
          <p className="implementation-title">{title}</p>
        </div>
        <span className="implementation-status">VERIFIED FLOW</span>
      </div>
      <div className="implementation-code">
        <div className="implementation-code-line"><span className="implementation-comment">// minimized Boolean model</span></div>
        <div className="implementation-code-line"><span className="implementation-keyword">assign</span> F <span className="implementation-symbol">=</span> <span className="implementation-expression">{expression || "0"}</span>;</div>
        <div className="implementation-code-line"><span className="implementation-comment">// gate family</span></div>
        <div className="implementation-code-line"><span className="implementation-string">{gates || "Mixed logic gates"}</span></div>
        {realizedAs && <div className="implementation-code-line"><span className="implementation-comment">// realization</span> {realizedAs}</div>}
      </div>
    </div>
  );
}
