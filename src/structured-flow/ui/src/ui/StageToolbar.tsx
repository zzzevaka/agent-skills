import { Copy, Trash2 } from "lucide-react";
import { useState } from "react";
import { dependentsOf } from "../domain/ops";
import { pyRepr } from "../domain/pyCompat";
import type { Flow, Stage } from "../domain/types";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ConfirmDialog } from "./ConfirmDialog";
import { useStageActions } from "./stageActions";

function IconAction({
  label,
  disabled,
  title,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  title?: string;
  onClick(): void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label={label}
          title={title}
          disabled={disabled}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function StageToolbar({ flow, stage }: { flow: Flow; stage: Stage }) {
  const actions = useStageActions();
  const [confirming, setConfirming] = useState(false);
  const dependents = dependentsOf(flow, stage.name);
  const only = flow.stages.length === 1;

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex items-center gap-0.5" role="toolbar" aria-label="Stage actions">
        <IconAction label="Duplicate stage" onClick={() => actions.duplicate(stage.name)}>
          <Copy />
        </IconAction>
        <IconAction
          label="Delete stage"
          disabled={only}
          title={only ? "A flow needs at least one stage" : undefined}
          onClick={() => setConfirming(true)}
        >
          <Trash2 />
        </IconAction>
      </div>
      {confirming && (
        <ConfirmDialog
          title={`Delete stage ${pyRepr(stage.name)}?`}
          confirmLabel={dependents.length ? "Unlink and delete" : "Delete"}
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            actions.remove(stage.name, true);
          }}
        >
          {dependents.length > 0 && (
            <p>
              This stage is required by: {dependents.join(", ")}. They will lose this dependency.
            </p>
          )}
        </ConfirmDialog>
      )}
    </TooltipProvider>
  );
}
