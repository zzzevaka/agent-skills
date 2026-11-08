import { Redo2, Undo2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useFlowStore, useFlowStoreApi } from "../store/flowStore";
import { Button } from "@/components/ui/button";

export function SaveBar({ onSave }: { onSave(): void }) {
  const store = useFlowStoreApi();
  const dirty = useFlowStore((s) => s.dirty);
  const errors = useFlowStore((s) => s.errors);
  const canUndo = useFlowStore((s) => s.canUndo);
  const canRedo = useFlowStore((s) => s.canRedo);
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(timer);
  }, [armed]);
  useEffect(() => {
    if (!dirty) setArmed(false);
  }, [dirty]);

  if (!dirty && !canUndo && !canRedo) return null;
  return (
    <div
      className="fixed bottom-14 right-4 z-20 flex items-center gap-1.5 rounded-lg border bg-background/95 p-1.5 shadow-lg backdrop-blur md:right-6"
      role="group"
      aria-label="Changes"
    >
      {canUndo && (
        <Button variant="ghost" size="sm" onClick={() => store.getState().undo()}>
          <Undo2 aria-hidden="true" />
          Undo
        </Button>
      )}
      {canRedo && (
        <Button variant="ghost" size="sm" onClick={() => store.getState().redo()}>
          <Redo2 aria-hidden="true" />
          Redo
        </Button>
      )}
      {dirty && (
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={() => (armed ? store.getState().discard() : setArmed(true))}
          >
            {armed ? "Click again to discard" : "Discard"}
          </Button>
          <Button
            size="sm"
            disabled={errors.length > 0}
            title={errors.length ? errors.join("; ") : "Save (Ctrl+S)"}
            onClick={onSave}
          >
            Save
          </Button>
        </>
      )}
    </div>
  );
}
