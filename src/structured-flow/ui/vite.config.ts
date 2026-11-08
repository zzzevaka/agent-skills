import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  base: "./",
  plugins: [react(), viteSingleFile()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  build: {
    outDir: "../../../skills/structured-flow/assets",
    emptyOutDir: true,
    // Inline the font (and any other asset) into the single HTML file.
    assetsInlineLimit: 10_000_000,
    rollupOptions: { input: "flow-ui.html" },
  },
});
