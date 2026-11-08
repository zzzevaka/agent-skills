"""Generate the Python/TypeScript parity corpus from the Python implementation.

Python is the source of truth: run this script after changing a case, review
the diff of the generated files, and commit them. `test_parity.py` fails when
the committed files differ from what the Python code produces today, and the
UI test suite asserts that the TypeScript port produces the same results.
"""

import json
import sys
from pathlib import Path

SCRIPTS_DIRECTORY = (
    Path(__file__).resolve().parents[3] / "skills" / "durable-flow" / "scripts"
)
sys.path.insert(0, str(SCRIPTS_DIRECTORY))

from lib.exceptions import ValidationError  # noqa: E402
from lib.schema import SchemaDef, _validate_value  # noqa: E402
from validate import find_errors  # noqa: E402

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "parity"

_OBJ = {
    "type": "object",
    "properties": {"a": {"type": "string"}, "b": {"type": "integer"}},
    "required": ["a"],
}

REPR_STRINGS = [
    "abc",
    "it's",
    'say "hi"',
    "both ' and \"",
    "a\nb",
    "tab\t",
    "back\\slash",
    "ключ",
    "\u0000",
    "\x7f",
    " ",
    "​",
    "\U0001f600",
    "",
]

# definition -> values to validate against it
SCHEMA_CASES: list[tuple[object, list[object]]] = [
    ({"type": "string"}, ["a", 1, None]),
    ({"type": "integer"}, [1, True, 1.5, "x", 3.0]),
    ({"type": "number"}, [1, 1.5, "x", True]),
    ({"type": "boolean"}, [True, 1, "x"]),
    ({"type": "array", "items": {"type": "integer"}}, [[1, 2], [1, "a"], "x", {}]),
    (
        _OBJ,
        [
            {"a": "x", "b": 1},
            {"a": 1, "b": 1},
            {"a": "x"},
            {"b": 1},
            {"b": "x"},
            {"b": 1, "a": "x", "c": 2},
            [],
            "x",
        ],
    ),
    (
        {
            "type": "object",
            "properties": {
                "items": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {"n": {"type": "integer"}},
                        "required": ["n"],
                    },
                }
            },
            "required": ["items"],
        },
        [{"items": [{"n": 1}, {"n": "x"}]}, {"items": [{}]}, {}],
    ),
    ({"type": "string", "description": "d", "examples": ["a"]}, ["a"]),
    ({"type": "object"}, [{}, {"a": 1}]),
    (
        {
            "type": "object",
            "properties": {"it's": {"type": "integer"}},
            "required": ["it's"],
        },
        [{"it's": "x"}, {}],
    ),
    ({"type": "string", "enum": ["a", "b"]}, ["a", "c", 1, "it's"]),
    ({"type": "string", "enum": ["it's", 'say "hi"']}, ["x"]),
    ({"type": "integer", "enum": [1, 2]}, [1, 2.0, 3, True, "1"]),
    ({"type": "number", "enum": [1.5, 2]}, [1.5, 2.0, 2.5]),
    ({"type": "boolean", "enum": [True]}, [True, False, 1]),
    (
        {
            "type": "object",
            "properties": {"s": {"type": "string", "enum": ["a"]}},
            "required": ["s"],
        },
        [{"s": "a"}, {"s": "b"}],
    ),
    # definition errors
    ([], []),
    ("x", []),
    ({}, []),
    ({"type": 1}, []),
    ({"type": "string", "foo": 1, "bar": 2}, []),
    ({"type": "string", "pattern": "x"}, []),
    ({"type": "string", "items": {"type": "string"}}, []),
    ({"type": "integer", "properties": {}}, []),
    ({"type": "array"}, []),
    ({"type": "array", "items": {"type": "string"}, "properties": {}}, []),
    ({"type": "array", "items": {"type": "set"}}, []),
    ({"type": "object", "properties": []}, []),
    ({"type": "object", "properties": {"a": {"type": "nope"}}}, []),
    ({"type": "object", "properties": {"it's": {"type": "nope"}}}, []),
    ({"type": "object", "items": {"type": "string"}}, []),
    ({"type": "set"}, []),
    ({"type": "str"}, []),
    ({"type": "int"}, []),
    ({"type": "float"}, []),
    ({"type": "bool"}, []),
    ({"type": "object", "properties": {"a": {"type": "str"}}}, []),
    ({"type": "null"}, []),
    ({"type": "string", "required": []}, []),
    ({"type": "array", "items": {"type": "string"}, "required": []}, []),
    ({"type": "object", "properties": {"a": {"type": "string"}}, "required": "a"}, []),
    ({"type": "object", "properties": {"a": {"type": "string"}}, "required": [1]}, []),
    (
        {"type": "object", "properties": {"a": {"type": "string"}}, "required": ["a", "a"]},
        [],
    ),
    ({"type": "object", "properties": {"a": {"type": "string"}}, "required": ["b"]}, []),
    ({"type": "object", "properties": {"a": {"type": "string"}}, "required": []}, [{}]),
    ({"type": "object", "required": ["it's"]}, []),
    ({"type": "string", "enum": []}, []),
    ({"type": "string", "enum": "a"}, []),
    ({"type": "string", "enum": ["a", "a"]}, []),
    ({"type": "string", "enum": [5]}, []),
    ({"type": "integer", "enum": [True]}, []),
    ({"type": "integer", "enum": [1, 1.0]}, []),
    ({"type": "string", "enum": ["it's", None]}, []),
    ({"type": "array", "items": {"type": "string"}, "enum": [[]]}, []),
    ({"type": "object", "enum": [{}]}, []),
]

