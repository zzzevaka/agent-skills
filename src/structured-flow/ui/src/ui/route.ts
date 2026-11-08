import { useMemo, useSyncExternalStore } from "react";

export type TabId = "overview" | "stages" | "schemas";

export interface Route {
  tab: TabId;
  item: string | null;
}

const TABS: readonly string[] = ["overview", "stages", "schemas"];

function decode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * `#/<tab>` or `#/<tab>/<item>`; the legacy `#<stage-name>` links of the
 * previous page open that stage.
 */
export function parseHash(hash: string): Route {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!raw) return { tab: "overview", item: null };
  if (!raw.startsWith("/")) return { tab: "stages", item: decode(raw) };
  const [, tab, ...rest] = raw.split("/");
  if (!TABS.includes(tab)) return { tab: "overview", item: null };
  const item = decode(rest.join("/"));
  return { tab: tab as TabId, item: item || null };
}

export function formatHash(route: Route): string {
  return route.item === null
    ? `#/${route.tab}`
    : `#/${route.tab}/${encodeURIComponent(route.item)}`;
}

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("hashchange", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("hashchange", listener);
  };
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash);
  return useMemo(() => parseHash(hash), [hash]);
}

/** Go to a route; `replace` avoids adding a history entry (for selections). */
export function navigate(route: Route, options: { replace?: boolean } = {}): void {
  const hash = formatHash(route);
  if (options.replace) window.history.replaceState(null, "", hash);
  else window.location.hash = hash;
  notify();
}
