import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { SchemaEditor } from "../src/components/schema-editor/SchemaEditor";
import { validateDefinition, type SchemaNode } from "../src/domain/schemaDef";

const INITIAL: SchemaNode = {
  type: "object",
  properties: {
    a: { type: "string" },
    b: { type: "integer" },
    o: { type: "object", properties: {} },
    l: { type: "array", items: { type: "string" } },
  },
  required: ["a"],
};

let current: SchemaNode;
let emitted: number;

function Harness({ initial = INITIAL, readOnly = false }: { initial?: SchemaNode; readOnly?: boolean }) {
  const [value, setValue] = useState(initial);
  current = value;
  return (
    <SchemaEditor
      value={value}
      readOnly={readOnly}
      onChange={(next) => {
        validateDefinition(next); // the editor must never emit something the validators reject
        emitted += 1;
        current = next;
        setValue(next);
      }}
    />
  );
}

const fields = () => current.properties as Record<string, SchemaNode>;
const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

beforeEach(() => {
  emitted = 0;
});

describe("SchemaEditor", () => {
  it("renders_a_row_per_property_with_type_and_required", () => {
    render(<Harness />);
    expect((screen.getByLabelText("Name of a") as HTMLInputElement).value).toBe("a");
    expect((screen.getByLabelText("Type of b") as HTMLSelectElement).value).toBe("integer");
    expect(screen.getByRole("switch", { name: "Required: a" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("switch", { name: "Required: b" })).toHaveAttribute("aria-checked", "false");
  });

  it("add_field_adds_a_property_of_the_chosen_type", () => {
    render(<Harness />);
    change("Field name", "d");
    change("Field type", "number");
    fireEvent.click(screen.getByRole("button", { name: "Add field" }));
    expect(fields().d).toEqual({ type: "number" });
    expect(current.required).toEqual(["a", "d"]);
    expect((screen.getByLabelText("Field name") as HTMLInputElement).value).toBe("");
  });

  it("add_field_can_be_optional", () => {
    render(<Harness />);
    change("Field name", "d");
    fireEvent.click(screen.getByLabelText("New field is required"));
    fireEvent.click(screen.getByRole("button", { name: "Add field" }));
    expect(fields().d).toEqual({ type: "string" });
    expect(current.required).toEqual(["a"]);
  });

  it("add_field_refuses_an_empty_or_duplicate_name_with_a_message", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Add field" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a field name");
    change("Field name", "a");
    fireEvent.click(screen.getByRole("button", { name: "Add field" }));
    expect(screen.getByRole("alert")).toHaveTextContent('A field named "a" already exists');
    expect(emitted).toBe(0);
  });

  it("toggling_required_updates_the_required_list", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("switch", { name: "Required: b" }));
    expect(current.required).toEqual(["a", "b"]);
    fireEvent.click(screen.getByRole("switch", { name: "Required: a" }));
    fireEvent.click(screen.getByRole("switch", { name: "Required: b" }));
    expect("required" in current).toBe(false);
  });

  it("changing_type_resets_nested_structure", () => {
    render(<Harness />);
    change("Type of l", "string");
    expect(fields().l).toEqual({ type: "string" });
    change("Type of o", "array");
    expect(fields().o).toEqual({ type: "array", items: { type: "string" } });
  });

  it("object_field_expands_and_nested_fields_can_be_added", () => {
    render(<Harness />);
    expect(screen.queryByLabelText("Field name in o")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Expand o" }));
    change("Field name in o", "x");
    change("Field type in o", "integer");
    fireEvent.click(screen.getByRole("button", { name: "Add field to o" }));
    expect(fields().o).toEqual({
      type: "object",
      properties: { x: { type: "integer" } },
      required: ["x"],
    });
    fireEvent.click(screen.getByRole("switch", { name: "Required: x" }));
    expect("required" in fields().o).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Delete x" }));
    expect(fields().o).toEqual({ type: "object", properties: {} });
  });

  it("array_field_edits_its_items_type", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Expand l" }));
    change("Type of l items", "object");
    expect(fields().l).toEqual({ type: "array", items: { type: "object", properties: {} } });
    fireEvent.click(screen.getByRole("button", { name: "Expand l items" }));
    change("Field name in l items", "n");
    fireEvent.click(screen.getByRole("button", { name: "Add field to l items" }));
    expect((fields().l.items as SchemaNode).properties).toEqual({ n: { type: "string" } });
  });

  it("enum_values_can_be_added_and_removed_for_scalars_only", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Expand a" }));
    change("Enum value of a", "red");
    fireEvent.click(screen.getByRole("button", { name: "Add value to a" }));
    change("Enum value of a", "blue");
    fireEvent.click(screen.getByRole("button", { name: "Add value to a" }));
    expect(fields().a.enum).toEqual(["red", "blue"]);
    fireEvent.click(screen.getByRole("button", { name: "Remove red" }));
    expect(fields().a.enum).toEqual(["blue"]);
    fireEvent.click(screen.getByRole("button", { name: "Remove blue" }));
    expect("enum" in fields().a).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Expand b" }));
    change("Enum value of b", "x");
    fireEvent.click(screen.getByRole("button", { name: "Add value to b" }));
    expect(screen.getByRole("alert")).toHaveTextContent("integer");
    change("Enum value of b", "5");
    fireEvent.click(screen.getByRole("button", { name: "Add value to b" }));
    expect(fields().b.enum).toEqual([5]);

    fireEvent.click(screen.getByRole("button", { name: "Expand o" }));
    expect(screen.queryByLabelText("Enum value of o")).toBeNull();
  });

  it("duplicate_enum_values_are_ignored", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Expand a" }));
    for (let i = 0; i < 2; i++) {
      change("Enum value of a", "red");
      fireEvent.click(screen.getByRole("button", { name: "Add value to a" }));
    }
    expect(fields().a.enum).toEqual(["red"]);
  });

  it("rename_via_the_name_input_updates_required_too", () => {
    render(<Harness />);
    change("Name of a", "alpha");
    fireEvent.blur(screen.getByLabelText("Name of a"));
    expect(Object.keys(fields())).toEqual(["alpha", "b", "o", "l"]);
    expect(current.required).toEqual(["alpha"]);
  });

  it("rename_to_an_existing_name_is_reverted", () => {
    render(<Harness />);
    change("Name of a", "b");
    fireEvent.blur(screen.getByLabelText("Name of a"));
    expect(Object.keys(fields())).toEqual(["a", "b", "o", "l"]);
    expect((screen.getByLabelText("Name of a") as HTMLInputElement).value).toBe("a");
  });

  it("delete_removes_the_field", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Delete a" }));
    expect(Object.keys(fields())).toEqual(["b", "o", "l"]);
    expect("required" in current).toBe(false);
  });

  it("description_is_editable", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Expand a" }));
    change("Description of a", "the name");
    expect(fields().a).toEqual({ type: "string", description: "the name" });
    change("Description of a", "");
    expect(fields().a).toEqual({ type: "string" });
  });

  it("read_only_disables_every_control", () => {
    render(<Harness readOnly />);
    const controls = [
      ...screen.queryAllByRole("button"),
      ...screen.queryAllByRole("textbox"),
      ...screen.queryAllByRole("combobox"),
      ...screen.queryAllByRole("switch"),
      ...screen.queryAllByRole("checkbox"),
    ];
    expect(controls.length).toBeGreaterThan(4);
    for (const control of controls) {
      if (control.getAttribute("aria-label")?.startsWith("Expand")) continue; // reading is allowed
      expect(control).toBeDisabled();
    }
    expect(emitted).toBe(0);
  });

  it("non_object_root_shows_the_note", () => {
    render(<Harness initial={{ type: "array", items: { type: "string" } }} />);
    expect(screen.getByText(/not an object/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add field" })).toBeNull();
  });

  it("an_empty_object_offers_to_add_the_first_field", () => {
    render(<Harness initial={{ type: "object", properties: {} }} />);
    change("Field name", "first");
    fireEvent.click(screen.getByRole("button", { name: "Add field" }));
    expect(current).toEqual({ type: "object", properties: { first: { type: "string" } }, required: ["first"] });
  });
});
