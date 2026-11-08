import { invariantErrors, parseFlow } from "../src/domain/flow";
import {
  OpError,
  addSchema,
  addStage,
  deleteSchema,
  deleteStage,
  dependentsOf,
  duplicateStage,
  moveStage,
  renameSchema,
  renameStage,
  resetFrom,
  resetStage,
  setDependencies,
  addDependencyToFollowing,
  setMeta,
  setOutputSchema,
  setSchema,
  setStageFields,
  usedBy,
} from "../src/domain/ops";
import type { Flow } from "../src/domain/types";

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

/** a -> b -> c, c also depends on a; schemas s1 (str) and s2 (object). */
function base(): Flow {
  return deepFreeze(
    parseFlow({
      name: "f",
      goal: "g",
      revision: 4,
      schemas: {
        s1: { type: "string" },
        s2: { type: "object", properties: { n: { type: "integer" } } },
      },
      stages: [
        { name: "a", prompt: "pa", state: "finished", output: "oa", output_schema: "s1" },
        { name: "b", prompt: "pb", depends_on: ["a"], state: "inprogress", output: "partial" },
        { name: "c", prompt: "pc", depends_on: ["a", "b"], output_schema: "s2" },
      ],
    }),
  );
}

const names = (f: Flow) => f.stages.map((s) => s.name);

describe("renameStage", () => {
  it("renameStage_rewrites_dependents", () => {
    const next = renameStage(base(), "a", "root");
    expect(names(next)).toEqual(["root", "b", "c"]);
    expect(next.stages[1].depends_on).toEqual(["root"]);
    expect(next.stages[2].depends_on).toEqual(["root", "b"]);
    expect(invariantErrors(next)).toEqual([]);
  });

  it.each([
    ["existing", "b", "already exists"],
    ["empty", "", "empty"],
    ["whitespace", "   ", "empty"],
  ])("renameStage_rejects_%s_name", (_label, name, fragment) => {
    expect(() => renameStage(base(), "a", name)).toThrow(OpError);
    expect(() => renameStage(base(), "a", name)).toThrow(fragment);
  });

  it("renameStage_to_same_name_returns_same_flow", () => {
    const flow = base();
    expect(renameStage(flow, "a", "a")).toBe(flow);
  });

  it("renameStage_unknown_stage_throws", () => {
    expect(() => renameStage(base(), "zzz", "x")).toThrow(OpError);
  });
});

describe("addStage / duplicateStage", () => {
  it("addStage_appends_pending_stage_with_unique_default_name", () => {
    const once = addStage(base());
    expect(names(once)).toEqual(["a", "b", "c", "stage-4"]);
    expect(once.stages[3]).toMatchObject({ state: "pending", depends_on: [], prompt: "" });
    expect(names(addStage(once))).toEqual(["a", "b", "c", "stage-4", "stage-5"]);
  });

  it("addStage_rejects_existing_name", () => {
    expect(() => addStage(base(), "a")).toThrow("already exists");
  });

  it("duplicateStage_inserts_reset_copy_after_original", () => {
    const next = duplicateStage(base(), "a");
    expect(names(next)).toEqual(["a", "a-copy", "b", "c"]);
    expect(next.stages[1]).toMatchObject({
      prompt: "pa",
      output_schema: "s1",
      state: "pending",
      output: null,
      message: null,
      depends_on: [],
    });
    expect(invariantErrors(next)).toEqual([]);
  });

  it("duplicateStage_picks_unused_copy_name", () => {
    const once = duplicateStage(base(), "a");
    expect(names(duplicateStage(once, "a"))).toContain("a-copy-2");
  });
});

describe("deleteStage", () => {
  it("deleteStage_blocks_last_stage", () => {
    const single = parseFlow({ name: "f", goal: "g", stages: [{ name: "a", prompt: "p" }] });
    expect(() => deleteStage(single, "a", { unlink: true })).toThrow(
      "flow must contain at least one stage",
    );
  });

  it("deleteStage_requires_unlink_when_dependents", () => {
    expect(() => deleteStage(base(), "a", { unlink: false })).toThrow(/required by.*b.*c/);
  });

  it("deleteStage_unlink_removes_the_dependency", () => {
    const next = deleteStage(base(), "a", { unlink: true });
    expect(names(next)).toEqual(["b", "c"]);
    expect(next.stages[0].depends_on).toEqual([]);
    expect(next.stages[1].depends_on).toEqual(["b"]);
    expect(invariantErrors(next)).toEqual([]);
  });

  it("deleteStage_without_dependents_needs_no_unlink", () => {
    expect(names(deleteStage(base(), "c", { unlink: false }))).toEqual(["a", "b"]);
  });
});

