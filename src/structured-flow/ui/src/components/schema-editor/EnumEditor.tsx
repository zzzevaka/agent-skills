import { X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Props {
  label: string;
  type: "string" | "integer" | "number";
  values: unknown[];
  readOnly: boolean;
  onChange(values: unknown[]): void;
}

function parse(type: Props["type"], text: string): unknown | undefined {
  if (type === "string") return text === "" ? undefined : text;
  const trimmed = text.trim();
  if (trimmed === "") return undefined;
  const number = Number(trimmed);
  if (!Number.isFinite(number)) return undefined;
  if (type === "integer" && !Number.isInteger(number)) return undefined;
  return number;
}

/** The allowed values of a string, integer or number field, as removable chips. */
export function EnumEditor({ label, type, values, readOnly, onChange }: Props) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const add = () => {
    const value = parse(type, text);
    if (value === undefined) {
      setError(text === "" ? "Enter a value." : `${JSON.stringify(text)} is not a valid ${type}.`);
      return;
    }
    setError(null);
    setText("");
    if (!values.some((existing) => existing === value)) onChange([...values, value]);
  };

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">Allowed values (optional)</p>
      <div className="flex flex-wrap items-center gap-1.5">
        {values.map((value) => (
          <span
            key={String(value)}
            className="inline-flex items-center gap-1 rounded-md border bg-muted px-2 py-0.5 font-mono text-xs"
          >
            {String(value)}
            <button
              type="button"
              aria-label={`Remove ${String(value)}`}
              className="rounded text-muted-foreground hover:text-foreground disabled:opacity-50"
              disabled={readOnly}
              onClick={() => onChange(values.filter((other) => other !== value))}
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        <Input
          aria-label={`Enum value of ${label}`}
          placeholder="Add a value"
          className="h-7 w-36 text-xs"
          value={text}
          disabled={readOnly}
          onChange={(event) => {
            setText(event.target.value);
            setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs"
          aria-label={`Add value to ${label}`}
          disabled={readOnly}
          onClick={add}
        >
          Add value
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
