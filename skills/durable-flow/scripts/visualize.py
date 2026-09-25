#!/usr/bin/env python3

import argparse
import html
import json
from dataclasses import asdict
from pathlib import Path

from lib.cli import fail, open_repository, read_flow
from lib.models import Flow

_TEMPLATE = Path(__file__).resolve().parent / "lib" / "visualization.html"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="durable-flow-visualize",
        description="Render a durable-flow state file as a standalone HTML page",
    )
    parser.add_argument(
        "-p", "--path", type=str, required=True, help="path to the flow state file"
    )
    parser.add_argument(
        "-o",
        "--output",
        type=str,
        help="output HTML path (default: <flow-name>.html in the working directory)",
    )
    return parser.parse_args()


def render_html(flow: Flow, source: str) -> str:
    data = asdict(flow)
    data["source"] = source
    # Neutralise "</script>" and similar sequences inside the embedded JSON.
    payload = json.dumps(data, ensure_ascii=False).replace("<", "\\u003c")
    template = _TEMPLATE.read_text(encoding="utf-8")
    return template.replace("__TITLE__", html.escape(flow.name)).replace(
        "__FLOW_DATA__", payload
    )


def main() -> None:
    args = parse_args()
    flow_path = Path(args.path)
    try:
        flow = read_flow(open_repository(flow_path))
        output = (
            Path(args.output)
            if args.output
            else Path.cwd() / f"{flow_path.stem}.html"
        )
        output.write_text(render_html(flow, str(flow_path)), encoding="utf-8")
    except OSError as err:
        fail(f"Filesystem error: {err}")
    print(output.resolve())


if __name__ == "__main__":
    main()
