import { useEffect } from "react";
import { useFlowStoreApi } from "../store/flowStore";

const TEXT_FIELD = "input, textarea, select, [contenteditable='true'], .cm-editor";

/** Ctrl/Cmd+S saves; Ctrl/Cmd+Z / Shift+Z / Y undo and redo outside text fields. */
export function useShortcuts(onSave: () => void): void {
  const store = useFlowStoreApi();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key === "s") {
        event.preventDefault();
        // Leaving the focused field commits what is typed in it before saving.
        (document.activeElement as HTMLElement | null)?.blur?.();
        if (store.getState().dirty) onSave();
        return;
      }
      if ((event.target as Element | null)?.closest?.(TEXT_FIELD)) return;
      if (key === "z") {
        event.preventDefault();
        if (event.shiftKey) store.getState().redo();
        else store.getState().undo();
      } else if (key === "y") {
        event.preventDefault();
        store.getState().redo();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [store, onSave]);
}

/** Ask the browser to confirm leaving while there are unsaved changes. */
export function useBeforeUnload(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [active]);
}
