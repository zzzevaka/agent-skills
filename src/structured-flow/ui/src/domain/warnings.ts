/** Runtime-consistency problems that are worth showing but never block saving. */
import { pyRepr } from "./pyCompat";
import { ValidationError, parseAndValidate, validateDefinition, type SchemaNode } from "./schemaDef";
import type { Flow, Stage } from "./types";

export interface Warning {
  stage: string | null;
  message: string;
}

/** The schema definition for a stage's output (`str` by default), or null if unusable. */
export function schemaFor(flow: Flow, stage: Stage): SchemaNode | null {
  if (stage.output_schema === null) return { type: "string" };
  if (!Object.hasOwn(flow.schemas, stage.output_schema)) return null;
  return flow.schemas[stage.output_schema];
}

/** Why `output` does not fit the stage's schema, or null when it does (or cannot be checked). */
export function outputProblem(flow: Flow, stage: Stage, output: unknown): string | null {
  const definition = schemaFor(flow, stage);
  if (definition === null) return null;
  try {
    validateDefinition(definition);
  } catch (err) {
    if (err instanceof ValidationError) return null; // reported as an error elsewhere
    throw err;
  }
  try {
    parseAndValidate(definition, output);
  } catch (err) {
    if (!(err instanceof ValidationError)) throw err;
    return err.message;
  }
  return null;
}

export function runtimeWarnings(flow: Flow): Warning[] {
  const warnings: Warning[] = [];
  const state = new Map(flow.stages.map((s) => [s.name, s.state]));

  flow.stages.forEach((stage, index) => {
    if (stage.state === "finished") {
      for (const dependency of stage.depends_on) {
        if (state.has(dependency) && state.get(dependency) !== "finished") {
          warnings.push({
            stage: stage.name,
            message:
              `stage ${pyRepr(stage.name)} is finished but its dependency ` +
              `${pyRepr(dependency)} is not finished`,
          });
        }
      }
      const problem = outputProblem(flow, stage, stage.output);
      if (problem) {
        warnings.push({
          stage: stage.name,
          message: `stage ${pyRepr(stage.name)} output is invalid: ${problem}`,
        });
      }
    }
    if (stage.state === "pending") {
      const later = flow.stages.slice(index + 1).find((s) => s.state === "finished");
      if (later) {
        warnings.push({
          stage: stage.name,
          message: `stage ${pyRepr(stage.name)} is pending but the later stage ${pyRepr(later.name)} is finished`,
        });
      }
    }
  });

  const active = flow.stages.filter((s) => s.state === "inprogress" || s.state === "waiting");
  if (active.length > 1) {
    warnings.push({
      stage: null,
      message: `more than one stage is in progress or waiting: ${active
        .map((s) => pyRepr(s.name))
        .join(", ")}`,
    });
  }
  return warnings;
}