describe("moveStage", () => {
  it("moveStage_blocks_before_dependency", () => {
    expect(() => moveStage(base(), 1, 0)).toThrow(OpError);
    expect(() => moveStage(base(), 1, 0)).toThrow(/'b'.*'a'/);
  });

  it("moveStage_blocks_dependency_after_dependent", () => {
    expect(() => moveStage(base(), 0, 2)).toThrow(/'b'.*'a'|'a'.*'b'/);
  });

  it("moveStage_allows_independent_reorder", () => {
    const flow = addStage(base(), "free");
    const next = moveStage(flow, 3, 0);
    expect(names(next)).toEqual(["free", "a", "b", "c"]);
    expect(invariantErrors(next)).toEqual([]);
  });

  it("moveStage_rejects_out_of_range_index", () => {
    expect(() => moveStage(base(), 0, 9)).toThrow(OpError);
    expect(() => moveStage(base(), -1, 0)).toThrow(OpError);
  });

  it("moveStage_to_same_index_returns_same_flow", () => {
    const flow = base();
    expect(moveStage(flow, 1, 1)).toBe(flow);
  });
});

describe("dependencies and schemas of a stage", () => {
  it("setDependencies_accepts_earlier_stages_in_given_order", () => {
    expect(setDependencies(base(), "c", ["b", "a"]).stages[2].depends_on).toEqual(["b", "a"]);
  });

  it("setDependencies_rejects_later_unknown_self_and_duplicates", () => {
    expect(() => setDependencies(base(), "a", ["b"])).toThrow(OpError);
    expect(() => setDependencies(base(), "b", ["a", "a"])).toThrow(OpError);
    expect(() => setDependencies(base(), "b", ["b"])).toThrow(OpError);
    expect(() => setDependencies(base(), "b", ["nope"])).toThrow(OpError);
  });

  it("addDependencyToFollowing_makes_every_later_stage_depend_on_the_stage", () => {
    const flow = deepFreeze(
      parseFlow({
        name: "f",
        goal: "g",
        stages: [
          { name: "a", prompt: "p" },
          { name: "b", prompt: "p" },
          { name: "c", prompt: "p", depends_on: ["b"] },
          { name: "d", prompt: "p", depends_on: ["a"] },
        ],
      }),
    );
    const next = addDependencyToFollowing(flow, "a");
    expect(next.stages.map((s) => s.depends_on)).toEqual([[], ["a"], ["a", "b"], ["a"]]);
    expect(invariantErrors(next)).toEqual([]);
    expect(addDependencyToFollowing(next, "a")).toBe(next);
  });

  it("addDependencyToFollowing_does_nothing_for_the_last_stage_and_rejects_unknown_names", () => {
    const flow = base();
    expect(addDependencyToFollowing(flow, "c")).toBe(flow);
    expect(() => addDependencyToFollowing(flow, "nope")).toThrow(OpError);
  });

  it("setOutputSchema_sets_and_clears", () => {
    expect(setOutputSchema(base(), "b", "s2").stages[1].output_schema).toBe("s2");
    expect(setOutputSchema(base(), "a", null).stages[0].output_schema).toBeNull();
  });

  it("setOutputSchema_rejects_unknown_schema", () => {
    expect(() => setOutputSchema(base(), "a", "nope")).toThrow("unknown schema");
  });
});

describe("stage fields and reset", () => {
  it("setStageFields_updates_given_fields_only", () => {
    const next = setStageFields(base(), "b", { prompt: "new", message: "m" });
    expect(next.stages[1]).toMatchObject({ prompt: "new", message: "m", state: "inprogress" });
  });

  it("setStageFields_rejects_invalid_state", () => {
    expect(() => setStageFields(base(), "b", { state: "done" as never })).toThrow(OpError);
  });

  it("resetStage_sets_pending_and_clears_output_and_message", () => {
    const next = resetStage(base(), "a");
    expect(next.stages[0]).toMatchObject({ state: "pending", output: null, message: null });
    expect(next.stages[1].state).toBe("inprogress");
  });

  it("resetFrom_resets_the_stage_and_every_following_one", () => {
    const next = resetFrom(base(), "b");
    expect(next.stages.map((s) => s.state)).toEqual(["finished", "pending", "pending"]);
    expect(next.stages[1].output).toBeNull();
  });
});

