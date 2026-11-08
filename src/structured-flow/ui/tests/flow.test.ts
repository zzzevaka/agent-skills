import { findErrors, invariantErrors, parseFlow } from "../src/domain/flow";
import { ValidationError } from "../src/domain/schemaDef";
import { loadParity } from "./fixtures";

interface FlowCase {
  label: string;
  input: unknown;
  expected_errors: string[];
}

describe("findErrors (parity corpus)", () => {
  const cases = loadParity<FlowCase[]>("flow-cases.json");

  it.each(cases.map((c) => [c.label, c] as const))("%s", (_label, c) => {
    expect(findErrors(c.input)).toEqual(c.expected_errors);
  });
});

describe("parseFlow", () => {
  const stage = { name: "a", prompt: "p" };

  it("fills_defaults_for_a_minimal_flow", () => {
    expect(parseFlow({ name: "f", goal: "g", stages: [stage] })).toEqual({
      name: "f",
      goal: "g",
      schemas: {},
      revision: 0,
      stages: [
        {
          name: "a",
          prompt: "p",
          depends_on: [],
          output_schema: null,
          state: "pending",
          message: null,
          output: null,
        },
      ],
    });
  });

  it("reads_legacy_prompt_as_goal", () => {
    expect(parseFlow({ name: "f", prompt: "old", stages: [stage] }).goal).toBe("old");
  });

  it("moves_legacy_finished_message_into_output", () => {
    const flow = parseFlow({
      name: "f",
      goal: "g",
      stages: [{ ...stage, state: "finished", message: "done" }],
    });
    expect(flow.stages[0].output).toBe("done");
    expect(flow.stages[0].message).toBeNull();
  });

  it("keeps_message_and_output_when_output_is_present", () => {
    const flow = parseFlow({
      name: "f",
      goal: "g",
      stages: [{ ...stage, state: "finished", message: "m", output: "o" }],
    });
    expect(flow.stages[0]).toMatchObject({ message: "m", output: "o" });
  });

  it("throws_validation_error_for_missing_key", () => {
    expect(() => parseFlow({ goal: "g", stages: [stage] })).toThrow(ValidationError);
  });
});

describe("malformed input", () => {
  it.each([5, null, true])("malformed_stages_%s_reports_prefix", (stages) => {
    const [first] = findErrors({ name: "a", goal: "g", stages });
    expect(first).toMatch(/^malformed flow file/);
  });
});

describe("invariantErrors", () => {
  it("returns_nothing_for_a_valid_parsed_flow", () => {
    const flow = parseFlow({ name: "f", goal: "g", stages: [{ name: "a", prompt: "p" }] });
    expect(invariantErrors(flow)).toEqual([]);
  });

  it("does_not_mutate_its_input", () => {
    const flow = parseFlow({ name: "f", goal: "g", stages: [{ name: "a", prompt: "p" }] });
    const before = JSON.stringify(flow);
    invariantErrors(flow);
    expect(JSON.stringify(flow)).toBe(before);
  });
});

describe("names that collide with Object.prototype", () => {
  it("unknown_output_schema_named_constructor_is_reported", () => {
    const errors = findErrors({
      name: "f",
      goal: "g",
      stages: [{ name: "a", prompt: "p", output_schema: "constructor" }],
    });
    expect(errors).toEqual(["stage 'a' references unknown output schema 'constructor'"]);
  });
});
