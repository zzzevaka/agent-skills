import { setMeta } from "../domain/ops";
import { useFlowStore, useFlowStoreApi } from "../store/flowStore";
import { InlineEdit } from "./InlineEdit";

export function EditableTitle() {
  const store = useFlowStoreApi();
  const name = useFlowStore((s) => s.draft.name);
  return (
    <h1 className="min-w-0 text-base font-semibold tracking-tight">
      <InlineEdit
        value={name}
        inputLabel="Flow name"
        buttonLabel="Edit flow name"
        buttonTitle="Rename the flow"
        placeholder="Untitled flow"
        onCommit={(value) => store.getState().apply((flow) => setMeta(flow, { name: value }))}
      />
    </h1>
  );
}
