import json
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import generate_parity_fixtures as gen  # noqa: E402


def load(name: str):
    return json.loads((gen.FIXTURES / name).read_text())


class SchemaParityTests(unittest.TestCase):
    """The committed corpus must match what the Python code produces today."""

    def test_schema_cases_are_current(self):
        self.assertEqual(load("schema-cases.json"), gen.build_schema_cases())

    def test_schema_parse_cases_are_current(self):
        self.assertEqual(load("schema-parse-cases.json"), gen.build_parse_cases())

    def test_repr_cases_are_current(self):
        self.assertEqual(load("pyrepr.json"), gen.build_repr_cases())


class FlowParityTests(unittest.TestCase):
    def test_flow_cases_are_current(self):
        self.assertEqual(load("flow-cases.json"), gen.build_flow_cases())


if __name__ == "__main__":
    unittest.main()
