import { fireEvent, render, screen, within } from "@testing-library/react";
import { parseFlow } from "../src/domain/flow";
import { createFlowStore, FlowStoreProvider } from "../src/store/flowStore";
import { App } from "../src/ui/App";
import { navigate } from "../src/ui/route";

vi.mock("../src/ui/CodeEditor", async () => {
  const { createElement } = await import("react");
  return {
    CodeEditor: (props: { value: string; ariaLabel: string; onChange(v: string): void; onBlur?(): void }) =>
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
    obj: { type: "object", properties: { count: { type: "integer" } } },
    text: { type: "string" },
  },
  stages: [
    { name: "a", prompt: "p", output_schema: "obj" },
    { name: "b", prompt: "p", output_schema: "obj" },
    { name: "c", prompt: "p" },
  ],
};

function setup(raw: object = BASE, item: string | null = "obj") {
  navigate({ tab: "schemas", item }, { replace: true });
  const store = createFlowStore({ flow: parseFlow(raw), format: "yaml", source: null });
  render(
    <FlowStoreProvider store={store}>
      <App />
    </FlowStoreProvider>,
  );
  return { store, schemas: () => store.getState().draft.schemas };
}

const editor = () => screen.getByRole("textbox", { name: "Schema definition" });
const type = (text: string) => fireEvent.change(editor(), { target: { value: text } });
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));
const listItem = (name: string) => within(screen.getByRole("list", { name: "Schemas" })).getByText(name);

describe("schema editor", () => {
  it("valid_yaml_updates_the_draft", () => {
    const { schemas } = setup();
    type("type: integer");
    expect(schemas().obj).toEqual({ type: "integer" });
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    expect(screen.queryByTestId("schema-error")).toBeNull();
  });

  it("invalid_yaml_blocks_save_and_keeps_the_text", () => {
    const { schemas } = setup();
    type("a: [");
    expect(screen.getByTestId("schema-error")).toHaveTextContent("invalid YAML");
    expect(editor()).toHaveValue("a: [");
    expect(schemas().obj).toEqual(BASE.schemas.obj);
    type("type: boolean");
    expect(screen.queryByTestId("schema-error")).toBeNull();
  });

  it("the_save_button_is_disabled_while_the_yaml_is_broken", () => {
    setup();
    type("type: integer");
    type("a: [");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("definition_error_message_matches_python", () => {
    setup();
    type("type: object\nproperties:\n  a:\n    type: foo");
    expect(screen.getByTestId("schema-error")).toHaveTextContent(
      "schemas.obj.properties.a: unknown schema type 'foo'",
    );
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("switching_schemas_keeps_the_unparsable_text", () => {
    setup();
    type("a: [");
    fireEvent.click(listItem("text"));
    expect(editor()).toHaveValue("type: string\n");
    fireEvent.click(listItem("obj"));
    expect(editor()).toHaveValue("a: [");
    expect(screen.getByTestId("schema-error")).toBeInTheDocument();
  });

  it("typing_is_one_undo_step", () => {
    const { schemas } = setup();
    type("type: i");
    type("type: in");
    type("type: integer");
    click("Undo");
    expect(schemas().obj).toEqual(BASE.schemas.obj);
  });

  it("undo_restores_the_editor_text", () => {
    setup();
    type("type: integer");
    click("Undo");
    expect(editor()).toHaveValue("type: object\nproperties:\n  count:\n    type: integer\n");
  });
});

describe("schema list", () => {
  it("add_schema_creates_a_unique_name_and_selects_it", () => {
    const { schemas } = setup();
    click("Add schema");
    expect(Object.keys(schemas())).toEqual(["obj", "text", "schema-3"]);
    expect(window.location.hash).toBe("#/schemas/schema-3");
  });

  it("add_schema_skips_names_that_are_taken", () => {
    const { schemas } = setup({ ...BASE, schemas: { ...BASE.schemas, "schema-3": { type: "string" } } });
    click("Add schema");
    expect(Object.keys(schemas())).toContain("schema-4");
  });

  it("the_empty_state_still_offers_add", () => {
    const { schemas } = setup({ ...BASE, schemas: {}, stages: [{ name: "a", prompt: "p" }] }, null);
    expect(screen.getByText("No schemas defined.")).toBeInTheDocument();
    click("Add schema");
    expect(Object.keys(schemas())).toEqual(["schema-1"]);
  });

  it("rename_rewrites_the_stage_output_schema_and_the_hash", () => {
    const { store } = setup();
    click("Edit schema name");
    const input = screen.getByRole("textbox", { name: "Schema name" });
    fireEvent.change(input, { target: { value: "record" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(Object.keys(store.getState().draft.schemas)).toEqual(["record", "text"]);
    expect(store.getState().draft.stages[0].output_schema).toBe("record");
    expect(window.location.hash).toBe("#/schemas/record");
  });

  it("rename_to_an_existing_name_is_refused", () => {
    const { schemas } = setup();
    click("Edit schema name");
    const input = screen.getByRole("textbox", { name: "Schema name" });
    fireEvent.change(input, { target: { value: "text" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(Object.keys(schemas())).toEqual(["obj", "text"]);
    expect(screen.getByRole("alert")).toHaveTextContent("already exists");
  });

  it("delete_of_a_used_schema_requires_unlinking", () => {
    const { store } = setup();
    click("Delete schema");
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent(/used by/i);
    expect(dialog).toHaveTextContent("a, b");
    expect(within(dialog).queryByRole("button", { name: "Delete" })).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Unlink and delete" }));
    expect(Object.keys(store.getState().draft.schemas)).toEqual(["text"]);
    expect(store.getState().draft.stages.map((s) => s.output_schema)).toEqual([null, null, null]);
    expect(window.location.hash).toBe("#/schemas/text");
  });

  it("delete_of_an_unused_schema_is_a_plain_delete", () => {
    const { schemas } = setup(BASE, "text");
    click("Delete schema");
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete" }));
    expect(Object.keys(schemas())).toEqual(["obj"]);
  });

  it("delete_forgets_a_broken_editor_text_so_saving_is_possible_again", () => {
    setup(BASE, "text");
    type("a: [");
    click("Delete schema");
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete" }));
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });
});
