/**
 * File System Access API (Chromium): pick a file, read and write it in place,
 * and remember the handle across page reloads (IndexedDB).
 */
import type { FlowFileAdapter } from "./adapter";

type Mode = "read" | "readwrite";
type PermissionResult = "granted" | "prompt" | "denied";

interface PermissionHandle extends FileSystemFileHandle {
  queryPermission?(descriptor: { mode: Mode }): Promise<PermissionResult>;
  requestPermission?(descriptor: { mode: Mode }): Promise<PermissionResult>;
}

declare global {
  interface Window {
    showOpenFilePicker?(options?: unknown): Promise<FileSystemFileHandle[]>;
    showSaveFilePicker?(options?: unknown): Promise<FileSystemFileHandle>;
  }
}

const FILE_TYPES = [
  {
    description: "Flow files",
    accept: {
      "application/json": [".json"],
      "text/yaml": [".yaml", ".yml"],
    },
  },
];

export function fsAccessSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.showOpenFilePicker === "function" &&
    typeof window.showSaveFilePicker === "function"
  );
}

function requireSupport(): void {
  if (!fsAccessSupported()) throw new Error("File access is not supported in this browser");
}

export function adapterFromHandle(handle: FileSystemFileHandle): FlowFileAdapter {
  return {
    kind: "handle",
    name: handle.name,
    handle,
    async read() {
      const file = await handle.getFile();
      return { text: await file.text(), name: handle.name };
    },
    async write(text) {
      const stream = await handle.createWritable();
      try {
        await stream.write(text);
        await stream.close();
      } catch (err) {
        await stream.abort?.().catch(() => {});
        throw err;
      }
    },
  };
}

/** Let the user pick the flow file; rejects with an AbortError when they cancel. */
export async function connectFile(): Promise<FlowFileAdapter> {
  requireSupport();
  const [handle] = await window.showOpenFilePicker!({ multiple: false, types: FILE_TYPES });
  return adapterFromHandle(handle);
}

/** Let the user choose where to save, write `text` there, and return the new file. */
export async function saveAs(suggestedName: string, text: string): Promise<FlowFileAdapter> {
  requireSupport();
  const handle = await window.showSaveFilePicker!({ suggestedName, types: FILE_TYPES });
  const adapter = adapterFromHandle(handle);
  await adapter.write(text);
  return adapter;
}

export async function hasPermission(
  adapter: FlowFileAdapter,
  mode: Mode = "readwrite",
): Promise<PermissionResult> {
  const handle = adapter.handle as PermissionHandle | undefined;
  if (!handle?.queryPermission) return "granted";
  return handle.queryPermission({ mode });
}

/** Ask the user for access again; must run inside a click or key handler. */
export async function requestPermission(
  adapter: FlowFileAdapter,
  mode: Mode = "readwrite",
): Promise<PermissionResult> {
  const handle = adapter.handle as PermissionHandle | undefined;
  if (!handle?.requestPermission) return "granted";
  return handle.requestPermission({ mode });
}

const DB_NAME = "structured-flow";
const STORE = "handles";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB is unavailable"));
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function done(request: IDBRequest | IDBTransaction): Promise<unknown> {
  return new Promise((resolve, reject) => {
    request.addEventListener("error", () => reject(request.error));
    if ("result" in request) request.addEventListener("success", () => resolve(request.result));
    else request.addEventListener("complete", () => resolve(undefined));
  });
}

/** Remember the connected file under `key` (the flow's source path). Failures are ignored. */
export async function rememberHandle(key: string, adapter: FlowFileAdapter): Promise<void> {
  if (!adapter.handle) return;
  try {
    const db = await openDatabase();
    const transaction = db.transaction(STORE, "readwrite");
    transaction.objectStore(STORE).put(adapter.handle, key);
    await done(transaction);
    db.close();
  } catch {
    /* private window or blocked storage: the file just has to be connected again */
  }
}

/** The file connected earlier for `key`, or null (also when storage is unavailable). */
export async function restoreHandle(key: string): Promise<FlowFileAdapter | null> {
  try {
    const db = await openDatabase();
    const handle = (await done(db.transaction(STORE).objectStore(STORE).get(key))) as
      | FileSystemFileHandle
      | undefined;
    db.close();
    return handle ? adapterFromHandle(handle) : null;
  } catch {
    return null;
  }
}
