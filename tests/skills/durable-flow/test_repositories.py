import importlib.util
import json
import sys
import tempfile
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
from lib.models import StageState
from lib.repositories import FlowRepository, _get_storage

REFERENCE_DIRECTORY = (
    Path(__file__).resolve().parents[3] / "skills" / "durable-flow" / "references"
)


def flow_data():
    return {
        "name": "test-flow",
        "goal": "Complete the task",
        "stages": [{"name": "work", "prompt": "Do the work."}],
    }


class FlowRepositoryTests(unittest.TestCase):
    def test_reads_and_persists_json_mutation(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "flow.json"
            path.write_text(json.dumps(flow_data()))
            repository = FlowRepository(path)

            flow = repository.get_flow()
            updated = repository.mutate(
                flow.revision,
                lambda current: current.start_next_stage(revision=current.revision),
            )
            reloaded = repository.get_flow()

        self.assertEqual(updated.revision, 1)
        self.assertEqual(reloaded.revision, 1)
        self.assertEqual(reloaded.stages[0].state, StageState.INPROGRESS)

    def test_rejects_stale_revision_without_changing_file(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "flow.json"
            path.write_text(json.dumps(flow_data()))
            repository = FlowRepository(path)

            with self.assertRaisesRegex(ValidationError, "stale revision"):
                repository.mutate(
                    1, lambda current: current.start_next_stage(revision=current.revision)
                )

            self.assertEqual(repository.get_flow().revision, 0)

    def test_loads_legacy_prompt_and_finished_message_fields(self):
        data = flow_data()
        data.pop("goal")
        data["prompt"] = "Legacy goal"
        data["stages"][0].update(state="finished", message="Legacy output")

        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "legacy.json"
            path.write_text(json.dumps(data))
            stage = FlowRepository(path).get_flow().stages[0]

        self.assertEqual(stage.state, StageState.FINISHED)
        self.assertEqual(stage.output, "Legacy output")
        self.assertIsNone(stage.message)

    def test_rejects_malformed_json(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "broken.json"
            path.write_text("{")

            with self.assertRaisesRegex(ValidationError, "invalid JSON"):
                FlowRepository(path).get_flow()

    def test_rejects_unsupported_file_extension(self):
        with self.assertRaisesRegex(ValidationError, "unsupported flow file extension"):
            _get_storage(Path("flow.toml"))

    @unittest.skipUnless(importlib.util.find_spec("yaml"), "PyYAML is not installed")
    def test_reads_and_writes_yaml(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "flow.yaml"
            path.write_text(
                "name: test-flow\ngoal: Complete the task\nstages:\n"
                "  - name: work\n    prompt: Do the work.\n"
            )
            repository = FlowRepository(path)
            flow = repository.get_flow()
            repository.mutate(
                flow.revision,
                lambda current: current.start_next_stage(revision=current.revision),
            )
            reloaded = repository.get_flow()

        self.assertEqual(reloaded.revision, 1)
        self.assertEqual(reloaded.stages[0].state, StageState.INPROGRESS)


class ReferenceFlowTests(unittest.TestCase):
    def test_json_starter_flow_loads_with_default_runtime_state(self):
        flow = FlowRepository(REFERENCE_DIRECTORY / "example.json").get_flow()

        self.assertEqual(flow.revision, 0)
        self.assertTrue(all(stage.state is StageState.PENDING for stage in flow.stages))

    @unittest.skipUnless(importlib.util.find_spec("yaml"), "PyYAML is not installed")
    def test_yaml_starter_flow_loads_with_default_runtime_state(self):
        flow = FlowRepository(REFERENCE_DIRECTORY / "example.yaml").get_flow()

        self.assertEqual(flow.revision, 0)
        self.assertTrue(all(stage.state is StageState.PENDING for stage in flow.stages))
