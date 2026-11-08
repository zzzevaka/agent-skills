import { findErrors, parseFlow } from "../domain/flow";
import { formatFromName, parseText, type FileFormat } from "../domain/serialize";
import type { Flow } from "../domain/types";
import type { FlowFileAdapter } from "./adapter";

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Parse and validate a flow file's text; throws an Error whose message can be shown as is. */
export function flowFromText(
  text: string,
  name: string,
  fallback: FileFormat,
): { flow: Flow; format: FileFormat } {
  const format = formatFromName(name) ?? fallback;
  let raw: unknown;
  try {
    raw = parseText(text, format);
  } catch (err) {
    throw new Error(`Could not read ${name}: ${message(err)}`);
  }
  const errors = findErrors(raw);
  if (errors.length) {
    const more = errors.length > 1 ? ` (and ${errors.length - 1} more)` : "";
    throw new Error(`${name} has problems: ${errors[0]}${more}`);
  }
  return { flow: parseFlow(raw), format };
}

export async function readFlowFrom(
  adapter: FlowFileAdapter,
  fallback: FileFormat,
): Promise<{ flow: Flow; format: FileFormat }> {
  let text: string;
  try {
    ({ text } = await adapter.read());
  } catch (err) {
    throw new Error(`Could not read ${adapter.name}: ${message(err)}`);
  }
  return flowFromText(text, adapter.name, fallback);
}
