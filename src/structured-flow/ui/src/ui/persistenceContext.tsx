import { createContext, useContext, type ReactNode } from "react";
import { useStore, type StoreApi } from "zustand";
import type { PersistenceState } from "../io/persistence";

export const PersistenceContext = createContext<StoreApi<PersistenceState> | null>(null);

export function PersistenceProvider(props: { api: StoreApi<PersistenceState>; children?: ReactNode }) {
  return <PersistenceContext.Provider value={props.api}>{props.children}</PersistenceContext.Provider>;
}

/** The persistence controller, or null when the app runs without one (tests, previews). */
export function usePersistenceApi(): StoreApi<PersistenceState> | null {
  return useContext(PersistenceContext);
}

export function usePersistence<T>(api: StoreApi<PersistenceState>, selector: (s: PersistenceState) => T): T {
  return useStore(api, selector);
}
