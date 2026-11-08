import type { Flow, Stage } from "../domain/types";

/** The stage a route shows: the named one, else the active (running/waiting/failed) one, else the first. */
export function currentStage(flow: Flow, selected: string | null): { stage: Stage; index: number } | null {
  const named = selected === null ? undefined : flow.stages.find((s) => s.name === selected);
  const active = flow.stages.find((s) => ["inprogress", "waiting", "failed"].includes(s.state));
  const stage = named ?? active ?? flow.stages[0];
  return stage ? { stage, index: flow.stages.indexOf(stage) } : null;
}

/** The schema a route shows: the named one, else the first. */
export function currentSchemaName(flow: Flow, selected: string | null): string | null {
  if (selected !== null && Object.hasOwn(flow.schemas, selected)) return selected;
  return Object.keys(flow.schemas)[0] ?? null;
}
