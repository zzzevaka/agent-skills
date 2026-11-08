import sys
import unittest
from pathlib import Path

sys.path.insert(
    0,
    str(
        Path(__file__).resolve().parents[3]
        / "skills"
        / "durable-flow"
        / "scripts"
    ),
)

from lib.exceptions import ValidationError
from lib.schema import SchemaDef


def obj(properties, required=None):
    node = {"type": "object", "properties": properties}
    if required is not None:
        node["required"] = required
    return node


def definition_error(raw):
    try:
        SchemaDef(raw).validate_definition()
    except ValidationError as err:
        return str(err)
    return None


def value_error(raw, value):
    try:
        SchemaDef(raw).validate(value)
    except ValidationError as err:
        return str(err)
    return None


class SchemaDefTests(unittest.TestCase):
    def test_validates_nested_object_and_array(self):
        schema = SchemaDef(
            obj(
                {
                    "name": {"type": "string"},
                    "scores": {"type": "array", "items": {"type": "number"}},
                },
                ["name"],
            )
        )

        schema.validate({"name": "Ada", "scores": [1, 2.5]})

    def test_new_type_names_validate(self):
        for name in ("string", "integer", "number", "boolean"):
            self.assertIsNone(definition_error({"type": name}), name)

    def test_old_type_names_get_a_hint(self):
        for old, new in (
            ("str", "string"),
            ("int", "integer"),
            ("float", "number"),
            ("bool", "boolean"),
        ):
            self.assertEqual(
                definition_error({"type": old}),
                f"schema: unknown schema type {old!r}; use {new!r}",
            )
        self.assertEqual(
            definition_error({"type": "set"}), "schema: unknown schema type 'set'"
        )

    def test_integer_accepts_integral_float_and_rejects_bool_and_fraction(self):
        schema = {"type": "integer"}
        self.assertIsNone(value_error(schema, 3))
        self.assertIsNone(value_error(schema, 3.0))
        self.assertEqual(value_error(schema, True), "(root): expected integer, got bool")
        self.assertEqual(value_error(schema, 1.5), "(root): expected integer, got float")
        self.assertEqual(value_error(schema, "x"), "(root): expected integer, got str")

    def test_number_rejects_bool(self):
        schema = {"type": "number"}
        self.assertIsNone(value_error(schema, 1))
        self.assertIsNone(value_error(schema, 1.5))
        self.assertEqual(value_error(schema, True), "(root): expected number, got bool")

    def test_boolean_and_string_types(self):
        self.assertIsNone(value_error({"type": "boolean"}, False))
        self.assertEqual(value_error({"type": "boolean"}, 1), "(root): expected boolean, got int")
        self.assertEqual(value_error({"type": "string"}, None), "(root): expected string, got NoneType")

    def test_object_fields_are_optional_unless_required(self):
        raw = obj({"a": {"type": "string"}, "b": {"type": "integer"}}, ["a"])
        self.assertIsNone(value_error(raw, {"a": "x"}))
        self.assertIsNone(value_error(raw, {"a": "x", "b": 2}))
        self.assertEqual(value_error(raw, {"b": 2}), "a: required field is missing")
        self.assertEqual(value_error(raw, {"a": "x", "b": "no"}), "b: expected integer, got str")

    def test_extra_fields_are_allowed_and_unchecked(self):
        raw = obj({"a": {"type": "string"}}, ["a"])
        self.assertIsNone(value_error(raw, {"a": "x", "other": [1, {"deep": None}]}))

    def test_required_must_be_unique_strings_naming_properties(self):
        props = {"a": {"type": "string"}}
        self.assertEqual(
            definition_error(obj(props, ["a", "a"])),
            "schema.required: expected a list of unique strings",
        )
        self.assertEqual(
            definition_error(obj(props, [1])),
            "schema.required: expected a list of unique strings",
        )
        self.assertEqual(
            definition_error(obj(props, "a")),
            "schema.required: expected a list of unique strings",
        )
        self.assertEqual(
            definition_error(obj(props, ["b"])),
            "schema.required: 'b' is not in properties",
        )
        self.assertIsNone(definition_error(obj(props, [])))

    def test_required_only_on_objects(self):
        self.assertEqual(
            definition_error({"type": "string", "required": []}),
            "schema: only an object schema can define required",
        )
        self.assertEqual(
            definition_error({"type": "array", "items": {"type": "string"}, "required": []}),
            "schema: only an object schema can define required",
        )

    def test_enum_accepts_listed_values_only(self):
        raw = {"type": "string", "enum": ["a", "b"]}
        self.assertIsNone(value_error(raw, "a"))
        self.assertEqual(value_error(raw, "c"), '(root): expected one of "a", "b", got "c"')
        self.assertEqual(value_error(raw, 1), "(root): expected string, got int")

    def test_enum_one_does_not_accept_true(self):
        raw = {"type": "integer", "enum": [1, 2]}
        self.assertIsNone(value_error(raw, 1))
        self.assertIsNone(value_error(raw, 2.0))
        self.assertEqual(value_error(raw, True), "(root): expected integer, got bool")
        flags = {"type": "boolean", "enum": [True]}
        self.assertIsNone(value_error(flags, True))
        self.assertEqual(value_error(flags, False), "(root): expected one of true, got false")

    def test_enum_definition_errors(self):
        self.assertEqual(
            definition_error({"type": "string", "enum": []}),
            "schema.enum: expected a non-empty list",
        )
        self.assertEqual(
            definition_error({"type": "string", "enum": "a"}),
            "schema.enum: expected a non-empty list",
        )
        self.assertEqual(
            definition_error({"type": "string", "enum": ["a", "a"]}),
            "schema.enum: values must be unique",
        )
        self.assertEqual(
            definition_error({"type": "string", "enum": [5]}),
            "schema.enum: 5 is not a valid string",
        )
        self.assertEqual(
            definition_error({"type": "integer", "enum": [True]}),
            "schema.enum: true is not a valid integer",
        )
        self.assertEqual(
            definition_error({"type": "array", "items": {"type": "string"}, "enum": [[]]}),
            "schema: enum is only allowed on scalar schemas",
        )
        self.assertEqual(
            definition_error({"type": "object", "enum": [{}]}),
            "schema: enum is only allowed on scalar schemas",
        )

    def test_rejects_invalid_schema_definitions(self):
        with self.assertRaisesRegex(ValidationError, "requires 'items'"):
            SchemaDef({"type": "array"}).validate_definition()
        with self.assertRaisesRegex(ValidationError, "unknown schema type"):
            SchemaDef({"type": "null"}).validate_definition()
        with self.assertRaisesRegex(ValidationError, "unsupported schema keys"):
            SchemaDef({"type": "string", "pattern": "x"}).validate_definition()

    def test_parses_json_output_inside_markdown_fence(self):
        schema = SchemaDef(obj({"ok": {"type": "boolean"}}, ["ok"]))

        result = schema.parse_and_validate('```json\n{"ok": true}\n```')

        self.assertEqual(result, {"ok": True})

    def test_reports_invalid_json_output(self):
        schema = SchemaDef({"type": "array", "items": {"type": "integer"}})

        with self.assertRaisesRegex(ValidationError, "could not parse output as JSON"):
            schema.parse_and_validate("not json")

    def test_string_root_is_not_json_parsed_and_others_are(self):
        self.assertEqual(
            SchemaDef({"type": "string"}).parse_and_validate("  done  "), "done"
        )
        self.assertEqual(SchemaDef({"type": "integer"}).parse_and_validate("42"), 42)
        with self.assertRaisesRegex(ValidationError, "could not parse output as JSON"):
            SchemaDef({"type": "integer"}).parse_and_validate("x")
