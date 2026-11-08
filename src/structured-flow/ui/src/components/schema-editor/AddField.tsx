import { Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SchemaType } from "../../domain/schemaEdit";
import { TypeSelect } from "./TypeSelect";

interface Props {
  /** Name of the object the field goes into; empty for the root. Makes the labels unique. */
  scope?: string;
  existing: string[];
  readOnly: boolean;
  onAdd(name: string, type: SchemaType, required: boolean): void;
}

/** One line: name, type, required, Add. Enter in the name box adds too. */
export function AddField({ scope, existing, readOnly, onAdd }: Props) {
  const [name, setName] = useState("");
  const [type, setType] = useState<SchemaType>("string");
  const [required, setRequired] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const in_ = scope ? ` in ${scope}` : "";

  const submit = () => {
    if (name.trim() === "") return setError("Enter a field name.");
    if (existing.includes(name)) return setError(`A field named "${name}" already exists.`);
    onAdd(name, type, required);
    setName("");
    setError(null);
  };

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label={`Field name${in_}`}
          placeholder="Field name"
          className="h-8 min-w-0 flex-1 basis-32"
          value={name}
          disabled={readOnly}
          onChange={(event) => {
            setName(event.target.value);
            setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submit();
            }
          }}
        />
        <TypeSelect value={type} label={`Field type${in_}`} disabled={readOnly} onChange={setType} />
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            aria-label={`New field is required${in_}`}
            checked={required}
            disabled={readOnly}
            onChange={(event) => setRequired(event.target.checked)}
          />
          Required
        </label>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8"
          disabled={readOnly}
          aria-label={scope ? `Add field to ${scope}` : "Add field"}
          onClick={submit}
        >
          <Plus /> Add field
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
