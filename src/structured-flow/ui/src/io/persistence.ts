import { createStore, type StoreApi } from "zustand/vanilla";
import { invariantErrors } from "../domain/flow";
import { formatFromName, serializeFlow, type FileFormat } from "../domain/serialize";
import type { Flow } from "../domain/types";
import type { FlowState } from "../store/flowStore";
import type { FlowFileAdapter } from "./adapter";
import { LAST_FILE_KEY, blankInit, type Notice } from "./bootstrap";
import type { Deps } from "./deps";

export type { Deps };
import { flowFromText, readFlowFrom } from "./readFlow";

export type ConflictChoice = "overwrite" | "reload" | "copy" | "cancel";

export interface Confirmation {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm(): Promise<void>;
}

export interface PersistenceState {
  adapter: FlowFileAdapter | null;
  fsSupported: boolean;
  notice: Notice | null;
  /** The file on disk is at another revision than this page was based on. */
  conflict: { diskRevision: number } | null;
  confirm: Confirmation | null;
  needsPermission: boolean;
  busy: boolean;
  save(): Promise<void>;
  saveAs(): Promise<void>;
  newFlow(): Promise<void>;
  reload(): Promise<void>;
  openFile(): Promise<void>;
  resolveConflict(choice: ConflictChoice): Promise<void>;
  cancelConfirm(): void;
  dismissNotice(): void;
}

export interface PersistenceInit {
  store: StoreApi<FlowState>;
  adapter: FlowFileAdapter | null;
  notice: Notice | null;
  needsPermission: boolean;
  deps: Deps;
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));
const isAbort = (err: unknown) =>
  typeof err === "object" && err !== null && (err as { name?: unknown }).name === "AbortError";

