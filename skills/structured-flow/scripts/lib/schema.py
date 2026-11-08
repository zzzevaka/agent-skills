"""Small strict schema validator for structured-flow, using only stdlib."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from .exceptions import ValidationError

_SCALARS = {"string", "integer", "number", "boolean"}
_ANNOTATIONS = {"description", "examples"}
_KEYS = {"type", "items", "properties", "required", "enum", *_ANNOTATIONS}
_OLD_TYPE_NAMES = {
    "str": "string",
    "int": "integer",
    "float": "number",
    "bool": "boolean",
}


@dataclass(frozen=True)
class SchemaDef:
    raw: dict[str, Any]

    def validate_definition(self, path: str = "schema") -> None:
        _validate_schema(self.raw, path=path)

    def validate(self, value: Any) -> None:
        self.validate_definition()
        errors: list[str] = []
        _validate_value(self.raw, value, "", errors)
        if errors:
            raise ValidationError("; ".join(errors))

    def parse_and_validate(self, value: Any) -> Any:
        """Parse text outputs as JSON for non-string schemas, then validate."""
        if self.raw.get("type") == "string":
            parsed = value.strip() if isinstance(value, str) else value
        elif isinstance(value, str):
            body = _strip_json_fence(value)
            try:
                parsed = json.loads(body)
            except json.JSONDecodeError as err:
                raise ValidationError(f"could not parse output as JSON: {err}") from err
        else:
            parsed = value
        self.validate(parsed)
        return parsed


def _json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False)


def _is_type(schema_type: str, value: Any) -> bool:
    if schema_type == "string":
        return isinstance(value, str)
    if schema_type == "integer":
        if isinstance(value, bool):
            return False
        return isinstance(value, int) or (isinstance(value, float) and value.is_integer())
    if schema_type == "number":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    return isinstance(value, bool)  # boolean


def _same_value(left: Any, right: Any) -> bool:
    """Equality that keeps True apart from 1 (Python treats them as equal)."""
    if isinstance(left, bool) or isinstance(right, bool):
        return isinstance(left, bool) and isinstance(right, bool) and left == right
    if isinstance(left, (int, float)) and isinstance(right, (int, float)):
        return left == right
    return type(left) is type(right) and left == right


def _validate_enum(node: dict[str, Any], schema_type: str, path: str) -> None:
    if "enum" not in node:
        return
    if schema_type not in _SCALARS:
        raise ValidationError(f"{path}: enum is only allowed on scalar schemas")
    values = node["enum"]
    if not isinstance(values, list) or not values:
        raise ValidationError(f"{path}.enum: expected a non-empty list")
    for value in values:
        if not _is_type(schema_type, value):
            raise ValidationError(f"{path}.enum: {_json(value)} is not a valid {schema_type}")
    for index, value in enumerate(values):
        if any(_same_value(value, other) for other in values[:index]):
            raise ValidationError(f"{path}.enum: values must be unique")


def _validate_required(node: dict[str, Any], schema_type: str, path: str) -> None:
    if "required" not in node:
        return
    if schema_type != "object":
        raise ValidationError(f"{path}: only an object schema can define required")
    names = node["required"]
    if (
        not isinstance(names, list)
        or not all(isinstance(name, str) for name in names)
        or len(set(names)) != len(names)
    ):
        raise ValidationError(f"{path}.required: expected a list of unique strings")
    properties = node.get("properties", {})
    for name in names:
        if name not in properties:
            raise ValidationError(f"{path}.required: {name!r} is not in properties")


def _validate_schema(node: Any, path: str) -> None:
    if not isinstance(node, dict):
        raise ValidationError(f"{path}: schema must be an object")
    schema_type = node.get("type")
    if not isinstance(schema_type, str):
        raise ValidationError(f"{path}: schema requires a string 'type'")
    unknown_keys = set(node) - _KEYS
    if unknown_keys:
        raise ValidationError(f"{path}: unsupported schema keys: {sorted(unknown_keys, key=str)}")
    if schema_type in _SCALARS:
        if "items" in node or "properties" in node:
            raise ValidationError(f"{path}: scalar schema cannot define items or properties")
    elif schema_type == "array":
        if "items" not in node:
            raise ValidationError(f"{path}: array schema requires 'items'")
        _validate_schema(node["items"], f"{path}.items")
        if "properties" in node:
            raise ValidationError(f"{path}: array schema cannot define properties")
    elif schema_type == "object":
        properties = node.get("properties", {})
        if not isinstance(properties, dict):
            raise ValidationError(f"{path}.properties: expected an object")
        for key, child in properties.items():
            if not isinstance(key, str):
                raise ValidationError(f"{path}.properties: keys must be strings")
            _validate_schema(child, f"{path}.properties.{key}")
        if "items" in node:
            raise ValidationError(f"{path}: object schema cannot define items")
    elif schema_type in _OLD_TYPE_NAMES:
        raise ValidationError(
            f"{path}: unknown schema type {schema_type!r}; use {_OLD_TYPE_NAMES[schema_type]!r}"
        )
    else:
        raise ValidationError(f"{path}: unknown schema type {schema_type!r}")
    _validate_required(node, schema_type, path)
    _validate_enum(node, schema_type, path)


def _validate_value(node: dict[str, Any], value: Any, path: str, errors: list[str]) -> None:
    schema_type = node["type"]
    label = path or "(root)"
    if schema_type == "array":
        if not isinstance(value, list):
            errors.append(f"{label}: expected array")
            return
        for index, item in enumerate(value):
            _validate_value(node["items"], item, f"{path}[{index}]", errors)
        return
    if schema_type == "object":
        if not isinstance(value, dict):
            errors.append(f"{label}: expected object")
            return
        prefix = f"{path}." if path else ""
        properties = node.get("properties", {})
        for key in node.get("required", []):
            if key not in value:
                errors.append(f"{prefix}{key}: required field is missing")
        for key, child in properties.items():
            if key in value:
                _validate_value(child, value[key], f"{prefix}{key}", errors)
        return
    if not _is_type(schema_type, value):
        errors.append(f"{label}: expected {schema_type}, got {type(value).__name__}")
        return
    allowed = node.get("enum")
    if allowed is not None and not any(_same_value(value, item) for item in allowed):
        options = ", ".join(_json(item) for item in allowed)
        errors.append(f"{label}: expected one of {options}, got {_json(value)}")


def _strip_json_fence(text: str) -> str:
    body = text.strip()
    if not body.startswith("```"):
        return body
    pieces = body.split("```", 2)
    if len(pieces) < 3:
        return body
    body = pieces[1].strip()
    if body.startswith("json"):
        body = body[4:].lstrip()
    return body
