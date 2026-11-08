"""Check files written by the UI serializer against the Python implementation.

Usage: python check_roundtrip.py <dir>

For every `<name>.json|yaml` in <dir> with a sidecar `<name>.<ext>.expected.json`,
load it with the same code `state_management.py` uses, require that
`validate.py` finds no errors, and require that the parsed flow equals the
sidecar. Exits 1 on any mismatch. Not a unittest: it needs files produced by
`npm test` in `src/durable-flow/ui/`.
"""

import json
import sys
from dataclasses import asdict
from pathlib import Path

SCRIPTS_DIRECTORY = (
    Path(__file__).resolve().parents[3] / "skills" / "durable-flow" / "scripts"
)
sys.path.insert(0, str(SCRIPTS_DIRECTORY))

from lib.repositories import FlowRepository, _plain  # noqa: E402
from validate import find_errors  # noqa: E402


def check(path: Path) -> list[str]:
    expected = json.loads(Path(f"{path}.expected.json").read_text())
    repository = FlowRepository(path)
    problems = [f"{path.name}: {error}" for error in find_errors(repository.read_data())]
    if problems:
        return problems
    # asdict keeps tuples; a JSON round trip makes them lists like the sidecar.
    actual = json.loads(
        json.dumps(asdict(repository.get_flow(), dict_factory=_plain))
    )
    if actual != expected:
        return [f"{path.name}: parsed flow differs from the expected flow"]
    return []


def main() -> int:
    directory = Path(sys.argv[1])
    files = sorted(
        p for p in directory.iterdir() if p.suffix in (".json", ".yaml", ".yml")
        and not p.name.endswith(".expected.json")
    )
    if not files:
        print(f"no round-trip files found in {directory}", file=sys.stderr)
        return 1
    problems = [problem for path in files for problem in check(path)]
    for problem in problems:
        print(problem, file=sys.stderr)
    print(f"checked {len(files)} files, {len(problems)} problem(s)")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
