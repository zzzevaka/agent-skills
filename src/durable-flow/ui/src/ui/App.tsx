import { useFlowStore } from "../store/flowStore";
import { AppShell } from "./AppShell";
import { useBeforeUnload, useShortcuts } from "./useShortcuts";

export function App({ onSave = () => {} }: { onSave?: () => void }) {
  const dirty = useFlowStore((s) => s.dirty);
  useShortcuts(onSave);
  useBeforeUnload(dirty);
  return <AppShell onSave={onSave} />;
}
