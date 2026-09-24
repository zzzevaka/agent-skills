import json
import os
import tempfile
from abc import ABC, abstractmethod
from contextlib import contextmanager
from dataclasses import asdict
from enum import Enum
from pathlib import Path
from typing import Any

from .exceptions import ValidationError
from .models import Flow, Stage, StageState

_Serialised = dict[str, Any]


def _plain(items: list[tuple[str, Any]]) -> dict[str, Any]:
    return {key: value.value if isinstance(value, Enum) else value for key, value in items}


@contextmanager
def _exclusive_lock(path: Path):
    """Serialize local read-check-write transactions across processes."""
    lock_path = path.with_name(path.name + ".lock")
    with open(lock_path, "a+b") as lock_file:
        if os.name == "nt":
            import msvcrt

            lock_file.seek(0, os.SEEK_END)
            if lock_file.tell() == 0:
                lock_file.write(b"\0")
                lock_file.flush()
            lock_file.seek(0)
            msvcrt.locking(lock_file.fileno(), msvcrt.LK_LOCK, 1)
            try:
                yield
            finally:
                lock_file.seek(0)
                msvcrt.locking(lock_file.fileno(), msvcrt.LK_UNLCK, 1)
        else:
            import fcntl

            fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX)
            try:
                yield
            finally:
                fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)


class _Storage(ABC):
    @abstractmethod
    def read(self, path: Path) -> _Serialised: ...
    @abstractmethod
    def write(self, value: _Serialised, path: Path) -> None: ...


class _JSONStorage(_Storage):
    def read(self, path: Path) -> _Serialised:
        try:
            with open(path, 'r') as fp:
                return json.load(fp)
        except json.JSONDecodeError as err:
            raise ValidationError(f"invalid JSON: {err}")
        except UnicodeError as err:
            raise ValidationError(f"flow file is not valid UTF-8: {err}")

    def write(self, value: _Serialised, path: Path) -> None:
        with open(path, 'w') as fp:
            json.dump(value, fp, indent=2)
            fp.write("\n")


class _YAMLStorage(_Storage):
    @staticmethod
    def _yaml():
        try:
            import yaml
        except ImportError:
            raise ValidationError("PyYAML is required to work with YAML flow files")
        return yaml

    @classmethod
    def _dumper(cls, yaml) -> type:
        def represent_str(dumper, data: str):
            style = "|" if "\n" in data else None
            return dumper.represent_scalar("tag:yaml.org,2002:str", data, style=style)

        dumper = type("_BlockDumper", (yaml.SafeDumper,), {})
        dumper.add_representer(str, represent_str)
        return dumper

    def read(self, path: Path) -> _Serialised:
        yaml = self._yaml()
        try:
            with open(path, 'r') as fp:
                return yaml.safe_load(fp)
        except yaml.YAMLError as err:
            raise ValidationError(f"invalid YAML: {err}")
        except UnicodeError as err:
            raise ValidationError(f"flow file is not valid UTF-8: {err}")

    def write(self, value: _Serialised, path: Path) -> None:
        yaml = self._yaml()
        with open(path, 'w') as fp:
            yaml.dump(
                value,
                fp,
                Dumper=self._dumper(yaml),
                sort_keys=False,
                allow_unicode=True,
                default_flow_style=False,
                width=10 ** 6,
            )


_STORAGES: dict[str, type[_Storage]] = {
    ".json": _JSONStorage,
    ".yaml": _YAMLStorage,
    ".yml": _YAMLStorage,
}


def _get_storage(path: Path) -> _Storage:
    try:
        return _STORAGES[path.suffix.lower()]()
    except KeyError:
        supported = ", ".join(sorted(_STORAGES))
        raise ValidationError(f"unsupported flow file extension {path.suffix!r}, expected one of: {supported}")


class FlowRepository:
    def __init__(self, path: Path) -> None:
        self._path = path
        self._storage = _get_storage(path)

    def get_flow(self) -> Flow:
        raw_value = self._storage.read(path=self._path)

        if not isinstance(raw_value, dict):
            raise ValidationError("flow file must contain an object")
        try:
            # Read the old top-level key during the transition, but serialize
            # the canonical field as `goal` from this point forward.
            goal = raw_value.get("goal", raw_value.get("prompt"))
            if goal is None:
                raise ValidationError("missing key 'goal' (formerly 'prompt')")
            raw_schemas = raw_value.get("schemas", {})
            if not isinstance(raw_schemas, dict):
                raise ValidationError("'schemas' must be an object")

            stages = []
            for index, raw_stage in enumerate(raw_value["stages"]):
                if not isinstance(raw_stage, dict):
                    raise ValidationError(f"stage {index} must be an object")
                raw_dependencies = raw_stage.get("depends_on", [])
                if not isinstance(raw_dependencies, list) or not all(
                    isinstance(item, str) for item in raw_dependencies
                ):
                    raise ValidationError(
                        f"stage {raw_stage.get('name', index)!r} 'depends_on' must be a list of names"
                    )
                state = StageState(raw_stage.get("state", StageState.PENDING.value))
                legacy_message_output = state == StageState.FINISHED and "output" not in raw_stage
                stages.append(
                    Stage(
                        name=raw_stage["name"],
                        prompt=raw_stage["prompt"],
                        depends_on=tuple(raw_dependencies),
                        output_schema=raw_stage.get("output_schema"),
                        state=state,
                        message=None if legacy_message_output else raw_stage.get("message"),
                        output=(
                            raw_stage.get("message")
                            if legacy_message_output
                            else raw_stage.get("output")
                        ),
                    )
                )
            flow = Flow(
                name=raw_value["name"],
                goal=goal,
                stages=tuple(stages),
                schemas=raw_schemas,
                revision=raw_value.get("revision", 0),
            )
            flow.validate_invariants()
            return flow
        except ValidationError:
            raise
        except KeyError as err:
            raise ValidationError(f"missing key {err}")
        except ValueError as err:
            raise ValidationError(f"invalid stage state: {err}")
        except TypeError as err:
            raise ValidationError(f"malformed flow file: {err}")

    def mutate(self, revision: int, operation) -> Flow:
        """Apply one revision-checked mutation as an atomic local transaction."""
        with _exclusive_lock(self._path):
            current = self.get_flow()
            if revision != current.revision:
                raise ValidationError(
                    f"stale revision {revision!r}; current revision is {current.revision}. "
                    "Run get_flow and retry with the latest revision."
                )
            updated = operation(current)
            if updated.revision != current.revision + 1:
                raise ValidationError("a successful flow mutation must increment revision by one")
            self._write_flow_atomic(updated)
            return updated

    def _write_flow_atomic(self, flow: Flow) -> None:
        parent = self._path.parent
        fd, temporary_name = tempfile.mkstemp(
            prefix=f".{self._path.name}.", suffix=self._path.suffix, dir=parent
        )
        os.close(fd)
        temporary_path = Path(temporary_name)
        try:
            self._storage.write(asdict(flow, dict_factory=_plain), path=temporary_path)
            with open(temporary_path, "rb") as temporary:
                os.fsync(temporary.fileno())
            os.replace(temporary_path, self._path)
        except Exception:
            temporary_path.unlink(missing_ok=True)
            raise
