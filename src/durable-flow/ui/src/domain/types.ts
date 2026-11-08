import type { SchemaNode } from "./schemaDef";

export type StageState = "pending" | "inprogress" | "waiting" | "finished" | "failed";

export const STAGE_STATES: readonly StageState[] = [
  "pending",
  "inprogress",
  "waiting",
  "finished",
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
