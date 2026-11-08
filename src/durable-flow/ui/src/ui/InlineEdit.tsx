import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
  value: string;
  inputLabel: string;
  buttonLabel: string;
  buttonTitle?: string;
  placeholder?: string;
  className?: string;
  onCommit(value: string): void;
}

/** Text that turns into an input on click; Enter or blur commits, Escape cancels. */
export function InlineEdit({
  value,
  inputLabel,
  buttonLabel,
  buttonTitle,
  placeholder,
  className,
  onCommit,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);
  const cancelled = useRef(false);

  const commit = () => {
    setEditing(false);
    if (cancelled.current) return;
    if (text !== value) onCommit(text);
  };

  if (editing) {
    return (
      <input
        className={cn(
          "h-8 w-full min-w-0 rounded-md border border-input bg-background px-2 font-[inherit] text-[length:inherit] font-semibold tracking-[inherit] shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          className,
        )}
        aria-label={inputLabel}
        value={text}
        autoFocus
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit();
          if (event.key === "Escape") {
            cancelled.current = true;
            setEditing(false);
          }
        }}
      />
    );
  }
  return (
    <button
      type="button"
      aria-label={buttonLabel}
      title={buttonTitle}
      className={cn(
        "-mx-1 max-w-full truncate rounded px-1 text-left font-[inherit] text-[length:inherit] font-semibold tracking-[inherit] transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      onClick={() => {
        cancelled.current = false;
        setText(value);
        setEditing(true);
      }}
    >
      {value || placeholder}
    </button>
  );
}
