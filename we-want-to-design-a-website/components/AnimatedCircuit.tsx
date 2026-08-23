"use client";

import { useMemo, useRef, useState } from "react";

type Node = {
  id: string;
  type: string;
  inputs: string[];
};

type Edge = {
  source: string;
  target: string;
};

type Circuit = {
  nodes: Node[];
  edges: Edge[];
  output: string;
};

type Props = {
  circuit: Circuit;
  variables: string[];
  probe: Record<string, number>;
  outputs: string[];
};

type Point = {
  x: number;
  y: number;
};

type Segment = {
  x: number;
  y: number;
  width: number;
  height: number;
  horizontal: boolean;
};

type Layout = {
  width: number;
  height: number;
  nodes: Map<string, Point>;
  inputPins: Map<string, Point>;
  sourcePins: Map<string, Point>;
  targetPins: Map<number, Point>;
  lanes: Map<number, number>;
};

function upper(type: string) {
  return type.toUpperCase();
}

function gateSize(type: string) {
  switch (upper(type)) {
    case "NOT":
      return {
        width: 78,
        height: 60,
      };

    case "XOR":
    case "XNOR":
      return {
        width: 142,
        height: 94,
      };

    default:
      return {
        width: 126,
        height: 92,
      };
  }
}

function evalGate(type: string, values: number[]) {
  switch (upper(type)) {
    case "NOT":
      return values[0] ? 0 : 1;

    case "AND":
      return values.length > 0 && values.every(Boolean) ? 1 : 0;

    case "OR":
      return values.some(Boolean) ? 1 : 0;

    case "NAND":
      return values.length > 0 && values.every(Boolean) ? 0 : 1;

    case "NOR":
      return values.some(Boolean) ? 0 : 1;

    case "XOR":
      return values.reduce((a, b) => a ^ b, 0);

    case "XNOR":
      return Number(!values.reduce((a, b) => a ^ b, 0));

    default:
      return values[0] ?? 0;
  }
}

function inputOffsets(count: number, height: number) {
  if (count <= 1) return [0];

  const spread = Math.min(
    height - 22,
    Math.max(62, (count - 1) * 28)
  );

  const step = spread / (count - 1);

  return Array.from(
    { length: count },
    (_, i) => -spread / 2 + i * step
  );
}

function orthogonalSegments(
  source: Point,
  target: Point,
  lane: number
): Segment[] {
  const horizontal = (
    x: number,
    y: number,
    width: number
  ): Segment => ({
    x: Math.min(x, x + width),
    y,
    width: Math.abs(width),
    height: 3,
    horizontal: true,
  });

  const vertical = (
    x: number,
    y: number,
    height: number
  ): Segment => ({
    x,
    y: Math.min(y, y + height),
    width: 3,
    height: Math.abs(height),
    horizontal: false,
  });

  const parts: Segment[] = [];

  const first = lane - source.x;
  const second = target.x - lane;

  if (Math.abs(first) > 1) {
    parts.push(
      horizontal(source.x, source.y, first)
    );
  }

  if (Math.abs(target.y - source.y) > 1) {
    parts.push(
      vertical(
        lane,
        source.y,
        target.y - source.y
      )
    );
  }

  if (Math.abs(second) > 1) {
    parts.push(
      horizontal(
        lane,
        target.y,
        second
      )
    );
  }

  return parts;
}

function gateClass(type: string) {
  switch (upper(type)) {
    case "NOT":
      return "not";

    case "OR":
      return "or";

    case "NOR":
      return "or inverted";

    case "XOR":
      return "xor";

    case "XNOR":
      return "xor inverted";

    case "NAND":
      return "and inverted";

    case "AND":
    default:
      return "and";
  }
}

