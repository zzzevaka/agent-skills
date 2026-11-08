import { Pencil } from "lucide-react";
import { useState } from "react";
import { useFlowStore, useFlowStoreApi } from "../store/flowStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function RevisionBadge() {
  const store = useFlowStoreApi();
  const baseline = useFlowStore((s) => s.baseline.revision);
  const dirty = useFlowStore((s) => s.dirty);
  const override = useFlowStore((s) => s.revisionOverride);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  const next = override ?? baseline + 1;

  const apply = () => {
    const parsed = value.trim() === "" ? Number.NaN : Number(value);
    if (!Number.isInteger(parsed) || parsed < 0) {
      setProblem("revision must be a non-negative integer");
      return;
    }
    store.getState().setRevisionOverride(parsed);
    setEditing(false);
    setProblem(null);
  };

  return (
    <div
      className="relative ml-auto flex items-center gap-2 font-mono text-xs text-muted-foreground"
      data-testid="revision-badge"
    >
      <span>{`rev ${baseline}${dirty ? ` → ${next}` : ""}`}</span>
      {override !== null && !editing && (
        <Button
          variant="link"
          className="h-auto p-0 text-xs"
          onClick={() => store.getState().setRevisionOverride(null)}
        >
          Use automatic revision
        </Button>
      )}
      {editing ? (
        <span className="relative inline-flex items-center">
          <Input
            type="number"
            aria-label="Revision"
            className="h-7 w-24 text-xs"
            value={value}
            autoFocus
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") apply();
              if (event.key === "Escape") {
                setEditing(false);
                setProblem(null);
              }
            }}
          />
          <p
            role="note"
            className="absolute bottom-full right-0 mb-2 w-72 rounded-md border bg-popover p-3 font-sans text-xs leading-5 text-popover-foreground shadow-md"
          >
            Every save increments the revision. Changing it by hand can break the lock an agent
            holds on this file.
          </p>
          {problem && (
            <p
              role="alert"
              className="absolute bottom-full right-0 mb-24 w-72 rounded-md border border-destructive/50 bg-popover p-3 font-sans text-xs text-destructive shadow-md"
            >
              {problem}
            </p>
          )}
        </span>
      ) : (
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          aria-label="Edit revision"
          title="Set the revision by hand"
          onClick={() => {
            setValue(String(next));
            setProblem(null);
            setEditing(true);
          }}
        >
          <Pencil className="!size-3.5" aria-hidden="true" />
        </Button>
      )}
    </div>
  );
}
