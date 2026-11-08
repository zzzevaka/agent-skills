import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Vitest runs with the `src/durable-flow/ui/` directory as the working directory.
const PARITY = resolve(process.cwd(), "../../../tests/skills/durable-flow/fixtures/parity");

/** Load a shared Python/TypeScript parity fixture file. */
export function loadParity<T>(name: string): T {
  return JSON.parse(readFileSync(resolve(PARITY, name), "utf-8")) as T;
}
