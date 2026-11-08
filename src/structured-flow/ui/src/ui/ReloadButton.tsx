import { RefreshCw } from "lucide-react";
import type { StoreApi } from "zustand";
import type { PersistenceState } from "../io/persistence";
import { Button } from "@/components/ui/button";
import { usePersistence, usePersistenceApi } from "./persistenceContext";

function Reload({ api }: { api: StoreApi<PersistenceState> }) {
  const adapter = usePersistence(api, (s) => s.adapter);
  const busy = usePersistence(api, (s) => s.busy);
  if (adapter?.kind !== "handle") return null;
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 gap-1.5 px-2 text-xs"
      disabled={busy}
      aria-label="Reload from file"
      title="Reload from file"
      onClick={() => void api.getState().reload()}
    >
      <RefreshCw aria-hidden="true" />
      <span className="max-sm:sr-only">Reload</span>
    </Button>
  );
}

/** Re-reads the open file (shown only when the page can read it back). */
export function ReloadButton() {
  const api = usePersistenceApi();
  return api ? <Reload api={api} /> : null;
}
