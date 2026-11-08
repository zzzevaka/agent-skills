/** Where a flow file lives: a real file the browser may write to, or a download. */
export interface FlowFileAdapter {
  /** `handle`: reads and writes the chosen file in place. `download`: write-only. */
  kind: "handle" | "download";
  /** File name; its extension tells which format the file is in. */
  name: string;
  /** The underlying File System Access handle, for remembering it across reloads. */
  handle?: FileSystemFileHandle;
  read(): Promise<{ text: string; name: string }>;
  write(text: string): Promise<void>;
}
