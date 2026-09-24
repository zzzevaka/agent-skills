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


class SchemaDefTests(unittest.TestCase):
    def test_validates_nested_object_and_array(self):
        schema = SchemaDef(
            {
                "type": "object",
                "properties": {
                    "name": {"type": "str"},
                    "scores": {"type": "array", "items": {"type": "float"}},
                },
            }
        )

        schema.validate({"name": "Ada", "scores": [1, 2.5]})

    def test_rejects_wrong_types_missing_and_extra_fields(self):
        schema = SchemaDef(
            {"type": "object", "properties": {"count": {"type": "int"}}}
        )

        with self.assertRaisesRegex(ValidationError, "expected int"):
            schema.validate({"count": True})
        with self.assertRaisesRegex(ValidationError, "required field is missing"):
            schema.validate({})
        with self.assertRaisesRegex(ValidationError, "extra field is not allowed"):
            schema.validate({"count": 1, "other": "value"})

    def test_rejects_invalid_schema_definitions(self):
        with self.assertRaisesRegex(ValidationError, "requires 'items'"):
            SchemaDef({"type": "array"}).validate_definition()
        with self.assertRaisesRegex(ValidationError, "unknown schema type"):
            SchemaDef({"type": "number"}).validate_definition()

    def test_parses_json_output_inside_markdown_fence(self):
        schema = SchemaDef(
            {"type": "object", "properties": {"ok": {"type": "bool"}}}
        )

        result = schema.parse_and_validate('```json\n{"ok": true}\n```')

        self.assertEqual(result, {"ok": True})

    def test_reports_invalid_json_output(self):
        schema = SchemaDef({"type": "array", "items": {"type": "int"}})

        with self.assertRaisesRegex(ValidationError, "could not parse output as JSON"):
            schema.parse_and_validate("not json")

    def test_string_output_is_trimmed(self):
        schema = SchemaDef({"type": "str"})

        self.assertEqual(schema.parse_and_validate("  done  "), "done")
