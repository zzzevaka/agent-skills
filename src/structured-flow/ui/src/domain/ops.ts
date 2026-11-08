/**
 * Pure edit operations on a Flow. Each returns a new Flow (never mutates its
 * input) and throws OpError, with a message fit to show the user, when the
 * edit is not allowed. A valid flow stays valid after every operation.
 */
import { pyRepr, pyStrip } from "./pyCompat";
import type { SchemaNode } from "./schemaDef";
import { STAGE_STATES, type Flow, type Stage } from "./types";

export class OpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpError";
  }
}

const names = (list: string[]) => list.map(pyRepr).join(", ");

function indexOfStage(flow: Flow, name: string): number {
  const index = flow.stages.findIndex((stage) => stage.name === name);
  if (index === -1) throw new OpError(`there is no stage named ${pyRepr(name)}`);
  return index;
}

function checkNewName(kind: "stage" | "schema", name: string, taken: boolean): void {
  if (!pyStrip(name)) throw new OpError(`${kind} name must not be empty`);
  if (taken) throw new OpError(`${kind} ${pyRepr(name)} already exists`);
}

const hasStage = (flow: Flow, name: string) => flow.stages.some((s) => s.name === name);
const hasSchema = (flow: Flow, name: string) => Object.hasOwn(flow.schemas, name);

function updateStage(flow: Flow, name: string, change: (stage: Stage) => Stage): Flow {
  const index = indexOfStage(flow, name);
  return {
    ...flow,
    stages: flow.stages.map((stage, i) => (i === index ? change(stage) : stage)),
  };
}

export function dependentsOf(flow: Flow, stage: string): string[] {
  return flow.stages.filter((s) => s.depends_on.includes(stage)).map((s) => s.name);
}

export function usedBy(flow: Flow, schema: string): string[] {
  return flow.stages.filter((s) => s.output_schema === schema).map((s) => s.name);
}

export function renameStage(flow: Flow, oldName: string, newName: string): Flow {
  indexOfStage(flow, oldName);
  if (oldName === newName) return flow;
  checkNewName("stage", newName, hasStage(flow, newName));
  return {
    ...flow,
    stages: flow.stages.map((stage) => ({
      ...stage,
      name: stage.name === oldName ? newName : stage.name,
      depends_on: stage.depends_on.map((d) => (d === oldName ? newName : d)),
    })),
  };
}

function blankStage(name: string): Stage {
  return {
    name,
    prompt: "",
    depends_on: [],
    output_schema: null,
    state: "pending",
    message: null,
    output: null,
  };
}

export function addStage(flow: Flow, name?: string): Flow {
  let chosen = name;
  if (chosen === undefined) {
    let n = flow.stages.length + 1;
    while (hasStage(flow, `stage-${n}`)) n += 1;
    chosen = `stage-${n}`;
  } else {
    checkNewName("stage", chosen, hasStage(flow, chosen));
  }
  return { ...flow, stages: [...flow.stages, blankStage(chosen)] };
}

export function duplicateStage(flow: Flow, name: string): Flow {
  const index = indexOfStage(flow, name);
  const original = flow.stages[index];
  let copyName = `${name}-copy`;
  for (let n = 2; hasStage(flow, copyName); n += 1) copyName = `${name}-copy-${n}`;
  const copy: Stage = {
    ...blankStage(copyName),
    prompt: original.prompt,
    depends_on: [...original.depends_on],
    output_schema: original.output_schema,
  };
  const stages = [...flow.stages];
  stages.splice(index + 1, 0, copy);
  return { ...flow, stages };
}

export function deleteStage(flow: Flow, name: string, opts: { unlink: boolean }): Flow {
  indexOfStage(flow, name);
  if (flow.stages.length === 1) throw new OpError("flow must contain at least one stage");
  const dependents = dependentsOf(flow, name);
  if (dependents.length && !opts.unlink) {
    throw new OpError(`stage ${pyRepr(name)} is required by: ${names(dependents)}`);
  }
  return {
    ...flow,
    stages: flow.stages
      .filter((stage) => stage.name !== name)
      .map((stage) => ({ ...stage, depends_on: stage.depends_on.filter((d) => d !== name) })),
  };
}

export function moveStage(flow: Flow, from: number, to: number): Flow {
  const last = flow.stages.length - 1;
  for (const index of [from, to]) {
    if (!Number.isInteger(index) || index < 0 || index > last) {
      throw new OpError(`position ${index} is outside the stage list`);
    }
  }
  if (from === to) return flow;
  const stages = [...flow.stages];
  const [moved] = stages.splice(from, 1);
  stages.splice(to, 0, moved);
  stages.forEach((stage, position) => {
    for (const dependency of stage.depends_on) {
      if (stages.findIndex((s) => s.name === dependency) >= position) {
        throw new OpError(
          `stage ${pyRepr(stage.name)} would come before its dependency ${pyRepr(dependency)}`,
        );
      }
    }
  });
  return { ...flow, stages };
}

