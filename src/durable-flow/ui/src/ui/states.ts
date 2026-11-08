import type { StageState } from "../domain/types";

export const STATE_LABELS: Record<StageState, string> = {
  pending: "Pending",
  inprogress: "In progress",
  waiting: "Waiting",
  finished: "Finished",
  failed: "Failed",
};

/** Order used by the progress bar and legend. */
export const STATE_ORDER: readonly StageState[] = [
  "finished",
  "inprogress",
  "waiting",
  "pending",
  "failed",
];

/** Tailwind classes per state (static strings so the class scanner finds them). */
export const STATE_BG: Record<StageState, string> = {
  pending: "bg-status-pending",
  inprogress: "bg-status-inprogress",
  waiting: "bg-status-waiting",
  finished: "bg-status-finished",
  failed: "bg-status-failed",
};

export const STATE_TEXT: Record<StageState, string> = {
  pending: "text-status-pending",
  inprogress: "text-status-inprogress",
  waiting: "text-status-waiting",
  finished: "text-status-finished",
  failed: "text-status-failed",
};

export const STATE_BORDER: Record<StageState, string> = {
  pending: "",
  inprogress: "border-status-inprogress/50",
  waiting: "border-status-waiting/50",
  finished: "",
  failed: "border-status-failed/50",
};
