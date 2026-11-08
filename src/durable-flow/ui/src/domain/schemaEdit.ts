/**
 * Pure functions behind the visual schema editor. Each takes a schema node and
 * returns a new one; a request that makes no sense (empty or duplicate name,
 * unknown field, bad index) returns the node it was given. Every result is a
 * valid definition for `validateDefinition`.
 */
import { validateValue, type SchemaNode } from "./schemaDef";

export type SchemaType = "string" | "integer" | "number" | "boolean" | "array" | "object";

export const SCHEMA_TYPES: SchemaType[] = [
  "string",
  "integer",
  "number",
  "boolean",
  "array",
  "object",
];

const SCALAR_TYPES = new Set<string>(["string", "integer", "number", "boolean"]);

export interface Field {
  name: string;
  schema: SchemaNode;
  required: boolean;
}

type Properties = Record<string, SchemaNode>;

const propertiesOf = (node: SchemaNode): Properties => (node.properties ?? {}) as Properties;
const requiredOf = (node: SchemaNode): string[] => (node.required ?? []) as string[];

/** `node` with new properties; `required` is kept in property order and dropped when empty. */
function rebuild(node: SchemaNode, entries: [string, SchemaNode][], required: string[]): SchemaNode {
  const { required: _old, ...rest } = node;
  const names = new Set(entries.map(([name]) => name));
  const ordered = entries.map(([name]) => name).filter((name) => required.includes(name) && names.has(name));
  const next: SchemaNode = { ...rest, properties: Object.fromEntries(entries) };
  if (ordered.length) next.required = ordered;
  return next;
}

const entriesOf = (node: SchemaNode) => Object.entries(propertiesOf(node));

export function defaultSchema(type: SchemaType): SchemaNode {
  if (type === "array") return { type, items: { type: "string" } };
  if (type === "object") return { type, properties: {} };
  return { type };
}

export function fieldsOf(node: SchemaNode): Field[] {
  const required = requiredOf(node);
  return entriesOf(node).map(([name, schema]) => ({ name, schema, required: required.includes(name) }));
}

export function addField(
  node: SchemaNode,
  name: string,
  type: SchemaType,
  required = false,
): SchemaNode {
  if (name.trim() === "" || Object.hasOwn(propertiesOf(node), name)) return node;
  const entries: [string, SchemaNode][] = [...entriesOf(node), [name, defaultSchema(type)]];
  return rebuild(node, entries, required ? [...requiredOf(node), name] : requiredOf(node));
}

export function renameField(node: SchemaNode, from: string, to: string): SchemaNode {
  const properties = propertiesOf(node);
  if (to.trim() === "" || from === to) return node;
  if (!Object.hasOwn(properties, from) || Object.hasOwn(properties, to)) return node;
  const entries = entriesOf(node).map(([name, schema]): [string, SchemaNode] => [
    name === from ? to : name,
    schema,
  ]);
  return rebuild(node, entries, requiredOf(node).map((name) => (name === from ? to : name)));
}

export function removeField(node: SchemaNode, name: string): SchemaNode {
  if (!Object.hasOwn(propertiesOf(node), name)) return node;
  return rebuild(
    node,
    entriesOf(node).filter(([key]) => key !== name),
    requiredOf(node),
  );
}

export function setField(node: SchemaNode, name: string, child: SchemaNode): SchemaNode {
  if (!Object.hasOwn(propertiesOf(node), name)) return node;
  return rebuild(
    node,
    entriesOf(node).map(([key, schema]): [string, SchemaNode] => [key, key === name ? child : schema]),
    requiredOf(node),
  );
}

export function moveField(node: SchemaNode, from: number, to: number): SchemaNode {
  const entries = entriesOf(node);
  const inRange = (index: number) => Number.isInteger(index) && index >= 0 && index < entries.length;
  if (from === to || !inRange(from) || !inRange(to)) return node;
  const [moved] = entries.splice(from, 1);
  entries.splice(to, 0, moved);
  return rebuild(node, entries, requiredOf(node));
}

export function setRequired(node: SchemaNode, name: string, required: boolean): SchemaNode {
  if (!Object.hasOwn(propertiesOf(node), name)) return node;
  const current = requiredOf(node);
  const next = required ? [...current.filter((n) => n !== name), name] : current.filter((n) => n !== name);
  return rebuild(node, entriesOf(node), next);
}

/** A node of another type: annotations stay, structure resets, `enum` stays if still valid. */
export function changeType(child: SchemaNode, type: SchemaType): SchemaNode {
  if (child.type === type) return child;
  const next: SchemaNode = { type };
  if ("description" in child) next.description = child.description;
  if ("examples" in child) next.examples = child.examples;
  const values = child.enum;
  if (
    Array.isArray(values) &&
    SCALAR_TYPES.has(child.type as string) &&
    SCALAR_TYPES.has(type) &&
    values.every((value) => validateValue({ type }, value).length === 0)
  ) {
    next.enum = values;
  }
  const fresh = defaultSchema(type);
  if ("items" in fresh) next.items = fresh.items;
  if ("properties" in fresh) next.properties = fresh.properties;
  return next;
}

export function setEnum(child: SchemaNode, values: unknown[] | null): SchemaNode {
  const { enum: _old, ...rest } = child;
  return values && values.length ? { ...rest, enum: values } : rest;
}
