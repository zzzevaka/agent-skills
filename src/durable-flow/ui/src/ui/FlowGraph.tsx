import { useMemo } from "react";
import type { Stage } from "../domain/types";
import { cn } from "@/lib/utils";
import { layoutGraph, NODE_H, nodeWidthFor } from "./layoutGraph";
import { STATE_BG, STATE_BORDER, STATE_LABELS } from "./states";

interface Props {
  stages: Stage[];
  selected: string | null;
  onSelect(name: string): void;
  /** Classes for the scrolling wrapper; defaults to a height capped by the viewport. */
  className?: string;
}

export function FlowGraph({ stages, selected, onSelect, className }: Props) {
  const layout = useMemo(
    () => layoutGraph(stages, { nodeWidth: nodeWidthFor(stages.map((s) => s.name)) }),
    [stages],
  );
  const stateOf = useMemo(() => new Map(stages.map((s) => [s.name, s.state])), [stages]);
  const related = useMemo(() => {
    const names = new Set<string>();
    if (selected === null) return names;
    for (const stage of stages) {
      if (stage.name === selected) stage.depends_on.forEach((d) => names.add(d));
      if (stage.depends_on.includes(selected)) names.add(stage.name);
    }
    return names;
  }, [stages, selected]);
  const dimmed = selected !== null;

  return (
    <div className={cn("graph-wrap min-h-0 overflow-auto", className ?? "max-h-[calc(100svh-14rem)]")}>
      <div className="graph relative mx-auto" style={{ width: layout.width, height: layout.height }}>
        <svg
          className="edges pointer-events-none absolute inset-0 overflow-visible"
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          width={layout.width}
          height={layout.height}
          aria-hidden="true"
        >
          {layout.edges.map((edge) => {
            const done = stateOf.get(edge.from) === "finished";
            const highlighted = dimmed && (edge.from === selected || edge.to === selected);
            return (
              <path
                key={`${edge.from}>${edge.to}`}
                d={edge.path}
                className={cn(
                  "fill-none stroke-border stroke-[1.5] transition-[stroke,opacity]",
                  done && "done stroke-status-finished/60",
                  highlighted && "hl stroke-primary stroke-2",
                  dimmed && !highlighted && "opacity-35",
                )}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            );
          })}
        </svg>
        {layout.nodes.map((node, index) => {
          const state = stages[index].state;
          const isSelected = node.name === selected;
          const isRelated = related.has(node.name);
          return (
            <button
              key={`${index}:${node.name}`}
              type="button"
              title={node.name}
              style={{ left: node.x, top: node.y, width: node.w, height: NODE_H }}
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
  );
}
