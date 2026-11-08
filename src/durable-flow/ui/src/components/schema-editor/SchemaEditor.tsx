import type { SchemaNode } from "../../domain/schemaDef";
import { ObjectFields, type OnChange } from "./SchemaTree";

export interface SchemaEditorProps {
  value: SchemaNode;
  onChange: OnChange;
  readOnly?: boolean;
}

/**
 * Visual editor for an object schema: a row per field (name, type, required, description,
 * allowed values, nested fields or items). It only knows the keywords of our dialect, so
 * what it emits always passes `validateDefinition`. The structure follows jsonjoy-builder
 * (see THIRD_PARTY.md).
 */
export type { ChangeOptions } from "./SchemaTree";

export function SchemaEditor({ value, onChange, readOnly = false }: SchemaEditorProps) {
  if (value.type !== "object") {
    return (
      <p className="text-sm text-muted-foreground" data-testid="schema-editor-note">
        This schema is not an object, so it has no fields to edit here. Edit it in the YAML.
      </p>
    );
  }
  return (
    <div data-testid="schema-editor">
      <ObjectFields node={value} readOnly={readOnly} onChange={onChange} />
    </div>
  );
}
