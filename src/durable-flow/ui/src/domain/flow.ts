/**
 * Port of Flow.invariant_errors (models.py), parse_flow (repositories.py) and
 * find_errors (validate.py). Messages are identical; see the parity corpus.
 */
import { pyRepr, pyStrip, pyValueRepr } from "./pyCompat";
import { ValidationError, validateDefinition } from "./schemaDef";
import { STAGE_STATES, type Flow, type SchemaNode, type Stage, type StageState } from "./types";

type Raw = Record<string, unknown>;

// `prompt` is the legacy name of `goal`, still accepted when reading.
const FLOW_KEYS = new Set(["name", "goal", "prompt", "schemas", "stages", "revision"]);
const STAGE_KEYS = new Set([
  "name",
  "prompt",
  "depends_on",
  "output_schema",
  "state",
  "message",
  "output",
]);

function isObject(value: unknown): value is Raw {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function required(raw: Raw, key: string): unknown {
  if (!(key in raw)) throw new ValidationError(`missing key ${pyRepr(key)}`);
  return raw[key];
}

/** Build a Flow from raw file data without checking its invariants. */
export function parseFlow(raw: unknown): Flow {
  if (!isObject(raw)) throw new ValidationError("flow file must contain an object");
  const goal = "goal" in raw ? raw.goal : raw.prompt;
  if (goal === null || goal === undefined) {
    throw new ValidationError("missing key 'goal' (formerly 'prompt')");
  }
  const schemas = "schemas" in raw ? raw.schemas : {};
  if (!isObject(schemas)) throw new ValidationError("'schemas' must be an object");

  const rawStages = required(raw, "stages");
  if (!Array.isArray(rawStages)) {
    throw new ValidationError("malformed flow file: 'stages' must be a list");
  }
  const stages: Stage[] = rawStages.map((rawStage, index) => {
    if (!isObject(rawStage)) throw new ValidationError(`stage ${index} must be an object`);
    const dependencies = "depends_on" in rawStage ? rawStage.depends_on : [];
    if (!Array.isArray(dependencies) || !dependencies.every((d) => typeof d === "string")) {
      const label = "name" in rawStage ? pyValueRepr(rawStage.name) : String(index);
      throw new ValidationError(`stage ${label} 'depends_on' must be a list of names`);
    }
    const state = "state" in rawStage ? rawStage.state : "pending";
    if (!STAGE_STATES.includes(state as StageState)) {
      throw new ValidationError(
        `invalid stage state: ${pyValueRepr(state)} is not a valid StageState`,
      );
    }
    const name = required(rawStage, "name") as string;
    const prompt = required(rawStage, "prompt") as string;
    const legacyMessageOutput = state === "finished" && !("output" in rawStage);
    return {
      name,
      prompt,
      depends_on: [...(dependencies as string[])],
      output_schema: (rawStage.output_schema ?? null) as string | null,
      state: state as StageState,
      message: legacyMessageOutput ? null : ((rawStage.message ?? null) as string | null),
      output: legacyMessageOutput ? (rawStage.message ?? null) : (rawStage.output ?? null),
    };
  });

  return {
    name: required(raw, "name") as string,
    goal: goal as string,
    stages,
    schemas: schemas as Record<string, SchemaNode>,
    revision: ("revision" in raw ? raw.revision : 0) as number,
  };
}

/** Problems that make a flow unusable, in the same order as the Python code. */
export function invariantErrors(flow: Flow): string[] {
  const errors: string[] = [];
  if (typeof flow.revision !== "number" || !Number.isInteger(flow.revision) || flow.revision < 0) {
    errors.push("flow revision must be a non-negative integer");
  }
  if (typeof flow.name !== "string" || !pyStrip(flow.name)) {
    errors.push("flow name must be a non-empty string");
  }
  if (typeof flow.goal !== "string") errors.push("flow goal must be a string");
  if (!flow.stages.length) errors.push("flow must contain at least one stage");

  for (const [name, definition] of Object.entries(flow.schemas)) {
    if (!name) {
      errors.push("schema names must be non-empty strings");
      continue;
    }
    try {
      validateDefinition(definition, `schemas.${name}`);
    } catch (err) {
      if (err instanceof ValidationError) errors.push(err.message);
      else throw err;
    }
  }

  const seen = new Set<string>();
  for (const stage of flow.stages) {
    if (typeof stage.name !== "string" || !pyStrip(stage.name)) {
      errors.push("stage names must be non-empty strings");
      continue;
    }
    const label = pyRepr(stage.name);
    if (typeof stage.prompt !== "string") errors.push(`stage ${label} prompt must be a string`);
    if (!STAGE_STATES.includes(stage.state)) errors.push(`stage ${label} has an invalid state`);
    if (seen.has(stage.name)) errors.push(`stage ${label} is duplicated`);
    if (new Set(stage.depends_on).size !== stage.depends_on.length) {
      errors.push(`stage ${label} repeats a dependency`);
    }
    for (const dependency of stage.depends_on) {
      if (!seen.has(dependency)) {
        errors.push(
          `stage ${label} depends on ${pyRepr(dependency)}, which must be a previous stage`,
        );
      }
    }
    if (stage.output_schema !== null && typeof stage.output_schema !== "string") {
      errors.push(`stage ${label} output_schema must be a string`);
    } else if (stage.output_schema !== null && !Object.hasOwn(flow.schemas, stage.output_schema)) {
      errors.push(
        `stage ${label} references unknown output schema ${pyRepr(stage.output_schema)}`,
      );
    }
    seen.add(stage.name);
  }
  return errors;
}

function unknownKeys(value: Raw, known: Set<string>, owner: string): string[] {
  return Object.keys(value)
    .filter((key) => !known.has(key))
    .sort()
    .map((key) => `${owner} has unknown key ${pyRepr(key)}`);
}

/** Every problem in raw flow data: unknown keys, then parse or invariant errors. */
export function findErrors(raw: unknown): string[] {
  if (!isObject(raw)) return ["flow file must contain an object"];

  const errors = unknownKeys(raw, FLOW_KEYS, "flow");
  if (Array.isArray(raw.stages)) {
    raw.stages.forEach((stage, index) => {
      if (isObject(stage)) {
        const label = `stage ${"name" in stage ? pyValueRepr(stage.name) : index}`;
        errors.push(...unknownKeys(stage, STAGE_KEYS, label));
      }
    });
  }

  let flow: Flow;
  try {
    flow = parseFlow(raw);
  } catch (err) {
    if (err instanceof ValidationError) return [...errors, err.message];
    throw err;
  }
  return [...errors, ...invariantErrors(flow)];
}
