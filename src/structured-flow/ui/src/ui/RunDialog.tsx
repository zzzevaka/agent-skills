import { Check, Copy, Download } from "lucide-react";
import { useEffect, useState } from "react";
import { serializeFlow } from "../domain/serialize";
import { downloadText } from "../io/download";
import { useFlowStore } from "../store/flowStore";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HARNESSES, installCommand, runCommands, runFileName, type HarnessId } from "./runCommands";

const STORAGE_KEY = "structured-flow:harness";

function storedHarness(): HarnessId {
  try {
    const id = localStorage.getItem(STORAGE_KEY);
    if (HARNESSES.some((h) => h.id === id)) return id as HarnessId;
  } catch {
    // Storage can be blocked; the default is fine.
  }
  return "opencode";
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-7 shrink-0"
      aria-label={copied ? `${label}: copied` : label}
      title="Copy"
      onClick={() => {
        navigator.clipboard?.writeText(text).then(
          () => setCopied(true),
          () => {},
        );
      }}
    >
      {copied ? <Check /> : <Copy />}
    </Button>
  );
}

function Command({ label, command }: { label: string; command: string }) {
  return (
    <div className="flex items-center gap-1 rounded-md border bg-muted/50 py-1 pl-3 pr-1">
      <code className="min-w-0 flex-1 whitespace-pre-wrap break-all py-1 font-mono text-xs" aria-label={label}>
        {command}
      </code>
      <CopyButton text={command} label={`Copy ${label.toLowerCase()}`} />
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2" aria-label={title}>
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <span
          aria-hidden="true"
          className="grid size-5 place-items-center rounded-full bg-primary text-xs text-primary-foreground"
        >
          {n}
        </span>
        {title}
      </h3>
      {children}
    </section>
  );
}

export function RunDialog({ onClose }: { onClose(): void }) {
  const baseline = useFlowStore((s) => s.baseline);
  const format = useFlowStore((s) => s.format);
  const source = useFlowStore((s) => s.source);
  const dirty = useFlowStore((s) => s.dirty);
  const [harnessId, setHarnessId] = useState(storedHarness);

  const harness = HARNESSES.find((h) => h.id === harnessId) ?? HARNESSES[0];
  const file = runFileName(source, format);
  const choose = (id: string) => {
    setHarnessId(id as HarnessId);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // Remembering the choice is a convenience only.
    }
  };

  return (
    <AlertDialog open onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent className="max-h-[90svh] max-w-2xl grid-cols-[minmax(0,1fr)] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>How to run this flow</AlertDialogTitle>
          <AlertDialogDescription>
            An agent runs the flow with the structured-flow skill, one stage at a time.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <Tabs value={harnessId} onValueChange={choose}>
          <TabsList aria-label="Agent">
            {HARNESSES.map((h) => (
              <TabsTrigger key={h.id} value={h.id}>
                {h.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <Step n={1} title="Install the skill">
          <Command label="Install command" command={installCommand(harness)} />
        </Step>

        <Step n={2} title="Download the flow file">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => downloadText(file, serializeFlow(baseline, format))}>
              <Download aria-hidden="true" />
              {`Download ${file}`}
            </Button>
            {dirty && (
              <p role="status" className="text-xs text-muted-foreground">
                Unsaved changes are not in the file. Save first.
              </p>
            )}
          </div>
        </Step>

        <Step n={3} title="Start the run">
          <p className="text-sm text-muted-foreground">Replace path/to with the folder where you saved the file, then run:</p>
          {runCommands(harness, `path/to/${file}`).map((c) => (
            <div key={c.label} className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">{c.label}</span>
              <Command label={c.label} command={c.command} />
            </div>
          ))}
        </Step>

        <AlertDialogFooter>
          <AlertDialogCancel>Close</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
