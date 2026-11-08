import { Monitor, Moon, Sun } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { getThemeMode, setThemeMode, type ThemeMode } from "./theme";

const THEMES: { mode: ThemeMode; label: string; Icon: typeof Sun }[] = [
  { mode: "auto", label: "System theme", Icon: Monitor },
  { mode: "light", label: "Light theme", Icon: Sun },
  { mode: "dark", label: "Dark theme", Icon: Moon },
];

export function ThemeToggle({ className }: { className?: string }) {
  const [mode, setMode] = useState<ThemeMode>(getThemeMode);
  return (
    <div
      role="group"
      aria-label="Theme"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-lg bg-muted p-0.5 group-data-[collapsible=icon]:flex-col",
        className,
      )}
    >
      {THEMES.map(({ mode: value, label, Icon }) => (
        <button
          key={value}
          type="button"
          data-mode={value}
          title={label}
          aria-label={label}
          aria-pressed={mode === value}
          onClick={() => {
            setThemeMode(value);
            setMode(value);
          }}
          className={cn(
            "grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            mode === value && "bg-background text-foreground shadow-sm",
          )}
        >
          <Icon className="size-4" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