export function setDependencies(flow: Flow, name: string, dependencies: string[]): Flow {
  const index = indexOfStage(flow, name);
  if (new Set(dependencies).size !== dependencies.length) {
    throw new OpError(`stage ${pyRepr(name)} repeats a dependency`);
  }
  for (const dependency of dependencies) {
    const position = flow.stages.findIndex((s) => s.name === dependency);
    if (position === -1 || position >= index) {
      throw new OpError(
        `stage ${pyRepr(name)} can only depend on earlier stages; ` +
          `${pyRepr(dependency)} is not an earlier stage`,
      );
    }
  }
  return updateStage(flow, name, (stage) => ({ ...stage, depends_on: [...dependencies] }));
}

/** Make every stage after `name` depend on it (stages that already do are left alone). */
export function addDependencyToFollowing(flow: Flow, name: string): Flow {
  const index = indexOfStage(flow, name);
  let changed = false;
  const stages = flow.stages.map((stage, position) => {
    if (position <= index || stage.depends_on.includes(name)) return stage;
    changed = true;
    const wanted = new Set([...stage.depends_on, name]);
    const depends_on = flow.stages
      .slice(0, position)
      .map((earlier) => earlier.name)
      .filter((earlier) => wanted.has(earlier));
    return { ...stage, depends_on };
  });
  return changed ? { ...flow, stages } : flow;
}

export function setOutputSchema(flow: Flow, name: string, schema: string | null): Flow {
  if (schema !== null && !hasSchema(flow, schema)) {
    throw new OpError(`unknown schema ${pyRepr(schema)}`);
  }
  return updateStage(flow, name, (stage) => ({ ...stage, output_schema: schema }));
}

export function setStageFields(
  flow: Flow,
  name: string,
  patch: Partial<Pick<Stage, "prompt" | "state" | "message" | "output">>,
): Flow {
  if (patch.state !== undefined && !STAGE_STATES.includes(patch.state)) {
    throw new OpError(`invalid state ${pyRepr(String(patch.state))}`);
  }
  return updateStage(flow, name, (stage) => ({ ...stage, ...patch }));
}

const reset = (stage: Stage): Stage => ({ ...stage, state: "pending", message: null, output: null });

export function resetStage(flow: Flow, name: string): Flow {
  return updateStage(flow, name, reset);
}

export function resetFrom(flow: Flow, name: string): Flow {
  const index = indexOfStage(flow, name);
  return { ...flow, stages: flow.stages.map((stage, i) => (i >= index ? reset(stage) : stage)) };
}

/** A schema name that is not taken yet: `schema-N`. */
export function newSchemaName(flow: Flow): string {
  let n = Object.keys(flow.schemas).length + 1;
  while (Object.hasOwn(flow.schemas, `schema-${n}`)) n += 1;
  return `schema-${n}`;
}

export function addSchema(flow: Flow, name: string, definition: SchemaNode): Flow {
  checkNewName("schema", name, hasSchema(flow, name));
  return { ...flow, schemas: { ...flow.schemas, [name]: definition } };
}

export function renameSchema(flow: Flow, oldName: string, newName: string): Flow {
  if (!hasSchema(flow, oldName)) throw new OpError(`there is no schema named ${pyRepr(oldName)}`);
  if (oldName === newName) return flow;
  checkNewName("schema", newName, hasSchema(flow, newName));
  return {
    ...flow,
    schemas: Object.fromEntries(
      Object.entries(flow.schemas).map(([key, value]) => [key === oldName ? newName : key, value]),
    ),
    stages: flow.stages.map((stage) =>
      stage.output_schema === oldName ? { ...stage, output_schema: newName } : stage,
    ),
  };
}

export function deleteSchema(flow: Flow, name: string, opts: { unlink: boolean }): Flow {
  if (!hasSchema(flow, name)) throw new OpError(`there is no schema named ${pyRepr(name)}`);
  const users = usedBy(flow, name);
  if (users.length && !opts.unlink) {
    throw new OpError(`schema ${pyRepr(name)} is used by: ${names(users)}`);
  }
  return {
    ...flow,
    schemas: Object.fromEntries(Object.entries(flow.schemas).filter(([key]) => key !== name)),
    stages: flow.stages.map((stage) =>
      stage.output_schema === name ? { ...stage, output_schema: null } : stage,
    ),
  };
}

export function setSchema(flow: Flow, name: string, definition: SchemaNode): Flow {
  if (!hasSchema(flow, name)) throw new OpError(`there is no schema named ${pyRepr(name)}`);
  return { ...flow, schemas: { ...flow.schemas, [name]: definition } };
}

export function setMeta(
  flow: Flow,
  patch: Partial<Pick<Flow, "name" | "goal" | "revision">>,
): Flow {
  if (
    patch.revision !== undefined &&
    (!Number.isInteger(patch.revision) || patch.revision < 0)
  ) {
    throw new OpError("revision must be a non-negative integer");
  }
  return { ...flow, ...patch };
}
