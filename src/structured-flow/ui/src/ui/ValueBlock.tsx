import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const LIMIT = 20_000;

/** A stage output or any JSON-like value, as text; long values are cut with "Show all". */
export function ValueBlock({ value, className }: { value: unknown; className?: string }) {
  const [all, setAll] = useState(false);
  if (value === null || value === undefined) {
    return <p className="text-sm text-muted-foreground">No output yet.</p>;
  }
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  const shown = all || text.length <= LIMIT ? text : text.slice(0, LIMIT);
  return (
    <div className="space-y-2">
      <pre
        data-testid="value"
        className={cn(
          "max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 font-mono text-[13px] leading-5",
          className,
        )}
      >
        {shown}
      </pre>
      {shown.length < text.length && (
        <Button variant="link" size="sm" className="h-auto p-0" onClick={() => setAll(true)}>
          Show all
        </Button>
      )}
    </div>
  );
}
