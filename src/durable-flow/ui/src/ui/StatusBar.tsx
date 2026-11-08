import { useFlowStore } from "../store/flowStore";
import { Problems } from "./Problems";
import { ProgressSummary } from "./ProgressSummary";
import { RevisionBadge } from "./RevisionBadge";

export function StatusBar() {
  const lastError = useFlowStore((s) => s.lastError);
  return (
    <footer className="sticky bottom-0 z-10 flex items-center gap-4 border-t bg-background/95 px-4 py-1.5 text-xs backdrop-blur md:px-6">
      <Problems />
      {lastError && (
        <p role="alert" className="text-sm text-destructive">
          {lastError}
        </p>
      )}
      <div className="ml-auto flex items-center gap-4">
        <ProgressSummary />
        <RevisionBadge />
      </div>
    </footer>
  );
}
