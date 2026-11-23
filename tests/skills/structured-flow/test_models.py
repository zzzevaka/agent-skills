import json
import sys
import unittest
from pathlib import Path

sys.path.insert(
    0,
    str(
        Path(__file__).resolve().parents[3]
        / "skills"
        / "structured-flow"
        / "scripts"
    ),
)

from lib.exceptions import ValidationError
from lib.models import Flow, Stage, StageState, StageStatus


def make_flow() -> Flow:
    return Flow(
        name="test-flow",
        goal="Complete the task",
        schemas={
            "result": {
                "type": "object",
                "properties": {"answer": {"type": "string"}},
                "required": ["answer"],
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
    def test_dependency_input_is_resolved_when_a_stage_starts(self):
        flow = make_flow().start_stage(name="collect", revision=0)
        flow = flow.finish_stage(revision=1, output="Collected facts")
        flow = flow.start_stage(name="summarize", revision=2)
        rendered = json.loads(flow.render())

        self.assertEqual(
            rendered["stages"][1]["input"], {"collect": "Collected facts"}
        )
        self.assertEqual(rendered["stages"][1]["state"], StageState.INPROGRESS)

    def test_finish_parses_and_validates_structured_output(self):
        flow = make_flow().start_stage(name="collect", revision=0)
        flow = flow.finish_stage(revision=1, output="source result")
        flow = flow.start_stage(name="summarize", revision=2)
        flow = flow.finish_stage(revision=3, output='{"answer": "42"}')

        self.assertEqual(flow.stages[1].output, {"answer": "42"})
        self.assertEqual(flow.stages[1].state, StageState.FINISHED)
        self.assertEqual(flow.revision, 4)

    def test_invalid_output_does_not_finish_stage_or_advance_revision(self):
        flow = make_flow().start_stage(name="collect", revision=0)
        flow = flow.finish_stage(revision=1, output="source result")
        flow = flow.start_stage(name="summarize", revision=2)

        with self.assertRaisesRegex(ValidationError, "output is invalid"):
            flow.finish_stage(revision=3, output='{"wrong": "field"}')

        self.assertEqual(flow.stages[1].state, StageState.INPROGRESS)
        self.assertEqual(flow.revision, 3)

    def test_pause_and_resume_preserve_saved_output(self):
        flow = make_flow().start_stage(name="collect", revision=0)
        flow = flow.set_output(revision=1, output="partial")
        flow = flow.pause_stage(revision=2, message="Waiting for input")
        flow = flow.resume_stage(name="collect", revision=3, message="Input received")

        self.assertEqual(flow.stages[0].state, StageState.INPROGRESS)
        self.assertEqual(flow.stages[0].output, "partial")
        self.assertEqual(flow.stages[0].message, "Input received")
        self.assertEqual(flow.revision, 4)

    def test_stale_revision_is_rejected(self):
        with self.assertRaisesRegex(ValidationError, "stale revision"):
            make_flow().start_stage(name="collect", revision=1)

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

    def test_invariant_errors_reports_every_violation(self):
        flow = Flow(
            name="bad",
            goal="",
            schemas={"broken": {"type": "array"}},
            stages=(
                Stage(name="first", prompt="first", depends_on=("later",)),
                Stage(name="first", prompt="again", output_schema="missing"),
            ),
        )

        errors = flow.invariant_errors()

        self.assertEqual(len(errors), 4, errors)
        for fragment in (
            "array schema requires 'items'",
            "'later', which must be a previous stage",
            "'first' is duplicated",
            "unknown output schema 'missing'",
        ):
            self.assertTrue(any(fragment in e for e in errors), (fragment, errors))

    def test_invariant_errors_is_empty_for_valid_flow(self):
        self.assertEqual(make_flow().invariant_errors(), [])


def make_graph_flow() -> Flow:
    return Flow(
        name="graph-flow",
        goal="Complete the task",
        stages=(
            Stage(name="a", prompt="Do a."),
            Stage(name="b", prompt="Do b."),
            Stage(name="c", prompt="Do c.", depends_on=("a",)),
            Stage(name="d", prompt="Do d.", depends_on=("a", "b")),
        ),
    )


def statuses(flow: Flow) -> dict[str, StageStatus]:
    return {stage.name: flow.status_of(stage) for stage in flow.stages}


class SchedulingTests(unittest.TestCase):
    def test_status_of_pending_stage_follows_its_dependencies(self):
        flow = make_graph_flow()
        self.assertEqual(
            statuses(flow),
            {
                "a": StageStatus.READY_TO_START,
                "b": StageStatus.READY_TO_START,
                "c": StageStatus.WAITING_FOR_DEPENDENCIES,
                "d": StageStatus.WAITING_FOR_DEPENDENCIES,
            },
        )

        flow = flow.start_stage(name="a", revision=0)
        flow = flow.finish_stage(revision=1, output="done")

        self.assertEqual(statuses(flow)["c"], StageStatus.READY_TO_START)
        self.assertEqual(statuses(flow)["d"], StageStatus.WAITING_FOR_DEPENDENCIES)
        self.assertEqual(statuses(flow)["a"], StageStatus.FINISHED)

    def test_render_replaces_pending_with_computed_status(self):
        flow = make_graph_flow().start_stage(name="a", revision=0)
        rendered = json.loads(flow.render())

        self.assertEqual(
            [stage["state"] for stage in rendered["stages"]],
            ["inprogress", "ready_to_start", "waiting_for_dependencies", "waiting_for_dependencies"],
        )

    def test_start_stage_while_another_waits_keeps_its_output(self):
        flow = make_graph_flow().start_stage(name="a", revision=0)
        flow = flow.set_output(revision=1, output="partial")
        flow = flow.pause_stage(revision=2, message="review")
        flow = flow.start_stage(name="b", revision=3)

        self.assertEqual(flow.revision, 4)
        self.assertEqual(flow.stages[0].state, StageState.WAITING)
        self.assertEqual(flow.stages[0].output, "partial")
        self.assertEqual(flow.stages[0].message, "review")
        self.assertEqual(flow.stages[1].state, StageState.INPROGRESS)

    def test_start_stage_rejects_blocked_stage(self):
        with self.assertRaisesRegex(ValidationError, r"waiting_for_dependencies.*'a'"):
            make_graph_flow().start_stage(name="c", revision=0)

    def test_blocked_start_error_lists_ready_stages(self):
        with self.assertRaisesRegex(ValidationError, "Ready to start: a, b"):
            make_graph_flow().start_stage(name="c", revision=0)

    def test_blocked_start_error_lists_waiting_stages_when_nothing_is_ready(self):
        flow = make_flow().start_stage(name="collect", revision=0)
        flow = flow.pause_stage(revision=1, message="needs review")

        with self.assertRaisesRegex(
            ValidationError, r"Nothing is ready to start.*collect \(needs review\)"
        ):
            flow.start_stage(name="summarize", revision=2)

    def test_failed_dependency_blocks_only_its_dependents(self):
        flow = make_graph_flow().start_stage(name="a", revision=0)
        flow = flow.fail_stage(revision=1, message="boom")

        with self.assertRaisesRegex(ValidationError, "waiting_for_dependencies"):
            flow.start_stage(name="c", revision=2)
        started = flow.start_stage(name="b", revision=2)
        self.assertEqual(started.stages[1].state, StageState.INPROGRESS)

    def test_start_stage_rejected_while_another_is_inprogress(self):
        flow = make_graph_flow().start_stage(name="a", revision=0)

        with self.assertRaisesRegex(ValidationError, "already inprogress"):
            flow.start_stage(name="b", revision=1)

    def test_start_stage_rejects_unknown_and_non_pending_stage(self):
        flow = make_graph_flow()
        with self.assertRaisesRegex(ValidationError, "there is no stage named 'zzz'"):
            flow.start_stage(name="zzz", revision=0)

        flow = flow.start_stage(name="a", revision=0).finish_stage(revision=1, output="x")
        with self.assertRaisesRegex(
            ValidationError, "only a ready_to_start stage can be started"
        ):
            flow.start_stage(name="a", revision=2)

    def test_resume_stage_by_name_picks_the_named_waiting_stage(self):
        flow = make_graph_flow().start_stage(name="a", revision=0)
        flow = flow.pause_stage(revision=1, message="wait a")
        flow = flow.start_stage(name="b", revision=2)
        flow = flow.pause_stage(revision=3, message="wait b")
        flow = flow.resume_stage(name="a", revision=4, message="a is back")

        self.assertEqual(flow.stages[0].state, StageState.INPROGRESS)
        self.assertEqual(flow.stages[0].message, "a is back")
        self.assertEqual(flow.stages[1].state, StageState.WAITING)

    def test_resume_stage_rejected_while_another_is_inprogress(self):
        flow = make_graph_flow().start_stage(name="a", revision=0)
        flow = flow.pause_stage(revision=1, message="wait a")
        flow = flow.start_stage(name="b", revision=2)

        with self.assertRaisesRegex(ValidationError, "already inprogress"):
            flow.resume_stage(name="a", revision=3, message="back")

    def test_resume_stage_rejects_stage_that_is_not_waiting(self):
        with self.assertRaisesRegex(ValidationError, "only a waiting stage can be resumed"):
            make_graph_flow().resume_stage(name="a", revision=0, message="back")

    def test_active_stage_commands_fail_with_two_inprogress_stages(self):
        flow = Flow(
            name="bad",
            goal="",
            stages=(
                Stage(name="x", prompt="x", state=StageState.INPROGRESS),
                Stage(name="y", prompt="y", state=StageState.INPROGRESS),
            ),
        )

        with self.assertRaisesRegex(
            ValidationError, "more than one stage is inprogress.*'x'.*'y'"
        ):
            flow.set_output(output="x", revision=0)

    def test_active_stage_commands_fail_without_inprogress_stage(self):
        with self.assertRaisesRegex(
            ValidationError, "there is no stage in the inprogress state"
        ):
            make_graph_flow().finish_stage(revision=0, output="x")

    def test_waiting_stage_is_truncated_but_keeps_message_in_render(self):
        flow = make_graph_flow().start_stage(name="a", revision=0)
        flow = flow.set_output(revision=1, output="partial")
        flow = flow.pause_stage(revision=2, message="review")
        flow = flow.start_stage(name="b", revision=3)
        rendered = json.loads(flow.render())

        waiting, active = rendered["stages"][0], rendered["stages"][1]
        self.assertEqual(waiting["prompt"], "...truncated...")
        self.assertEqual(waiting["output"], "...truncated...")
        self.assertEqual(waiting["message"], "review")
        self.assertEqual(active["prompt"], "Do b.")
        self.assertEqual(active["input"], {})
