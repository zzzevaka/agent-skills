import { FilePlus2, FolderOpen, RefreshCw, SaveAll } from "lucide-react";
import type { StoreApi } from "zustand";
import type { FileFormat } from "../domain/serialize";
import type { PersistenceState } from "../io/persistence";
import { useFlowStore, useFlowStoreApi } from "../store/flowStore";
import { Button } from "@/components/ui/button";
import { usePersistence, usePersistenceApi } from "./persistenceContext";

const label = "group-data-[collapsible=icon]:sr-only";
const action = "h-8 w-full justify-start gap-2 px-2 text-sm font-normal group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0";

function Actions({ api }: { api: StoreApi<PersistenceState> }) {
  const flowStore = useFlowStoreApi();
  const adapter = usePersistence(api, (s) => s.adapter);
  const fsSupported = usePersistence(api, (s) => s.fsSupported);
  const busy = usePersistence(api, (s) => s.busy);
  const format = useFlowStore((s) => s.format);
  const source = useFlowStore((s) => s.source);
  const actions = api.getState();

  return (
    <div className="flex flex-col gap-0.5" role="toolbar" aria-label="File">
      <Button variant="ghost" className={action} disabled={busy} title="Open file" onClick={() => void actions.openFile()}>
        <FolderOpen />
        <span className={label}>Open file</span>
      </Button>
      {adapter?.kind === "handle" && (
        <Button variant="ghost" className={action} disabled={busy} title="Reload from file" onClick={() => void actions.reload()}>
          <RefreshCw />
          <span className={label}>Reload from file</span>
        </Button>
      )}
      {fsSupported && (
        <Button variant="ghost" className={action} disabled={busy} aria-label="Save as" title="Save as" onClick={() => void actions.saveAs()}>
          <SaveAll />
          <span className={label}>Save as…</span>
        </Button>
      )}
      <Button variant="ghost" className={action} disabled={busy} title="New flow" onClick={() => void actions.newFlow()}>
        <FilePlus2 />
        <span className={label}>New flow</span>
      </Button>
      {source === null && !adapter && (
        <select
          aria-label="File format"
          value={format}
          className="mt-1 h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm group-data-[collapsible=icon]:hidden"
          onChange={(event) => flowStore.getState().setFile({ source, format: event.target.value as FileFormat })}
        >
          <option value="yaml">YAML</option>
          <option value="json">JSON</option>
        </select>
      )}
    </div>
  );
}

export function FileActions() {
  const api = usePersistenceApi();
  return api ? <Actions api={api} /> : null;
}
