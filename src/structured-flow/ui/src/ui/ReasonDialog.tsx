import { useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export type ReasonState = "waiting" | "failed";

interface Props {
  state: ReasonState;
  /** The reason already set, when editing it. */
  initial: string;
  /** `true` when only the reason is edited (the state does not change). */
  editing: boolean;
  onSubmit(reason: string): void;
  onCancel(): void;
}

const TEXT: Record<ReasonState, { title: string; hint: string; confirm: string }> = {
  waiting: {
    title: "Why is the stage waiting?",
    hint: "Say what is awaited and what will let the stage resume.",
    confirm: "Set to waiting",
  },
  failed: {
    title: "Why did the stage fail?",
    hint: "Say what went wrong, so someone can decide what to do next.",
    confirm: "Mark as failed",
  },
};

/** Asks for the reason a stage is waiting or failed; the reason is required. */
export function ReasonDialog({ state, initial, editing, onSubmit, onCancel }: Props) {
  const [text, setText] = useState(initial);
  const field = useRef<HTMLTextAreaElement>(null);
  const reason = text.trim();
  const copy = TEXT[state];

  return (
    <AlertDialog open onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          field.current?.focus();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{copy.title}</AlertDialogTitle>
          <AlertDialogDescription>{copy.hint}</AlertDialogDescription>
        </AlertDialogHeader>
        <Textarea
          ref={field}
          aria-label="Reason"
          rows={4}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && reason) onSubmit(reason);
          }}
        />
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button disabled={!reason} onClick={() => onSubmit(reason)}>
            {editing ? "Save reason" : copy.confirm}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
