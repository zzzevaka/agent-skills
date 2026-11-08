import { Check, ChevronDown } from "lucide-react";
import { useState } from "react";
import { STAGE_STATES, type StageState } from "../domain/types";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { STATE_BG, STATE_LABELS, STATE_TEXT } from "./states";

/** The stage state as a badge; clicking it opens the list of states to choose from. */
export function StateMenu({ state, onChoose }: { state: StageState; onChoose(state: StageState): void }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" data-testid="state-pill" className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Badge variant="outline" className={cn("cursor-pointer gap-1.5 px-2.5 py-1 font-medium", STATE_TEXT[state])}>
            <span className={cn("size-2 rounded-full", STATE_BG[state])} aria-hidden="true" />
            {STATE_LABELS[state]}
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
              <span className={cn("size-2 rounded-full", STATE_BG[value])} aria-hidden="true" />
              <span className="flex-1">{STATE_LABELS[value]}</span>
              {value === state && <Check className="size-4 text-muted-foreground" aria-hidden="true" />}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
