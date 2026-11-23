import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { Stage } from "../domain/types";
import { cn } from "@/lib/utils";
import { edgeHue, fitScale, layoutGraph, nodeWidthFor, type Direction } from "./layoutGraph";
import { computeStatuses } from "../domain/status";
import { STATE_BG, STATE_BORDER, STATE_LABELS } from "./states";

interface Props {
  stages: Stage[];
  selected: string | null;
  onSelect(name: string): void;
  /** Top to bottom (default) or left to right. */
  direction?: Direction;
  /** Classes for the scrolling wrapper; give it `flex-1` inside a height-limited card to make the graph scroll there. */
  className?: string;
}

const hueStyle = (source: number) => ({ "--h": edgeHue(source) }) as CSSProperties;

export function FlowGraph({ stages, selected, onSelect, direction = "vertical", className }: Props) {
  const layout = useMemo(
    () => layoutGraph(stages, { nodeWidth: nodeWidthFor(stages.map((s) => s.name)), direction }),
    [stages, direction],
  );
  const statuses = useMemo(() => computeStatuses(stages), [stages]);
  const stateOf = useMemo(() => new Map(stages.map((s, i) => [s.name, statuses[i]])), [stages, statuses]);
  // Related stages are the ones joined to the selection by a drawn edge.
  const related = useMemo(() => {
    const names = new Set<string>();
    if (selected === null) return names;
    for (const edge of layout.edges) {
      if (edge.to === selected) names.add(edge.from);
      if (edge.from === selected) names.add(edge.to);
    }
    return names;
  }, [layout, selected]);
  const dimmed = selected !== null;

  // Shrink a graph that is wider than its card so it is visible at once. The card
  // scrolls only when even the smallest scale does not fit.
  const wrap = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(0);
  useEffect(() => {
    const element = wrap.current;
    if (!element) return;
    const update = () => setAvailable(element.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const scale = fitScale(available, layout.width);

  return (
    <div ref={wrap} className={cn("graph-wrap min-h-0 overflow-auto", className)}>
      <div className="mx-auto" style={{ width: layout.width * scale, height: layout.height * scale }}>
        <div
          className="graph relative"
          style={{
            width: layout.width,
            height: layout.height,
            ...(scale < 1 ? { transform: `scale(${scale})`, transformOrigin: "top left" } : {}),
          }}
        >
          <svg
            className="edges pointer-events-none absolute inset-0 overflow-visible"
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            width={layout.width}
            height={layout.height}
            aria-hidden="true"
          >
            <g className={cn("transition-opacity", dimmed && "opacity-35")}>
              {layout.edges
                .filter((edge) => !edge.implied)
                .map((edge) => (
                  <path
                    key={`${edge.from}>${edge.to}`}
                    d={edge.path}
                    style={hueStyle(edge.source)}
                    className={cn(
                      "edge-line fill-none stroke-[1.5]",
                      stateOf.get(edge.from) === "finished" ? "done" : "opacity-80",
                    )}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ))}
            </g>
            {layout.edges
              .filter((edge) => edge.from === selected || edge.to === selected)
              .map((edge) => (
                <path
                  key={`${edge.from}>${edge.to}`}
                  d={edge.path}
                  style={hueStyle(edge.source)}
                  className={cn(
                    "hl edge-line fill-none",
                    edge.implied ? "implied stroke-[1.5] [stroke-dasharray:5_4]" : "stroke-[2.5]",
                  )}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}
          </svg>
          {layout.nodes.map((node, index) => {
            const state = statuses[index];
            const isSelected = node.name === selected;
            const isRelated = related.has(node.name);
            return (
              <button
                key={`${index}:${node.name}`}
                type="button"
                title={node.name}
                style={{ left: node.x, top: node.y, width: node.w, height: node.h }}
                onClick={() => onSelect(node.name)}
                className={cn(
                  "node absolute flex flex-col justify-center gap-1 overflow-hidden rounded-lg border bg-card px-3.5 py-2.5 text-left shadow-sm transition",
                  "hover:-translate-y-px hover:border-muted-foreground/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  `s-${state}`,
                  STATE_BORDER[state],
                  isSelected && "selected border-primary ring-2 ring-primary/20",
                  isRelated && "related",
                  dimmed && !isSelected && !isRelated && "opacity-50",
                )}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="font-mono text-[11px] font-semibold text-muted-foreground">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="truncate text-sm font-semibold">{node.name}</span>
                </span>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span
                    className={cn("size-2 rounded-full", STATE_BG[state], state === "inprogress" && "animate-pulse")}
                  />
                  {STATE_LABELS[state]}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
