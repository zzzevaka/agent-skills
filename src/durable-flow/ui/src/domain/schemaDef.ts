/**
 * Port of skills/durable-flow/scripts/lib/schema.py. Messages are identical;
 * the parity corpus in tests/skills/durable-flow/fixtures/parity enforces it.
 */
import { pyListRepr, pyLstrip, pyRepr, pyStrip, pyTypeName } from "./pyCompat";

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export type SchemaNode = Record<string, unknown>;

const SCALARS = new Set(["string", "integer", "number", "boolean"]);
const KEYS = new Set(["type", "items", "properties", "required", "enum", "description", "examples"]);
const OLD_TYPE_NAMES: Record<string, string> = {
  str: "string",
  int: "integer",
  float: "number",
  bool: "boolean",
};

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isType(type: string, value: unknown): boolean {
  if (type === "string") return typeof value === "string";
  if (type === "integer") return typeof value === "number" && Number.isInteger(value);
  if (type === "number") return typeof value === "number";
  return typeof value === "boolean";
}

/** Strict equality: `true` is not `1`, and numbers compare by value. */
function sameValue(left: unknown, right: unknown): boolean {
  return left === right;
}

function validateEnum(node: SchemaNode, type: string, path: string): void {
  if (!("enum" in node)) return;
  if (!SCALARS.has(type)) {
    throw new ValidationError(`${path}: enum is only allowed on scalar schemas`);
  }
  const values = node.enum;
  if (!Array.isArray(values) || values.length === 0) {
    throw new ValidationError(`${path}.enum: expected a non-empty list`);
  }
  for (const value of values) {
    if (!isType(type, value)) {
      throw new ValidationError(`${path}.enum: ${JSON.stringify(value)} is not a valid ${type}`);
    }
  }
  values.forEach((value, index) => {
    if (values.slice(0, index).some((other) => sameValue(value, other))) {
      throw new ValidationError(`${path}.enum: values must be unique`);
    }
  });
}

function validateRequired(node: SchemaNode, type: string, path: string): void {
  if (!("required" in node)) return;
  if (type !== "object") {
    throw new ValidationError(`${path}: only an object schema can define required`);
  }
  const names = node.required;
  if (
    !Array.isArray(names) ||
    !names.every((name) => typeof name === "string") ||
    new Set(names).size !== names.length
  ) {
    throw new ValidationError(`${path}.required: expected a list of unique strings`);
  }
  const properties = (node.properties ?? {}) as Record<string, unknown>;
  for (const name of names as string[]) {
    if (!Object.hasOwn(properties, name)) {
      throw new ValidationError(`${path}.required: ${pyRepr(name)} is not in properties`);
    }
  }
}

export function validateDefinition(node: unknown, path = "schema"): void {
  if (!isObject(node)) throw new ValidationError(`${path}: schema must be an object`);
  const type = node.type;
  if (typeof type !== "string") {
    throw new ValidationError(`${path}: schema requires a string 'type'`);
  }
  const unknown = Object.keys(node)
    .filter((key) => !KEYS.has(key))
    .sort();
  if (unknown.length) {
    throw new ValidationError(`${path}: unsupported schema keys: ${pyListRepr(unknown)}`);
  }
  if (SCALARS.has(type)) {
    if ("items" in node || "properties" in node) {
      throw new ValidationError(`${path}: scalar schema cannot define items or properties`);
    }
  } else if (type === "array") {
    if (!("items" in node)) {
      throw new ValidationError(`${path}: array schema requires 'items'`);
    }
    validateDefinition(node.items, `${path}.items`);
    if ("properties" in node) {
      throw new ValidationError(`${path}: array schema cannot define properties`);
    }
  } else if (type === "object") {
    const properties = "properties" in node ? node.properties : {};
    if (!isObject(properties)) {
      throw new ValidationError(`${path}.properties: expected an object`);
    }
    for (const [key, child] of Object.entries(properties)) {
      validateDefinition(child, `${path}.properties.${key}`);
    }
    if ("items" in node) {
      throw new ValidationError(`${path}: object schema cannot define items`);
    }
  } else if (Object.hasOwn(OLD_TYPE_NAMES, type)) {
    throw new ValidationError(
      `${path}: unknown schema type ${pyRepr(type)}; use ${pyRepr(OLD_TYPE_NAMES[type])}`,
    );
  } else {
    throw new ValidationError(`${path}: unknown schema type ${pyRepr(type)}`);
  }
  validateRequired(node, type, path);
  validateEnum(node, type, path);
}

function collect(node: SchemaNode, value: unknown, path: string, errors: string[]): void {
  const type = node.type as string;
  const label = path || "(root)";
  if (type === "array") {
    if (!Array.isArray(value)) {
      errors.push(`${label}: expected array`);
      return;
    }
    value.forEach((item, index) =>
      collect(node.items as SchemaNode, item, `${path}[${index}]`, errors),
    );
    return;
  }
  if (type === "object") {
    if (!isObject(value)) {
      errors.push(`${label}: expected object`);
      return;
    }
    const properties = (node.properties ?? {}) as Record<string, SchemaNode>;
    const prefix = path ? `${path}.` : "";
    for (const key of (node.required ?? []) as string[]) {
      if (!Object.hasOwn(value, key)) {
        errors.push(`${prefix}${key}: required field is missing`);
      }
    }
    for (const key of Object.keys(properties)) {
      if (Object.hasOwn(value, key)) {
        collect(properties[key], value[key], `${prefix}${key}`, errors);
      }
    }
    return;
  }
  if (!isType(type, value)) {
    errors.push(`${label}: expected ${type}, got ${pyTypeName(value)}`);
    return;
  }
  const allowed = node.enum as unknown[] | undefined;
  if (allowed !== undefined && !allowed.some((item) => sameValue(value, item))) {
    const options = allowed.map((item) => JSON.stringify(item)).join(", ");
    errors.push(`${label}: expected one of ${options}, got ${JSON.stringify(value)}`);
  }
}

/** Errors for `value` against an already-valid definition (`[]` when valid). */
export function validateValue(def: SchemaNode, value: unknown): string[] {
  const errors: string[] = [];
  collect(def, value, "", errors);
  return errors;
}

function stripJsonFence(text: string): string {
  const body = pyStrip(text);
  if (!body.startsWith("```")) return body;
  const end = body.indexOf("```", 3);
  if (end === -1) return body;
  let inner = pyStrip(body.slice(3, end));
  if (inner.startsWith("json")) inner = pyLstrip(inner.slice(4));
  return inner;
}

/** Parse text output as JSON for non-string schemas, then validate it. */
export function parseAndValidate(def: SchemaNode, value: unknown): unknown {
  let parsed: unknown;
  if (def.type === "string") {
    parsed = typeof value === "string" ? pyStrip(value) : value;
  } else if (typeof value === "string") {
    try {
      parsed = JSON.parse(stripJsonFence(value));
    } catch (err) {
      throw new ValidationError(
        `could not parse output as JSON: ${(err as Error).message}`,
      );
    }
  } else {
    parsed = value;
  }
  validateDefinition(def);
  const errors = validateValue(def, parsed);
  if (errors.length) throw new ValidationError(errors.join("; "));
  return parsed;
}
