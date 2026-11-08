import { useEffect, useMemo, useState } from "react";
import { realDeps, type Deps } from "../io/deps";
import { bootstrap, type BootResult } from "../io/bootstrap";
import { createPersistence } from "../io/persistence";
import { createFlowStore, FlowStoreProvider } from "../store/flowStore";
import { App } from "./App";
import { Dialogs } from "./Dialogs";
import { PersistenceProvider } from "./persistenceContext";
import { StartScreen } from "./StartScreen";

type State = { boot: BootResult } | { error: string } | null;

function Session({ boot, deps }: { boot: BootResult; deps: Deps }) {
  const [{ store, persistence }] = useState(() => {
    const flowStore = createFlowStore(boot.initial);
    return {
      store: flowStore,
      persistence: createPersistence({
        store: flowStore,
        adapter: boot.adapter,
        notice: boot.notice,
        needsPermission: boot.needsPermission,
        deps,
      }),
    };
  });
  const [started, setStarted] = useState(boot.started);

  /** Run a file action from the start screen; continue to the editor when a file got loaded. */
  const startAfter = async (action: () => Promise<void>) => {
    await action();
    if (store.getState().source !== null) setStarted(true);
  };

  return (
    <FlowStoreProvider store={store}>
      <PersistenceProvider api={persistence}>
        {started ? (
          <App onSave={() => void persistence.getState().save()} />
        ) : (
          <StartScreen
            rememberedName={boot.needsPermission ? (boot.adapter?.name ?? null) : null}
            fsSupported={deps.fsSupported}
            onOpen={() => void startAfter(() => persistence.getState().openFile())}
            onReopen={() => void startAfter(() => persistence.getState().reload())}
            onNew={() => setStarted(true)}
          />
        )}
        <Dialogs />
      </PersistenceProvider>
    </FlowStoreProvider>
  );
}

/** Restores the last opened file if the browser allows, then shows the editor or the start screen. */
export function Root({ deps }: { deps?: Deps }) {
  const resolved = useMemo(() => deps ?? realDeps(), [deps]);
  const [state, setState] = useState<State>(null);

  useEffect(() => {
    let cancelled = false;
    bootstrap(resolved).then(
      (boot) => !cancelled && setState({ boot }),
      (err) => !cancelled && setState({ error: err instanceof Error ? err.message : String(err) }),
    );
    return () => {
      cancelled = true;
    };
  }, [resolved]);

  if (state === null) return <p role="status" className="p-6 text-sm text-muted-foreground">Loading…</p>;
  if ("error" in state) {
    return (
      <p role="alert" className="p-6 text-sm text-destructive">
        {`This page could not start: ${state.error}`}
      </p>
    );
  }
  return <Session boot={state.boot} deps={resolved} />;
}
