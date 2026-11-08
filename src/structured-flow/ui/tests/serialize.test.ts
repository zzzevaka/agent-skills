import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import YAML from "yaml";
import { parseFlow } from "../src/domain/flow";
import { ValidationError } from "../src/domain/schemaDef";
import { formatFromName, parseText, serializeFlow, toYaml } from "../src/domain/serialize";
import type { Flow } from "../src/domain/types";

const REFERENCES = resolve(process.cwd(), "../../../skills/structured-flow/references");
const ROUNDTRIP = resolve(process.cwd(), ".roundtrip");

const TRICKY = [
  "yes", "no", "on", "off", "true", "null", "~", "", "0123", "0x1F", "1e3", "1_000",
  "12:30:45", "2026-11-07", "2026-11-07 10:00:00", "- x", "a: b", "# c", " lead",
  "trail ", "multi\nline", "multi\nline\n", "\n\nstart", "  indented\n  block\n",
  "tab\there", "ключ", "'quoted'", '"dq"', "@at", "`bt", "%pct", "!bang", "&amp",
  "*star", "?q", "|pipe", ">gt", "[br", "{cb", ",c", "=", "<<", "a b", " nbsp",
];

function readReference(name: string): Flow {
  const text = readFileSync(resolve(REFERENCES, name), "utf-8");
  return parseFlow(parseText(text, name.endsWith(".json") ? "json" : "yaml"));
}

function trickyFlow(): Flow {
  return {
    name: "tricky",
    goal: "Goal with\nnewlines and: colons\n\nand a blank line.\n",
    revision: 3,
    schemas: { out: { type: "array", items: { type: "string" } } },
    stages: [
      {
        name: "first",
        prompt: "Line one\n  indented line\ttab\n\nlast line without newline",
        depends_on: [],
        output_schema: "out",
        state: "finished",
        message: null,
        output: TRICKY,
      },
      {
        name: "yes",
        prompt: "p",
        depends_on: ["first"],
        output_schema: null,
        state: "waiting",
        message: "Waiting: answer needed\n",
        output: "2026-11-07",
      },
      {
        name: "it's",
        prompt: "p",
        depends_on: ["first", "yes"],
        output_schema: null,
        state: "pending",
        message: null,
        output: null,
      },
    ],
  };
}

describe("serializeFlow", () => {
  const flow = readReference("example.yaml");

  it("json_ends_with_newline_uses_two_spaces_and_dataclass_key_order", () => {
    const text = serializeFlow(flow, "json");
    expect(text.endsWith("}\n")).toBe(true);
    expect(text).toContain('\n  "name": ');
    const data = JSON.parse(text);
    expect(Object.keys(data)).toEqual(["name", "goal", "stages", "schemas", "revision"]);
    expect(Object.keys(data.stages[0])).toEqual([
      "name",
      "prompt",
      "depends_on",
      "output_schema",
      "state",
      "message",
      "output",
    ]);
  });

  it("yaml_uses_literal_block_for_multiline_strings", () => {
    expect(serializeFlow(flow, "yaml")).toMatch(/^goal: \|\n {2}Keep the Spanish/m);
  });

  it("yaml_keeps_key_order_and_does_not_fold_long_lines", () => {
    const text = serializeFlow(
      { ...flow, goal: "word ".repeat(80).trim() },
      "yaml",
    );
    expect(text.indexOf("name:")).toBeLessThan(text.indexOf("goal:"));
    expect(text.indexOf("goal:")).toBeLessThan(text.indexOf("\nstages:"));
    expect(text.indexOf("\nstages:")).toBeLessThan(text.indexOf("\nschemas:"));
    expect(text.indexOf("\nschemas:")).toBeLessThan(text.indexOf("\nrevision:"));
    expect(text).toContain("word ".repeat(80).trim());
  });

  it.each(["json", "yaml"] as const)("round_trips_example_flow_as_%s", (format) => {
    const again = parseFlow(parseText(serializeFlow(flow, format), format));
    expect(again).toEqual(flow);
  });

  it.each(["json", "yaml"] as const)("round_trips_tricky_flow_as_%s", (format) => {
    const tricky = trickyFlow();
    expect(parseFlow(parseText(serializeFlow(tricky, format), format))).toEqual(tricky);
  });

  it.each(TRICKY.map((s) => [JSON.stringify(s), s] as const))(
    "yaml_output_%s_comes_back_as_the_same_string",
    (_label, value) => {
      const text = serializeFlow(
        { ...flow, stages: [{ ...flow.stages[0], output: value }] },
        "yaml",
      );
      const back = parseFlow(parseText(text, "yaml"));
      expect(back.stages[0].output).toBe(value);
    },
  );
});

describe("parseText", () => {
  it("rejects_invalid_json_like_python", () => {
    expect(() => parseText("{", "json")).toThrow(ValidationError);
    expect(() => parseText("{", "json")).toThrow(/^invalid JSON: /);
  });

  it("rejects_invalid_yaml_like_python", () => {
    expect(() => parseText("a: [", "yaml")).toThrow(/^invalid YAML: /);
  });

  it("reads_yaml_1_1_booleans_like_pyyaml", () => {
    expect(parseText("a: yes\nb: off", "yaml")).toEqual({ a: true, b: false });
  });
});

describe("formatFromName", () => {
  it.each([
    ["flow.json", "json"],
    ["FLOW.JSON", "json"],
    ["flow.yaml", "yaml"],
    ["flow.yml", "yaml"],
    ["flow.txt", null],
    ["flow", null],
  ])("%s_is_%s", (name, expected) => {
    expect(formatFromName(name)).toBe(expected);
  });
});

describe("python round-trip files", () => {
  it("writes_files_for_check_roundtrip_py", () => {
    mkdirSync(ROUNDTRIP, { recursive: true });
    const flows: [string, Flow][] = [
      ["example-json", readReference("example.json")],
      ["example-yaml", readReference("example.yaml")],
      ["tricky", trickyFlow()],
    ];
    for (const [name, flow] of flows) {
      for (const format of ["json", "yaml"] as const) {
        const path = resolve(ROUNDTRIP, `${name}.${format}`);
        writeFileSync(path, serializeFlow(flow, format));
        writeFileSync(`${path}.expected.json`, JSON.stringify(flow));
      }
    }
    expect(YAML.parse("a: 1")).toEqual({ a: 1 });
  });
});

describe("toYaml", () => {
  it("renders_nested_values_in_block_style_with_python_compatible_quoting", () => {
    expect(toYaml({ type: "object", properties: { a: { type: "string" } } })).toBe(
      "type: object\nproperties:\n  a:\n    type: string\n",
    );
    expect(toYaml({ v: "yes" })).toBe('v: "yes"\n');
  });
});
