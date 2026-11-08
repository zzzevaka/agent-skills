import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { createElement } from "react";
import { parseFlow } from "../src/domain/flow";
import { OpError, renameSchema, renameStage, setMeta, setStageFields } from "../src/domain/ops";
import type { Flow } from "../src/domain/types";
import { FlowStoreProvider, createFlowStore, useFlowStore } from "../src/store/flowStore";

const flow = (): Flow =>
  parseFlow({
    name: "f",
    goal: "g",
    revision: 4,
    stages: [
      { name: "a", prompt: "pa" },
      { name: "b", prompt: "pb", depends_on: ["a"] },
    ],
  });

const make = () => createFlowStore({ flow: flow(), format: "yaml", source: "flow.yaml" });

describe("createFlowStore", () => {
  it("starts_clean_with_baseline_equal_to_draft", () => {
    const state = make().getState();
    expect(state.dirty).toBe(false);
    expect(state.draft).toBe(state.baseline);
    expect(state.errors).toEqual([]);
    expect(state.canUndo || state.canRedo).toBe(false);
    expect(state).toMatchObject({ format: "yaml", source: "flow.yaml" });
  });

  it("edit_makes_dirty_and_reverting_clears_it", () => {
    const store = make();
    store.getState().apply((f) => renameStage(f, "a", "x"));
    expect(store.getState().dirty).toBe(true);
    store.getState().apply((f) => renameStage(f, "x", "a"));
    expect(store.getState().dirty).toBe(false);
  });

  it("undo_and_redo_round_trip", () => {
    const store = make();
    store.getState().apply((f) => setMeta(f, { goal: "one" }));
    store.getState().apply((f) => setMeta(f, { goal: "two" }));
    expect(store.getState().canUndo).toBe(true);
    store.getState().undo();
    expect(store.getState().draft.goal).toBe("one");
    expect(store.getState().canRedo).toBe(true);
    store.getState().undo();
    expect(store.getState().draft.goal).toBe("g");
    expect(store.getState().canUndo).toBe(false);
    store.getState().redo();
    store.getState().redo();
    expect(store.getState().draft.goal).toBe("two");
    expect(store.getState().canRedo).toBe(false);
  });

  it("a_new_edit_after_undo_clears_redo", () => {
    const store = make();
    store.getState().apply((f) => setMeta(f, { goal: "one" }));
    store.getState().undo();
    store.getState().apply((f) => setMeta(f, { goal: "other" }));
    expect(store.getState().canRedo).toBe(false);
  });

  it("history_is_capped_at_100_steps", () => {
    const store = make();
    for (let i = 0; i < 120; i += 1) store.getState().apply((f) => setMeta(f, { goal: `g${i}` }));
    let undone = 0;
    while (store.getState().canUndo) {
      store.getState().undo();
      undone += 1;
    }
    expect(undone).toBe(100);
  });

  it("an_operation_that_changes_nothing_is_not_an_edit", () => {
    const store = make();
    store.getState().apply((f) => f);
    expect(store.getState().canUndo).toBe(false);
    expect(store.getState().dirty).toBe(false);
  });

  it("discard_restores_the_baseline_and_clears_history_and_override", () => {
    const store = make();
    store.getState().apply((f) => setMeta(f, { name: "changed" }));
    store.getState().setRevisionOverride(9);
    store.getState().discard();
    const state = store.getState();
    expect(state.draft).toBe(state.baseline);
    expect(state.dirty).toBe(false);
    expect(state.canUndo).toBe(false);
    expect(state.revisionOverride).toBeNull();
  });

  it("markSaved_makes_the_saved_flow_the_new_baseline", () => {
    const store = make();
    store.getState().apply((f) => setMeta(f, { name: "changed" }));
    store.getState().setRevisionOverride(9);
    const saved = { ...store.getState().draft, revision: 9 };
    store.getState().markSaved(saved);
    const state = store.getState();
    expect(state.baseline).toBe(saved);
    expect(state.draft).toBe(saved);
    expect(state.dirty).toBe(false);
    expect(state.revisionOverride).toBeNull();
    expect(state.nextRevision()).toBe(10);
  });

  it("replaceFromDisk_resets_everything_to_the_given_flow", () => {
    const store = make();
    store.getState().apply((f) => setMeta(f, { name: "changed" }));
    const fresh = { ...flow(), revision: 12 };
    store.getState().replaceFromDisk(fresh);
    expect(store.getState().draft).toBe(fresh);
    expect(store.getState().baseline).toBe(fresh);
    expect(store.getState().dirty).toBe(false);
    expect(store.getState().canUndo).toBe(false);
  });

  it("nextRevision_is_baseline_plus_one_unless_overridden", () => {
    const store = make();
    expect(store.getState().nextRevision()).toBe(5);
    store.getState().setRevisionOverride(20);
    expect(store.getState().nextRevision()).toBe(20);
    store.getState().setRevisionOverride(null);
    expect(store.getState().nextRevision()).toBe(5);
  });

  it("a_revision_override_alone_counts_as_a_change", () => {
    const store = make();
    store.getState().setRevisionOverride(7);
    expect(store.getState().dirty).toBe(true);
    store.getState().setRevisionOverride(null);
    expect(store.getState().dirty).toBe(false);
  });

  it.each([-1, 1.5, Number.NaN])("setRevisionOverride_rejects_%s", (value) => {
    const store = make();
    store.getState().setRevisionOverride(value);
    expect(store.getState().revisionOverride).toBeNull();
    expect(store.getState().lastError).toMatch(/revision/);
  });

  it("a_blocked_operation_sets_lastError_and_keeps_the_draft", () => {
    const store = make();
    const before = store.getState().draft;
    store.getState().apply(() => {
      throw new OpError("not allowed");
    });
    expect(store.getState().lastError).toBe("not allowed");
    expect(store.getState().draft).toBe(before);
    expect(store.getState().canUndo).toBe(false);
    store.getState().apply((f) => setMeta(f, { goal: "ok" }));
    expect(store.getState().lastError).toBeNull();
  });

  it("other_errors_from_an_operation_are_not_swallowed", () => {
    const store = make();
    expect(() =>
      store.getState().apply(() => {
        throw new TypeError("bug");
      }),
    ).toThrow("bug");
  });

  it("errors_and_warnings_follow_the_draft", () => {
    const store = make();
    store.getState().apply((f) => setMeta(f, { name: "" }));
    expect(store.getState().errors).toEqual(["flow name must be a non-empty string"]);
    store.getState().apply((f) => setMeta(f, { name: "f" }));
    store.getState().apply((f) => setStageFields(f, "b", { state: "finished", output: "x" }));
    expect(store.getState().warnings.map((w) => w.stage)).toContain("b");
  });
});

