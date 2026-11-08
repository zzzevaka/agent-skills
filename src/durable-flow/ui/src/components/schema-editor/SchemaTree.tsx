import { ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { SchemaNode } from "../../domain/schemaDef";
import {
  addField,
  changeType,
  fieldsOf,
  removeField,
  renameField,
  setField,
  setRequired,
  type Field,
  type SchemaType,
} from "../../domain/schemaEdit";
import { AddField } from "./AddField";
import { EnumEditor } from "./EnumEditor";
import { TypeSelect } from "./TypeSelect";

interface TreeProps {
  readOnly: boolean;
}

/** Reported with a change; edits that share a `coalesce` key may be merged into one undo step. */
export interface ChangeOptions {
  coalesce?: string;
}
export type OnChange = (next: SchemaNode, options?: ChangeOptions) => void;

/** The fields of an object schema, one row each, and the line that adds another. */
export function ObjectFields({
  node,
  onChange,
  scope,
  readOnly,
}: TreeProps & { node: SchemaNode; scope?: string; onChange: OnChange }) {
  const fields = fieldsOf(node);
  return (
    <div className="space-y-2">
      {fields.map((field) => (
        <FieldRow
          key={field.name}
          field={field}
          readOnly={readOnly}
          onRename={(to) => {
            const next = renameField(node, field.name, to);
            if (next === node) return false;
            onChange(next);
            return true;
          }}
          onType={(type) => onChange(setField(node, field.name, changeType(field.schema, type)))}
          onRequired={(required) => onChange(setRequired(node, field.name, required))}
          onRemove={() => onChange(removeField(node, field.name))}
          onChange={(child, options) => onChange(setField(node, field.name, child), options)}
        />
      ))}
      <AddField
        scope={scope}
        existing={fields.map((field) => field.name)}
        readOnly={readOnly}
        onAdd={(name, type, required) => onChange(addField(node, name, type, required))}
      />
    </div>
  );
}

function FieldRow({
  field,
  readOnly,
  onRename,
  onType,
  onRequired,
  onRemove,
  onChange,
}: TreeProps & {
  field: Field;
  onRename(to: string): boolean;
  onType(type: SchemaType): void;
  onRequired(required: boolean): void;
  onRemove(): void;
  onChange: OnChange;
}) {
  const { name, schema, required } = field;
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState(name);
  useEffect(() => setDraft(name), [name]);

  const commitName = () => {
    if (draft !== name && !onRename(draft)) setDraft(name);
  };

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex flex-wrap items-center gap-2 p-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          aria-label={`${expanded ? "Collapse" : "Expand"} ${name}`}
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? <ChevronDown /> : <ChevronRight />}
        </Button>
        <Input
          aria-label={`Name of ${name}`}
          className="h-8 min-w-0 flex-1 basis-28 font-medium"
          value={draft}
          disabled={readOnly}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commitName}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") setDraft(name);
          }}
        />
        <TypeSelect value={schema.type as string} label={`Type of ${name}`} disabled={readOnly} onChange={onType} />
        <button
          type="button"
          role="switch"
          aria-checked={required}
          aria-label={`Required: ${name}`}
          disabled={readOnly}
          onClick={() => onRequired(!required)}
          className={cn(
            "h-8 w-20 shrink-0 rounded-md border text-xs font-medium transition-colors disabled:opacity-50",
            required
              ? "border-primary/40 bg-primary/10 text-foreground"
              : "border-input bg-transparent text-muted-foreground",
          )}
        >
          {required ? "Required" : "Optional"}
        </button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          aria-label={`Delete ${name}`}
          disabled={readOnly}
          onClick={onRemove}
        >
          <Trash2 />
        </Button>
      </div>
      {expanded && (
        <div className="border-t p-3">
          <NodeBody schema={schema} label={name} readOnly={readOnly} onChange={onChange} />
        </div>
      )}
    </div>
  );
}

/** Everything about one schema node except its name: description, allowed values, nested fields or items. */
function NodeBody({
  schema,
  label,
  readOnly,
  onChange,
}: TreeProps & { schema: SchemaNode; label: string; onChange: OnChange }) {
  const type = schema.type as string;
  return (
    <div className="space-y-3">
      <Input
        aria-label={`Description of ${label}`}
        placeholder="Description (optional)"
        className="h-8"
        value={typeof schema.description === "string" ? schema.description : ""}
        disabled={readOnly}
        onChange={(event) => {
          const { description: _old, ...rest } = schema;
          onChange(event.target.value === "" ? rest : { ...rest, description: event.target.value }, {
            coalesce: `description:${label}`,
          });
        }}
      />
      {(type === "string" || type === "integer" || type === "number") && (
        <EnumEditor
          label={label}
          type={type}
          values={Array.isArray(schema.enum) ? schema.enum : []}
          readOnly={readOnly}
          onChange={(values) => {
            const { enum: _old, ...rest } = schema;
            onChange(values.length ? { ...rest, enum: values } : rest);
          }}
        />
      )}
      {type === "object" && (
        <div className="ml-2 border-l pl-3">
          <ObjectFields node={schema} scope={label} readOnly={readOnly} onChange={onChange} />
        </div>
      )}
      {type === "array" && (
        <ItemsEditor
          schema={schema}
          label={label}
          readOnly={readOnly}
          onChange={onChange}
        />
      )}
    </div>
  );
}

function ItemsEditor({
  schema,
  label,
  readOnly,
  onChange,
}: TreeProps & { schema: SchemaNode; label: string; onChange: OnChange }) {
  const [expanded, setExpanded] = useState(false);
  const items = schema.items as SchemaNode;
  const itemsLabel = `${label} items`;
  return (
    <div className="ml-2 space-y-2 border-l pl-3">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          aria-label={`${expanded ? "Collapse" : "Expand"} ${itemsLabel}`}
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? <ChevronDown /> : <ChevronRight />}
        </Button>
        <span className="text-sm text-muted-foreground">Items</span>
        <TypeSelect
          value={items.type as string}
          label={`Type of ${itemsLabel}`}
          disabled={readOnly}
          onChange={(type) => onChange({ ...schema, items: changeType(items, type) })}
        />
      </div>
      {expanded && (
        <NodeBody
          schema={items}
          label={itemsLabel}
          readOnly={readOnly}
          onChange={(next, options) => onChange({ ...schema, items: next }, options)}
        />
      )}
    </div>
  );
}