# (definition, text) -> parse_and_validate result
PARSE_CASES: list[tuple[object, str]] = [
    ({"type": "string"}, "  hi  "),
    ({"type": "string"}, chr(0x85) + "hi" + chr(0x1F)),
    ({"type": "string"}, chr(0xFEFF) + "hi"),
    ({"type": "integer"}, "42"),
    ({"type": "integer"}, "3.0"),
    ({"type": "array", "items": {"type": "string"}}, '```json\n["a"]\n```'),
    (
        {"type": "object", "properties": {"a": {"type": "integer"}}, "required": ["a"]},
        '{"a": 1}',
    ),
    ({"type": "integer"}, "abc"),
    ({"type": "integer"}, '"x"'),
    (
        {"type": "object", "properties": {"a": {"type": "integer"}}, "required": ["a"]},
        "{}",
    ),
    ({"type": "object", "properties": {"a": {"type": "integer"}}}, "{}"),
    ({"type": "string", "enum": ["a", "b"]}, "  a "),
    ({"type": "string", "enum": ["a", "b"]}, "c"),
    ({"type": "str"}, "x"),
]

_JSON_PREFIX = "could not parse output as JSON: "

_DROP = object()


def _stage(name: object = "a", **changes: object) -> dict:
    data: dict = {"name": name, "prompt": "p"}
    if name is _DROP:
        del data["name"]
    for key, value in changes.items():
        if value is _DROP:
            data.pop(key, None)
        else:
            data[key] = value
    return data


def _flow(**changes: object) -> dict:
    data: dict = {"name": "f", "goal": "g", "stages": [_stage("a")]}
    for key, value in changes.items():
        if value is _DROP:
            data.pop(key, None)
        else:
            data[key] = value
    return data


def _reference(name: str) -> object:
    path = SCRIPTS_DIRECTORY.parent / "references" / name
    if name.endswith(".json"):
        return json.loads(path.read_text())
    import yaml

    return yaml.safe_load(path.read_text())


