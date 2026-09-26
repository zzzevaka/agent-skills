import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPTS_DIRECTORY = (
    Path(__file__).resolve().parents[3] / "skills" / "durable-flow" / "scripts"
)
REFERENCE_DIRECTORY = SCRIPTS_DIRECTORY.parent / "references"
sys.path.insert(0, str(SCRIPTS_DIRECTORY))

from validate import find_errors  # noqa: E402


def run_validate(path: Path) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, str(SCRIPTS_DIRECTORY / "validate.py"), "-p", str(path)],
        capture_output=True,
        text=True,
        env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"},
    )


class FindErrorsTests(unittest.TestCase):
    def test_reference_flow_has_no_errors(self):
        data = json.loads((REFERENCE_DIRECTORY / "example.json").read_text())

        self.assertEqual(find_errors(data), [])

    def test_reports_unknown_keys_and_invariant_errors_together(self):
        data = {
            "name": "typos",
            "goal": "Find every mistake at once",
            "shemas": {},
            "stages": [
                {"name": "first", "prompt": "Do it.", "output_shema": "result"},
                {"name": "second", "prompt": "Then.", "depends_on": ["missing"]},
                {"name": "second", "prompt": "Again."},
            ],
        }

        errors = find_errors(data)

        self.assertEqual(len(errors), 4, errors)
        for fragment in (
            "'shemas'",
            "'output_shema'",
            "'missing', which must be a previous stage",
            "'second' is duplicated",
        ):
            self.assertTrue(any(fragment in e for e in errors), (fragment, errors))

    def test_legacy_top_level_prompt_is_not_unknown(self):
        data = {
            "name": "legacy",
            "prompt": "Old name for goal",
            "stages": [{"name": "only", "prompt": "Do it."}],
        }

        self.assertEqual(find_errors(data), [])

    def test_reports_structural_error_alongside_unknown_keys(self):
        data = {
            "name": "broken",
            "goal": "",
            "stages": [{"name": "no-prompt", "promt": "Typo."}],
        }

        errors = find_errors(data)

        self.assertEqual(len(errors), 2, errors)
        self.assertTrue(any("'promt'" in e for e in errors), errors)
        self.assertTrue(any("'prompt'" in e for e in errors), errors)

    def test_non_object_flow_is_rejected(self):
        self.assertEqual(len(find_errors(["not", "a", "flow"])), 1)


class ValidateCliTests(unittest.TestCase):
    def test_valid_flow_exits_zero(self):
        result = run_validate(REFERENCE_DIRECTORY / "example.json")

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stderr, "")

    def test_invalid_flow_lists_every_error_and_exits_one(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "flow.json"
            original = json.dumps(
                {
                    "name": "bad",
                    "goal": "",
                    "stages": [
                        {"name": "a", "prompt": "x", "depends_on": ["b"]},
                        {"name": "b", "prompt": "y", "output_schema": "nope"},
                    ],
                }
            )
            path.write_text(original)

            result = run_validate(path)
            unchanged = path.read_text() == original

        self.assertEqual(result.returncode, 1)
        self.assertIn("'b', which must be a previous stage", result.stderr)
        self.assertIn("unknown output schema 'nope'", result.stderr)
        self.assertTrue(unchanged)

    def test_syntax_error_exits_one(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "flow.json"
            path.write_text('{"name": ')

            result = run_validate(path)

        self.assertEqual(result.returncode, 1)
        self.assertIn("invalid JSON", result.stderr)


if __name__ == "__main__":
    unittest.main()
