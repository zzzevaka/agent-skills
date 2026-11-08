import { NativeSelect } from "@/components/ui/native-select";
import { SCHEMA_TYPES, type SchemaType } from "../../domain/schemaEdit";
import { cn } from "@/lib/utils";

interface Props {
  value: string;
  label: string;
  disabled?: boolean;
  className?: string;
  onChange(type: SchemaType): void;
}

export function TypeSelect({ value, label, disabled, className, onChange }: Props) {
  return (
    <NativeSelect
      aria-label={label}
      value={value}
      disabled={disabled}
      className={cn("h-8 w-28 shrink-0 font-mono text-xs", className)}
      onChange={(event) => onChange(event.target.value as SchemaType)}
    >
      {SCHEMA_TYPES.map((type) => (
        <option key={type} value={type}>
          {type}
        </option>
      ))}
    </NativeSelect>
  );
}
