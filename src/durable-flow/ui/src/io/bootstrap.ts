import { parseFlow } from "../domain/flow";
import type { Flow } from "../domain/types";
import type { StoreInit } from "../store/flowStore";
import type { FlowFileAdapter } from "./adapter";
import type { Deps } from "./deps";
import { readFlowFrom } from "./readFlow";

/** Key the last opened or saved file is remembered under. */
export const LAST_FILE_KEY = "last";

export interface Notice {
  kind: "info" | "error";
  text: string;
}

export interface BootResult {
  initial: StoreInit;
  /** The remembered file: open (`started`) or waiting for a click to be read again. */
  adapter: FlowFileAdapter | null;
  notice: Notice | null;
  /** A file was opened on load; otherwise the start screen shows. */
  started: boolean;
  /** The remembered file needs the user's permission before it can be read. */
  needsPermission: boolean;
}

export function blankFlow(): Flow {
  return parseFlow({ name: "new-flow", goal: "", stages: [{ name: "stage-1", prompt: "" }] });
}

export const blankInit = (): StoreInit => ({ flow: blankFlow(), format: "yaml", source: null });

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * Decide what the page starts with: the file the user opened last, read from disk
 * right now (so reloading the page shows fresh data), or the start screen.
 */
export async function bootstrap(
  deps: Pick<Deps, "restoreHandle" | "hasPermission">,
): Promise<BootResult> {
  const start = (over: Partial<BootResult> = {}): BootResult => ({
    initial: blankInit(),
    adapter: null,
    notice: null,
    started: false,
    needsPermission: false,
    ...over,
  });

  const adapter = await deps.restoreHandle(LAST_FILE_KEY);
  if (!adapter) return start();

  const permission = await deps.hasPermission(adapter, "read");
  if (permission === "denied") {
    return start({
      notice: { kind: "error", text: `Access to ${adapter.name} was denied. Open the file again.` },
    });
  }
  if (permission === "prompt") return start({ adapter, needsPermission: true });

  try {
    const { flow, format } = await readFlowFrom(adapter, "yaml");
    return start({ initial: { flow, format, source: adapter.name }, adapter, started: true });
  } catch (err) {
    return start({ notice: { kind: "error", text: message(err) } });
  }
}
