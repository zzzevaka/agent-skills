import { useFlowStore } from "../store/flowStore";
import { cn } from "@/lib/utils";
import { STATE_BG, STATE_LABELS, STATE_ORDER } from "./states";

/** One bar with a segment per present state, and "finished / total" at its right. */
export function ProgressSummary() {
  const stages = useFlowStore((s) => s.draft.stages);
  if (stages.length === 0) return null;
  const counts = STATE_ORDER.map((state) => ({
    state,
    count: stages.filter((s) => s.state === state).length,
  })).filter((entry) => entry.count > 0);
  const finished = stages.filter((s) => s.state === "finished").length;
  return (
    <div className="flex items-center gap-2" title={`${finished} of ${stages.length} stages finished`}>
      <div className="flex h-1.5 w-28 overflow-hidden max-sm:w-12 rounded-full bg-muted" data-testid="progress">
        {counts.map(({ state, count }) => (
          <span
            key={state}
            className={cn(STATE_BG[state], "transition-[flex-grow]")}
            style={{ flexGrow: count }}
            title={`${STATE_LABELS[state]}: ${count}`}
          />
        ))}
      </div>
      <span className="tabular-nums text-muted-foreground">{`${finished} / ${stages.length}`}</span>
    </div>
  );
}
