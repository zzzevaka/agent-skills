import json
import os
import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPTS_DIRECTORY = (
    Path(__file__).resolve().parents[3] / "skills" / "durable-flow" / "scripts"
)
sys.path.insert(0, str(SCRIPTS_DIRECTORY))

from lib.repositories import FlowRepository  # noqa: E402
from visualize import _TEMPLATE, render_html  # noqa: E402


def flow_data():
    return {
        "name": "Demo </title>",
        "goal": "Ship it </script><script>alert(1)</script>",
        "stages": [
            {
                "name": "first",
                "prompt": "Do it.",
                "state": "finished",
                "output": "done",
            },
            {"name": "second", "prompt": "Then this.", "depends_on": ["first"]},
        ],
    }


def embedded_data(page: str) -> dict:
    match = re.search(
        r'<script type="application/json" id="flow-data">(.*?)</script>',
        page,
        re.DOTALL,
    )
    return json.loads(match.group(1))


class VisualizeTests(unittest.TestCase):
    def test_embeds_flow_state_safely(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "flow.json"
            path.write_text(json.dumps(flow_data()))
            flow = FlowRepository(path).get_flow()

            page = render_html(flow, "flow.json")

        self.assertIn("<title>Demo &lt;/title&gt; · durable-flow</title>", page)
        template = _TEMPLATE.read_text(encoding="utf-8")
        self.assertEqual(page.count("</script>"), template.count("</script>"))
        data = embedded_data(page)
        self.assertEqual(data["goal"], flow_data()["goal"])
        self.assertEqual(data["source"], "flow.json")
        self.assertEqual(
            [(s["name"], s["state"], s["depends_on"]) for s in data["stages"]],
            [("first", "finished", []), ("second", "pending", ["first"])],
        )

    def test_cli_writes_page_to_working_directory(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "release.json"
            path.write_text(json.dumps(flow_data()))
            workdir = Path(temp_dir) / "out"
            workdir.mkdir()

            result = subprocess.run(
                [sys.executable, str(SCRIPTS_DIRECTORY / "visualize.py"), "-p", str(path)],
                cwd=workdir,
                capture_output=True,
                text=True,
                env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"},
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            page = workdir / "release.html"
            self.assertEqual(result.stdout.strip(), str(page.resolve()))
            self.assertEqual(embedded_data(page.read_text())["name"], "Demo </title>")

    def test_cli_rejects_missing_flow(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            result = subprocess.run(
                [
                    sys.executable,
                    str(SCRIPTS_DIRECTORY / "visualize.py"),
                    "-p",
                    str(Path(temp_dir) / "missing.json"),
                ],
                cwd=temp_dir,
                capture_output=True,
                text=True,
            )

            self.assertEqual(result.returncode, 1)
            self.assertIn("File doesn't exist", result.stderr)
            self.assertEqual(list(Path(temp_dir).iterdir()), [])


if __name__ == "__main__":
    unittest.main()
