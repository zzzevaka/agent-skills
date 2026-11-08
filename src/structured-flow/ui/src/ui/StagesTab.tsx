import { useFlowStore } from "../store/flowStore";
import { currentStage } from "./selection";
import { StageDetail } from "./StageDetail";

/** The stage pane; the list of stages lives in the sidebar. */
export function StagesTab({ selected }: { selected: string | null }) {
  const flow = useFlowStore((s) => s.draft);
  const current = currentStage(flow, selected);

  return (
    <section data-testid="stage-detail">
      {current ? (
        <StageDetail flow={flow} stage={current.stage} index={current.index} />
      ) : (
        <p className="text-sm text-muted-foreground">This flow has no stages. Use “Add stage”.</p>
      )}
    </section>
  );
}