describe("useFlowStore", () => {
  it("re_renders_when_the_selected_state_changes", () => {
    const store = make();
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(FlowStoreProvider, { store }, children);
    const { result } = renderHook(() => useFlowStore((s) => s.draft.name), { wrapper });
    expect(result.current).toBe("f");
    act(() => store.getState().apply((f) => setMeta(f, { name: "renamed" })));
    expect(result.current).toBe("renamed");
  });

  it("throws_outside_a_provider", () => {
    expect(() => renderHook(() => useFlowStore((s) => s.dirty))).toThrow(/FlowStoreProvider/);
  });
});

describe("schema text editing", () => {
  const withSchemas = () =>
    createFlowStore({
      flow: parseFlow({
        name: "f",
        goal: "g",
        schemas: { s: { type: "string" }, t: { type: "integer" } },
        stages: [{ name: "a", prompt: "p", output_schema: "s" }],
      }),
      format: "yaml",
      source: null,
    });

  it("valid_yaml_updates_the_schema_and_marks_dirty", () => {
    const store = withSchemas();
    store.getState().editSchemaText("s", "type: integer");
    expect(store.getState().draft.schemas.s).toEqual({ type: "integer" });
    expect(store.getState().dirty).toBe(true);
    expect(store.getState().errors).toEqual([]);
  });

  it("invalid_yaml_keeps_the_draft_blocks_saving_and_keeps_the_text", () => {
    const store = withSchemas();
    store.getState().editSchemaText("s", "a: [");
    const state = store.getState();
    expect(state.draft.schemas.s).toEqual({ type: "string" });
    expect(state.errors).toHaveLength(1);
    expect(state.errors[0]).toMatch(/^schemas\.s: invalid YAML: /);
    expect(state.schemaBuffers.s.text).toBe("a: [");
    expect(state.dirty).toBe(false);
  });

  it("fixing_the_yaml_clears_the_error", () => {
    const store = withSchemas();
    store.getState().editSchemaText("s", "a: [");
    store.getState().editSchemaText("s", "type: boolean");
    expect(store.getState().errors).toEqual([]);
    expect(store.getState().draft.schemas.s).toEqual({ type: "boolean" });
  });

  it("a_parsed_but_invalid_definition_is_reported_with_the_python_message", () => {
    const store = withSchemas();
    store.getState().editSchemaText("s", "type: object\nproperties:\n  a:\n    type: foo");
    expect(store.getState().errors).toEqual([
      "schemas.s.properties.a: unknown schema type 'foo'",
    ]);
  });

  it.each(["", "- a\n- b", "just text"])("non_mapping_yaml_%j_is_a_definition_error", (text) => {
    const store = withSchemas();
    store.getState().editSchemaText("s", text);
    expect(store.getState().errors).toEqual(["schemas.s: schema must be an object"]);
  });

  it("unchanged_text_is_not_an_edit", () => {
    const store = withSchemas();
    store.getState().editSchemaText("s", "type: string");
    expect(store.getState().dirty).toBe(false);
    expect(store.getState().canUndo).toBe(false);
  });

  it("undo_discard_and_replace_clear_ui_errors_and_buffers", () => {
    for (const reset of [
      (s: ReturnType<typeof withSchemas>) => s.getState().discard(),
      (s: ReturnType<typeof withSchemas>) => s.getState().replaceFromDisk(flow()),
      (s: ReturnType<typeof withSchemas>) => s.getState().markSaved(flow()),
    ]) {
      const store = withSchemas();
      store.getState().editSchemaText("s", "a: [");
      reset(store);
      expect(store.getState().errors).toEqual([]);
      expect(store.getState().schemaBuffers).toEqual({});
    }
    const store = withSchemas();
    store.getState().editSchemaText("t", "type: boolean");
    store.getState().editSchemaText("s", "a: [");
    store.getState().undo();
    expect(store.getState().errors).toEqual([]);
  });

  it("renaming_or_deleting_a_schema_forgets_its_unparsable_text", () => {
    const store = withSchemas();
    store.getState().editSchemaText("s", "a: [");
    store.getState().apply((f) => renameSchema(f, "s", "renamed"));
    expect(store.getState().errors).toEqual([]);
    expect(store.getState().schemaBuffers).toEqual({});
  });
});

