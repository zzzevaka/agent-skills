import { Check, ChevronDown } from "lucide-react";
import { useState } from "react";
import { storedState } from "../domain/status";
import { STAGE_STATES, type StageState, type StageStatus } from "../domain/types";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { STATE_BG, STATE_LABELS, STATE_TEXT, STORED_STATE_LABELS, statusForStored } from "./states";

/** The stage status as a badge; clicking it opens the list of stored states to choose from. */
export function StateMenu({ status, onChoose }: { status: StageStatus; onChoose(state: StageState): void }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" data-testid="state-pill" className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Badge variant="outline" className={cn("cursor-pointer gap-1.5 px-2.5 py-1 font-medium", STATE_TEXT[status])}>
            <span className={cn("size-2 rounded-full", STATE_BG[status])} aria-hidden="true" />
            {STATE_LABELS[status]}
            <ChevronDown className="size-3 opacity-60" aria-hidden="true" />
          </Badge>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-44 p-1">
        <div role="group" aria-label="Set state" className="flex flex-col">
          {STAGE_STATES.map((value) => (
            <button
              key={value}
              type="button"
              className="flex h-8 items-center gap-2 rounded-sm px-2 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
              onClick={() => {
                setOpen(false);
                onChoose(value);
              }}
            >
              <span className={cn("size-2 rounded-full", STATE_BG[statusForStored(value)])} aria-hidden="true" />
              <span className="flex-1">{STORED_STATE_LABELS[value]}</span>
              {value === storedState(status) && <Check className="size-4 text-muted-foreground" aria-hidden="true" />}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
