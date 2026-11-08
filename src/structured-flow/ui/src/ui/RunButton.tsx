import { CircleHelp } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RunDialog } from "./RunDialog";

/** The "How to run?" button: opens the instructions for running the flow with an agent. */
export function RunButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1.5 px-2 text-xs"
        title="How to run?"
        onClick={() => setOpen(true)}
      >
        <CircleHelp aria-hidden="true" />
        <span className="max-sm:sr-only">How to run?</span>
      </Button>
      {open && <RunDialog onClose={() => setOpen(false)} />}
    </>
  );
}