describe("coalesced edits", () => {
  afterEach(() => vi.restoreAllMocks());

  it("edits_with_the_same_key_in_quick_succession_are_one_undo_step", () => {
    const store = make();
    store.getState().apply((f) => setMeta(f, { goal: "a" }), { coalesce: "goal" });
    store.getState().apply((f) => setMeta(f, { goal: "ab" }), { coalesce: "goal" });
    store.getState().apply((f) => setMeta(f, { goal: "abc" }), { coalesce: "goal" });
    store.getState().undo();
    expect(store.getState().draft.goal).toBe("g");
    expect(store.getState().canUndo).toBe(false);
  });

  it("different_keys_or_no_key_do_not_coalesce", () => {
    const store = make();
    store.getState().apply((f) => setMeta(f, { goal: "a" }), { coalesce: "x" });
    store.getState().apply((f) => setMeta(f, { goal: "b" }), { coalesce: "y" });
    store.getState().apply((f) => setMeta(f, { goal: "c" }));
    store.getState().apply((f) => setMeta(f, { goal: "d" }));
    let steps = 0;
    while (store.getState().canUndo) {
      store.getState().undo();
      steps += 1;
    }
    expect(steps).toBe(4);
  });

  it("a_pause_starts_a_new_undo_step", () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000);
    const store = make();
    store.getState().apply((f) => setMeta(f, { goal: "a" }), { coalesce: "goal" });
    now.mockReturnValue(1_000 + 5_000);
    store.getState().apply((f) => setMeta(f, { goal: "ab" }), { coalesce: "goal" });
    store.getState().undo();
    expect(store.getState().draft.goal).toBe("a");
  });

  it("another_edit_in_between_breaks_the_run", () => {
    const store = make();
    store.getState().apply((f) => setMeta(f, { goal: "a" }), { coalesce: "goal" });
    store.getState().apply((f) => setMeta(f, { name: "n" }));
    store.getState().apply((f) => setMeta(f, { goal: "ab" }), { coalesce: "goal" });
    store.getState().undo();
    expect(store.getState().draft.goal).toBe("a");
  });
});

describe("setFile", () => {
  it("updates_source_and_format_without_marking_the_flow_dirty", () => {
    const store = make();
    store.getState().setFile({ source: "other.json", format: "json" });
    expect(store.getState()).toMatchObject({ source: "other.json", format: "json", dirty: false });
  });
});

describe("markSaved while editing", () => {
  it("keeps_a_newer_draft_and_only_moves_the_baseline", () => {
    const store = make();
    store.getState().apply((f) => setMeta(f, { goal: "saved" }));
    const savedFrom = store.getState().draft;
    store.getState().apply((f) => setMeta(f, { goal: "typed later" }));
    store.getState().markSaved({ ...savedFrom, revision: 5 }, savedFrom);
    const state = store.getState();
    expect(state.baseline.goal).toBe("saved");
    expect(state.baseline.revision).toBe(5);
    expect(state.draft.goal).toBe("typed later");
    expect(state.dirty).toBe(true);
    expect(state.canUndo).toBe(true);
  });

  it("without_later_edits_it_resets_everything_as_before", () => {
    const store = make();
    store.getState().apply((f) => setMeta(f, { goal: "saved" }));
    const savedFrom = store.getState().draft;
    store.getState().markSaved({ ...savedFrom, revision: 5 }, savedFrom);
    expect(store.getState().dirty).toBe(false);
    expect(store.getState().canUndo).toBe(false);
  });

  it("the_revision_field_alone_never_makes_the_flow_dirty", () => {
    const store = make();
    store.getState().apply((f) => setMeta(f, { goal: "x" }));
    const savedFrom = store.getState().draft;
    store.getState().apply((f) => setMeta(f, { goal: "y" }));
    store.getState().markSaved({ ...savedFrom, revision: 9 }, savedFrom);
    store.getState().undo();
    expect(store.getState().draft.goal).toBe("x");
    expect(store.getState().dirty).toBe(false);
  });
});
