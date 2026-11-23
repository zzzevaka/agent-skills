import { STAGE_STATUSES, type StageState, type StageStatus } from "../domain/types";

export const STATE_LABELS: Record<StageStatus, string> = {
  ready_to_start: "Ready to start",
  waiting_for_dependencies: "Waiting for dependencies",
  inprogress: "In progress",
  waiting: "Waiting",
  finished: "Finished",
  failed: "Failed",
};

/** Labels of the states stored in a flow file, as listed by the state menu. */
export const STORED_STATE_LABELS: Record<StageState, string> = {
  pending: "Pending",
  inprogress: "In progress",
  waiting: "Waiting",
  finished: "Finished",
  failed: "Failed",
};

/** Order used by the progress bar and legend. */
export const STATE_ORDER: readonly StageStatus[] = STAGE_STATUSES;

/** The status whose colour a stored state uses (a stored `pending` is shown grey). */
export const statusForStored = (state: StageState): StageStatus =>
  state === "pending" ? "waiting_for_dependencies" : state;

/** Tailwind classes per status (static strings so the class scanner finds them). */
export const STATE_BG: Record<StageStatus, string> = {
  ready_to_start: "bg-status-ready",
  waiting_for_dependencies: "bg-status-pending",
  inprogress: "bg-status-inprogress",
  waiting: "bg-status-waiting",
  finished: "bg-status-finished",
  failed: "bg-status-failed",
};

export const STATE_TEXT: Record<StageStatus, string> = {
  ready_to_start: "text-status-ready",
  waiting_for_dependencies: "text-status-pending",
  inprogress: "text-status-inprogress",
  waiting: "text-status-waiting",
  finished: "text-status-finished",
  failed: "text-status-failed",
};

export const STATE_BORDER: Record<StageStatus, string> = {
  ready_to_start: "border-status-ready/50",
  waiting_for_dependencies: "",
  inprogress: "border-status-inprogress/50",
  waiting: "border-status-waiting/50",
  finished: "",
  failed: "border-status-failed/50",
};
