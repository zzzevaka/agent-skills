/**
 * Reading and writing flow files. Output must be accepted by the Python
 * scripts: key order follows the dataclasses, and YAML is written in the 1.1
 * dialect (what PyYAML reads) so that strings such as `yes`, `on`, `0123` or
 * `2026-11-07` are quoted instead of being re-typed on the Python side.
 */
import YAML from "yaml";
import { ValidationError } from "./schemaDef";
import type { Flow } from "./types";

export type FileFormat = "json" | "yaml";

const YAML_OPTIONS = {
  version: "1.1",
  sortMapEntries: false,
  lineWidth: 0,
  blockQuote: "literal",
} as const;

/** `{name, goal, stages, schemas, revision}` with stage keys in dataclass order. */
function orderedFlow(flow: Flow): Record<string, unknown> {
  return {
    name: flow.name,
    goal: flow.goal,
    stages: flow.stages.map((stage) => ({
      name: stage.name,
      prompt: stage.prompt,
      depends_on: stage.depends_on,
      output_schema: stage.output_schema,
      state: stage.state,
      message: stage.message,
      output: stage.output,
    })),
    schemas: flow.schemas,
    revision: flow.revision,
  };
}

// PyYAML's scanner cannot read these inside plain or block scalars (a tab in a
// plain scalar is a scan error), so such strings are always double-quoted.
const NEEDS_DOUBLE_QUOTES = new RegExp(
  "[\\u0000-\\u0008\\u000b-\\u001f\\u007f-\\u009f\\u2028\\u2029\\ufeff]|\\t",
);

// PyYAML resolves a bare `=` and `<<` to its "value" and "merge" tags, which
// the `yaml` package's 1.1 schema does not, and PyYAML cannot construct them.
function needsDoubleQuotes(value: string): boolean {
  return value === "=" || value === "<<" || NEEDS_DOUBLE_QUOTES.test(value);
}

/** YAML double-quoted scalar; JSON escapes are valid YAML escapes. */
function doubleQuoted(value: string): string {
  return JSON.stringify(value).replace(
    /[\u007f-\u009f\u2028\u2029\ufeff]/g,
    (char) => "\\u" + char.charCodeAt(0).toString(16).padStart(4, "0"),
  );
}

export function toYaml(data: unknown): string {
  // The `yaml` package cannot always be told to quote a string (a bare `<<` is
  // a merge key to it) or to escape line separators, so risky strings are
  // swapped for unique placeholders and replaced by hand-quoted text afterwards.
  const quoted = new Map<string, string>();
  const doc = new YAML.Document(data, YAML_OPTIONS);
  const salt = Math.random().toString(36).slice(2);
  YAML.visit(doc, {
    Scalar(_key, node) {
      if (typeof node.value === "string" && needsDoubleQuotes(node.value)) {
        const token = `dfq${salt}x${quoted.size}x`;
        quoted.set(token, doubleQuoted(node.value));
        node.value = token;
        node.type = "PLAIN";
        node.tag = undefined;
      }
    },
  });
  let text = doc.toString(YAML_OPTIONS);
  for (const [token, replacement] of quoted) {
    text = text.replace(token, () => replacement);
  }
  return text;
}

export function serializeFlow(flow: Flow, format: FileFormat): string {
  const data = orderedFlow(flow);
  return format === "json" ? JSON.stringify(data, null, 2) + "\n" : toYaml(data);
}

export function parseText(text: string, format: FileFormat): unknown {
  if (format === "json") {
    try {
      return JSON.parse(text);
    } catch (err) {
      throw new ValidationError(`invalid JSON: ${(err as Error).message}`);
    }
  }
  try {
    return YAML.parse(text, { version: "1.1" });
  } catch (err) {
    throw new ValidationError(`invalid YAML: ${(err as Error).message}`);
  }
}

export function formatFromName(name: string): FileFormat | null {
  const lower = name.toLowerCase();
  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".yaml") || lower.endsWith(".yml")) return "yaml";
  return null;
}
