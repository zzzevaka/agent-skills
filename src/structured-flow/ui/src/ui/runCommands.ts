import type { FileFormat } from "../domain/serialize";

export type HarnessId = "opencode" | "claude" | "codex";

export interface Harness {
  id: HarnessId;
  label: string;
  /** Agent id of the `skills` installer (`npx skills add -a <agent>`). */
  agent: string;
}

export const HARNESSES: readonly Harness[] = [
  { id: "opencode", label: "OpenCode", agent: "opencode" },
  { id: "claude", label: "Claude Code", agent: "claude-code" },
  { id: "codex", label: "Codex", agent: "codex" },
];

export interface RunCommand {
  label: string;
  command: string;
}

const REPOSITORY = "https://github.com/zzzevaka/agent-skills";

/** Characters that are safe in a file name pasted into a shell command. */
const UNSAFE_NAME_CHARS = /[^A-Za-z0-9._-]+/g;

/**
 * The file name offered for download and used in the commands. Anything that could
 * be read by a shell as syntax is replaced, so a copied command never runs more
 * than intended.
 */
export function runFileName(source: string | null, format: FileFormat): string {
  const base = source?.split(/[\\/]/).pop() ?? "";
  const name = base.replace(UNSAFE_NAME_CHARS, "_").replace(/^[-.]+/, "");
  return name.length > 0 ? name : `flow.${format}`;
}

export function installCommand(harness: Harness): string {
  return `npx skills add ${REPOSITORY} --skill structured-flow -a ${harness.agent}`;
}

/** The prompt that asks the skill to run `file`, in the way `harness` invokes skills. */
function prompt(harness: HarnessId, request: string): string {
  switch (harness) {
    case "opencode":
      return `opencode run "@structured-flow ${request}"`;
    case "claude":
      return `claude "/structured-flow ${request}"`;
    case "codex":
      // `$` mentions a skill in Codex; single quotes keep the shell from expanding it.
      return `codex '$structured-flow ${request}'`;
  }
}

export function runCommands(harness: Harness, file: string): RunCommand[] {
  return [
    { label: "Run the whole flow", command: prompt(harness.id, `run ${file}`) },
    { label: "Run one stage and stop", command: prompt(harness.id, `run only next stage and stop ${file}`) },
  ];
}
