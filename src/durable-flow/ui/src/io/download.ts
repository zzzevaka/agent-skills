import type { FlowFileAdapter } from "./adapter";

const TYPES: Record<string, string> = {
  json: "application/json",
  yaml: "text/yaml",
  yml: "text/yaml",
};

/** Browsers without in-place saving: "writing" downloads a copy of the file. */
export function downloadAdapter(name: string): FlowFileAdapter {
  return {
    kind: "download",
    name,
    async read() {
      throw new Error("A downloaded file cannot be read back");
    },
    async write(text) {
      const extension = name.split(".").pop()?.toLowerCase() ?? "";
      const blob = new Blob([text], { type: `${TYPES[extension] ?? "text/plain"};charset=utf-8` });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      link.style.display = "none";
      document.body.append(link);
      try {
        link.click();
      } finally {
        link.remove();
        URL.revokeObjectURL(url);
      }
    },
  };
}
