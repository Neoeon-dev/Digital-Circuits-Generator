"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

const HEX = [
  { ch: "0", bits: [1, 1, 1, 1, 1, 1, 0] },
  { ch: "1", bits: [0, 1, 1, 0, 0, 0, 0] },
  { ch: "2", bits: [1, 1, 0, 1, 1, 0, 1] },
  { ch: "3", bits: [1, 1, 1, 1, 0, 0, 1] },
  { ch: "4", bits: [0, 1, 1, 0, 0, 1, 1] },
  { ch: "5", bits: [1, 0, 1, 1, 0, 1, 1] },
  { ch: "6", bits: [1, 0, 1, 1, 1, 1, 1] },
  { ch: "7", bits: [1, 1, 1, 0, 0, 0, 0] },
  { ch: "8", bits: [1, 1, 1, 1, 1, 1, 1] },
  { ch: "9", bits: [1, 1, 1, 1, 0, 1, 1] },
  { ch: "A", bits: [1, 1, 1, 0, 1, 1, 1] },
  { ch: "b", bits: [0, 0, 1, 1, 1, 1, 1] },
  { ch: "C", bits: [1, 0, 0, 1, 1, 1, 0] },
  { ch: "d", bits: [0, 1, 1, 1, 1, 0, 1] },
  { ch: "E", bits: [1, 0, 0, 1, 1, 1, 1] },
  { ch: "F", bits: [1, 0, 0, 0, 1, 1, 1] },
];

const BCD = HEX.slice(0, 10);

const labels = ["a", "b", "c", "d", "e", "f", "g"];

const colors = [
  ["RED", "#ef4444"],
  ["GREEN", "#10b981"],
  ["CYAN", "#00c2ff"],
  ["AMBER", "#f59e0b"],
  ["PURPLE", "#a855f7"],
  ["WHITE", "#f8fafc"],
] as const;

const SEGMENT_PATHS = [
  "M48 34 H172",    // a
  "M178 43 V143",   // b
  "M178 177 V277",  // c
  "M48 286 H172",   // d
  "M42 177 V277",   // e
  "M42 43 V143",    // f
  "M48 160 H172",   // g
];

function SevenDisplay({
  segmentState,
  color,
  onToggle,
  dpOn,
}: {
  segmentState: boolean[];
  color: string;
  onToggle: (index: number) => void;
  dpOn: boolean;
}) {
  return (
    <svg
      viewBox="0 0 220 320"
      className="sevenseg-svg compact"
      role="img"
      aria-label="Seven segment display"
    >
      {SEGMENT_PATHS.map((path, index) => {
        const active = Boolean(segmentState[index]);

        return (
          <g
            key={labels[index]}
            className="cursor-pointer"
            onClick={() => onToggle(index)}
          >
            {/* Physical segment body */}
            <path
              d={path}
              stroke="#d6dde6"
              strokeWidth="17"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />

            {/* Lit segment */}
            {active && (
              <path
                d={path}
                stroke={color}
                strokeWidth="15"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
                style={{
                  filter: `drop-shadow(0 0 7px ${color})`,
                }}
              />
            )}

            {/* Segment label */}
            <text
              x={
                index === 0 ||
                index === 3 ||
                index === 6
                  ? 110
                  : index === 1 ||
                    index === 2
                  ? 194
                  : 26
              }
              y={
                index === 0
                  ? 20
                  : index === 3
                  ? 307
                  : index === 6
                  ? 149
                  : 160
              }
              textAnchor="middle"
              fill="#71839a"
              fontSize="8"
              fontFamily="JetBrains Mono, monospace"
              pointerEvents="none"
            >
              {labels[index]}
            </text>
          </g>
        );
      })}

      {/* Decimal point */}
      <circle
        cx="195"
        cy="286"
        r="7.5"
        fill={dpOn ? color : "#d6dde6"}
        style={{
          filter: dpOn
            ? `drop-shadow(0 0 7px ${color})`
            : undefined,
        }}
        onClick={() => onToggle(7)}
        className="cursor-pointer"
      />
    </svg>
  );
}

