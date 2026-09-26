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

    def render(self, verbose: bool = False) -> str:
        rendered = asdict(self)
        if not verbose:
            active = next(
                (
                    i
                    for i, stage in enumerate(self.stages)
                    if stage.state in (StageState.INPROGRESS, StageState.WAITING)
                ),
                None,
            )
            for index, stage_repr in enumerate(rendered["stages"]):
                if index != active:
                    stage_repr["prompt"] = "...truncated..."
                    stage_repr["output"] = "...truncated..."
                    if stage_repr["state"] != StageState.WAITING:
                        stage_repr["message"] = None
            if active is not None:
                rendered["stages"][active]["input"] = self._resolve_input(self.stages[active])
        else:
            active = next(
                (
                    i
                    for i, stage in enumerate(self.stages)
                    if stage.state in (StageState.INPROGRESS, StageState.WAITING)
                ),
                None,
            )
            if active is not None:
                rendered["stages"][active]["input"] = self._resolve_input(self.stages[active])
        return json.dumps(rendered, ensure_ascii=False)

    def start_next_stage(self, *, revision: int) -> Self:
        self._check_revision(revision)
        self.validate_invariants()
        current = self._get_first_stage_in_state(StageState.PENDING)
        self._resolve_input(current)
        return self._replace_stage(
            current,
            revision=revision,
            state=StageState.INPROGRESS,
            message=None,
            output=None,
        )

    def set_output(self, *, output: str, revision: int) -> Self:
        self._check_revision(revision)
        current = self._get_first_stage_in_state(StageState.INPROGRESS)
        return self._replace_stage(current, revision=revision, output=output)

    def finish_stage(self, *, revision: int, output: str | None = None) -> Self:
        self._check_revision(revision)
        current = self._get_first_stage_in_state(StageState.INPROGRESS)
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
        return self._update_stage(
            StageState.INPROGRESS, revision=revision, state=StageState.FAILED, message=message
        )

    def pause_stage(self, *, message: str, revision: int) -> Self:
        return self._update_stage(
            StageState.INPROGRESS, revision=revision, state=StageState.WAITING, message=message
        )

    def resume_stage(self, *, message: str, revision: int) -> Self:
        return self._update_stage(
            StageState.WAITING, revision=revision, state=StageState.INPROGRESS, message=message
        )

    def _output_schema(self, stage: Stage) -> SchemaDef:
        if stage.output_schema is None:
            return SchemaDef({"type": "str"})
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

    def _get_first_stage_in_state(self, state: StageState) -> Stage:
        for stage in self.stages:
            if stage.state == state:
                return stage
            if stage.state == StageState.FAILED:
                raise ValidationError(f"stage {stage.name!r} has failed")
            if stage.state in (StageState.INPROGRESS, StageState.WAITING):
                raise ValidationError(f"stage {stage.name!r} is {stage.state.value}")
        raise ValidationError(f"there is no stage in the {state.value} state")

    def _check_revision(self, revision: int) -> None:
        if type(revision) is not int or revision != self.revision:
            raise ValidationError(
                f"stale revision {revision!r}; current revision is {self.revision}. "
                "Run get_flow and retry with the latest revision."
            )

    def _update_stage(self, state: StageState, /, revision: int, **changes) -> Self:
        self._check_revision(revision)
        current_stage = self._get_first_stage_in_state(state)
        return self._replace_stage(current_stage, revision=revision, **changes)

    def _replace_stage(self, current: Stage, *, revision: int, **changes) -> Self:
        self._check_revision(revision)
        stages = tuple(
            replace(stage, **changes) if stage is current else stage for stage in self.stages
        )
        return replace(self, stages=stages, revision=revision + 1)
