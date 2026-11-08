import {
  SCHEMA_TYPES,
  addField,
  changeType,
  defaultSchema,
  fieldsOf,
  moveField,
  removeField,
  renameField,
  setEnum,
  setField,
  setRequired,
} from "../src/domain/schemaEdit";
import { validateDefinition, type SchemaNode } from "../src/domain/schemaDef";

const base = (): SchemaNode => ({
  type: "object",
  properties: { a: { type: "string" }, b: { type: "integer" }, c: { type: "boolean" } },
  required: ["a", "c"],
});

const names = (node: SchemaNode) => Object.keys(node.properties as object);

describe("schema editing functions", () => {
  it("default_schemas_are_valid_for_every_type", () => {
    for (const type of SCHEMA_TYPES) validateDefinition(defaultSchema(type));
    expect(defaultSchema("array")).toEqual({ type: "array", items: { type: "string" } });
    expect(defaultSchema("object")).toEqual({ type: "object", properties: {} });
  });

  it("fields_of_lists_name_schema_and_required_in_order", () => {
    expect(fieldsOf(base()).map((f) => [f.name, f.required])).toEqual([
      ["a", true],
      ["b", false],
      ["c", true],
    ]);
    expect(fieldsOf({ type: "object" })).toEqual([]);
  });

  it("add_field_appends_and_optionally_requires", () => {
    const next = addField(base(), "d", "number", true);
    expect(names(next)).toEqual(["a", "b", "c", "d"]);
    expect(next.required).toEqual(["a", "c", "d"]);
    expect((next.properties as Record<string, unknown>).d).toEqual({ type: "number" });
    const optional = addField(base(), "e", "array");
    expect(optional.required).toEqual(["a", "c"]);
    expect((optional.properties as Record<string, unknown>).e).toEqual(defaultSchema("array"));
  });

  it("add_field_to_an_object_without_properties", () => {
    expect(addField({ type: "object" }, "x", "string", true)).toEqual({
      type: "object",
      properties: { x: { type: "string" } },
      required: ["x"],
    });
  });

  it("add_field_ignores_empty_and_duplicate_names", () => {
    const node = base();
    expect(addField(node, "", "string")).toBe(node);
    expect(addField(node, "   ", "string")).toBe(node);
    expect(addField(node, "a", "string")).toBe(node);
    expect(names(addField(node, "constructor", "string"))).toContain("constructor");
  });

  it("rename_keeps_order_and_updates_required", () => {
    const next = renameField(base(), "a", "alpha");
    expect(names(next)).toEqual(["alpha", "b", "c"]);
    expect(next.required).toEqual(["alpha", "c"]);
  });

  it("rename_refuses_empty_duplicate_or_missing_names", () => {
    const node = base();
    expect(renameField(node, "a", "")).toBe(node);
    expect(renameField(node, "a", "b")).toBe(node);
    expect(renameField(node, "zzz", "y")).toBe(node);
    expect(renameField(node, "a", "a")).toBe(node);
  });

  it("remove_drops_from_required_and_removes_empty_required", () => {
    const one = removeField(base(), "a");
    expect(names(one)).toEqual(["b", "c"]);
    expect(one.required).toEqual(["c"]);
    const none = removeField(removeField(base(), "a"), "c");
    expect("required" in none).toBe(false);
    expect(removeField(base(), "nope")).toEqual(base());
  });

  it("set_required_keeps_properties_order", () => {
    const next = setRequired(base(), "b", true);
    expect(next.required).toEqual(["a", "b", "c"]);
    const off = setRequired(setRequired(base(), "a", false), "c", false);
    expect("required" in off).toBe(false);
    const node = base();
    expect(setRequired(node, "zzz", true)).toBe(node);
  });

  it("move_field_reorders_properties", () => {
    expect(names(moveField(base(), 0, 2))).toEqual(["b", "c", "a"]);
    expect(names(moveField(base(), 2, 0))).toEqual(["c", "a", "b"]);
    const node = base();
    expect(moveField(node, 1, 1)).toBe(node);
    expect(moveField(node, 0, 9)).toBe(node);
    expect(moveField(node, 0, 2).required).toEqual(["c", "a"]);
  });

  it("set_field_replaces_one_field", () => {
    const next = setField(base(), "b", { type: "number", description: "d" });
    expect((next.properties as Record<string, unknown>).b).toEqual({
      type: "number",
      description: "d",
    });
    const node = base();
    expect(setField(node, "nope", { type: "string" })).toBe(node);
  });

  it("change_type_resets_structure_and_keeps_annotations", () => {
    const array = { type: "array", description: "d", examples: [[1]], items: { type: "integer" } };
    expect(changeType(array, "object")).toEqual({
      type: "object",
      description: "d",
      examples: [[1]],
      properties: {},
    });
    const object = { type: "object", description: "d", properties: { a: { type: "string" } }, required: ["a"] };
    expect(changeType(object, "array")).toEqual({
      type: "array",
      description: "d",
      items: { type: "string" },
    });
    expect(changeType(object, "string")).toEqual({ type: "string", description: "d" });
    expect(changeType(array, "array")).toBe(array);
  });

  it("change_type_keeps_enum_only_when_still_valid", () => {
    const text = { type: "string", enum: ["a", "b"] };
    expect(changeType(text, "string")).toBe(text);
    expect(changeType(text, "integer")).toEqual({ type: "integer" });
    expect(changeType({ type: "integer", enum: [1, 2] }, "number")).toEqual({
      type: "number",
      enum: [1, 2],
    });
    expect(changeType({ type: "number", enum: [1.5, 2] }, "integer")).toEqual({ type: "integer" });
    expect(changeType(text, "object")).toEqual({ type: "object", properties: {} });
  });

  it("set_enum_null_or_empty_removes_it", () => {
    const withEnum = setEnum({ type: "string", description: "d" }, ["a"]);
    expect(withEnum).toEqual({ type: "string", description: "d", enum: ["a"] });
    expect(setEnum(withEnum, null)).toEqual({ type: "string", description: "d" });
    expect(setEnum(withEnum, [])).toEqual({ type: "string", description: "d" });
  });

  it("every_function_output_passes_validateDefinition", () => {
    const steps: SchemaNode[] = [
      addField(base(), "d", "object", true),
      addField(base(), "d", "array"),
      renameField(base(), "c", "gamma"),
      removeField(base(), "a"),
      setRequired(base(), "b", true),
      setRequired(base(), "a", false),
      moveField(base(), 0, 1),
      setField(base(), "a", changeType({ type: "string", enum: ["x"] }, "integer")),
    ];
    for (const node of steps) validateDefinition(node);
  });

  it("functions_never_mutate_their_input", () => {
    const node = base();
    const snapshot = JSON.stringify(node);
    addField(node, "d", "string", true);
    renameField(node, "a", "z");
    removeField(node, "a");
    setRequired(node, "b", true);
    moveField(node, 0, 2);
    setField(node, "a", { type: "number" });
    expect(JSON.stringify(node)).toBe(snapshot);
  });
});
