import { CircleAlert, TriangleAlert } from "lucide-react";
import { useFlowStore } from "../store/flowStore";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { errorTarget } from "./errorTarget";
import { navigate } from "./route";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function Problems() {
  const flow = useFlowStore((s) => s.draft);
  const errors = useFlowStore((s) => s.errors);
  const warnings = useFlowStore((s) => s.warnings);
  const total = errors.length + warnings.length;

  const summary = total
    ? [
        errors.length ? plural(errors.length, "error") : null,
        warnings.length ? plural(warnings.length, "warning") : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "No problems";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-2 text-xs"
          data-testid="problems-summary"
          disabled={total === 0}
        >
          {errors.length > 0 && <CircleAlert className="text-destructive" aria-hidden="true" />}
          {errors.length === 0 && warnings.length > 0 && (
            <TriangleAlert className="text-status-waiting" aria-hidden="true" />
          )}
          {summary}
        </Button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-[min(640px,90vw)] p-2">
        <ul role="list" aria-label="Problems" className="max-h-[40vh] space-y-0.5 overflow-auto">
          {errors.map((message) => (
            <li key={`e:${message}`}>
              <button
                type="button"
                className="w-full rounded-md px-2 py-1.5 text-left text-sm text-destructive hover:bg-accent"
                onClick={() => {
                  const target = errorTarget(message, flow);
                  if (target) navigate(target);
                }}
              >
                {`Error: ${message}`}
              </button>
            </li>
          ))}
          {warnings.map((warning) => (
            <li key={`w:${warning.message}`}>
              <button
                type="button"
                className="w-full rounded-md px-2 py-1.5 text-left text-sm text-status-waiting hover:bg-accent"
                onClick={() => {
                  const target = warning.stage
                    ? ({ tab: "stages", item: warning.stage } as const)
                    : errorTarget(warning.message, flow);
                  if (target) navigate(target);
                }}
              >
                {`Warning: ${warning.message}`}
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