function suggestedName(name: string, format: FileFormat): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "flow"}.${format}`;
}

const basename = (path: string) => path.split(/[\\/]/).pop() || path;

export function createPersistence(init: PersistenceInit): StoreApi<PersistenceState> {
  const { store, deps } = init;

  return createStore<PersistenceState>()((set, get) => {
    const info = (text: string) => set({ notice: { kind: "info", text } });
    const fail = (text: string) => set({ notice: { kind: "error", text } });

    const rememberFile = (adapter: FlowFileAdapter) => deps.rememberHandle(LAST_FILE_KEY, adapter);

    const adopt = (adapter: FlowFileAdapter | null, source: string, format: FileFormat) => {
      set({ adapter });
      store.getState().setFile({ source, format });
    };

    /** Load `adapter`'s file into the page (asking for permission if needed). */
    const loadFrom = async (adapter: FlowFileAdapter) => {
      if ((await deps.hasPermission(adapter, "read")) !== "granted") {
        if ((await deps.requestPermission(adapter, "read")) !== "granted") {
          throw new Error(`Permission to read ${adapter.name} was not granted`);
        }
      }
      const { flow, format } = await readFlowFrom(adapter, store.getState().format);
      store.getState().replaceFromDisk(flow);
      store.getState().setFile({ source: store.getState().source ?? adapter.name, format });
      set({ needsPermission: false });
      return flow;
    };

    const guarded = async (work: () => Promise<void>) => {
      if (get().busy) return;
      set({ busy: true });
      try {
        await work();
      } catch (err) {
        if (!isAbort(err)) fail(message(err));
      } finally {
        set({ busy: false });
      }
    };

    /** Run `work`, after confirming when that would throw away unsaved edits. */
    const discardingEdits = async (title: string, work: () => Promise<void>) => {
      if (!store.getState().dirty) return guarded(work);
      set({
        confirm: {
          title,
          body: "Your unsaved changes will be lost.",
          confirmLabel: "Discard changes",
          onConfirm: async () => {
            set({ confirm: null });
            await guarded(work);
          },
        },
      });
    };

    const writeCopy = async () => {
      const { draft, format } = store.getState();
      const savedFrom = draft;
      const candidate: Flow = { ...draft, revision: store.getState().nextRevision() };
      const errors = invariantErrors(candidate);
      if (errors.length) return fail(errors.join("; "));
      const adapter = await deps.saveAs(
        suggestedName(candidate.name, format),
        serializeFlow(candidate, format),
      );
      const savedFormat = formatFromName(adapter.name) ?? format;
      store.getState().markSaved(candidate, savedFrom);
      adopt(adapter, adapter.name, savedFormat);
      await rememberFile(adapter);
      info(`Saved ${adapter.name} (revision ${candidate.revision})`);
    };

    /** Writing needs a permission the browser may ask for again after a reload. */
    const ensureWritable = async (adapter: FlowFileAdapter) => {
      if (adapter.kind !== "handle") return;
      if ((await deps.hasPermission(adapter, "readwrite")) === "granted") return;
      if ((await deps.requestPermission(adapter, "readwrite")) !== "granted") {
        throw new Error(`Permission to write ${adapter.name} was not granted`);
      }
    };

    const afterSave = (adapter: FlowFileAdapter, saved: Flow, savedFrom: Flow) => {
      store.getState().markSaved(saved, savedFrom);
      info(
        adapter.kind === "download"
          ? `Downloaded ${adapter.name} (revision ${saved.revision}). Put it in place of the original file.`
          : `Saved ${adapter.name} (revision ${saved.revision})`,
      );
    };

    const doSave = async () => {
      const state = store.getState();
      if (!state.dirty || state.errors.length) return;
      let adapter = get().adapter;

      if (!adapter) {
        if (!deps.fsSupported) {
          adapter = deps.downloadAdapter(
            state.source ? basename(state.source) : suggestedName(state.draft.name, state.format),
          );
        } else {
          return writeCopy();
        }
      }

      await ensureWritable(adapter);
      const savedFrom = state.draft;
      const result = await deps.saveFlow({
        adapter,
        draft: savedFrom,
        baselineRevision: state.baseline.revision,
        revision: state.nextRevision(),
        format: state.format,
      });
      if (result.ok) return afterSave(adapter, result.saved, savedFrom);
      if (result.reason === "conflict") return set({ conflict: { diskRevision: result.diskRevision } });
      fail(result.reason === "invalid" ? result.errors.join("; ") : result.message);
    };

    return {
      adapter: init.adapter,
      fsSupported: deps.fsSupported,
      notice: init.notice,
      conflict: null,
      confirm: null,
      needsPermission: init.needsPermission,
      busy: false,

      save: () => guarded(doSave),
      saveAs: () => guarded(writeCopy),

      reload: async () => {
        const adapter = get().adapter;
        if (!adapter || adapter.kind !== "handle") return;
        await discardingEdits("Reload from file?", async () => {
          const flow = await loadFrom(adapter);
          info(`Reloaded ${adapter.name} (revision ${flow.revision})`);
        });
      },

      openFile: async () => {
        await discardingEdits("Open another file?", async () => {
          if (deps.fsSupported) {
            const adapter = await deps.connectFile();
            const { flow, format } = await readFlowFrom(adapter, store.getState().format);
            store.getState().replaceFromDisk(flow);
            adopt(adapter, adapter.name, format);
            await rememberFile(adapter);
            info(`Opened ${adapter.name} (revision ${flow.revision})`);
          } else {
            const file = await deps.pickFile();
            if (!file) return;
            const { flow, format } = flowFromText(file.text, file.name, store.getState().format);
            store.getState().replaceFromDisk(flow);
            adopt(null, file.name, format);
            info(`Opened ${file.name}. This browser cannot save in place: Save downloads a copy.`);
          }
        });
      },

      newFlow: async () => {
        await discardingEdits("Start a new flow?", async () => {
          const blank = blankInit();
          store.getState().replaceFromDisk(blank.flow);
          store.getState().setFile({ source: blank.source, format: blank.format });
          set({ adapter: null, notice: null, needsPermission: false });
        });
      },

      resolveConflict: async (choice) => {
        const conflict = get().conflict;
        if (!conflict) return;
        set({ conflict: null });
        if (choice === "cancel") return;
        const adapter = get().adapter;
        if (choice === "copy") return guarded(writeCopy);
        if (!adapter) return;
        if (choice === "reload") {
          return guarded(async () => {
            const flow = await loadFrom(adapter);
            info(`Reloaded ${adapter.name} (revision ${flow.revision})`);
          });
        }
        await guarded(async () => {
          await ensureWritable(adapter);
          const state = store.getState();
          const savedFrom = state.draft;
          const result = await deps.saveFlow({
            adapter,
            draft: savedFrom,
            baselineRevision: state.baseline.revision,
            revision: conflict.diskRevision + 1,
            format: state.format,
            skipCheck: true,
          });
          if (result.ok) afterSave(adapter, result.saved, savedFrom);
          else fail(result.reason === "invalid" ? result.errors.join("; ") : (result as { message: string }).message);
        });
      },

      cancelConfirm: () => set({ confirm: null }),
      dismissNotice: () => set({ notice: null }),
    };
  });
}
