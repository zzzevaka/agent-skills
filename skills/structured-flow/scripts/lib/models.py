import json
from dataclasses import asdict, dataclass, field, replace
from enum import StrEnum, auto
from typing import Any, Self

from .exceptions import ValidationError
from .schema import SchemaDef


@dataclass(frozen=True, kw_only=True)
class StageConfig:
    name: str
    prompt: str
    depends_on: tuple[str, ...] = ()
    output_schema: str | None = None


@dataclass(frozen=True, kw_only=True)
class FlowConfig:
    name: str
    goal: str
    stages: tuple[StageConfig, ...]
    schemas: dict[str, dict[str, Any]] = field(default_factory=dict)


class StageState(StrEnum):
    PENDING = auto()
    INPROGRESS = auto()
    WAITING = auto()
    FINISHED = auto()
    FAILED = auto()


class StageStatus(StrEnum):
    """What the agent sees: a stored `pending` stage is split by its dependencies."""

    READY_TO_START = auto()
    WAITING_FOR_DEPENDENCIES = auto()
    INPROGRESS = auto()
    WAITING = auto()
    FINISHED = auto()
    FAILED = auto()


@dataclass(frozen=True, kw_only=True)
class Stage(StageConfig):
    state: StageState = StageState.PENDING
    message: str | None = None
    output: Any = None


