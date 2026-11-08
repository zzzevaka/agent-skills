import { useMemo } from "react";
import { addSchema, deleteSchema, newSchemaName, renameSchema } from "../domain/ops";
import type { Flow } from "../domain/types";
import { useFlowStoreApi } from "../store/flowStore";
import { navigate } from "./route";

const select = (name: string) => navigate({ tab: "schemas", item: name }, { replace: true });

/** Schema-list operations that also keep the URL selection in step. */
export function useSchemaActions() {
  const store = useFlowStoreApi();
  return useMemo(() => {
    const run = (op: (flow: Flow) => Flow) => {
      const before = store.getState().draft;
      store.getState().apply(op);
      return store.getState().draft !== before;
    };
    return {
      add() {
        const name = newSchemaName(store.getState().draft);
        if (run((f) => addSchema(f, name, { type: "object", properties: {} }))) select(name);
      },
      rename(oldName: string, newName: string) {
        if (run((f) => renameSchema(f, oldName, newName))) select(newName);
      },
      remove(name: string) {
        const names = Object.keys(store.getState().draft.schemas);
        const index = names.indexOf(name);
        if (!run((f) => deleteSchema(f, name, { unlink: true }))) return;
        const remaining = Object.keys(store.getState().draft.schemas);
        if (remaining.length) select(remaining[Math.max(0, index - 1)]);
        else navigate({ tab: "schemas", item: null }, { replace: true });
      },
    };
  }, [store]);
}