describe("schemas", () => {
  it("addSchema_adds_and_rejects_existing_or_empty_names", () => {
    expect(Object.keys(addSchema(base(), "s3", { type: "integer" }).schemas)).toEqual([
      "s1",
      "s2",
      "s3",
    ]);
    expect(() => addSchema(base(), "s1", { type: "integer" })).toThrow("already exists");
    expect(() => addSchema(base(), " ", { type: "integer" })).toThrow("empty");
  });

  it("addSchema_accepts_prototype_names_when_unused", () => {
    expect(Object.keys(addSchema(base(), "constructor", { type: "integer" }).schemas)).toContain(
      "constructor",
    );
  });

  it("renameSchema_rewrites_output_schema_and_keeps_order", () => {
    const next = renameSchema(base(), "s1", "text");
    expect(Object.keys(next.schemas)).toEqual(["text", "s2"]);
    expect(next.stages[0].output_schema).toBe("text");
    expect(invariantErrors(next)).toEqual([]);
  });

  it("renameSchema_rejects_existing_name", () => {
    expect(() => renameSchema(base(), "s1", "s2")).toThrow("already exists");
  });

  it("deleteSchema_requires_unlink_when_used", () => {
    expect(() => deleteSchema(base(), "s1", { unlink: false })).toThrow(/used by.*a/);
  });

  it("deleteSchema_unlink_clears_stage_output_schema", () => {
    const next = deleteSchema(base(), "s1", { unlink: true });
    expect(Object.keys(next.schemas)).toEqual(["s2"]);
    expect(next.stages[0].output_schema).toBeNull();
    expect(invariantErrors(next)).toEqual([]);
  });

  it("setSchema_replaces_definition_and_rejects_unknown_name", () => {
    expect(setSchema(base(), "s1", { type: "integer" }).schemas.s1).toEqual({ type: "integer" });
    expect(() => setSchema(base(), "nope", { type: "integer" })).toThrow(OpError);
  });

  it("usedBy_and_dependentsOf", () => {
    expect(usedBy(base(), "s1")).toEqual(["a"]);
    expect(usedBy(base(), "s2")).toEqual(["c"]);
    expect(dependentsOf(base(), "a")).toEqual(["b", "c"]);
    expect(dependentsOf(base(), "c")).toEqual([]);
  });
});

describe("setMeta", () => {
  it("setMeta_updates_name_goal_and_revision", () => {
    expect(setMeta(base(), { name: "n", goal: "x", revision: 9 })).toMatchObject({
      name: "n",
      goal: "x",
      revision: 9,
    });
  });

  it.each([-1, 1.5, Number.NaN])("setMeta_rejects_revision_%s", (revision) => {
    expect(() => setMeta(base(), { revision })).toThrow("revision must be a non-negative integer");
  });
});

describe("every operation keeps a valid flow valid and never mutates its input", () => {
  it("applies_a_sequence_of_operations", () => {
    let flow = base();
    const steps: ((f: Flow) => Flow)[] = [
      (f) => addStage(f, "extra"),
      (f) => setDependencies(f, "extra", ["a"]),
      (f) => setOutputSchema(f, "extra", "s2"),
      (f) => moveStage(f, 3, 1),
      (f) => renameStage(f, "extra", "renamed"),
      (f) => duplicateStage(f, "renamed"),
      (f) => renameSchema(f, "s2", "obj"),
      (f) => addSchema(f, "s9", { type: "boolean" }),
      (f) => deleteSchema(f, "s9", { unlink: false }),
      (f) => resetFrom(f, "b"),
      (f) => deleteStage(f, "renamed-copy", { unlink: false }),
      (f) => setMeta(f, { revision: 12 }),
    ];
    for (const step of steps) {
      flow = deepFreeze(step(flow));
      expect(invariantErrors(flow)).toEqual([]);
    }
  });
});
