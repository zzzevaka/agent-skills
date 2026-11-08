import { useMemo } from "react";
import { addStage, deleteStage, duplicateStage, moveStage, renameStage } from "../domain/ops";
import type { Flow } from "../domain/types";
import { useFlowStoreApi } from "../store/flowStore";
import { navigate } from "./route";

const select = (name: string) => navigate({ tab: "stages", item: name }, { replace: true });

/** Stage-list operations that also keep the URL selection in step. */
export function useStageActions() {
  const store = useFlowStoreApi();
  return useMemo(() => {
    const run = (op: (flow: Flow) => Flow) => {
      const before = store.getState().draft;
      store.getState().apply(op);
      const after = store.getState().draft;
      return { before, after, changed: before !== after };
    };
    return {
      add() {
        const { after, changed } = run((flow) => addStage(flow));
        if (changed) select(after.stages[after.stages.length - 1].name);
      },
      duplicate(name: string) {
        const { before, after, changed } = run((flow) => duplicateStage(flow, name));
        if (!changed) return;
        const known = new Set(before.stages.map((s) => s.name));
        const copy = after.stages.find((s) => !known.has(s.name));
        if (copy) select(copy.name);
      },
      remove(name: string, unlink: boolean) {
        const index = store.getState().draft.stages.findIndex((s) => s.name === name);
        const { after, changed } = run((flow) => deleteStage(flow, name, { unlink }));
        if (changed) select(after.stages[Math.max(0, index - 1)].name);
      },
      move(from: number, to: number) {
        run((flow) => moveStage(flow, from, to));
      },
      rename(oldName: string, newName: string) {
        const { changed } = run((flow) => renameStage(flow, oldName, newName));
        if (changed) select(newName);
      },
    };
  }, [store]);
}
