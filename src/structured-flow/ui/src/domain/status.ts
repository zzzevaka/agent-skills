import type { Stage, StageState, StageStatus } from "./types";

/**
 * The display status of every stage, in the order of `stages`. Only a stored `pending`
 * stage is split: it is `ready_to_start` when all its dependencies are finished and
 * `waiting_for_dependencies` otherwise. Mirrors `Flow.status_of` in the Python scripts.
 */
export function computeStatuses(stages: readonly Stage[]): StageStatus[] {
  const finished = new Set(stages.filter((s) => s.state === "finished").map((s) => s.name));
  return stages.map((stage) => {
    if (stage.state !== "pending") return stage.state;
    return stage.depends_on.every((name) => finished.has(name))
      ? "ready_to_start"
      : "waiting_for_dependencies";
  });
}

/** The state stored in the flow file for a display status. */
export function storedState(status: StageStatus): StageState {
  return status === "ready_to_start" || status === "waiting_for_dependencies" ? "pending" : status;
}
