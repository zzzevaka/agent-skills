import { Crepe } from "@milkdown/crepe";
import { remarkStringifyOptionsCtx } from "@milkdown/kit/core";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
import { useEffect, useRef, useState } from "react";

import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";

export interface MarkdownEditorProps {
  /**
   * The text in the document. The editor owns it while the user types; when the value
   * changes from outside (undo, discard, reload, another stage) the editor starts over from it.
   */
  value: string;
  ariaLabel: string;
  /** Shown while the text is empty. */
  placeholder: string;
  /** Called with the new Markdown after the user edited it (shortly after typing stops, and on blur). */
  onCommit: (markdown: string) => void;
}

const trimEnd = (markdown: string) => markdown.replace(/\n+$/, "");

function Editor({
  value,
  placeholder,
  onCommit,
  lastKnown,
}: {
  value: string;
  placeholder: string;
  onCommit: (m: string) => void;
  lastKnown: { current: string };
}) {
  const crepeRef = useRef<Crepe | null>(null);
  // What the editor last agreed on with the document: its own re-serialisation of the
  // untouched text is not an edit, so the first reading after mount is the baseline.
  const committed = useRef<string | null>(null);
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;

  /** Hand the text to the document if the user changed it. Milkdown's own change event is debounced. */
  const commit = () => {
    const crepe = crepeRef.current;
    if (!crepe || committed.current === null) return;
    let markdown: string;
    try {
      markdown = trimEnd(crepe.getMarkdown());
    } catch {
      return; // not created yet, or already destroyed
    }
    if (markdown === committed.current) return;
    committed.current = markdown;
    lastKnown.current = markdown;
    onCommitRef.current(markdown);
  };

  useEditor((root) => {
    const crepe = new Crepe({
      root,
      defaultValue: value,
      // No LaTeX, image upload, AI, top bar or language-heavy code blocks: the page is one offline file.
      features: {
        [Crepe.Feature.Latex]: false,
        [Crepe.Feature.ImageBlock]: false,
        [Crepe.Feature.AI]: false,
        [Crepe.Feature.TopBar]: false,
        [Crepe.Feature.CodeMirror]: false,
      },
      featureConfigs: { [Crepe.Feature.Placeholder]: { text: placeholder, mode: "doc" } },
    });
    // Write Markdown the way the prompts are usually written ("- " bullets) so that
    // an edit does not rewrite every list in the text.
    crepe.editor.config((ctx) => {
      ctx.update(remarkStringifyOptionsCtx, (previous) => ({
        ...previous,
        bullet: "-" as const,
        listItemIndent: "one" as const,
        rule: "-" as const,
        emphasis: "*" as const,
        strong: "*" as const,
      }));
    });
    crepe.on((listener) => {
      listener.mounted(() => {
        committed.current = trimEnd(crepe.getMarkdown());
      });
      listener.markdownUpdated(commit);
    });
    crepeRef.current = crepe;
    return crepe;
  }, []);

  return (
    <div onBlur={commit}>
      <Milkdown />
    </div>
  );
}

/** WYSIWYG Markdown editor (Milkdown Crepe) that always shows the text as editable page content. */
export function MarkdownEditor({ value, ariaLabel, placeholder, onCommit }: MarkdownEditorProps) {
  const lastKnown = useRef(value);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (value !== lastKnown.current) {
      lastKnown.current = value;
      setVersion((v) => v + 1);
    }
  }, [value]);
  return (
    <MilkdownProvider key={version}>
      <div role="group" aria-label={ariaLabel} className="markdown-editor">
        <Editor value={value} placeholder={placeholder} onCommit={onCommit} lastKnown={lastKnown} />
      </div>
    </MilkdownProvider>
  );
}
