import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { parseFlow } from "../src/domain/flow";
import { OpError, renameStage, setMeta, setStageFields } from "../src/domain/ops";
import type { Flow } from "../src/domain/types";
import { createFlowStore, FlowStoreProvider } from "../src/store/flowStore";
import { App } from "../src/ui/App";
import { navigate } from "../src/ui/route";

const GOOD = {
  name: "My flow",
  goal: "The goal",
  revision: 4,
  stages: [
    { name: "a", prompt: "p" },
    { name: "b", prompt: "p", depends_on: ["a"] },
  ],
};

function setup(raw: object = GOOD) {
  const store = createFlowStore({ flow: parseFlow(raw), format: "yaml", source: "flow.yaml" });
  const onSave = vi.fn();
  render(
    <FlowStoreProvider store={store}>
      <App onSave={onSave} />
    </FlowStoreProvider>,
  );
  const edit = (op: (f: Flow) => Flow) => act(() => store.getState().apply(op));
  return { store, onSave, edit };
}

const key = (init: KeyboardEventInit, target: Document | Element = document) =>
  fireEvent.keyDown(target, init);

beforeEach(() => {
  navigate({ tab: "overview", item: null }, { replace: true });
});

describe("save bar", () => {
  it("save_hidden_until_dirty", () => {
    const { edit } = setup();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    edit((f) => setMeta(f, { goal: "changed" }));
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("clicking_save_calls_onSave", () => {
    const { edit, onSave } = setup();
    edit((f) => setMeta(f, { goal: "changed" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("save_disabled_with_errors_and_explains_why", () => {
    const { edit } = setup();
    edit((f) => setMeta(f, { name: "" }));
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();
    expect(save).toHaveAttribute("title", expect.stringContaining("flow name must be a non-empty string"));
  });

  it("discard_needs_a_second_click_and_restores_the_baseline", () => {
    const { store, edit } = setup();
    edit((f) => setMeta(f, { name: "Changed" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(store.getState().draft.name).toBe("Changed");
    fireEvent.click(screen.getByRole("button", { name: "Click again to discard" }));
    expect(store.getState().draft.name).toBe("My flow");
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });

  it("undo_and_redo_buttons_follow_history", () => {
    const { store, edit } = setup();
    edit((f) => setMeta(f, { goal: "one" }));
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(store.getState().draft.goal).toBe("The goal");
    fireEvent.click(screen.getByRole("button", { name: "Redo" }));
    expect(store.getState().draft.goal).toBe("one");
  });
});

describe("inline editing", () => {
  it("flow_name_is_committed_on_enter_as_one_edit", () => {
    const { store } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Edit flow name" }));
    const input = screen.getByRole("textbox", { name: "Flow name" });
    fireEvent.change(input, { target: { value: "Renamed" } });
    expect(store.getState().draft.name).toBe("My flow");
    key({ key: "Enter" }, input);
    expect(store.getState().draft.name).toBe("Renamed");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Renamed");
  });

  it("escape_cancels_a_name_edit", () => {
    const { store } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Edit flow name" }));
    const input = screen.getByRole("textbox", { name: "Flow name" });
    fireEvent.change(input, { target: { value: "Nope" } });
    key({ key: "Escape" }, input);
    expect(store.getState().draft.name).toBe("My flow");
    expect(screen.queryByRole("textbox", { name: "Flow name" })).toBeNull();
  });

  it("goal_is_always_editable_and_committed_when_the_field_loses_focus", () => {
    const { store } = setup();
    const goal = screen.getByRole("textbox", { name: "Goal" });
    expect(goal).toHaveValue("The goal");
    fireEvent.change(goal, { target: { value: "New **goal**" } });
    expect(store.getState().draft.goal).toBe("The goal");
    fireEvent.blur(goal);
    expect(store.getState().draft.goal).toBe("New **goal**");
  });
});

describe("revision badge", () => {
  const badge = () => screen.getByTestId("revision-badge");

  it("shows_the_current_revision_and_the_next_one_when_dirty", () => {
    const { edit } = setup();
    expect(badge()).toHaveTextContent(/^rev 4$/);
    edit((f) => setMeta(f, { goal: "x" }));
    expect(badge()).toHaveTextContent("rev 4 → 5");
  });

  it("a_manual_revision_is_applied_and_counts_as_a_change", () => {
    const { store } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Edit revision" }));
    expect(screen.getByRole("note")).toHaveTextContent(/lock/i);
    const input = screen.getByRole("spinbutton", { name: "Revision" });
    fireEvent.change(input, { target: { value: "20" } });
    key({ key: "Enter" }, input);
    expect(store.getState().revisionOverride).toBe(20);
    expect(badge()).toHaveTextContent("rev 4 → 20");
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it.each(["-1", "1.5", ""])("override_rejects_%j", (value) => {
    const { store } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Edit revision" }));
    const input = screen.getByRole("spinbutton", { name: "Revision" });
    fireEvent.change(input, { target: { value } });
    key({ key: "Enter" }, input);
    expect(screen.getByRole("alert")).toHaveTextContent("revision must be a non-negative integer");
    expect(store.getState().revisionOverride).toBeNull();
  });

  it("the_automatic_revision_can_be_restored", () => {
    const { store } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Edit revision" }));
    const input = screen.getByRole("spinbutton", { name: "Revision" });
    fireEvent.change(input, { target: { value: "9" } });
    key({ key: "Enter" }, input);
    fireEvent.click(screen.getByRole("button", { name: "Use automatic revision" }));
    expect(store.getState().revisionOverride).toBeNull();
    expect(badge()).toHaveTextContent(/^rev 4$/);
  });
});

describe("shortcuts and guards", () => {
  it.each([{ ctrlKey: true }, { metaKey: true }])("save_shortcut_%j_triggers_save_once", (mods) => {
    const { edit, onSave } = setup();
    edit((f) => setMeta(f, { goal: "x" }));
    const event = new KeyboardEvent("keydown", { key: "s", cancelable: true, bubbles: true, ...mods });
    document.dispatchEvent(event);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it("undo_and_redo_shortcuts_work_outside_text_fields", () => {
    const { store, edit } = setup();
    edit((f) => setMeta(f, { goal: "x" }));
    key({ key: "z", ctrlKey: true });
    expect(store.getState().draft.goal).toBe("The goal");
    key({ key: "z", ctrlKey: true, shiftKey: true });
    expect(store.getState().draft.goal).toBe("x");
  });

  it("undo_shortcut_is_left_to_text_fields", () => {
    const { store, edit } = setup();
    edit((f) => setMeta(f, { goal: "x" }));
    key({ key: "z", ctrlKey: true }, screen.getByRole("textbox", { name: "Goal" }));
    expect(store.getState().draft.goal).toBe("x");
  });

  it("beforeunload_is_blocked_only_while_dirty", () => {
    const { edit, store } = setup();
    const clean = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);
    edit((f) => setMeta(f, { goal: "x" }));
    const dirty = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(dirty);
    expect(dirty.defaultPrevented).toBe(true);
    act(() => store.getState().discard());
    const again = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(again);
    expect(again.defaultPrevented).toBe(false);
  });
});

describe("problems panel", () => {
  const BAD = { ...GOOD, stages: [{ name: "a", prompt: "p", depends_on: ["b"] }, { name: "b", prompt: "p" }] };
  const summary = () => screen.getByRole("button", { name: /problem|error|warning/i });

  it("says_there_are_no_problems", () => {
    setup();
    expect(screen.getByTestId("problems-summary")).toHaveTextContent("No problems");
  });

  it("counts_errors_and_warnings_with_plurals", () => {
    const { edit } = setup({ ...GOOD, stages: [{ name: "a", prompt: "p" }, { name: "b", prompt: "p", depends_on: ["a"] }] });
    edit((f) => setStageFields(f, "b", { state: "finished", output: "x" }));
    expect(screen.getByTestId("problems-summary")).toHaveTextContent("2 warnings");
    setup(BAD);
    expect(screen.getAllByTestId("problems-summary").at(-1)).toHaveTextContent("1 error");
  });

  it("error_click_navigates_to_the_stage", () => {
    setup(BAD);
    fireEvent.click(summary());
    const list = screen.getByRole("list", { name: "Problems" });
    fireEvent.click(within(list).getByRole("button", { name: /depends on 'b'/ }));
    expect(window.location.hash).toBe("#/stages/a");
  });

  it("warning_click_navigates_to_its_stage", () => {
    const { edit } = setup();
    edit((f) => setStageFields(f, "b", { state: "finished", output: "x" }));
    fireEvent.click(summary());
    fireEvent.click(screen.getByRole("button", { name: /dependency 'a' is not finished/ }));
    expect(window.location.hash).toBe("#/stages/b");
  });

  it("a_blocked_operation_is_announced_as_an_alert", () => {
    const { store } = setup();
    act(() =>
      store.getState().apply(() => {
        throw new OpError("stage 'a' already exists");
      }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent("stage 'a' already exists");
    act(() => store.getState().apply((f) => renameStage(f, "a", "z")));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("saving from inside a field", () => {
  it("ctrl_s_commits_the_focused_field_before_saving", () => {
    navigate({ tab: "stages", item: "a" }, { replace: true });
    const store = createFlowStore({ flow: parseFlow(GOOD), format: "yaml", source: null });
    let savedName: string | null = "not called";
    const onSave = vi.fn(() => {
      savedName = store.getState().draft.stages[0].name;
    });
    render(
      <FlowStoreProvider store={store}>
        <App onSave={onSave} />
      </FlowStoreProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit stage name" }));
    const input = screen.getByRole("textbox", { name: "Stage name" });
    input.focus();
    fireEvent.change(input, { target: { value: "typed-not-blurred" } });
    fireEvent.keyDown(input, { key: "s", ctrlKey: true });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(savedName).toBe("typed-not-blurred");
  });
});
