import { parseFlow } from "../src/domain/flow";
import { runtimeWarnings } from "../src/domain/warnings";

const flow = (stages: object[], schemas: object = {}) =>
  parseFlow({ name: "f", goal: "g", schemas, stages });

describe("runtimeWarnings", () => {
  it("is_empty_for_a_healthy_flow", () => {
    const f = flow([
      { name: "a", prompt: "p", state: "finished", output: "x" },
      { name: "b", prompt: "p", depends_on: ["a"], state: "inprogress" },
      { name: "c", prompt: "p", depends_on: ["b"] },
    ]);
    expect(runtimeWarnings(f)).toEqual([]);
  });

  it("warns_when_finished_stage_has_unfinished_dependency", () => {
    const f = flow([
      { name: "a", prompt: "p", state: "pending" },
      { name: "b", prompt: "p", depends_on: ["a"], state: "finished", output: "x" },
    ]);
    expect(runtimeWarnings(f)).toContainEqual({
      stage: "b",
      message: "stage 'b' is finished but its dependency 'a' is not finished",
    });
  });

  it("warns_when_more_than_one_stage_is_active", () => {
    const f = flow([
      { name: "a", prompt: "p", state: "inprogress" },
      { name: "b", prompt: "p", state: "waiting" },
    ]);
    expect(runtimeWarnings(f)).toContainEqual({
      stage: null,
      message: "more than one stage is in progress or waiting: 'a', 'b'",
    });
  });

  it("warns_when_a_pending_stage_precedes_a_finished_one", () => {
    const f = flow([
      { name: "a", prompt: "p", state: "pending" },
      { name: "b", prompt: "p", state: "finished", output: "x" },
    ]);
    expect(runtimeWarnings(f)).toContainEqual({
      stage: "a",
      message: "stage 'a' is pending but the later stage 'b' is finished",
    });
  });

  it("warns_when_finished_output_does_not_match_its_schema", () => {
    const f = flow(
      [{ name: "a", prompt: "p", state: "finished", output: { n: "x" }, output_schema: "s" }],
      { s: { type: "object", properties: { n: { type: "integer" } } } },
    );
    expect(runtimeWarnings(f)).toContainEqual({
      stage: "a",
      message: "stage 'a' output is invalid: n: expected integer, got str",
    });
  });

  it("parses_json_text_output_for_non_string_schemas", () => {
    const f = flow(
      [{ name: "a", prompt: "p", state: "finished", output: '{"n": 1}', output_schema: "s" }],
      { s: { type: "object", properties: { n: { type: "integer" } } } },
    );
    expect(runtimeWarnings(f)).toEqual([]);
  });

  it("warns_when_finished_stage_has_no_output", () => {
    const f = flow([{ name: "a", prompt: "p", state: "finished", output: null }]);
    expect(runtimeWarnings(f)).toHaveLength(1);
    expect(runtimeWarnings(f)[0].stage).toBe("a");
  });

  it("does_not_throw_when_the_schema_is_missing_or_invalid", () => {
    const f = flow(
      [{ name: "a", prompt: "p", state: "finished", output: "x", output_schema: "nope" }],
      { other: { type: "nope" } },
    );
    expect(() => runtimeWarnings(f)).not.toThrow();
  });

  it("reports_output_problems_for_a_field_named_schema", () => {
    const f = flow(
      [{ name: "a", prompt: "p", state: "finished", output: {}, output_schema: "s" }],
      { s: { type: "object", properties: { schema: { type: "integer" } }, required: ["schema"] } },
    );
    expect(runtimeWarnings(f)).toContainEqual({
      stage: "a",
      message: "stage 'a' output is invalid: schema: required field is missing",
    });
  });
});
