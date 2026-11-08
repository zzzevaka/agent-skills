import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { json } from "@codemirror/lang-json";
import { yaml } from "@codemirror/lang-yaml";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { Annotation, EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { useEffect, useRef } from "react";

export interface CodeEditorProps {
  value: string;
  language: "yaml" | "json" | "text";
  ariaLabel: string;
  onChange(value: string): void;
  onBlur?(): void;
}

/** Marks changes that came from the `value` prop, so they are not reported back. */
const External = Annotation.define<boolean>();

const highlight = HighlightStyle.define([
  { tag: tags.propertyName, color: "hsl(var(--hl-key))" },
  { tag: [tags.string, tags.special(tags.string)], color: "hsl(var(--hl-string))" },
  { tag: [tags.number, tags.bool, tags.null], color: "hsl(var(--hl-number))" },
  { tag: tags.comment, color: "hsl(var(--muted-foreground))", fontStyle: "italic" },
  { tag: [tags.keyword, tags.atom], color: "hsl(var(--hl-number))" },
]);

const theme = EditorView.theme({
  "&": {
    backgroundColor: "hsl(var(--muted))",
    color: "hsl(var(--foreground))",
    borderRadius: "calc(var(--radius) - 2px)",
    fontSize: "13px",
  },
  "&.cm-focused": { outline: "1px solid hsl(var(--ring))" },
  ".cm-content": {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    padding: "10px 4px",
    caretColor: "hsl(var(--foreground))",
  },
  ".cm-cursor": { borderLeftColor: "hsl(var(--foreground))" },
  ".cm-scroller": { maxHeight: "420px", overflow: "auto" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
    backgroundColor: "hsl(var(--primary) / 0.3)",
  },
});

function languageExtension(language: CodeEditorProps["language"]): Extension {
  if (language === "yaml") return yaml();
  if (language === "json") return json();
  return [];
}

export function CodeEditor({ value, language, ariaLabel, onChange, onBlur }: CodeEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const latest = useRef({ value, onChange, onBlur });
  latest.current = { value, onChange, onBlur };

  useEffect(() => {
    const editor = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: latest.current.value,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          EditorView.lineWrapping,
          languageExtension(language),
          syntaxHighlighting(highlight),
          theme,
          EditorView.contentAttributes.of({ "aria-label": ariaLabel }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !update.transactions.some((t) => t.annotation(External))) {
              latest.current.onChange(update.state.doc.toString());
            }
          }),
          EditorView.domEventHandlers({
            blur: () => {
              latest.current.onBlur?.();
            },
          }),
        ],
      }),
    });
    view.current = editor;
    return () => {
      editor.destroy();
      view.current = null;
    };
  }, [language, ariaLabel]);

  useEffect(() => {
    const editor = view.current;
    if (editor && editor.state.doc.toString() !== value) {
      editor.dispatch({
        changes: { from: 0, to: editor.state.doc.length, insert: value },
        annotations: External.of(true),
      });
    }
  }, [value]);

  return <div className="code-editor" ref={host} />;
}
