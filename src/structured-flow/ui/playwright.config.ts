import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "**/*.spec.ts",
  timeout: 30_000,
  reporter: "list",
  use: { acceptDownloads: true, viewport: { width: 1360, height: 860 } },
});
