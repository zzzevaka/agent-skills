import { findErrors, parseFlow } from "../src/domain/flow";
import { parseText, serializeFlow, type FileFormat } from "../src/domain/serialize";
import type { Flow } from "../src/domain/types";
import type { FlowFileAdapter } from "../src/io/adapter";
import { saveFlow } from "../src/io/saveFlow";

const flow = (revision = 4, extra: Partial<Flow> = {}): Flow =>
  parseFlow({
    name: "f",
    goal: "g",
    revision,
    stages: [{ name: "a", prompt: "p" }],
    ...extra,
  });

interface Fake extends FlowFileAdapter {
  writes: string[];
  reads: number;
}

function fake(
  disk: string | Error,
  options: { name?: string; kind?: "handle" | "download"; writeError?: Error } = {},
): Fake {
  const adapter: Fake = {
    kind: options.kind ?? "handle",
    name: options.name ?? "flow.yaml",
    writes: [],
    reads: 0,
    async read() {
      adapter.reads += 1;
      if (disk instanceof Error) throw disk;
      return { text: disk, name: adapter.name };
    },
    async write(text) {
      if (options.writeError) throw options.writeError;
      adapter.writes.push(text);
    },
  };
  return adapter;
}

const onDisk = (revision: number, format: FileFormat = "yaml") =>
  serializeFlow(flow(revision), format);

const args = (adapter: FlowFileAdapter, overrides: object = {}) => ({
  adapter,
  draft: flow(4, { goal: "edited" }),
  baselineRevision: 4,
  revision: 5,
  format: "yaml" as FileFormat,
  ...overrides,
});

describe("saveFlow", () => {
  it("saves_with_incremented_revision", async () => {
    const adapter = fake(onDisk(4));
    const result = await saveFlow(args(adapter));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.saved.revision).toBe(5);
    expect(result.saved.goal).toBe("edited");
    expect(adapter.writes).toHaveLength(1);
    expect(parseFlow(parseText(adapter.writes[0], "yaml")).revision).toBe(5);
  });

  it("conflict_when_disk_revision_differs", async () => {
    const adapter = fake(onDisk(9));
    const result = await saveFlow(args(adapter));
    expect(result).toEqual({ ok: false, reason: "conflict", diskRevision: 9 });
    expect(adapter.writes).toEqual([]);
  });

  it("a_disk_file_without_revision_counts_as_revision_zero", async () => {
    const adapter = fake("name: f\ngoal: g\nstages:\n  - name: a\n    prompt: p\n");
    const result = await saveFlow(args(adapter, { baselineRevision: 0, revision: 1 }));
    expect(result.ok).toBe(true);
  });

  it("conflict_when_disk_file_invalid_reports_unreadable", async () => {
    const adapter = fake("a: [");
    const result = await saveFlow(args(adapter));
    expect(result).toMatchObject({ ok: false, reason: "unreadable" });
    expect(adapter.writes).toEqual([]);
  });

  it("a_disk_file_that_is_not_a_mapping_is_unreadable", async () => {
    const adapter = fake("- just\n- a list\n");
    expect(await saveFlow(args(adapter))).toMatchObject({ ok: false, reason: "unreadable" });
  });

  it("read_failure_does_not_write", async () => {
    const adapter = fake(new Error("file was deleted"));
    const result = await saveFlow(args(adapter));
    expect(result).toMatchObject({ ok: false, reason: "unreadable" });
    if (!result.ok && result.reason === "unreadable") expect(result.message).toContain("file was deleted");
    expect(adapter.writes).toEqual([]);
  });

  it("a_file_deleted_between_the_check_and_the_write_is_reported", async () => {
    const adapter = fake(onDisk(4), { writeError: new Error("NotFoundError") });
    const result = await saveFlow(args(adapter));
    expect(result).toMatchObject({ ok: false, reason: "write-failed" });
    if (!result.ok && result.reason === "write-failed") expect(result.message).toContain("NotFoundError");
  });

  it("download_adapter_skips_the_check", async () => {
    const adapter = fake(new Error("cannot read"), { kind: "download", name: "flow.yaml" });
    const result = await saveFlow(args(adapter));
    expect(result.ok).toBe(true);
    expect(adapter.reads).toBe(0);
    expect(adapter.writes).toHaveLength(1);
  });

  it("override_revision_is_written", async () => {
    const adapter = fake(onDisk(4));
    const result = await saveFlow(args(adapter, { revision: 20 }));
    expect(result.ok && result.saved.revision).toBe(20);
    expect(parseFlow(parseText(adapter.writes[0], "yaml")).revision).toBe(20);
  });

  it("skipCheck_overwrites_despite_a_conflict", async () => {
    const adapter = fake(onDisk(9));
    const result = await saveFlow(args(adapter, { revision: 10, skipCheck: true }));
    expect(result.ok).toBe(true);
    expect(adapter.reads).toBe(0);
    expect(adapter.writes).toHaveLength(1);
  });

  it("written_text_passes_findErrors_empty", async () => {
    const adapter = fake(onDisk(4));
    await saveFlow(args(adapter));
    expect(findErrors(parseText(adapter.writes[0], "yaml"))).toEqual([]);
  });

  it("writes_json_when_the_format_is_json", async () => {
    const adapter = fake(onDisk(4, "json"), { name: "flow.json" });
    await saveFlow(args(adapter, { format: "json" }));
    expect(adapter.writes[0].startsWith("{\n")).toBe(true);
    expect(parseFlow(JSON.parse(adapter.writes[0])).revision).toBe(5);
  });

  it("reads_the_disk_file_in_the_format_of_its_name", async () => {
    const adapter = fake(onDisk(4, "json"), { name: "flow.json" });
    const result = await saveFlow(args(adapter, { format: "json" }));
    expect(result.ok).toBe(true);
  });

  it("an_invalid_draft_is_refused_without_any_file_access", async () => {
    const adapter = fake(onDisk(4));
    const result = await saveFlow(args(adapter, { draft: flow(4, { name: "" }) }));
    expect(result).toMatchObject({ ok: false, reason: "invalid" });
    if (!result.ok && result.reason === "invalid") {
      expect(result.errors).toEqual(["flow name must be a non-empty string"]);
    }
    expect(adapter.reads).toBe(0);
    expect(adapter.writes).toEqual([]);
  });

  it.each([-1, 1.5, Number.NaN])("an_invalid_revision_%s_is_refused", async (revision) => {
    const adapter = fake(onDisk(4));
    const result = await saveFlow(args(adapter, { revision }));
    expect(result).toMatchObject({ ok: false, reason: "invalid" });
    expect(adapter.writes).toEqual([]);
  });
});