@dataclass(frozen=True, kw_only=True)
class Flow(FlowConfig):
    stages: tuple[Stage, ...]
    revision: int = 0

    def validate_invariants(self) -> None:
        errors = self.invariant_errors()
        if errors:
            raise ValidationError("; ".join(errors))

    def invariant_errors(self) -> list[str]:
        errors: list[str] = []
        if type(self.revision) is not int or self.revision < 0:
            errors.append("flow revision must be a non-negative integer")
        if not isinstance(self.name, str) or not self.name.strip():
            errors.append("flow name must be a non-empty string")
        if not isinstance(self.goal, str):
            errors.append("flow goal must be a string")
        if not self.stages:
            errors.append("flow must contain at least one stage")

        for name, raw_schema in self.schemas.items():
            if not isinstance(name, str) or not name:
                errors.append("schema names must be non-empty strings")
                continue
            try:
                SchemaDef(raw_schema).validate_definition(path=f"schemas.{name}")
            except ValidationError as err:
                errors.append(str(err))

        seen: set[str] = set()
        for stage in self.stages:
            if not isinstance(stage.name, str) or not stage.name.strip():
                errors.append("stage names must be non-empty strings")
                continue
            if not isinstance(stage.prompt, str):
                errors.append(f"stage {stage.name!r} prompt must be a string")
            if not isinstance(stage.state, StageState):
                errors.append(f"stage {stage.name!r} has an invalid state")
            if stage.name in seen:
                errors.append(f"stage {stage.name!r} is duplicated")
            if not isinstance(stage.depends_on, tuple) or not all(
                isinstance(dependency, str) for dependency in stage.depends_on
            ):
                errors.append(f"stage {stage.name!r} dependencies must be names")
            else:
                if len(set(stage.depends_on)) != len(stage.depends_on):
                    errors.append(f"stage {stage.name!r} repeats a dependency")
                for dependency in stage.depends_on:
                    if dependency not in seen:
                        errors.append(
                            f"stage {stage.name!r} depends on {dependency!r}, which must be "
                            "a previous stage"
                        )
            if stage.output_schema is not None and not isinstance(stage.output_schema, str):
                errors.append(f"stage {stage.name!r} output_schema must be a string")
            elif stage.output_schema is not None and stage.output_schema not in self.schemas:
                errors.append(
                    f"stage {stage.name!r} references unknown output schema {stage.output_schema!r}"
                )
            seen.add(stage.name)
        return errors

    def status_of(self, stage: Stage) -> StageStatus:
        if stage.state != StageState.PENDING:
            return StageStatus(stage.state.value)
        if self._unfinished_dependencies(stage):
            return StageStatus.WAITING_FOR_DEPENDENCIES
        return StageStatus.READY_TO_START

    def render(self, verbose: bool = False) -> str:
        rendered = asdict(self)
        for stage, stage_repr in zip(self.stages, rendered["stages"]):
            stage_repr["state"] = self.status_of(stage).value
            if stage.state == StageState.INPROGRESS:
                stage_repr["input"] = self._resolve_input(stage)
            elif not verbose:
                stage_repr["prompt"] = "...truncated..."
                stage_repr["output"] = "...truncated..."
                if stage.state != StageState.WAITING:
                    stage_repr["message"] = None
        return json.dumps(rendered, ensure_ascii=False)

    def start_stage(self, *, name: str, revision: int) -> Self:
        self._check_revision(revision)
        self.validate_invariants()
        stage = self._get_stage_by_name(name)
        self._require_nothing_inprogress()
        if stage.state != StageState.PENDING:
            raise ValidationError(
                f"stage {name!r} is {stage.state.value}; only a ready_to_start stage "
                f"can be started.{self._schedule_hint()}"
            )
        unfinished = self._unfinished_dependencies(stage)
        if unfinished:
            raise ValidationError(
                f"stage {name!r} is waiting_for_dependencies: {unfinished[0]!r} is not "
                f"finished.{self._schedule_hint()}"
            )
        return self._replace_stage(
            stage, revision=revision, state=StageState.INPROGRESS, message=None, output=None
        )

    def set_output(self, *, output: str, revision: int) -> Self:
        return self._update_active_stage(revision=revision, output=output)

    def finish_stage(self, *, revision: int, output: str | None = None) -> Self:
        self._check_revision(revision)
        current = self._active_stage()
        candidate = current.output if output is None else output
        if candidate is None:
            raise ValidationError(
                f"stage {current.name!r} has no output; save one with set_output or pass -m"
            )
        schema = self._output_schema(current)
        try:
            validated = schema.parse_and_validate(candidate)
        except ValidationError as err:
            raise ValidationError(f"stage {current.name!r} output is invalid: {err}") from err
        return self._replace_stage(
            current,
            revision=revision,
            state=StageState.FINISHED,
            message=None,
            output=validated,
        )

    def fail_stage(self, *, message: str, revision: int) -> Self:
        return self._update_active_stage(
            revision=revision, state=StageState.FAILED, message=message
        )

    def pause_stage(self, *, message: str, revision: int) -> Self:
        return self._update_active_stage(
            revision=revision, state=StageState.WAITING, message=message
        )

    def resume_stage(self, *, name: str, message: str, revision: int) -> Self:
        self._check_revision(revision)
        stage = self._get_stage_by_name(name)
        self._require_nothing_inprogress()
        if stage.state != StageState.WAITING:
            raise ValidationError(
                f"stage {name!r} is {self.status_of(stage).value}; "
                "only a waiting stage can be resumed"
            )
        return self._replace_stage(
            stage, revision=revision, state=StageState.INPROGRESS, message=message
        )

    def _output_schema(self, stage: Stage) -> SchemaDef:
        if stage.output_schema is None:
            return SchemaDef({"type": "string"})
        return SchemaDef(self.schemas[stage.output_schema])

    def _resolve_input(self, stage: Stage) -> dict[str, Any]:
        inputs: dict[str, Any] = {}
        for dependency in stage.depends_on:
            source = self._get_stage_by_name(dependency)
            if source.state == StageState.FAILED:
                raise ValidationError(
                    f"dependency stage {source.name!r} has failed; cannot start {stage.name!r}"
                )
            if source.state != StageState.FINISHED:
                raise ValidationError(
                    f"dependency stage {source.name!r} is not finished; "
                    f"cannot start {stage.name!r}"
                )
            inputs[dependency] = source.output
        return inputs

    def _get_stage_by_name(self, name: str) -> Stage:
        for stage in self.stages:
            if stage.name == name:
                return stage
        raise ValidationError(f"there is no stage named {name!r}")

    def _unfinished_dependencies(self, stage: Stage) -> list[str]:
        finished = {s.name for s in self.stages if s.state == StageState.FINISHED}
        return [name for name in stage.depends_on if name not in finished]

    def _schedule_hint(self) -> str:
        ready = [s.name for s in self.stages if self.status_of(s) == StageStatus.READY_TO_START]
        if ready:
            return f" Ready to start: {', '.join(ready)}."
        waiting = [
            f"{s.name} ({s.message})" for s in self.stages if s.state == StageState.WAITING
        ]
        if waiting:
            return (
                " Nothing is ready to start; waiting for an outside event: "
                f"{', '.join(waiting)}."
            )
        return ""

    def _active_stage(self) -> Stage:
        active = [s for s in self.stages if s.state == StageState.INPROGRESS]
        if not active:
            raise ValidationError("there is no stage in the inprogress state")
        if len(active) > 1:
            names = ", ".join(repr(s.name) for s in active)
            raise ValidationError(
                f"more than one stage is inprogress: {names}; fix the flow file in the viewer"
            )
        return active[0]

    def _require_nothing_inprogress(self) -> None:
        for stage in self.stages:
            if stage.state == StageState.INPROGRESS:
                raise ValidationError(
                    f"stage {stage.name!r} is already inprogress; pause or finish it first"
                )

    def _check_revision(self, revision: int) -> None:
        if type(revision) is not int or revision != self.revision:
            raise ValidationError(
                f"stale revision {revision!r}; current revision is {self.revision}. "
                "Run get_flow and retry with the latest revision."
            )

    def _update_active_stage(self, *, revision: int, **changes) -> Self:
        self._check_revision(revision)
        return self._replace_stage(self._active_stage(), revision=revision, **changes)

    def _replace_stage(self, current: Stage, *, revision: int, **changes) -> Self:
        self._check_revision(revision)
        stages = tuple(
            replace(stage, **changes) if stage is current else stage for stage in self.stages
        )
        return replace(self, stages=stages, revision=revision + 1)
