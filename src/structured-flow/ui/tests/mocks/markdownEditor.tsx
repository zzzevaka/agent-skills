import { createElement } from "react";

/** jsdom cannot run ProseMirror: stand-in for MarkdownEditor with the same props (Playwright covers the real one). Commits on blur. */
export function MarkdownEditor({
  value,
  ariaLabel,
  placeholder,
  onCommit,
}: {
  value: string;
  ariaLabel: string;
  placeholder: string;
  onCommit: (markdown: string) => void;
}) {
  return createElement("textarea", {
    key: value,
    "aria-label": ariaLabel,
    placeholder,
    defaultValue: value,
    onBlur: (event: { currentTarget: HTMLTextAreaElement }) => {
      if (event.currentTarget.value !== value) onCommit(event.currentTarget.value);
    },
  });
}