export default function SevenSegmentLab({
  onSound,
}: {
  onSound?: (high?: boolean) => void;
}) {
  const [hexMode, setHexMode] = useState(false);
  const [anode, setAnode] = useState(false);
  const [value, setValue] = useState(0);
  const [color, setColor] = useState<string>(
    colors[2][1]
  );
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(700);
  const [history, setHistory] = useState<number[]>([0]);
  const [segmentBits, setSegmentBits] = useState<number[]>(
    BCD[0].bits.slice()
  );
  const [dpOn, setDpOn] = useState(false);

  const glyph = useMemo(
    () => (hexMode ? HEX : BCD)[value] ?? HEX[0],
    [hexMode, value]
  );

  /*
   * segmentBits represents the logical segment state:
   *
   * 1 = active/high
   * 0 = inactive/low
   *
   * For common cathode:
   *   1 => segment ON
   *
   * For common anode:
   *   0 => segment ON
   */
  const segmentState = useMemo(
    () =>
      segmentBits.map((bit) =>
        anode ? bit === 0 : bit === 1
      ),
    [segmentBits, anode]
  );

  const setInput = (
    next: number,
    shouldSound = true
  ) => {
    const limit = hexMode ? 15 : 9;

    const clamped = Math.max(
      0,
      Math.min(limit, next)
    );

    const pattern =
      (hexMode ? HEX : BCD)[clamped] ?? HEX[0];

    setValue(clamped);
    setSegmentBits(pattern.bits.slice());

    if (shouldSound) {
      onSound?.(true);
    }
  };

  /*
   * Counter.
   *
   * Use the functional state updater so the interval
   * doesn't depend on a stale `value` closure.
   */
  useEffect(() => {
    if (!running) return;

    const timer = window.setInterval(() => {
      setValue((current) => {
        const next =
          (current + 1) %
          (hexMode ? 16 : 10);

        const pattern =
          (hexMode ? HEX : BCD)[next] ?? HEX[0];

        setSegmentBits(pattern.bits.slice());
        onSound?.(true);

        return next;
      });
    }, speed);

    return () => {
      window.clearInterval(timer);
    };
  }, [running, speed, hexMode, onSound]);

  /*
   * Keep the current value valid when switching
   * between BCD and HEX.
   */
  useEffect(() => {
    const max = hexMode ? 15 : 9;

    if (value > max) {
      setInput(0, false);
    } else {
      const pattern =
        (hexMode ? HEX : BCD)[value] ?? HEX[0];

      setSegmentBits(pattern.bits.slice());
    }
  }, [hexMode]);

  /*
   * Keyboard shortcuts.
   */
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement
      ) {
        return;
      }

      const index = HEX.findIndex(
        (item) =>
          item.ch.toLowerCase() ===
          event.key.toLowerCase()
      );

      if (
        index >= 0 &&
        index <= (hexMode ? 15 : 9)
      ) {
        setInput(index);
      }
    };

    window.addEventListener(
      "keydown",
      handleKeyDown
    );

    return () => {
      window.removeEventListener(
        "keydown",
        handleKeyDown
      );
    };
  }, [hexMode]);

  /*
   * History for timing analyzer.
   */
  useEffect(() => {
    setHistory((items) => [
      ...items.slice(-29),
      value,
    ]);
  }, [value]);

  /*
   * Toggle one physical segment.
   */
  const toggleSegment = (index: number) => {
    /*
     * 0-6 = normal segments
     * 7   = decimal point
     */
    if (index === 7) {
      setDpOn((current) => !current);
      onSound?.(!dpOn);
      return;
    }

    const next = segmentBits.slice();

    next[index] = next[index] ? 0 : 1;

    setSegmentBits(next);

    /*
     * Try to reverse-decode the resulting pattern.
     */
    const match = HEX.findIndex((item) =>
      item.bits.every(
        (bit, bitIndex) =>
          bit === next[bitIndex]
      )
    );

    if (
      match >= 0 &&
      (hexMode || match < 10)
    ) {
      setValue(match);
    }

    onSound?.(true);
  };

  const reverseDecoded =
    HEX.find((item) =>
      item.bits.every(
        (bit, index) =>
          bit === segmentBits[index]
      )
    )?.ch ?? "Custom glyph";

  const binaryState =
    value.toString(2).padStart(4, "0");

  return (
    <section className="mx-auto max-w-7xl px-6 pb-20 lg:px-8">
      {/* Header */}
      <div className="mb-7 max-w-3xl">
        <p className="text-sm font-bold text-cyan">
          04 / 8-SEGMENT DISPLAY
        </p>

        <h1 className="mt-2 text-3xl font-bold tracking-tight text-ink sm:text-4xl">
          A compact decoder lab for BCD,
          HEX and the decimal point.
        </h1>

        <p className="mt-3 text-base leading-7 text-slate-600">
          The display is intentionally constrained
          so the engineering controls, segment state
          and timing analyzer stay visible in one
          viewport.
        </p>
      </div>

      {/* Main layout */}
      <div className="grid items-start gap-6 xl:grid-cols-[.74fr_1.26fr]">
        {/* Controls */}
        <div className="color-card color-card-pink rounded-3xl border border-slate-200 bg-white p-5 shadow-panel sm:p-7">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-slate-700">
                Display controls
              </p>

              <p className="mt-1 text-xs leading-5 text-slate-500">
                7 LED segments + 1 decimal-point
                indicator.
              </p>
            </div>

            <span className="rounded-full bg-violet/10 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-violet">
              Hardware
            </span>
          </div>

          {/* Mode */}
          <div className="mt-5 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setHexMode(false);
                setInput(
                  Math.min(value, 9),
                  false
                );
              }}
              className={`rounded-xl border p-3 text-left ${
                !hexMode
                  ? "border-cyan bg-cyan/5 ring-1 ring-cyan"
                  : "border-slate-200"
              }`}
            >
              <span className="text-[10px] font-bold uppercase text-slate-400">
                Mode
              </span>

              <p className="mt-1 text-sm font-bold">
                BCD 0–9
              </p>
            </button>

            <button
              type="button"
              onClick={() => {
                setHexMode(true);
              }}
              className={`rounded-xl border p-3 text-left ${
                hexMode
                  ? "border-violet bg-violet/5 ring-1 ring-violet"
                  : "border-slate-200"
              }`}
            >
              <span className="text-[10px] font-bold uppercase text-slate-400">
                Mode
              </span>

              <p className="mt-1 text-sm font-bold">
                HEX 0–F
              </p>
            </button>
          </div>

          {/* Anode / cathode */}
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setAnode(false)}
              className={`rounded-xl border p-3 text-left ${
                !anode
                  ? "border-emerald-400 bg-emerald-50 ring-1 ring-emerald-300"
                  : "border-slate-200"
              }`}
            >
              <p className="text-xs font-bold">
                COMMON CATHODE
              </p>

              <span className="text-[11px] text-slate-500">
                Active HIGH
              </span>
            </button>

            <button
              type="button"
              onClick={() => setAnode(true)}
              className={`rounded-xl border p-3 text-left ${
                anode
                  ? "border-amber-400 bg-amber-50 ring-1 ring-amber-300"
                  : "border-slate-200"
              }`}
            >
              <p className="text-xs font-bold">
                COMMON ANODE
              </p>

              <span className="text-[11px] text-slate-500">
                Active LOW
              </span>
            </button>
          </div>

          {/* Phosphor */}
          <div className="mt-5">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Phosphor
            </p>

            <div className="mt-2 flex flex-wrap gap-2">
              {colors.map(
                ([name, hex]) => (
                  <button
                    type="button"
                    key={name}
                    title={name}
                    onClick={() =>
                      setColor(hex)
                    }
                    className={`h-8 w-8 rounded-full border-2 ${
                      color === hex
                        ? "border-slate-900 ring-2 ring-cyan/40"
                        : "border-white"
                    }`}
                    style={{
                      background: hex,
                    }}
                  />
                )
              )}
            </div>
          </div>

          {/* Clock */}
          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between text-xs font-bold text-slate-600">
              <span>
                Clock interval
              </span>

              <span className="font-mono">
                {speed} ms
              </span>
            </div>

            <input
              value={speed}
              onChange={(event) =>
                setSpeed(
                  Math.max(
                    120,
                    Math.min(
                      1500,
                      Number(
                        event.target.value
                      ) || 700
                    )
                  )
                )
              }
              min={120}
              max={1500}
              step={40}
              type="range"
              className="mt-3 w-full accent-cyan"
            />

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() =>
                  setRunning(
                    (current) =>
                      !current
                  )
                }
                className="flex-1 rounded-xl bg-ink px-4 py-3 text-xs font-bold text-white transition hover:-translate-y-0.5"
              >
                {running
                  ? "Pause"
                  : "Start counter"}
              </button>

              <button
                type="button"
                onClick={() =>
                  setInput(
                    (value + 1) %
                      (hexMode
                        ? 16
                        : 10)
                  )
                }
                className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold"
              >
                Step
              </button>

              <button
                type="button"
                onClick={() => {
                  setRunning(false);
                  setInput(0);
                }}
                className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold"
              >
                Reset
              </button>
            </div>
          </div>

          {/* Digit buttons */}
          <div className="mt-5 grid grid-cols-4 gap-2">
            {(hexMode ? HEX : BCD).map(
              (item, index) => (
                <button
                  type="button"
                  key={item.ch}
                  onClick={() =>
                    setInput(index)
                  }
                  className={`rounded-lg border py-2 font-mono text-xs font-bold ${
                    value === index
                      ? "border-pink bg-pink/5 text-pink"
                      : "border-slate-200 text-slate-500"
                  }`}
                >
                  {item.ch}
                </button>
              )
            )}
          </div>

          <div className="mt-4 text-[10px] leading-5 text-slate-500">
            Keyboard: 0–9
            {hexMode
              ? " / A–F"
              : ""}
            . Click a segment directly
            to toggle its state.
          </div>
        </div>

        {/* Live display */}
        <motion.div
          layout
          className="color-card color-card-cyan rounded-3xl border border-slate-200 bg-white p-5 shadow-panel sm:p-7"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-cyan">
                LIVE DISPLAY
              </p>

              <h2 className="mt-1 text-2xl font-bold">
                Character{" "}
                <span className="font-mono">
                  {glyph.ch}
                </span>
              </h2>
            </div>

            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-600">
              {anode
                ? "ACTIVE LOW"
                : "ACTIVE HIGH"}
            </span>
          </div>

          <div className="mt-5 grid items-start gap-5 lg:grid-cols-[240px_1fr]">
            {/* 7-segment display */}
            <div className="sevenseg-display-card compact">
              <SevenDisplay
                segmentState={
                  segmentState
                }
                color={color}
                onToggle={
                  toggleSegment
                }
                dpOn={dpOn}
              />

              <div className="sevenseg-edit-row compact">
                {labels.map(
                  (label, index) => (
                    <button
                      type="button"
                      key={label}
                      onClick={() =>
                        toggleSegment(
                          index
                        )
                      }
                      className={`seg-toggle ${
                        segmentState[
                          index
                        ]
                          ? "is-on"
                          : ""
                      }`}
                    >
                      {label}
                    </button>
                  )
                )}
              </div>

              <button
                type="button"
                onClick={() =>
                  toggleSegment(7)
                }
                className={`seg-toggle mt-2 w-full ${
                  dpOn ? "is-on" : ""
                }`}
              >
                DP · decimal point{" "}
                {dpOn ? "ON" : "OFF"}
              </button>
            </div>

            {/* Decoder + analyzer */}
            <div className="space-y-4">
              {/* Decoder state */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-slate-600">
                    Decoder state
                  </p>

                  <span className="font-mono text-xs font-bold text-cyan">
                    {binaryState}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-4 gap-2">
                  {[8, 4, 2, 1].map(
                    (bit) => {
                      const active =
                        (value &
                          bit) !==
                        0;

                      return (
                        <div
                          key={bit}
                          className={`rounded-lg border p-2 text-center font-mono text-sm font-black ${
                            active
                              ? "border-emerald-300 bg-emerald-50 text-emerald-600"
                              : "border-slate-200 bg-white text-slate-400"
                          }`}
                        >
                          {active
                            ? 1
                            : 0}
                        </div>
                      );
                    }
                  )}
                </div>
              </div>

              {/* Segment outputs */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-bold text-slate-700">
                  Segment outputs
                </p>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  {labels.map(
                    (label, index) => {
                      const active =
                        segmentState[
                          index
                        ];

                      return (
                        <div
                          key={label}
                          className={`rounded-lg border p-2 ${
                            active
                              ? "border-emerald-300 bg-emerald-50"
                              : "border-slate-200 bg-slate-50"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase text-slate-500">
                              seg{" "}
                              {label}
                            </span>

                            <strong
                              className={`font-mono ${
                                active
                                  ? "text-emerald-600"
                                  : "text-slate-400"
                              }`}
                            >
                              {active
                                ? 1
                                : 0}
                            </strong>
                          </div>
                        </div>
                      );
                    }
                  )}
                </div>
              </div>

              {/* Timing analyzer */}
              <div className="rounded-2xl bg-ink p-4 text-white">
                <p className="text-xs font-bold uppercase tracking-wider text-cyan">
                  Timing analyzer
                </p>

                <div className="mt-3 sevenseg-wave">
                  {history
                    .slice(-20)
                    .map(
                      (item, index) => (
                        <span
                          key={`${index}-${item}`}
                          className={
                            item === value
                              ? "is-high"
                              : ""
                          }
                          style={{
                            height: `${
                              18 +
                              item * 3
                            }px`,
                          }}
                        />
                      )
                    )}
                </div>

                <p className="mt-3 text-[10px] leading-5 text-slate-400">
                  History updates with
                  every counter step and
                  manual edit.
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Reverse decode */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`${value}-${anode}-${hexMode}-${segmentBits.join(
            ""
          )}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-4 rounded-2xl border border-cyan/20 bg-cyan/5 p-3 text-xs leading-5 text-slate-600"
        >
          <strong className="text-cyan">
            Reverse decode:
          </strong>{" "}
          {anode
            ? "active-low"
            : "active-high"}{" "}
          pattern resolves to{" "}
          <span className="font-mono font-bold">
            {reverseDecoded}
          </span>
          {dpOn ? " + DP" : ""}.
        </motion.div>
      </AnimatePresence>
    </section>
  );
}