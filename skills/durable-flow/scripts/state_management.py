#!/usr/bin/env python3

import argparse
from enum import StrEnum, auto
from pathlib import Path

from lib.cli import fail, open_repository, read_flow
from lib.exceptions import ValidationError


class Commands(StrEnum):
    GET_FLOW = auto()
    START_NEXT_STAGE = auto()
    SET_OUTPUT = auto()
    FINISH_STAGE = auto()
    FAIL_STAGE = auto()
    PAUSE_STAGE = auto()
    RESUME_STAGE = auto()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog='durable-flow',
        description='Script for an AI skill durable-flow',
    )
    parser.add_argument("command", choices=[c.value for c in Commands])
    parser.add_argument("-p", "--path", type=str, required=True, help="path to the flow state file")
    parser.add_argument("-m", "--message", type=str, required=False)
    parser.add_argument(
        "-r", "--revision", type=int, help="revision returned by the latest get_flow"
    )
    parser.add_argument("-v", "--verbose", default=False, action="store_true", help="verbose mode shows the full information about the flow")
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    repository = open_repository(Path(args.path))
    if args.command == Commands.GET_FLOW:
        flow = read_flow(repository)
        print(flow.render(verbose=args.verbose))
        return

    if args.revision is None:
        fail(f"-r/--revision is required for the {args.command} command")

    params: dict[str, str] = {}
    if args.command == Commands.SET_OUTPUT:
        if args.message is None:
            fail(f"-m/--message is required for the {args.command} command")
        params = {"output": args.message}
    elif args.command in (Commands.PAUSE_STAGE, Commands.FAIL_STAGE, Commands.RESUME_STAGE):
        if args.message is None:
            fail(f"-m/--message is required for the {args.command} command")
        params = {"message": args.message}
    elif args.command == Commands.FINISH_STAGE and args.message is not None:
        params = {"output": args.message}

    try:
        flow = repository.mutate(
            args.revision,
            lambda current: getattr(current, args.command)(revision=args.revision, **params),
        )
    except ValidationError as err:
        fail(f"Validation error: {err}")

    print(flow.render(verbose=args.verbose))


if __name__ == '__main__':
    main()
