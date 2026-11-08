import { outputFromText, outputToText } from "../src/domain/output";
import { parseFlow } from "../src/domain/flow";
import { outputProblem } from "../src/domain/warnings";

describe("outputToText", () => {
  it.each([
    [null, ""],
    [undefined, ""],
    ["plain", "plain"],
    [{ n: 1 }, '{\n  "n": 1\n}'],
    [[1, 2], "[\n  1,\n  2\n]"],
    [5, "5"],
  ])("%j_becomes_%j", (value, text) => {
    expect(outputToText(value)).toBe(text);
  });
});

describe("outputFromText", () => {
  it("empty_or_blank_text_is_no_output", () => {
    expect(outputFromText("", false)).toBeNull();
    expect(outputFromText("  \n", true)).toBeNull();
  });

  it("string_schemas_keep_the_text_exactly", () => {
    expect(outputFromText('{"a": 1}', true)).toBe('{"a": 1}');
    expect(outputFromText("  keep spaces  ", true)).toBe("  keep spaces  ");
  });

  it("structured_schemas_parse_json_and_fall_back_to_text", () => {
    expect(outputFromText('{"a": [1, 2]}', false)).toEqual({ a: [1, 2] });
    expect(outputFromText("[1", false)).toBe("[1");
  });
});

describe("outputProblem", () => {
  const flow = parseFlow({
    name: "f",
    goal: "g",
    schemas: { s: { type: "object", properties: { n: { type: "integer" } } } },
    stages: [{ name: "a", prompt: "p", output_schema: "s" }],
  });
  const stage = flow.stages[0];

  it("is_null_for_a_matching_output", () => {
    expect(outputProblem(flow, stage, { n: 1 })).toBeNull();
    expect(outputProblem(flow, stage, '{"n": 1}')).toBeNull();
  });

  it("describes_a_mismatch_without_a_prefix", () => {
    expect(outputProblem(flow, stage, { n: "x" })).toBe("n: expected integer, got str");
  });

  it("describes_unparseable_text", () => {
    expect(outputProblem(flow, stage, "oops")).toMatch(/^could not parse output as JSON/);
  });

  it("is_null_when_the_schema_is_missing_or_broken", () => {
    const orphan = { ...stage, output_schema: "nope" };
    expect(outputProblem(flow, orphan, "x")).toBeNull();
    const broken = { ...flow, schemas: { s: { type: "nope" } } };
    expect(outputProblem(broken, stage, "x")).toBeNull();
  });
});
