import { fireEvent, render, screen } from "@testing-library/react";
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
    obj: {
      type: "object",
      properties: { count: { type: "integer" } },
      required: ["count"],
    },
    text: { type: "string" },
  },
  stages: [{ name: "a", prompt: "p", output_schema: "obj" }],
};

function setup(item = "obj") {
  navigate({ tab: "schemas", item }, { replace: true });
  const store = createFlowStore({ flow: parseFlow(BASE), format: "yaml", source: null });
  render(
    <FlowStoreProvider store={store}>
      <App />
    </FlowStoreProvider>,
  );
  return { store, schemas: () => store.getState().draft.schemas as Record<string, any> };
}

const yaml = () => screen.getByRole("textbox", { name: "Schema definition" }) as HTMLTextAreaElement;
const typeYaml = (text: string) => fireEvent.change(yaml(), { target: { value: text } });
const addField = (name: string) => {
  fireEvent.change(screen.getByLabelText("Field name"), { target: { value: name } });
  fireEvent.click(screen.getByRole("button", { name: "Add field" }));
};

describe("Schemas tab: visual editor beside the YAML", () => {
  it("shows_the_fields_of_the_schema", () => {
    setup();
    expect((screen.getByLabelText("Name of count") as HTMLInputElement).value).toBe("count");
    expect(screen.getByRole("switch", { name: "Required: count" })).toHaveAttribute("aria-checked", "true");
  });

  it("visual_edit_updates_the_yaml_and_marks_the_flow_changed", () => {
    const { schemas } = setup();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    addField("total");
    expect(schemas().obj.properties.total).toEqual({ type: "string" });
    expect(yaml().value).toContain("total:");
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("yaml_edit_updates_the_visual_editor", () => {
    setup();
    typeYaml("type: object\nproperties:\n  zeta:\n    type: boolean\n");
    expect((screen.getByLabelText("Name of zeta") as HTMLInputElement).value).toBe("zeta");
    expect(screen.queryByLabelText("Name of count")).toBeNull();
  });

  it("unparsable_yaml_makes_the_visual_editor_read_only_and_keeps_the_text", () => {
    const { schemas } = setup();
    typeYaml("a: [");
    expect(screen.getByRole("button", { name: "Add field" })).toBeDisabled();
    expect(screen.getByLabelText("Name of count")).toBeDisabled();
    expect(yaml().value).toBe("a: [");
    expect(schemas().obj.properties.count).toEqual({ type: "integer" });
  });

  it("an_invalid_definition_hides_the_visual_editor_with_a_hint", () => {
    setup();
    typeYaml("type: object\nproperties:\n  a:\n    type: foo\n");
    expect(screen.queryByRole("button", { name: "Add field" })).toBeNull();
    expect(screen.getByTestId("schema-editor-unavailable")).toHaveTextContent(/fix the yaml/i);
    typeYaml("type: object\nproperties:\n  a:\n    type: string\n");
    expect(screen.getByRole("button", { name: "Add field" })).toBeEnabled();
  });

  it("old_type_names_show_the_hint_in_the_error", () => {
    setup();
    typeYaml("type: str");
    expect(screen.getByTestId("schema-error")).toHaveTextContent("unknown schema type 'str'; use 'string'");
  });

  it("a_non_object_schema_is_edited_in_the_yaml_only", () => {
    setup("text");
    expect(screen.getByTestId("schema-editor-note")).toBeInTheDocument();
    expect(yaml().value).toBe("type: string\n");
  });

  it("typing_a_description_is_one_undo_step_but_separate_edits_are_not", () => {
    const { schemas } = setup();
    addField("total");
    fireEvent.click(screen.getByRole("button", { name: "Expand total" }));
    for (const text of ["t", "to", "total"]) {
      fireEvent.change(screen.getByLabelText("Description of total"), { target: { value: text } });
    }
    expect(schemas().obj.properties.total.description).toBe("total");
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(schemas().obj.properties.total).toEqual({ type: "string" });
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(schemas().obj.properties.total).toBeUndefined();
    expect(yaml().value).not.toContain("total");
  });
});
