import sys
from pathlib import Path
from typing import NoReturn

from .exceptions import ValidationError
from .models import Flow
from .repositories import FlowRepository


def fail(message: str) -> NoReturn:
    print(message, file=sys.stderr)
    sys.exit(1)


def open_repository(path: Path, *, must_exist: bool = True) -> FlowRepository:
    if must_exist and not path.exists():
        fail(f"File doesn't exist: {path}")
    if not must_exist and path.exists():
        fail(f"File already exists: {path}")
    try:
        return FlowRepository(path)
    except ValidationError as err:
        fail(f"Flow file contains errors: {err}")


def read_flow(repository: FlowRepository) -> Flow:
    try:
        return repository.get_flow()
    except ValidationError as err:
        fail(f"Flow file contains errors: {err}")
