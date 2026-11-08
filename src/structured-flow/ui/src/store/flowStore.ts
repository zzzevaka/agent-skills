import { createContext, createElement, useContext, type ReactNode } from "react";
import { useStore, type StoreApi } from "zustand";
import { createStore } from "zustand/vanilla";
import { invariantErrors } from "../domain/flow";
import { OpError } from "../domain/ops";
import { parseText, type FileFormat } from "../domain/serialize";
import type { Flow, SchemaNode } from "../domain/types";
import { runtimeWarnings, type Warning } from "../domain/warnings";

const HISTORY_LIMIT = 100;
/** Edits with the same coalesce key closer together than this are one undo step. */
const COALESCE_MS = 1500;

export interface StoreInit {
  flow: Flow;
  format: FileFormat;
  source: string | null;
}

/** Text of a schema as typed in the editor, and the definition object it produced. */
export interface SchemaBuffer {
  text: string;
  def: unknown;
}

export interface ApplyOptions {
  /** Merge rapid edits with the same key (typing) into one undo step. */
  coalesce?: string;
}

export interface FlowState {
  baseline: Flow;
  draft: Flow;
  format: FileFormat;
  source: string | null;
  /** Revision typed by the user; `null` means "baseline + 1". */
  revisionOverride: number | null;
  /** Blocking problems found by the UI that the flow itself cannot hold (broken YAML). */
  extraErrors: Record<string, string>;
  schemaBuffers: Record<string, SchemaBuffer>;
  dirty: boolean;
  errors: string[];
  warnings: Warning[];
  canUndo: boolean;
  canRedo: boolean;
  lastError: string | null;
  apply(op: (flow: Flow) => Flow, options?: ApplyOptions): void;
  editSchemaText(name: string, text: string): void;
  setRevisionOverride(revision: number | null): void;
  undo(): void;
  redo(): void;
  discard(): void;
  /**
   * The flow was written to disk. When `savedFrom` is given and the draft has
   * moved on since (edits made while saving), keep those edits and only move the
   * baseline.
   */
  markSaved(saved: Flow, savedFrom?: Flow): void;
  replaceFromDisk(flow: Flow): void;
  /** Change where the flow lives (name shown in the header, file format) without editing it. */
  setFile(file: { source: string | null; format: FileFormat }): void;
  nextRevision(): number;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keysA = Object.keys(a);
  if (keysA.length !== Object.keys(b).length) return false;
  return keysA.every(
    (key) =>
      Object.hasOwn(b, key) &&
      deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
  );
}

const SCHEMA_ERROR_PREFIX = "schema:";

/** Drop UI state that belongs to schemas which no longer exist. */
function prune(
  draft: Flow,
  extraErrors: Record<string, string>,
  buffers: Record<string, SchemaBuffer>,
) {
  return {
    extraErrors: Object.fromEntries(
      Object.entries(extraErrors).filter(([key]) =>
        Object.hasOwn(draft.schemas, key.slice(SCHEMA_ERROR_PREFIX.length)),
      ),
    ),
    schemaBuffers: Object.fromEntries(
      Object.entries(buffers).filter(([name]) => Object.hasOwn(draft.schemas, name)),
    ),
  };
}

