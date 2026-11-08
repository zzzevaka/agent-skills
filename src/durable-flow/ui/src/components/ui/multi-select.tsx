import { Plus, X } from "lucide-react";
import * as React from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface MultiSelectOption {
  value: string;
  /** Text shown for the value; defaults to the value. */
  label?: string;
}

export interface MultiSelectProps {
  /** Names the picker for assistive technology ("Dependencies"). */
  label: string;
  options: MultiSelectOption[];
  value: string[];
  onChange(next: string[]): void;
  placeholder?: string;
  /** Shown instead of the picker when there is nothing to choose, and in the list once everything is chosen. */
  emptyText: string;
  className?: string;
}

/**
 * Pick any number of values: the chosen ones are chips you can remove, and a button
 * opens a searchable list of the rest. The result keeps the order of `options`.
 */
export function MultiSelect({
  label,
  options,
  value,
  onChange,
  placeholder = "Add",
  emptyText,
  className,
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const chosen = new Set(value);
  const text = (option: MultiSelectOption) => option.label ?? option.value;
  const available = options.filter(
    (option) => !chosen.has(option.value) && text(option).toLowerCase().includes(query.trim().toLowerCase()),
  );
  const left = options.some((option) => !chosen.has(option.value));

  const change = (next: Set<string>) =>
    onChange(options.filter((option) => next.has(option.value)).map((option) => option.value));
  const add = (option: MultiSelectOption) => change(new Set([...value, option.value]));
  const remove = (name: string) => change(new Set(value.filter((v) => v !== name)));

  if (options.length === 0 && value.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {value.map((name) => {
        const option = options.find((o) => o.value === name);
        return (
          <span
            key={name}
            className="inline-flex max-w-full items-center gap-1 rounded-md border bg-secondary py-0.5 pl-2 pr-1 text-sm"
          >
            <span className="truncate">{option ? text(option) : name}</span>
            <button
              type="button"
              aria-label={`Remove ${name}`}
              className="rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              onClick={() => remove(name)}
            >
              <X className="size-3" />
            </button>
          </span>
        );
      })}
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setQuery("");
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            role="combobox"
            aria-label={label}
            aria-expanded={open}
            aria-haspopup="listbox"
            className="inline-flex h-7 items-center gap-1 rounded-md border border-dashed px-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <Plus className="size-3.5" />
            {placeholder}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 space-y-2 p-2">
          {left && (
            <input
              aria-label={`Search ${label}`}
              placeholder="Search"
              value={query}
              autoFocus
              className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && available[0]) {
                  event.preventDefault();
                  add(available[0]);
                  setQuery("");
                }
              }}
            />
          )}
          {left ? (
            <div role="listbox" aria-label={label} className="max-h-56 overflow-auto">
              {available.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected="false"
                  className="flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                  onClick={() => add(option)}
                >
                  {text(option)}
                </button>
              ))}
              {available.length === 0 && (
                <p className="px-2 py-1.5 text-sm text-muted-foreground">No match.</p>
              )}
            </div>
          ) : (
            <p className="px-2 py-1 text-sm text-muted-foreground">{emptyText}</p>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
