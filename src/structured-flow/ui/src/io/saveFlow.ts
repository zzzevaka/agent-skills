import { invariantErrors } from "../domain/flow";
import { formatFromName, parseText, serializeFlow, type FileFormat } from "../domain/serialize";
import type { Flow } from "../domain/types";
import type { FlowFileAdapter } from "./adapter";

export type SaveResult =
  | { ok: true; saved: Flow }
  | { ok: false; reason: "conflict"; diskRevision: number }
  | { ok: false; reason: "unreadable"; message: string }
  | { ok: false; reason: "write-failed"; message: string }
  | { ok: false; reason: "invalid"; errors: string[] };

export interface SaveArgs {
  adapter: FlowFileAdapter;
  draft: Flow;
  /** Revision of the file this draft was based on. */
  baselineRevision: number;
  /** Revision to write (normally baseline + 1, or the one typed by the user). */
  revision: number;
  format: FileFormat;
  /** Write without comparing revisions (the user chose to overwrite). */
  skipCheck?: boolean;
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * Save the draft. For a real file the current revision on disk is compared
 * with the one the draft was based on first, so changes made by an agent in
 * the meantime are never overwritten silently.
 */
export async function saveFlow(args: SaveArgs): Promise<SaveResult> {
  const { adapter, draft, baselineRevision, revision, format, skipCheck = false } = args;
  const candidate: Flow = { ...draft, revision };
  const errors = invariantErrors(candidate);
  if (errors.length) return { ok: false, reason: "invalid", errors };

  if (adapter.kind === "handle" && !skipCheck) {
    let raw: unknown;
    try {
      const { text } = await adapter.read();
      raw = parseText(text, formatFromName(adapter.name) ?? format);
    } catch (err) {
      return { ok: false, reason: "unreadable", message: `Could not read the file: ${message(err)}` };
    }
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      return { ok: false, reason: "unreadable", message: "The file on disk does not contain a flow" };
    }
    const disk = "revision" in raw ? (raw as { revision: unknown }).revision : 0;
    if (typeof disk !== "number" || !Number.isInteger(disk)) {
      return { ok: false, reason: "unreadable", message: "The file on disk has an invalid revision" };
    }
    if (disk !== baselineRevision) return { ok: false, reason: "conflict", diskRevision: disk };
  }

  try {
    await adapter.write(serializeFlow(candidate, format));
  } catch (err) {
    return { ok: false, reason: "write-failed", message: `Could not write the file: ${message(err)}` };
  }
  return { ok: true, saved: candidate };
}
