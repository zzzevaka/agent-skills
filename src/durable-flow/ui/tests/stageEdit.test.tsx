import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { parseFlow } from "../src/domain/flow";
import { createFlowStore, FlowStoreProvider } from "../src/store/flowStore";
import { App } from "../src/ui/App";
import { navigate } from "../src/ui/route";

vi.mock("../src/ui/CodeEditor", async () => {
  const { createElement } = await import("react");
  return {
    CodeEditor: (props: {
      value: string;
      ariaLabel: string;
      onChange(v: string): void;
      onBlur?(): void;
    }) =>
      createElement("textarea", {
        "aria-label": props.ariaLabel,
        value: props.value,
        onChange: (e: { target: { value: string } }) => props.onChange(e.target.value),
        onBlur: props.onBlur,
      }),
  };
});

const BASE = {
  name: "f",
  goal: "g",
  schemas: {
    s1: { type: "string" },
    s2: { type: "object", properties: { n: { type: "integer" } } },
  },
  stages: [
    { name: "a", prompt: "pa" },
    { name: "b", prompt: "pb", depends_on: ["a"] },
    { name: "free", prompt: "pf" },
    { name: "c", prompt: "pc", depends_on: ["a", "b"] },
  ],
};

function setup(raw: object = BASE, item: string | null = "a") {
  navigate({ tab: "stages", item }, { replace: true });
  const store = createFlowStore({ flow: parseFlow(raw), format: "yaml", source: null });
  render(
    <FlowStoreProvider store={store}>
      <App />
    </FlowStoreProvider>,
  );
  const names = () => store.getState().draft.stages.map((s) => s.name);
  const stage = (name: string) => store.getState().draft.stages.find((s) => s.name === name)!;
  return { store, names, stage };
}

const click = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));
const openTab = (name: string) => fireEvent.mouseDown(screen.getByRole("tab", { name }), { button: 0 });

const detail = () => within(screen.getByTestId("stage-detail"));
const listItem = (name: string) => within(screen.getByRole("list", { name: "Stages" })).getByText(name);