export function createFlowStore(init: StoreInit): StoreApi<FlowState> {
  let past: Flow[] = [];
  let future: Flow[] = [];
  let lastKey: string | null = null;
  let lastTime = 0;

  return createStore<FlowState>()((set, get) => {
    const view = (
      draft: Flow,
      override: number | null,
      extraErrors: Record<string, string>,
      baseline: Flow = get().baseline,
    ) => ({
      draft,
      // The revision field only changes by saving, so it never counts as an edit.
      dirty:
        override !== null ||
        !deepEqual({ ...draft, revision: 0 }, { ...baseline, revision: 0 }),
      errors: [...invariantErrors(draft), ...Object.values(extraErrors)],
      warnings: runtimeWarnings(draft),
      canUndo: past.length > 0,
      canRedo: future.length > 0,
    });

    const reset = (flow: Flow) => {
      past = [];
      future = [];
      lastKey = null;
      set({
        baseline: flow,
        revisionOverride: null,
        lastError: null,
        extraErrors: {},
        schemaBuffers: {},
        ...view(flow, null, {}, flow),
      });
    };

    /** Make `next` the draft, recording history (merged with the previous step when coalescing). */
    const change = (
      next: Flow,
      coalesce: string | undefined,
      extraErrors: Record<string, string>,
      buffers: Record<string, SchemaBuffer>,
    ) => {
      const now = Date.now();
      const merge =
        coalesce !== undefined && coalesce === lastKey && now - lastTime < COALESCE_MS && past.length > 0;
      if (!merge) past = [...past, get().draft].slice(-HISTORY_LIMIT);
      future = [];
      lastKey = coalesce ?? null;
      lastTime = now;
      const pruned = prune(next, extraErrors, buffers);
      set({
        lastError: null,
        ...pruned,
        ...view(next, get().revisionOverride, pruned.extraErrors),
      });
    };

    const travel = (target: Flow) => {
      lastKey = null;
      set({
        lastError: null,
        extraErrors: {},
        schemaBuffers: {},
        ...view(target, get().revisionOverride, {}),
      });
    };

    return {
      baseline: init.flow,
      format: init.format,
      source: init.source,
      revisionOverride: null,
      lastError: null,
      extraErrors: {},
      schemaBuffers: {},
      ...view(init.flow, null, {}, init.flow),

      apply(op, options = {}) {
        let next: Flow;
        try {
          next = op(get().draft);
        } catch (err) {
          if (err instanceof OpError) {
            set({ lastError: err.message });
            return;
          }
          throw err;
        }
        if (next === get().draft) return;
        change(next, options.coalesce, get().extraErrors, get().schemaBuffers);
      },

      editSchemaText(name, text) {
        const { draft, extraErrors, schemaBuffers } = get();
        if (!Object.hasOwn(draft.schemas, name)) return;
        const key = SCHEMA_ERROR_PREFIX + name;
        const current = draft.schemas[name];
        const withoutError = Object.fromEntries(
          Object.entries(extraErrors).filter(([k]) => k !== key),
        );

        let value: unknown;
        try {
          value = parseText(text, "yaml");
        } catch (err) {
          const message = (err as Error).message.split("\n")[0];
          const errors = { ...extraErrors, [key]: `schemas.${name}: ${message}` };
          set({
            extraErrors: errors,
            schemaBuffers: { ...schemaBuffers, [name]: { text, def: current } },
            ...view(draft, get().revisionOverride, errors),
          });
          return;
        }
        value = value === undefined ? null : value;

        if (deepEqual(value, current)) {
          set({
            extraErrors: withoutError,
            schemaBuffers: { ...schemaBuffers, [name]: { text, def: current } },
            ...view(draft, get().revisionOverride, withoutError),
          });
          return;
        }
        const next: Flow = { ...draft, schemas: { ...draft.schemas, [name]: value as SchemaNode } };
        change(next, `schema:${name}`, withoutError, {
          ...schemaBuffers,
          [name]: { text, def: value },
        });
      },

      setRevisionOverride(revision) {
        if (revision !== null && (!Number.isInteger(revision) || revision < 0)) {
          set({ lastError: "revision must be a non-negative integer" });
          return;
        }
        set({
          revisionOverride: revision,
          lastError: null,
          ...view(get().draft, revision, get().extraErrors),
        });
      },

      undo() {
        const previous = past.at(-1);
        if (!previous) return;
        future = [...future, get().draft];
        past = past.slice(0, -1);
        travel(previous);
      },

      redo() {
        const next = future.at(-1);
        if (!next) return;
        past = [...past, get().draft];
        future = future.slice(0, -1);
        travel(next);
      },

      discard() {
        reset(get().baseline);
      },

      markSaved(saved, savedFrom) {
        if (savedFrom && get().draft !== savedFrom) {
          set({
            baseline: saved,
            revisionOverride: null,
            lastError: null,
            ...view(get().draft, null, get().extraErrors, saved),
          });
          return;
        }
        reset(saved);
      },

      replaceFromDisk(flow) {
        reset(flow);
      },

      setFile(file) {
        set({ source: file.source, format: file.format });
      },

      nextRevision() {
        return get().revisionOverride ?? get().baseline.revision + 1;
      },
    };
  });
}

const FlowStoreContext = createContext<StoreApi<FlowState> | null>(null);

export function FlowStoreProvider(props: {
  store: StoreApi<FlowState>;
  children?: ReactNode;
}) {
  return createElement(FlowStoreContext.Provider, { value: props.store }, props.children);
}

export function useFlowStore<T>(selector: (state: FlowState) => T): T {
  const store = useContext(FlowStoreContext);
  if (!store) throw new Error("useFlowStore must be used inside a FlowStoreProvider");
  return useStore(store, selector);
}

/** Direct access to the store, for event handlers that need the latest state. */
export function useFlowStoreApi(): StoreApi<FlowState> {
  const store = useContext(FlowStoreContext);
  if (!store) throw new Error("useFlowStoreApi must be used inside a FlowStoreProvider");
  return store;
}
