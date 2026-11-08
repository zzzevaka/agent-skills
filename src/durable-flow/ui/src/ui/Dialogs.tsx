import type { StoreApi } from "zustand";
import type { PersistenceState } from "../io/persistence";
import { useFlowStore } from "../store/flowStore";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "./ConfirmDialog";
import { usePersistence, usePersistenceApi } from "./persistenceContext";

function Conflict({ api, diskRevision }: { api: StoreApi<PersistenceState>; diskRevision: number }) {
  const baseline = useFlowStore((s) => s.baseline.revision);
  const resolve = api.getState().resolveConflict;
  const choose = (choice: Parameters<typeof resolve>[0]) => (event: { preventDefault(): void }) => {
    event.preventDefault();
    void resolve(choice);
  };

  return (
    <AlertDialog open onOpenChange={(open) => !open && void resolve("cancel")}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>The file changed on disk</AlertDialogTitle>
          <AlertDialogDescription>
            {`Revision ${diskRevision} is on disk, but your changes are based on revision ${baseline}. Another writer, probably an agent, saved the flow in the meantime.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className={cn(buttonVariants({ variant: "outline" }))}
            onClick={choose("reload")}
          >
            Reload (discard my changes)
          </AlertDialogAction>
          <AlertDialogAction
            className={cn(buttonVariants({ variant: "outline" }))}
            onClick={choose("copy")}
          >
            Save a copy…
          </AlertDialogAction>
          <AlertDialogAction
            className={cn(buttonVariants({ variant: "destructive" }))}
            onClick={choose("overwrite")}
          >
            {`Overwrite (revision ${diskRevision + 1})`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function Active({ api }: { api: StoreApi<PersistenceState> }) {
  const conflict = usePersistence(api, (s) => s.conflict);
  const confirm = usePersistence(api, (s) => s.confirm);
  return (
    <>
      {conflict && <Conflict api={api} diskRevision={conflict.diskRevision} />}
      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          confirmLabel={confirm.confirmLabel}
          onCancel={() => api.getState().cancelConfirm()}
          onConfirm={() => void confirm.onConfirm()}
        >
          <p>{confirm.body}</p>
        </ConfirmDialog>
      )}
    </>
  );
}

export function Dialogs() {
  const api = usePersistenceApi();
  return api ? <Active api={api} /> : null;
}
