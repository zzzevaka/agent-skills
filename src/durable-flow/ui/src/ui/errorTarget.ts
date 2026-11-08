import { pyRepr } from "../domain/pyCompat";
import type { Flow } from "../domain/types";
import type { Route } from "./route";

/** Where to jump for a validation message: the stage or schema it is about. */
export function errorTarget(message: string, flow: Flow): Route | null {
  for (const name of Object.keys(flow.schemas)) {
    if (message.startsWith(`schemas.${name}:`) || message.startsWith(`schemas.${name}.`)) {
      return { tab: "schemas", item: name };
    }
  }
  let best: { index: number; name: string } | null = null;
  for (const stage of flow.stages) {
    const index = message.indexOf(`stage ${pyRepr(stage.name)}`);
    if (index !== -1 && (best === null || index < best.index)) {
      best = { index, name: stage.name };
    }
  }
  return best ? { tab: "stages", item: best.name } : null;
}