FLOW_CASES: list[tuple[str, object]] = [
    ("reference json is valid", _reference("example.json")),
    ("reference yaml is valid", _reference("example.yaml")),
    ("flow is not an object", []),
    ("flow is a string", "x"),
    (
        "typos are reported together with invariant errors",
        {
            "name": "typos",
            "goal": "Find every mistake at once",
            "shemas": {},
            "stages": [
                {"name": "first", "prompt": "Do it.", "output_shema": "result"},
                {"name": "second", "prompt": "Then.", "depends_on": ["missing"]},
            ],
        },
    ),
    ("unknown key on stage without a name", _flow(stages=[{"prompt": "p", "foo": 1}])),
    ("duplicate stage", _flow(stages=[_stage("a"), _stage("a")])),
    ("duplicate stage with quote", _flow(stages=[_stage("it's"), _stage("it's")])),
    ("forward dependency", _flow(stages=[_stage("a", depends_on=["b"]), _stage("b")])),
    ("self dependency", _flow(stages=[_stage("a", depends_on=["a"])])),
    (
        "repeated dependency",
        _flow(stages=[_stage("a"), _stage("b", depends_on=["a", "a"])]),
    ),
    (
        "missing dependency with non-ascii name",
        _flow(stages=[_stage("a", depends_on=["ключ"])]),
    ),
    ("unknown output schema", _flow(stages=[_stage("a", output_schema="nope")])),
    ("output schema not a string", _flow(stages=[_stage("a", output_schema=5)])),
    ("known output schema", _flow(
        schemas={"s": {"type": "string"}}, stages=[_stage("a", output_schema="s")]
    )),
    ("flow name of only a control char", _flow(name=chr(0x1F))),
    ("flow name of only a next-line char", _flow(name=chr(0x85))),
    ("flow name of only a byte order mark", _flow(name=chr(0xFEFF))),
    ("stage name of only a control char", _flow(stages=[_stage(chr(0x1F))])),
    ("stage name of only a byte order mark", _flow(stages=[_stage(chr(0xFEFF))])),
    ("empty flow name", _flow(name="")),
    ("whitespace flow name", _flow(name="   ")),
    ("null flow name", _flow(name=None)),
    ("empty stage name", _flow(stages=[_stage("")])),
    ("numeric stage name", _flow(stages=[_stage(5)])),
    ("no stages", _flow(stages=[])),
    ("negative revision", _flow(revision=-1)),
    ("boolean revision", _flow(revision=True)),
    ("string revision", _flow(revision="1")),
    ("valid revision", _flow(revision=7)),
    ("missing goal", _flow(goal=_DROP)),
    ("null goal", _flow(goal=None)),
    ("numeric goal", _flow(goal=5)),
    ("missing name", _flow(name=_DROP)),
    ("missing stages", _flow(stages=_DROP)),
    ("missing stage prompt", _flow(stages=[_stage("a", prompt=_DROP)])),
    ("missing stage name", _flow(stages=[_stage(_DROP)])),
    ("numeric stage prompt", _flow(stages=[_stage("a", prompt=5)])),
    ("bad state", _flow(stages=[_stage("a", state="foo")])),
    ("bad state beats missing name", _flow(stages=[{"prompt": "p", "state": "foo"}])),
    ("legacy prompt key as goal", {"name": "f", "prompt": "g", "stages": [_stage("a")]}),
    (
        "goal wins over legacy prompt",
        {"name": "f", "goal": "g", "prompt": "old", "stages": [_stage("a")]},
    ),
    (
        "legacy finished stage message",
        _flow(stages=[_stage("a", state="finished", message="done")]),
    ),
    ("schemas not an object", _flow(schemas=[])),
    ("invalid schema definition", _flow(schemas={"x": {"type": "nope"}})),
    ("old schema type name", _flow(schemas={"x": {"type": "str"}})),
    (
        "required names a missing property",
        _flow(
            schemas={
                "x": {"type": "object", "properties": {}, "required": ["a"]}
            }
        ),
    ),
    ("empty schema name", _flow(schemas={"": {"type": "string"}})),
    ("stage is not an object", _flow(stages=[1])),
    ("depends_on is not a list", _flow(stages=[_stage("a", depends_on="b")])),
    ("depends_on item not a string", _flow(stages=[_stage("a", depends_on=[1])])),
    ("depends_on invalid without a name", _flow(stages=[{"prompt": "p", "depends_on": 1}])),
]


def _definition_error(definition: object) -> str | None:
    try:
        SchemaDef(definition).validate_definition()  # type: ignore[arg-type]
    except ValidationError as err:
        return str(err)
    return None


def build_schema_cases() -> list[dict]:
    cases = []
    for definition, values in SCHEMA_CASES:
        error = _definition_error(definition)
        results = []
        if error is None:
            for value in values:
                errors: list[str] = []
                _validate_value(definition, value, "", errors)  # type: ignore[arg-type]
                # Python reports set differences in arbitrary order.
                results.append({"value": value, "errors": sorted(errors)})
        cases.append(
            {"definition": definition, "definition_error": error, "values": results}
        )
    return cases


def build_parse_cases() -> list[dict]:
    cases = []
    for definition, text in PARSE_CASES:
        try:
            result: dict = {"ok": SchemaDef(definition).parse_and_validate(text)}  # type: ignore[arg-type]
        except ValidationError as err:
            message = str(err)
            if message.startswith(_JSON_PREFIX):
                result = {"error": _JSON_PREFIX, "prefix_only": True}
            else:
                result = {"error": message, "prefix_only": False}
        cases.append({"definition": definition, "text": text, "result": result})
    return cases


def build_flow_cases() -> list[dict]:
    return [
        {"label": label, "input": raw, "expected_errors": find_errors(raw)}
        for label, raw in FLOW_CASES
    ]


def build_repr_cases() -> list[dict]:
    return [{"value": value, "repr": repr(value)} for value in REPR_STRINGS]


def _dump(value: object) -> str:
    return json.dumps(value, indent=2, ensure_ascii=True) + "\n"


def main() -> None:
    FIXTURES.mkdir(parents=True, exist_ok=True)
    (FIXTURES / "schema-cases.json").write_text(_dump(build_schema_cases()))
    (FIXTURES / "schema-parse-cases.json").write_text(_dump(build_parse_cases()))
    (FIXTURES / "flow-cases.json").write_text(_dump(build_flow_cases()))
    (FIXTURES / "pyrepr.json").write_text(_dump(build_repr_cases()))


if __name__ == "__main__":
    main()