export default function AnimatedCircuit({
  circuit,
  variables,
  probe,
  outputs,
}: Props) {
  const dragRef = useRef({
    active: false,
    x: 0,
    y: 0,
    panX: 0,
    panY: 0,
  });

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({
    x: 0,
    y: 0,
  });

  const nodeById = useMemo(
    () =>
      new Map(
        circuit.nodes.map((node) => [
          node.id,
          node,
        ])
      ),
    [circuit.nodes]
  );

  const incoming = useMemo(() => {
    const map = new Map<string, number[]>();

    circuit.edges.forEach((edge, index) => {
      map.set(edge.target, [
        ...(map.get(edge.target) ?? []),
        index,
      ]);
    });

    return map;
  }, [circuit.edges]);

  const values = useMemo(() => {
    const cache = new Map<string, number>();
    const visiting = new Set<string>();

    const resolve = (id: string): number => {
      if (
        Object.prototype.hasOwnProperty.call(
          probe,
          id
        )
      ) {
        return probe[id] ?? 0;
      }

      if (cache.has(id)) {
        return cache.get(id)!;
      }

      if (visiting.has(id)) {
        return 0;
      }

      const node = nodeById.get(id);

      if (!node) {
        return 0;
      }

      visiting.add(id);

      const inputs = (
        incoming.get(id) ?? []
      ).map((edgeIndex) =>
        resolve(
          circuit.edges[edgeIndex].source
        )
      );

      const value = evalGate(
        node.type,
        inputs
      );

      visiting.delete(id);
      cache.set(id, value);

      return value;
    };

    circuit.nodes.forEach((node) =>
      resolve(node.id)
    );

    return cache;
  }, [
    circuit,
    incoming,
    nodeById,
    probe,
  ]);

  const layout = useMemo<Layout>(() => {
    const depth = new Map<string, number>();
    const active = new Set<string>();

    const visit = (id: string): number => {
      if (depth.has(id)) {
        return depth.get(id)!;
      }

      if (active.has(id)) {
        return 1;
      }

      active.add(id);

      const parents = (
        incoming.get(id) ?? []
      )
        .map(
          (edgeIndex) =>
            circuit.edges[edgeIndex].source
        )
        .filter((source) =>
          nodeById.has(source)
        );

      const value = parents.length
        ? Math.max(...parents.map(visit)) + 1
        : 1;

      active.delete(id);
      depth.set(id, value);

      return value;
    };

    circuit.nodes.forEach((node) =>
      visit(node.id)
    );

    const maxDepth = Math.max(
      1,
      ...depth.values()
    );

    const columns = Array.from(
      { length: maxDepth },
      (_, i) =>
        circuit.nodes.filter(
          (node) =>
            depth.get(node.id) === i + 1
        )
    );

    const left = 290;
    const columnGap = 300;
    const right = 210;
    const top = 80;
    const bottom = 90;
    const rowGap = 154;

    const height = Math.max(
      610,
      Math.max(
        1,
        ...columns.map(
          (column) => column.length
        )
      ) *
        rowGap +
        top +
        bottom
    );

    const width = Math.max(
      1220,
      left + maxDepth * columnGap + right
    );

    const nodes = new Map<string, Point>();

    columns.forEach((column, index) => {
      const x =
        left + index * columnGap;

      const sorted = [...column].sort(
        (a, b) => {
          const averageY = (
            node: Node
          ) => {
            const ys = (
              incoming.get(node.id) ?? []
            )
              .map(
                (edgeIndex) =>
                  nodes.get(
                    circuit.edges[edgeIndex]
                      .source
                  )?.y
              )
              .filter(
                (
                  value
                ): value is number =>
                  value !== undefined
              );

            return ys.length
              ? ys.reduce(
                  (sum, value) =>
                    sum + value,
                  0
                ) / ys.length
              : Number.MAX_SAFE_INTEGER;
          };

          return (
            averageY(a) -
            averageY(b)
          );
        }
      );

      const step =
        sorted.length <= 1
          ? 0
          : Math.max(
              136,
              (height - top - bottom) /
                (sorted.length - 1)
            );

      sorted.forEach(
        (node, row) => {
          const y =
            sorted.length === 1
              ? height / 2
              : top + row * step;

          nodes.set(node.id, {
            x,
            y,
          });
        }
      );
    });

    const targetPins = new Map<
      number,
      Point
    >();

    const sourcePins = new Map<
      string,
      Point
    >();

    circuit.nodes.forEach((node) => {
      const point = nodes.get(node.id);

      if (!point) return;

      const size = gateSize(
        node.type
      );

      sourcePins.set(node.id, {
        x:
          point.x +
          size.width / 2 +
          ([
            "NOT",
            "NAND",
            "NOR",
            "XNOR",
          ].includes(
            upper(node.type)
          )
            ? 8
            : 0),
        y: point.y,
      });

      const slots = inputOffsets(
        Math.max(
          1,
          node.inputs.length
        ),
        size.height
      );

      (
        incoming.get(node.id) ?? []
      ).forEach(
        (edgeIndex, occurrence) => {
          const edge =
            circuit.edges[edgeIndex];

          const exact =
            node.inputs.findIndex(
              (input) =>
                input === edge.source
            );

          const slot =
            exact >= 0
              ? exact
              : occurrence;

          targetPins.set(
            edgeIndex,
            {
              x:
                point.x -
                size.width / 2,
              y:
                point.y +
                (slots[slot] ?? 0),
            }
          );
        }
      );
    });

    const inputPins = new Map<
      string,
      Point
    >();

    const minGap = Math.max(
      82,
      rowGap - 28
    );

    variables.forEach(
      (variable, index) => {
        const targetYs =
          circuit.edges
            .map(
              (
                edge,
                edgeIndex
              ) => ({
                edge,
                edgeIndex,
              })
            )
            .filter(
              ({ edge }) =>
                edge.source === variable
            )
            .map(
              ({ edgeIndex }) =>
                targetPins.get(
                  edgeIndex
                )?.y
            )
            .filter(
              (
                value
              ): value is number =>
                value !== undefined
            );

        const natural =
          targetYs.length
            ? targetYs.reduce(
                (sum, value) =>
                  sum + value,
                0
              ) / targetYs.length
            : top + index * minGap;

        inputPins.set(
          variable,
          {
            x: 94,
            y: Math.max(
              54,
              Math.min(
                height - 54,
                natural
              )
            ),
          }
        );
      }
    );

    const ordered = variables
      .map((variable) => ({
        variable,
        y: inputPins.get(variable)!.y,
      }))
      .sort((a, b) => a.y - b.y);

    let cursor = 52;

    ordered.forEach(
      ({ variable, y }) => {
        const next = Math.min(
          height - 52,
          Math.max(y, cursor)
        );

        inputPins.set(
          variable,
          {
            x: 94,
            y: next,
          }
        );

        cursor = next + minGap;
      }
    );

    const lanes = new Map<
      number,
      number
    >();

    const used = new Map<
      string,
      number
    >();

    circuit.edges.forEach(
      (edge, index) => {
        const source =
          sourcePins.get(
            edge.source
          ) ??
          inputPins.get(
            edge.source
          ) ?? {
            x: 140,
            y: height / 2,
          };

        const target =
          targetPins.get(index) ?? {
            x: source.x + 120,
            y: source.y,
          };

        const key = `${Math.round(
          source.x
        )}-${Math.round(target.x)}`;

        const count =
          used.get(key) ?? 0;

        used.set(
          key,
          count + 1
        );

        lanes.set(
          index,
          source.x +
            (target.x - source.x) *
              0.5 +
            (count - 1.5) * 28
        );
      }
    );

    return {
      width,
      height,
      nodes,
      inputPins,
      sourcePins,
      targetPins,
      lanes,
    };
  }, [
    circuit,
    incoming,
    nodeById,
    variables,
  ]);

  const outputValue =
    values.get(circuit.output) ?? 0;

  const resetView = () => {
    setZoom(1);
    setPan({
      x: 0,
      y: 0,
    });
  };

  return (
    <div className="logic-circuit-shell">
      <div className="logic-circuit-head">
        <div>
          <span>GENERATED CIRCUIT</span>
          <small>
            ENGINEERING VIEW · HTML / CSS ROUTER
          </small>
        </div>

        <div className="logic-circuit-actions">
          <button
            type="button"
            onClick={() =>
              setZoom((z) =>
                Math.max(
                  0.4,
                  +(z - 0.08).toFixed(2)
                )
              )
            }
            aria-label="Zoom out"
          >
            −
          </button>

          <button
            type="button"
            className="logic-circuit-zoom"
          >
            {Math.round(zoom * 100)}%
          </button>

          <button
            type="button"
            onClick={() =>
              setZoom((z) =>
                Math.min(
                  1.5,
                  +(z + 0.08).toFixed(2)
                )
              )
            }
            aria-label="Zoom in"
          >
            +
          </button>

          <button
            type="button"
            onClick={resetView}
          >
            Fit
          </button>
        </div>
      </div>

      <div
        className={`logic-circuit-stage${
          dragRef.current.active
            ? " is-dragging"
            : ""
        }`}
        onPointerDown={(event) => {
          if (
            (event.target as HTMLElement).closest(
              "button"
            )
          ) {
            return;
          }

          dragRef.current = {
            active: true,
            x: event.clientX,
            y: event.clientY,
            panX: pan.x,
            panY: pan.y,
          };

          event.currentTarget.setPointerCapture(
            event.pointerId
          );
        }}
        onPointerMove={(event) => {
          if (
            !dragRef.current.active
          ) {
            return;
          }

          setPan({
            x:
              dragRef.current.panX +
              event.clientX -
              dragRef.current.x,
            y:
              dragRef.current.panY +
              event.clientY -
              dragRef.current.y,
          });
        }}
        onPointerUp={() => {
          dragRef.current.active = false;
        }}
        onPointerCancel={() => {
          dragRef.current.active = false;
        }}
      >
        {/* Fixed viewport */}
        <div
          className="logic-circuit-surface"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            overflow: "hidden",
          }}
        >
          {/* Only this layer is transformed */}
          <div
            className="logic-circuit-content"
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: layout.width,
              height: layout.height,
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: "0 0",
              willChange: "transform",
            }}
          >
            {/* INPUTS */}
            {variables.map(
              (variable) => {
                const point =
                  layout.inputPins.get(
                    variable
                  );

                if (!point) {
                  return null;
                }

                const high =
                  Boolean(
                    probe[variable]
                  );

                return (
                  <div
                    key={`input-${variable}`}
                    className="logic-circuit-input"
                    style={{
                      left: point.x,
                      top: point.y,
                    }}
                  >
                    <span className="logic-circuit-input-label">
                      {variable}
                    </span>

                    <span
                      className={`logic-circuit-pin ${
                        high
                          ? "is-high"
                          : ""
                      }`}
                    />
                  </div>
                );
              }
            )}

            {/* WIRES */}
            {circuit.edges.map(
              (edge, index) => {
                const source =
                  layout.sourcePins.get(
                    edge.source
                  ) ??
                  layout.inputPins.get(
                    edge.source
                  ) ?? {
                    x: 140,
                    y: layout.height / 2,
                  };

                const target =
                  layout.targetPins.get(
                    index
                  ) ?? {
                    x: source.x + 120,
                    y: source.y,
                  };

                const lane =
                  layout.lanes.get(
                    index
                  ) ??
                  (source.x +
                    target.x) /
                    2;

                const high =
                  Object.prototype.hasOwnProperty.call(
                    probe,
                    edge.source
                  )
                    ? Boolean(
                        probe[
                          edge.source
                        ]
                      )
                    : Boolean(
                        values.get(
                          edge.source
                        )
                      );

                const segments =
                  orthogonalSegments(
                    source,
                    target,
                    lane
                  );

                return (
                  <div
                    key={`edge-${index}`}
                  >
                    {segments.map(
                      (
                        segment,
                        segmentIndex
                      ) => (
                        <div
                          key={`${index}-${segmentIndex}`}
                          className={`logic-wire-segment ${
                            segment.horizontal
                              ? "horizontal"
                              : "vertical"
                          } ${
                            high
                              ? "is-high"
                              : ""
                          }`}
                          data-signal={
                            high
                              ? "1"
                              : "0"
                          }
                          aria-label={`Signal ${
                            high
                              ? "high"
                              : "low"
                          }`}
                          style={{
                            left: segment.x,
                            top: segment.y,
                            width:
                              segment.width,
                            height:
                              segment.height,
                          }}
                        />
                      )
                    )}

                    <span
                      className={`logic-wire-junction ${
                        high
                          ? "is-high"
                          : ""
                      }`}
                      data-signal={
                        high
                          ? "1"
                          : "0"
                      }
                      style={{
                        left: lane,
                        top: source.y,
                      }}
                    />

                    <span
                      className={`logic-wire-end ${
                        high
                          ? "is-high"
                          : ""
                      }`}
                      data-signal={
                        high
                          ? "1"
                          : "0"
                      }
                      style={{
                        left: target.x,
                        top: target.y,
                      }}
                    />
                  </div>
                );
              }
            )}

            {/* GATES */}
            {circuit.nodes.map(
              (node) => {
                const point =
                  layout.nodes.get(
                    node.id
                  );

                if (!point) {
                  return null;
                }

                const size =
                  gateSize(
                    node.type
                  );

                const high =
                  Boolean(
                    values.get(
                      node.id
                    )
                  );

                const type =
                  upper(node.type);

                const inverted = [
                  "NOT",
                  "NAND",
                  "NOR",
                  "XNOR",
                ].includes(type);

                return (
                  <div
                    key={node.id}
                    className={`logic-gate-node ${gateClass(
                      type
                    )} ${
                      high
                        ? "is-high"
                        : ""
                    }`}
                    style={{
                      left: point.x,
                      top: point.y,
                      width: size.width,
                      height: size.height,
                    }}
                    title={`${type} · ${node.id}`}
                  >
                    <div className="logic-gate-shape">
                      {type === "NOT" ? (
                        <div className="logic-gate-not-body" />
                      ) : (
                        <div className="logic-gate-main-body" />
                      )}

                      {type ===
                        "XOR" ||
                      type ===
                        "XNOR" ? (
                        <div className="logic-gate-xor-trace" />
                      ) : null}

                      {inverted ? (
                        <span className="logic-gate-bubble" />
                      ) : null}
                    </div>

                    <span className="logic-gate-label">
                      {type}
                    </span>

                    <span className="logic-gate-id">
                      {node.id}
                    </span>
                  </div>
                );
              }
            )}

            {/* OUTPUT */}
            {(() => {
              const outputPoint =
                layout.nodes.get(
                  circuit.output
                );

              if (!outputPoint) {
                return null;
              }

              const outputGate =
                gateSize(
                  nodeById.get(
                    circuit.output
                  )?.type ??
                    "AND"
                );

              const outputType =
                upper(
                  nodeById.get(
                    circuit.output
                  )?.type ?? ""
                );

              const outputOffset =
                [
                  "NOT",
                  "NAND",
                  "NOR",
                  "XNOR",
                ].includes(
                  outputType
                )
                  ? 8
                  : 0;

              const outputX =
                outputPoint.x +
                outputGate.width /
                  2 +
                outputOffset;

              return (
                <>
                  <div
                    className={`logic-output-wire ${
                      outputValue
                        ? "is-high"
                        : ""
                    }`}
                    style={{
                      left: outputX,
                      top: outputPoint.y,
                      width: Math.max(
                        100,
                        layout.width -
                          120 -
                          outputX
                      ),
                    }}
                  />

                  <span
                    className={`logic-output-pin ${
                      outputValue
                        ? "is-high"
                        : ""
                    }`}
                    style={{
                      left:
                        layout.width -
                        120,
                      top: outputPoint.y,
                    }}
                  />

                  <div
                    className="logic-output-label"
                    style={{
                      left:
                        layout.width -
                        100,
                      top: outputPoint.y,
                    }}
                  >
                    {outputs[0] ||
                      "F"}{" "}
                    <strong>
                      {outputValue}
                    </strong>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      </div>

      <div className="logic-circuit-foot">
        <span>
          <i /> ROUTED WIRES · SPACED INPUTS ·
          REAL GATE GEOMETRY
        </span>

        <span>
          OUTPUT{" "}
          <strong>
            {outputValue}
          </strong>
        </span>
      </div>
    </div>
  );
}