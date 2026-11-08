import { pyListRepr, pyRepr, pyTypeName } from "../src/domain/pyCompat";
import {
  ValidationError,
  parseAndValidate,
  validateDefinition,
  validateValue,
} from "../src/domain/schemaDef";
import { loadParity } from "./fixtures";

interface SchemaCase {
  definition: unknown;
  definition_error: string | null;
  values: { value: unknown; errors: string[] }[];
}
interface ParseCase {
  definition: unknown;
  text: string;
  result: { ok: unknown } | { error: string; prefix_only: boolean };
}

describe("pyRepr", () => {
  it.each(loadParity<{ value: string; repr: string }[]>("pyrepr.json"))(
    "matches_python_repr_for_$repr",
    ({ value, repr }) => {
      expect(pyRepr(value)).toBe(repr);
    },
  );

  it("formats_lists_like_python", () => {
    expect(pyListRepr(["a", "it's"])).toBe(`['a', "it's"]`);
  });

  it("names_json_types_like_python", () => {
    expect(["x", 1, 1.5, true, null, [], {}].map(pyTypeName)).toEqual([
      "str",
      "int",
      "float",
      "bool",
      "NoneType",
      "list",
      "dict",
    ]);
  });
});

describe("schema definitions and values (parity corpus)", () => {
  const cases = loadParity<SchemaCase[]>("schema-cases.json");

  it.each(cases.map((c, i) => [i, JSON.stringify(c.definition), c] as const))(
    "case_%i_%s",
    (_i, _label, c) => {
      if (c.definition_error !== null) {
        expect(() => validateDefinition(c.definition)).toThrow(ValidationError);
        expect(() => validateDefinition(c.definition)).toThrow(
          new RegExp(
            `^${c.definition_error.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
          ),
        );
        return;
      }
      expect(() => validateDefinition(c.definition)).not.toThrow();
      for (const { value, errors } of c.values) {
        const actual = validateValue(c.definition as never, value);
        expect([...actual].sort()).toEqual(errors);
      }
    },
  );
});

describe("parseAndValidate (parity corpus)", () => {
  const cases = loadParity<ParseCase[]>("schema-parse-cases.json");

  it.each(cases.map((c, i) => [i, c.text, c] as const))(
    "case_%i_%j",
    (_i, _text, c) => {
      const run = () => parseAndValidate(c.definition as never, c.text);
      if ("ok" in c.result) {
        expect(run()).toEqual(c.result.ok);
      } else if (c.result.prefix_only) {
        expect(run).toThrow(c.result.error);
      } else {
        expect(run).toThrow(
          new RegExp(
            `^${c.result.error.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
          ),
        );
      }
    },
  );
});

describe("property names that collide with Object.prototype", () => {
  it("missing_property_named_constructor_is_reported", () => {
    const def = { type: "object", properties: { constructor: { type: "integer" } }, required: ["constructor"] };
    expect(validateValue(def, {})).toEqual(["constructor: required field is missing"]);
  });
});
