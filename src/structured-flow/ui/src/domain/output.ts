/** Converting a stage output to and from the text shown in the editor. */

export function outputToText(output: unknown): string {
  if (output === null || output === undefined) return "";
  return typeof output === "string" ? output : JSON.stringify(output, null, 2);
}

/**
 * Text typed by the user to the value to store: blank is "no output", string
 * schemas keep the text as typed, structured ones are parsed as JSON when they
 * can be (otherwise the text stays, and a warning explains why).
 */
export function outputFromText(text: string, stringSchema: boolean): unknown {
  if (text.trim() === "") return null;
  if (stringSchema) return text;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
