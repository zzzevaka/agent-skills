import json
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
from lib.models import Flow, Stage, StageState


def make_flow() -> Flow:
    return Flow(
        name="test-flow",
        goal="Complete the task",
        schemas={
            "result": {
                "type": "object",
                "properties": {"answer": {"type": "str"}},
            }
        },
        stages=(
            Stage(name="collect", prompt="Collect the answer."),
            Stage(
                name="summarize",
                prompt="Summarize the collected answer.",
                depends_on=("collect",),
                output_schema="result",
            ),
        ),
    )


class FlowTests(unittest.TestCase):
    def test_stages_run_sequentially_and_dependency_input_is_resolved(self):
        flow = make_flow().start_next_stage(revision=0)
        flow = flow.finish_stage(revision=1, output="Collected facts")
        flow = flow.start_next_stage(revision=2)
        rendered = json.loads(flow.render())

        self.assertEqual(
            rendered["stages"][1]["input"], {"collect": "Collected facts"}
        )
        self.assertEqual(rendered["stages"][1]["state"], StageState.INPROGRESS)

    def test_finish_parses_and_validates_structured_output(self):
        flow = make_flow().start_next_stage(revision=0)
        flow = flow.finish_stage(revision=1, output="source result")
        flow = flow.start_next_stage(revision=2)
        flow = flow.finish_stage(revision=3, output='{"answer": "42"}')

        self.assertEqual(flow.stages[1].output, {"answer": "42"})
        self.assertEqual(flow.stages[1].state, StageState.FINISHED)
        self.assertEqual(flow.revision, 4)

    def test_invalid_output_does_not_finish_stage_or_advance_revision(self):
        flow = make_flow().start_next_stage(revision=0)
        flow = flow.finish_stage(revision=1, output="source result")
        flow = flow.start_next_stage(revision=2)

        with self.assertRaisesRegex(ValidationError, "output is invalid"):
            flow.finish_stage(revision=3, output='{"wrong": "field"}')

        self.assertEqual(flow.stages[1].state, StageState.INPROGRESS)
        self.assertEqual(flow.revision, 3)

    def test_pause_and_resume_preserve_saved_output(self):
        flow = make_flow().start_next_stage(revision=0)
        flow = flow.set_output(revision=1, output="partial")
        flow = flow.pause_stage(revision=2, message="Waiting for input")
        flow = flow.resume_stage(revision=3, message="Input received")

        self.assertEqual(flow.stages[0].state, StageState.INPROGRESS)
        self.assertEqual(flow.stages[0].output, "partial")
        self.assertEqual(flow.stages[0].message, "Input received")
        self.assertEqual(flow.revision, 4)

    def test_stale_revision_is_rejected(self):
        with self.assertRaisesRegex(ValidationError, "stale revision"):
            make_flow().start_next_stage(revision=1)

    def test_invariants_reject_duplicate_stage_names_and_forward_dependencies(self):
        duplicate = Flow(
            name="bad",
            goal="",
            stages=(
                Stage(name="same", prompt="first"),
                Stage(name="same", prompt="second"),
            ),
        )
        forward_dependency = Flow(
            name="bad",
            goal="",
            stages=(
                Stage(name="first", prompt="first", depends_on=("second",)),
                Stage(name="second", prompt="second"),
            ),
        )

        with self.assertRaisesRegex(ValidationError, "duplicated"):
            duplicate.validate_invariants()
        with self.assertRaisesRegex(ValidationError, "must be a previous stage"):
            forward_dependency.validate_invariants()
