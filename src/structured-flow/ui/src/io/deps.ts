import type { FlowFileAdapter } from "./adapter";
import { downloadAdapter } from "./download";
import {
  connectFile,
  fsAccessSupported,
  hasPermission,
  rememberHandle,
  requestPermission,
  restoreHandle,
  saveAs,
} from "./fsAccess";
import { pickFile } from "./openInput";
import { saveFlow } from "./saveFlow";

type Permission = "granted" | "prompt" | "denied";

/** Everything persistence needs from the browser, so tests can replace it. */
export interface Deps {
  fsSupported: boolean;
  connectFile(): Promise<FlowFileAdapter>;
  saveAs(name: string, text: string): Promise<FlowFileAdapter>;
  pickFile(): Promise<{ text: string; name: string } | null>;
  downloadAdapter(name: string): FlowFileAdapter;
  hasPermission(adapter: FlowFileAdapter, mode: "read" | "readwrite"): Promise<Permission>;
  requestPermission(adapter: FlowFileAdapter, mode: "read" | "readwrite"): Promise<Permission>;
  rememberHandle(key: string, adapter: FlowFileAdapter): Promise<void>;
  restoreHandle(key: string): Promise<FlowFileAdapter | null>;
  saveFlow: typeof saveFlow;
}

export function realDeps(): Deps {
  return {
    fsSupported: fsAccessSupported(),
    connectFile,
    saveAs,
    pickFile,
    downloadAdapter,
    hasPermission,
    requestPermission,
    rememberHandle,
    restoreHandle,
    saveFlow,
  };
}
