import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT = (
    Path(__file__).resolve().parents[3]
    / "skills"
    / "structured-flow"
    / "scripts"
    / "state_management.py"
)


def run(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, str(SCRIPT), *args], capture_output=True, text=True
    )


class StateManagementTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.path = Path(self.directory.name) / "flow.json"
        self.path.write_text(
            json.dumps(
                {
                    "name": "cli-flow",
                    "goal": "Goal",
                    "stages": [
                        {"name": "a", "prompt": "Do a."},
                        {"name": "b", "prompt": "Do b."},
                    ],
                }
            )
        )

    def flow(self, *args: str) -> dict:
        result = run(*args, "-p", str(self.path))
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)

    def test_start_stage_starts_the_named_stage(self):
        flow = self.flow("start_stage", "-r", "0", "-s", "b")

        self.assertEqual([s["state"] for s in flow["stages"]], ["ready_to_start", "inprogress"])
        self.assertEqual(flow["revision"], 1)

    def test_start_stage_requires_stage_name(self):
        result = run("start_stage", "-p", str(self.path), "-r", "0")

        self.assertEqual(result.returncode, 1)
        self.assertIn("-s/--stage is required for the start_stage command", result.stderr)

    def test_resume_stage_requires_stage_name(self):
        result = run("resume_stage", "-p", str(self.path), "-r", "0", "-m", "back")

        self.assertEqual(result.returncode, 1)
        self.assertIn("-s/--stage is required for the resume_stage command", result.stderr)

    def test_unknown_stage_exits_with_error(self):
        result = run("start_stage", "-p", str(self.path), "-r", "0", "-s", "zzz")

        self.assertEqual(result.returncode, 1)
        self.assertIn("Validation error", result.stderr)
        self.assertIn("there is no stage named 'zzz'", result.stderr)

    def test_start_next_stage_is_not_a_command(self):
        result = run("start_next_stage", "-p", str(self.path), "-r", "0")

        self.assertEqual(result.returncode, 2)

    def test_stage_flag_is_rejected_for_commands_that_act_on_the_active_stage(self):
        self.flow("start_stage", "-r", "0", "-s", "a")
        for command in ("set_output", "finish_stage", "pause_stage", "fail_stage"):
            with self.subTest(command=command):
                result = run(command, "-p", str(self.path), "-r", "1", "-s", "b", "-m", "x")

                self.assertEqual(result.returncode, 1)
                self.assertIn(
                    f"-s/--stage is only valid for start_stage and resume_stage, not {command}",
                    result.stderr,
                )
        self.assertEqual(self.flow("get_flow")["revision"], 1)

    def test_interleaving_end_to_end(self):
        self.flow("start_stage", "-r", "0", "-s", "a")
        self.flow("pause_stage", "-r", "1", "-m", "waiting for review")
        self.flow("start_stage", "-r", "2", "-s", "b")
        self.flow("finish_stage", "-r", "3", "-m", "b done")
        self.flow("resume_stage", "-r", "4", "-s", "a", "-m", "approved")
        flow = self.flow("finish_stage", "-r", "5", "-m", "a done")

        self.assertEqual([s["state"] for s in flow["stages"]], ["finished", "finished"])
        self.assertEqual(flow["revision"], 6)


if __name__ == "__main__":
    unittest.main()
