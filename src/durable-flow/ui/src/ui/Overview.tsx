import { Maximize2, Minimize2 } from "lucide-react";
import { useEffect, useState } from "react";
import { setMeta } from "../domain/ops";
import { useFlowStore, useFlowStoreApi } from "../store/flowStore";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FlowGraph } from "./FlowGraph";
import { MarkdownEditor } from "./MarkdownEditor";
import { navigate } from "./route";
import { cn } from "@/lib/utils";

export function Overview({ selected }: { selected: string | null }) {
  const stages = useFlowStore((s) => s.draft.stages);
  const goal = useFlowStore((s) => s.draft.goal);
  const current = stages.find((s) => s.name === selected)?.name ?? null;
  const store = useFlowStoreApi();
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Escape peels one layer: full screen first, then the selection.
      if (fullscreen) setFullscreen(false);
      else if (current !== null) navigate({ tab: "overview", item: null }, { replace: true });
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [current, fullscreen]);

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold tracking-tight">Overview</h2>
      <div className="grid gap-6 lg:grid-cols-[2fr_3fr]">
        <div className="min-w-0 max-w-3xl">
          <MarkdownEditor
            ariaLabel="Goal"
            placeholder="Please enter flow goal ..."
            value={goal}
            onCommit={(markdown) =>
              store.getState().apply((f) => setMeta(f, { goal: markdown }), { coalesce: "goal" })
            }
          />
        </div>

        <Card
          data-testid="flow-card"
          data-fullscreen={fullscreen ? "true" : undefined}
          className={cn("min-w-0", fullscreen && "fixed inset-0 z-50 flex flex-col rounded-none border-0")}
        >
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-0">
            <CardTitle>Flow</CardTitle>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label={fullscreen ? "Exit full screen" : "Expand flow to full screen"}
              title={fullscreen ? "Exit full screen (Esc)" : "Full screen"}
              onClick={() => setFullscreen((v) => !v)}
            >
              {fullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
            </Button>
          </CardHeader>
          <CardContent className={cn("space-y-3 pt-2", fullscreen && "flex min-h-0 flex-1 flex-col")}>
            <FlowGraph
              className={fullscreen ? "flex-1" : undefined}
              stages={stages}
              selected={current}
              onSelect={(name) => navigate({ tab: "overview", item: name }, { replace: true })}
            />
            {current !== null && (
              <p className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Selected:</span>
                <b className="truncate font-semibold">{current}</b>
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0"
                  onClick={() => navigate({ tab: "stages", item: current })}
                >
                  Open stage →
                </Button>
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
