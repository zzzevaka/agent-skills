#!/usr/bin/env python3

import argparse
from pathlib import Path
from typing import Any

from lib.cli import fail, open_repository
from lib.exceptions import ValidationError
from lib.repositories import parse_flow

# `prompt` is the legacy name of `goal`, still accepted when reading.
_FLOW_KEYS = {"name", "goal", "prompt", "schemas", "stages", "revision"}
_STAGE_KEYS = {
    "name",
    "prompt",
    "depends_on",
    "output_schema",
    "state",
    "message",
    "output",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="durable-flow-validate",
        description="Check a durable-flow file and report every problem found",
    )
    parser.add_argument(
        "-p", "--path", type=str, required=True, help="path to the flow state file"
    )
    return parser.parse_args()


def _unknown_keys(value: dict, known: set[str], owner: str) -> list[str]:
    return [
        f"{owner} has unknown key {key!r}"
        for key in sorted(value.keys() - known, key=str)
    ]


def find_errors(data: Any) -> list[str]:
    if not isinstance(data, dict):
        return ["flow file must contain an object"]

    errors = _unknown_keys(data, _FLOW_KEYS, "flow")
    stages = data.get("stages")
    if isinstance(stages, list):
        for index, stage in enumerate(stages):
            if isinstance(stage, dict):
                label = f"stage {stage.get('name', index)!r}"
                errors += _unknown_keys(stage, _STAGE_KEYS, label)

    try:
        flow = parse_flow(data)
    except ValidationError as err:
        return errors + [str(err)]
    return errors + flow.invariant_errors()


def main() -> None:
    args = parse_args()
    path = Path(args.path)
    try:
        errors = find_errors(open_repository(path).read_data())
    except ValidationError as err:
        errors = [str(err)]
    except OSError as err:
        fail(f"Filesystem error: {err}")

    if errors:
        fail("\n".join([f"Flow file contains {len(errors)} error(s):"] + [f"- {e}" for e in errors]))
    print(f"Flow file is valid: {path}")


if __name__ == "__main__":
    main()