describe("stage list", () => {
  it("add_stage_appends_and_selects", () => {
    const { names } = setup();
    click("Add stage");
    expect(names()).toEqual(["a", "b", "free", "c", "stage-5"]);
    expect(window.location.hash).toBe("#/stages/stage-5");
  });

  it("duplicate_stage_selects_the_copy", () => {
    const { names } = setup();
    click("Duplicate stage");
    expect(names()).toContain("a-copy");
    expect(window.location.hash).toBe("#/stages/a-copy");
  });

  it("delete_last_stage_is_disabled_with_a_reason", () => {
    setup({ name: "f", goal: "g", stages: [{ name: "only", prompt: "p" }] }, "only");
    const button = screen.getByRole("button", { name: "Delete stage" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", expect.stringContaining("at least one stage"));
  });

  it("delete_without_dependents_asks_then_deletes_and_selects_the_previous_stage", () => {
    const { names } = setup(BASE, "c");
    click("Delete stage");
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent("Delete stage 'c'?");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(names()).toEqual(["a", "b", "free"]);
    expect(window.location.hash).toBe("#/stages/free");
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("delete_with_dependents_requires_unlinking", () => {
    const { names, stage } = setup(BASE, "a");
    click("Delete stage");
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent(/required by/i);
    expect(dialog).toHaveTextContent("b");
    expect(within(dialog).queryByRole("button", { name: "Delete" })).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Unlink and delete" }));
    expect(names()).toEqual(["b", "free", "c"]);
    expect(stage("b").depends_on).toEqual([]);
    expect(stage("c").depends_on).toEqual(["b"]);
  });

  it("cancel_keeps_the_stage", () => {
    const { names } = setup();
    click("Delete stage");
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Cancel" }));
    expect(names()).toContain("a");
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("rename_updates_dependents_and_the_hash", () => {
    const { names, stage } = setup();
    click("Edit stage name");
    const input = screen.getByRole("textbox", { name: "Stage name" });
    fireEvent.change(input, { target: { value: "root" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(names()[0]).toBe("root");
    expect(stage("b").depends_on).toEqual(["root"]);
    expect(window.location.hash).toBe("#/stages/root");
  });

  it("rename_to_an_existing_name_is_refused_with_a_message", () => {
    const { names } = setup();
    click("Edit stage name");
    const input = screen.getByRole("textbox", { name: "Stage name" });
    fireEvent.change(input, { target: { value: "b" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(names()[0]).toBe("a");
    expect(screen.getByRole("alert")).toHaveTextContent("already exists");
    expect(window.location.hash).toBe("#/stages/a");
  });

  it("rename_to_empty_is_refused", () => {
    const { names } = setup();
    click("Edit stage name");
    const input = screen.getByRole("textbox", { name: "Stage name" });
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(names()[0]).toBe("a");
    expect(screen.getByRole("alert")).toHaveTextContent("must not be empty");
  });
});

/** The row being dragged: dnd-kit also measures its overlay, which is empty when first measured. */
let draggedRow = 0;

/** jsdom has no layout: give each sortable row a 32px box so dnd-kit can find neighbours. */
function mockRowGeometry() {
  return vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const holder = this.closest("[data-row]");
    const index = holder ? Number(holder.getAttribute("data-row")) : draggedRow;
    const top = index * 32;
    return { x: 0, y: top, top, left: 0, right: 220, bottom: top + 32, width: 220, height: 32, toJSON: () => ({}) } as DOMRect;
  });
}

const tick = () => act(async () => void (await new Promise((resolve) => setTimeout(resolve, 0))));
const handle = (name: string) => screen.getByRole("button", { name: `Drag to reorder ${name}` });

async function keyboardDrag(name: string, codes: string[], finish = "Space") {
  const grip = handle(name);
  draggedRow = Number(grip.closest("[data-row]")!.getAttribute("data-row"));
  grip.focus();
  fireEvent.keyDown(grip, { code: "Space", key: " " });
  await tick();
  for (const code of codes) {
    fireEvent.keyDown(document, { code, key: code });
    await tick();
  }
  fireEvent.keyDown(document, { code: finish, key: finish });
  await tick();
}

describe("reordering by drag and drop", () => {
  afterEach(() => vi.restoreAllMocks());

  it("every_stage_has_a_drag_handle_button_named_after_it", () => {
    setup();
    for (const name of ["a", "b", "free", "c"]) {
      expect(handle(name)).toHaveAttribute("aria-roledescription", "sortable");
    }
  });

  it("the_toolbar_has_no_move_buttons_any_more", () => {
    setup();
    expect(screen.queryByRole("button", { name: "Move up" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Move down" })).toBeNull();
  });

  it("clicking_a_handle_does_not_select_the_stage", () => {
    setup(BASE, "a");
    fireEvent.click(handle("free"));
    expect(window.location.hash).toBe("#/stages/a");
  });

  it("keyboard_drag_moves_a_stage_up_and_keeps_the_selection", async () => {
    mockRowGeometry();
    const { names } = setup(BASE, "free");
    await keyboardDrag("free", ["ArrowUp"]);
    expect(names()).toEqual(["a", "free", "b", "c"]);
    expect(window.location.hash).toBe("#/stages/free");
  });

  it("keyboard_drag_moves_a_stage_down", async () => {
    mockRowGeometry();
    const { names } = setup(BASE, "b");
    await keyboardDrag("b", ["ArrowDown"]);
    expect(names()).toEqual(["a", "free", "b", "c"]);
  });

  it("a_drop_before_a_dependency_is_blocked_with_the_reason", async () => {
    mockRowGeometry();
    const { names } = setup(BASE, "b");
    await keyboardDrag("b", ["ArrowUp"]);
    expect(names()).toEqual(["a", "b", "free", "c"]);
    expect(screen.getByRole("alert")).toHaveTextContent("stage 'b' would come before its dependency 'a'");
  });

  it("escape_cancels_a_drag", async () => {
    mockRowGeometry();
    const { names, store } = setup(BASE, "free");
    await keyboardDrag("free", ["ArrowUp"], "Escape");
    expect(names()).toEqual(["a", "b", "free", "c"]);
    expect(store.getState().dirty).toBe(false);
  });

  it("re_rendering_the_list_keeps_text_typed_into_the_stage_name", () => {
    const { store } = setup(BASE, "a");
    click("Edit stage name");
    const input = screen.getByRole("textbox", { name: "Stage name" });
    fireEvent.change(input, { target: { value: "half-typed" } });
    act(() => store.getState().apply((f) => ({ ...f, goal: "another change" })));
    expect(screen.getByRole("textbox", { name: "Stage name" })).toHaveValue("half-typed");
  });
});

describe("stage fields", () => {
  it("prompt_is_always_editable_and_committed_when_the_field_loses_focus", () => {
    const { stage } = setup();
    const prompt = screen.getByRole("textbox", { name: "Prompt" });
    expect(prompt).toHaveValue("pa");
    fireEvent.change(prompt, { target: { value: "new **prompt**" } });
    expect(stage("a").prompt).toBe("pa");
    fireEvent.blur(prompt);
    expect(stage("a").prompt).toBe("new **prompt**");
  });

  it("an_undo_of_the_prompt_edit_puts_the_old_text_back_into_the_editor", () => {
    const { stage, store } = setup();
    fireEvent.change(screen.getByRole("textbox", { name: "Prompt" }), { target: { value: "changed" } });
    fireEvent.blur(screen.getByRole("textbox", { name: "Prompt" }));
    act(() => store.getState().undo());
    expect(stage("a").prompt).toBe("pa");
    expect(screen.getByRole("textbox", { name: "Prompt" })).toHaveValue("pa");
  });

  const openDeps = () => fireEvent.click(screen.getByRole("combobox", { name: "Dependencies" }));
  const depOptions = () =>
    within(screen.getByRole("listbox", { name: "Dependencies" })).getAllByRole("option").map((o) => o.textContent);

  it("the_dependency_picker_offers_only_earlier_stages_that_are_not_selected", () => {
    setup(BASE, "c");
    expect(detail().getByRole("button", { name: "Remove a" })).toBeInTheDocument();
    expect(detail().getByRole("button", { name: "Remove b" })).toBeInTheDocument();
    openDeps();
    expect(depOptions()).toEqual(["free"]);
  });

  it("the_first_stage_has_no_earlier_stages_to_pick", () => {
    setup(BASE, "a");
    expect(screen.queryByRole("combobox", { name: "Dependencies" })).toBeNull();
    expect(screen.getByTestId("stage-detail")).toHaveTextContent("No earlier stages.");
  });

  it("picking_and_removing_dependencies_updates_the_stage", () => {
    const { stage } = setup(BASE, "c");
    fireEvent.click(detail().getByRole("button", { name: "Remove b" }));
    expect(stage("c").depends_on).toEqual(["a"]);
    openDeps();
    fireEvent.click(within(screen.getByRole("listbox", { name: "Dependencies" })).getByRole("option", { name: "free" }));
    expect(stage("c").depends_on).toEqual(["a", "free"]);
    fireEvent.click(within(screen.getByRole("listbox", { name: "Dependencies" })).getByRole("option", { name: "b" }));
    expect(stage("c").depends_on).toEqual(["a", "b", "free"]);
  });

  it("dependency_to_all_following_stages_adds_this_stage_to_every_later_one", () => {
    const { stage, store } = setup(BASE, "a");
    click("Dependency to all following stages");
    expect(stage("b").depends_on).toEqual(["a"]);
    expect(stage("free").depends_on).toEqual(["a"]);
    expect(stage("c").depends_on).toEqual(["a", "b"]);
    expect(screen.getByRole("button", { name: "Dependency to all following stages" })).toBeDisabled();
    act(() => store.getState().undo());
    expect(stage("free").depends_on).toEqual([]);
  });

  it("dependency_to_all_following_stages_keeps_existing_dependencies_in_stage_order", () => {
    const { stage } = setup(BASE, "free");
    click("Dependency to all following stages");
    expect(stage("c").depends_on).toEqual(["a", "b", "free"]);
  });

  it("dependency_to_all_following_stages_is_disabled_for_the_last_stage", () => {
    setup(BASE, "c");
    expect(screen.getByRole("button", { name: "Dependency to all following stages" })).toBeDisabled();
  });

  it("output_schema_select_sets_and_clears_the_schema", () => {
    const { stage } = setup(BASE, "b");
    openTab("Output schema");
    const select = detail().getByRole("combobox", { name: "Output schema" });
    fireEvent.change(select, { target: { value: "s2" } });
    expect(stage("b").output_schema).toBe("s2");
    expect(screen.getByTestId("stage-detail").textContent).toContain("type: object");
    fireEvent.change(select, { target: { value: "" } });
    expect(stage("b").output_schema).toBeNull();
  });

  it("new_schema_creates_links_and_opens_it", () => {
    const { store, stage } = setup(BASE, "b");
    openTab("Output schema");
    fireEvent.click(detail().getByRole("button", { name: "New schema…" }));
    expect(Object.keys(store.getState().draft.schemas)).toEqual(["s1", "s2", "schema-3"]);
    expect(stage("b").output_schema).toBe("schema-3");
    expect(window.location.hash).toBe("#/schemas/schema-3");
  });

  it("output_of_a_string_stage_is_stored_as_typed", () => {
    const { stage } = setup(BASE, "a");
    click("Edit output");
    const output = detail().getByRole("textbox", { name: "Output" });
    fireEvent.change(output, { target: { value: '{"looks": "like json"}' } });
    fireEvent.blur(output);
    expect(stage("a").output).toBe('{"looks": "like json"}');
  });

  it("output_of_a_structured_stage_is_parsed_as_json", () => {
    const { stage } = setup({ ...BASE, stages: [{ name: "a", prompt: "p", output_schema: "s2" }] }, "a");
    click("Edit output");
    const output = detail().getByRole("textbox", { name: "Output" });
    fireEvent.change(output, { target: { value: '{"n": 1}' } });
    fireEvent.blur(output);
    expect(stage("a").output).toEqual({ n: 1 });
  });

  it("invalid_output_shows_a_warning_and_never_blocks_saving", () => {
    const { store } = setup({ ...BASE, stages: [{ name: "a", prompt: "p", output_schema: "s2" }] }, "a");
    click("Edit output");
    const output = detail().getByRole("textbox", { name: "Output" });
    fireEvent.change(output, { target: { value: '{"n": "x"}' } });
    expect(detail().getByTestId("output-warning")).toHaveTextContent("n: expected integer, got str");
    fireEvent.blur(output);
    expect(store.getState().errors).toEqual([]);
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("an_empty_output_is_stored_as_null", () => {
    const { stage } = setup({ ...BASE, stages: [{ name: "a", prompt: "p", state: "finished", output: "x" }] }, "a");
    click("Edit output");
    const output = detail().getByRole("textbox", { name: "Output" });
    fireEvent.change(output, { target: { value: "" } });
    fireEvent.blur(output);
    expect(stage("a").output).toBeNull();
  });

  it("reset_stage_clears_state_output_and_message", () => {
    const { stage } = setup(
      { ...BASE, stages: [{ name: "a", prompt: "p", state: "failed", message: "boom", output: "x" }] },
      "a",
    );
    click("Reset stage");
    expect(stage("a")).toMatchObject({ state: "pending", message: null, output: null });
  });

  it("reset_from_here_resets_the_following_stages_too", () => {
    const { store } = setup(
      {
        ...BASE,
        stages: [
          { name: "a", prompt: "p", state: "finished", output: "1" },
          { name: "b", prompt: "p", state: "finished", output: "2" },
          { name: "c", prompt: "p", state: "inprogress", output: "3" },
        ],
      },
      "b",
    );
    click("Reset from here");
    expect(store.getState().draft.stages.map((s) => s.state)).toEqual(["finished", "pending", "pending"]);
  });
});

describe("stage state and reason", () => {
  const STATES = {
    ...BASE,
    stages: [
      { name: "a", prompt: "p", state: "finished", output: "x" },
      { name: "b", prompt: "p", depends_on: ["a"], state: "waiting", message: "waiting for review" },
      { name: "c", prompt: "p", state: "failed", message: "boom" },
    ],
  };
  const badge = () => screen.getByTestId("state-pill");
  const choose = (name: string) =>
    fireEvent.click(within(screen.getByRole("group", { name: "Set state" })).getByRole("button", { name }));
  const reason = () => screen.getByRole("textbox", { name: "Reason" });

  it("the_state_is_changed_from_the_badge_menu_and_the_old_select_is_gone", () => {
    setup(BASE, "b");
    expect(screen.queryByRole("combobox", { name: "State" })).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Message" })).toBeNull();
    fireEvent.click(badge());
    const names = within(screen.getByRole("group", { name: "Set state" })).getAllByRole("button");
    expect(names.map((b) => b.textContent)).toEqual(["Pending", "In progress", "Waiting", "Finished", "Failed"]);
  });

  it("choosing_finished_sets_the_state_and_clears_the_reason", () => {
    const { stage } = setup(STATES, "b");
    fireEvent.click(badge());
    choose("Finished");
    expect(stage("b")).toMatchObject({ state: "finished", message: null });
    expect(screen.queryByTestId("reason-note")).toBeNull();
  });

  it("choosing_failed_asks_for_a_reason_and_cancel_keeps_everything", () => {
    const { stage } = setup(BASE, "b");
    fireEvent.click(badge());
    choose("Failed");
    expect(screen.getByRole("alertdialog")).toHaveTextContent("Why did the stage fail?");
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(stage("b").state).toBe("pending");
    expect(stage("b").message).toBeNull();
  });

  it("the_reason_is_required", () => {
    setup(BASE, "b");
    fireEvent.click(badge());
    choose("Failed");
    const confirm = within(screen.getByRole("alertdialog")).getByRole("button", { name: "Mark as failed" });
    expect(confirm).toBeDisabled();
    fireEvent.change(reason(), { target: { value: "   " } });
    expect(confirm).toBeDisabled();
    fireEvent.change(reason(), { target: { value: "disk full" } });
    expect(confirm).toBeEnabled();
  });

  it("confirming_sets_the_state_and_the_reason_and_shows_the_note", () => {
    const { stage } = setup(BASE, "b");
    fireEvent.click(badge());
    choose("Failed");
    fireEvent.change(reason(), { target: { value: "  disk full  " } });
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Mark as failed" }));
    expect(stage("b")).toMatchObject({ state: "failed", message: "disk full" });
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByTestId("reason-note")).toHaveTextContent("disk full");
  });

  it("waiting_has_its_own_wording", () => {
    const { stage } = setup(BASE, "b");
    fireEvent.click(badge());
    choose("Waiting");
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent("Why is the stage waiting?");
    fireEvent.change(reason(), { target: { value: "needs an answer" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Set to waiting" }));
    expect(stage("b")).toMatchObject({ state: "waiting", message: "needs an answer" });
  });

  it("the_note_shows_only_while_waiting_or_failed", () => {
    setup(STATES, "a");
    expect(screen.queryByTestId("reason-note")).toBeNull();
    fireEvent.click(screen.getAllByText("b").at(0)!.closest("button")!);
    expect(screen.getByTestId("reason-note")).toHaveTextContent("waiting for review");
  });

  it("edit_reason_changes_only_the_message", () => {
    const { stage } = setup(STATES, "c");
    click("Edit reason");
    expect(reason()).toHaveValue("boom");
    fireEvent.change(reason(), { target: { value: "boom again" } });
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Save reason" }));
    expect(stage("c")).toMatchObject({ state: "failed", message: "boom again" });
  });

  it("choosing_the_current_reason_state_again_edits_its_reason", () => {
    setup(STATES, "c");
    fireEvent.click(badge());
    choose("Failed");
    expect(reason()).toHaveValue("boom");
  });

  it("a_legacy_stage_without_a_reason_says_so", () => {
    setup({ ...BASE, stages: [{ name: "a", prompt: "p", state: "failed" }] }, "a");
    expect(screen.getByTestId("reason-note")).toHaveTextContent("No reason given");
  });

  it("escape_closes_the_dialog_without_changes", () => {
    const { stage } = setup(BASE, "b");
    fireEvent.click(badge());
    choose("Waiting");
    fireEvent.keyDown(reason(), { key: "Escape" });
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(stage("b").state).toBe("pending");
  });
});
