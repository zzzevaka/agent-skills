"""Small strict schema validator for durable-flow, using only stdlib."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from .exceptions import ValidationError

_SCALARS = {"str", "int", "float", "bool"}
_ANNOTATIONS = {"description", "examples"}


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
        if self.raw.get("type") == "str":
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


def _validate_schema(node: Any, path: str) -> None:
    if not isinstance(node, dict):
        raise ValidationError(f"{path}: schema must be an object")
    schema_type = node.get("type")
    if not isinstance(schema_type, str):
        raise ValidationError(f"{path}: schema requires a string 'type'")
    unknown_keys = set(node) - {"type", "items", "properties", *_ANNOTATIONS}
    if unknown_keys:
        raise ValidationError(f"{path}: unsupported schema keys: {sorted(unknown_keys, key=str)}")
    if schema_type in _SCALARS:
        if "items" in node or "properties" in node:
            raise ValidationError(f"{path}: scalar schema cannot define items or properties")
        return
    if schema_type == "array":
        if "items" not in node:
            raise ValidationError(f"{path}: array schema requires 'items'")
        _validate_schema(node["items"], f"{path}.items")
        if "properties" in node:
            raise ValidationError(f"{path}: array schema cannot define properties")
        return
    if schema_type == "object":
        properties = node.get("properties", {})
        if not isinstance(properties, dict):
            raise ValidationError(f"{path}.properties: expected an object")
        for key, child in properties.items():
            if not isinstance(key, str):
                raise ValidationError(f"{path}.properties: keys must be strings")
            _validate_schema(child, f"{path}.properties.{key}")
        if "items" in node:
            raise ValidationError(f"{path}: object schema cannot define items")
        return
    raise ValidationError(f"{path}: unknown schema type {schema_type!r}")


def _validate_value(node: dict[str, Any], value: Any, path: str, errors: list[str]) -> None:
    schema_type = node["type"]
    label = path or "(root)"
    if schema_type == "str":
        valid = isinstance(value, str)
    elif schema_type == "int":
        valid = type(value) is int
    elif schema_type == "float":
        valid = type(value) in (int, float)
    elif schema_type == "bool":
        valid = type(value) is bool
    elif schema_type == "array":
        if not isinstance(value, list):
            errors.append(f"{label}: expected array")
            return
        for index, item in enumerate(value):
            _validate_value(node["items"], item, f"{path}[{index}]", errors)
        return
    else:  # object
        if not isinstance(value, dict):
            errors.append(f"{label}: expected object")
            return
        properties = node.get("properties", {})
        for key in properties.keys() - value.keys():
            errors.append(f"{path + '.' if path else ''}{key}: required field is missing")
        for key in value.keys() - properties.keys():
            errors.append(f"{path + '.' if path else ''}{key}: extra field is not allowed")
        for key in properties.keys() & value.keys():
            _validate_value(properties[key], value[key], f"{path}.{key}" if path else key, errors)
        return
    if not valid:
        errors.append(f"{label}: expected {schema_type}, got {type(value).__name__}")


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
