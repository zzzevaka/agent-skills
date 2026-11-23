import type { SchemaNode } from "./schemaDef";

export type StageState = "pending" | "inprogress" | "waiting" | "finished" | "failed";

export const STAGE_STATES: readonly StageState[] = [
  "pending",
  "inprogress",
  "waiting",
  "finished",
  "failed",
];

/** What a stage looks like to the agent: a stored `pending` stage is split by its dependencies. */
export type StageStatus =
  | "ready_to_start"
  | "waiting_for_dependencies"
  | "inprogress"
  | "waiting"
  | "finished"
  | "failed";

/** Display order of the statuses (progress bar and legend). */
export const STAGE_STATUSES: readonly StageStatus[] = [
  "finished",
  "inprogress",
  "waiting",
  "ready_to_start",
  "waiting_for_dependencies",
  "failed",
];

export interface Stage {
  name: string;
  prompt: string;
  depends_on: string[];
  output_schema: string | null;
  state: StageState;
  message: string | null;
  output: unknown;
}

export interface Flow {
  name: string;
  goal: string;
  stages: Stage[];
  schemas: Record<string, SchemaNode>;
  revision: number;
}

export type { SchemaNode };
