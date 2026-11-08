import { findErrors, parseFlow } from "../src/domain/flow";
import { parseText, serializeFlow, type FileFormat } from "../src/domain/serialize";
import type { Flow } from "../src/domain/types";
import { setMeta } from "../src/domain/ops";
import type { FlowFileAdapter } from "../src/io/adapter";
import { LAST_FILE_KEY, bootstrap } from "../src/io/bootstrap";
import { createPersistence, type Deps } from "../src/io/persistence";
import { saveFlow } from "../src/io/saveFlow";
import { createFlowStore } from "../src/store/flowStore";

const flow = (revision: number, goal = "g"): Flow =>
  parseFlow({ name: "f", goal, revision, stages: [{ name: "a", prompt: "p" }] });

interface Disk extends FlowFileAdapter {
  text: string | Error;
  writes: string[];
}

function disk(text: string | Error, name = "flow.yaml", kind: "handle" | "download" = "handle"): Disk {
  const adapter: Disk = {
    kind,
    name,
    text,
    writes: [],
    async read() {
      if (adapter.text instanceof Error) throw adapter.text;
      return { text: adapter.text, name };
    },
    async write(next) {
      adapter.writes.push(next);
      adapter.text = next;
    },
  };
  return adapter;
}

const yamlOf = (revision: number, goal = "g", format: FileFormat = "yaml") =>
  serializeFlow(flow(revision, goal), format);

function deps(overrides: Partial<Deps> = {}): Deps & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    fsSupported: true,
    connectFile: async () => {
      calls.push("connectFile");
      throw new DOMException("cancelled", "AbortError");
    },
    saveAs: async () => {
      calls.push("saveAs");
      throw new DOMException("cancelled", "AbortError");
    },
    pickFile: async () => null,
    downloadAdapter: (name) => {
      calls.push(`download:${name}`);
      return disk(new Error("cannot read"), name, "download");
    },
    hasPermission: async () => "granted",
    requestPermission: async () => "granted",
    rememberHandle: async (key) => {
      calls.push(`remember:${key}`);
    },
    restoreHandle: async () => null,
    saveFlow,
    ...overrides,
  };
}

describe("bootstrap", () => {
  it("without_a_remembered_file_it_starts_on_the_start_screen", async () => {
    const keys: string[] = [];
    const result = await bootstrap(deps({ restoreHandle: async (key) => (keys.push(key), null) }));
    expect(keys).toEqual([LAST_FILE_KEY]);
    expect(result).toMatchObject({ started: false, adapter: null, notice: null, needsPermission: false });
    expect(findErrors(JSON.parse(JSON.stringify(result.initial.flow)))).toEqual([]);
    expect(result.initial).toMatchObject({ format: "yaml", source: null });
  });

  it("a_remembered_file_is_opened_on_load", async () => {
    const adapter = disk(yamlOf(12, "from disk"), "my-flow.yaml");
    const result = await bootstrap(deps({ restoreHandle: async () => adapter }));
    expect(result.started).toBe(true);
    expect(result.initial.flow).toMatchObject({ revision: 12, goal: "from disk" });
    expect(result.initial).toMatchObject({ source: "my-flow.yaml", format: "yaml" });
    expect(result.adapter).toBe(adapter);
    expect(result.notice).toBeNull();
  });

  it("a_remembered_file_needing_a_click_is_offered_for_reopening", async () => {
    const adapter = disk(yamlOf(12));
    const result = await bootstrap(
      deps({ restoreHandle: async () => adapter, hasPermission: async () => "prompt" }),
    );
    expect(result).toMatchObject({ started: false, needsPermission: true, notice: null });
    expect(result.adapter).toBe(adapter);
  });

  it("denied_access_falls_back_to_the_start_screen_with_a_message", async () => {
    const result = await bootstrap(
      deps({ restoreHandle: async () => disk(yamlOf(12)), hasPermission: async () => "denied" }),
    );
    expect(result).toMatchObject({ started: false, adapter: null });
    expect(result.notice).toMatchObject({ kind: "error" });
  });

  it("a_deleted_file_is_reported_and_forgotten", async () => {
    const adapter = disk(new Error("A requested file or directory could not be found"));
    const result = await bootstrap(deps({ restoreHandle: async () => adapter }));
    expect(result).toMatchObject({ started: false, adapter: null });
    expect(result.notice).toMatchObject({ kind: "error" });
    expect(result.notice?.text).toContain("could not be found");
  });

  it("an_invalid_file_is_reported", async () => {
    const result = await bootstrap(deps({ restoreHandle: async () => disk("a: [") }));
    expect(result.started).toBe(false);
    expect(result.notice?.text).toMatch(/invalid YAML/);
  });

  it("a_file_with_validation_errors_is_reported", async () => {
    const bad = "name: f\ngoal: g\nstages:\n  - name: a\n    prompt: p\n    depends_on: [b]\n  - name: b\n    prompt: p\n";
    const result = await bootstrap(deps({ restoreHandle: async () => disk(bad) }));
    expect(result.started).toBe(false);
    expect(result.notice?.text).toMatch(/must be a previous stage/);
  });

  it.each([
    ["flow.json", "json"],
    ["flow.yml", "yaml"],
    ["FLOW.YAML", "yaml"],
  ])("the_format_follows_the_file_name_%s", async (name, expected) => {
    const text = name.endsWith("json") ? yamlOf(1, "g", "json") : yamlOf(1);
    const result = await bootstrap(deps({ restoreHandle: async () => disk(text, name) }));
    expect(result.initial.format).toBe(expected);
  });
});

function setup(options: { adapter?: Disk | null; fsSupported?: boolean; dirty?: boolean; d?: Partial<Deps> } = {}) {
  const store = createFlowStore({ flow: flow(10), format: "yaml", source: "/work/flow.yaml" });
  if (options.dirty) store.getState().apply((f) => setMeta(f, { goal: "edited" }));
  const d = deps({ fsSupported: options.fsSupported ?? true, ...options.d });
  const persistence = createPersistence({
    store,
    adapter: options.adapter ?? null,
    notice: null,
    needsPermission: false,
    deps: d,
  });
  return { store, persistence, d };
}

describe("save", () => {
  it("does_nothing_when_nothing_changed_or_errors_exist", async () => {
    const adapter = disk(yamlOf(10));
    const clean = setup({ adapter });
    await clean.persistence.getState().save();
    expect(adapter.writes).toEqual([]);

    const broken = setup({ adapter, dirty: true });
    broken.store.getState().apply((f) => setMeta(f, { name: "" }));
    await broken.persistence.getState().save();
    expect(adapter.writes).toEqual([]);
  });

  it("save_with_a_handle_writes_in_place_and_marks_saved", async () => {
    const adapter = disk(yamlOf(10));
    const { store, persistence } = setup({ adapter, dirty: true });
    await persistence.getState().save();
    expect(adapter.writes).toHaveLength(1);
    expect(parseFlow(parseText(adapter.writes[0], "yaml"))).toMatchObject({ revision: 11, goal: "edited" });
    expect(store.getState()).toMatchObject({ dirty: false });
    expect(store.getState().baseline.revision).toBe(11);
    expect(persistence.getState().notice).toMatchObject({ kind: "info" });
  });

  it("saving_twice_increments_the_revision_each_time", async () => {
    const adapter = disk(yamlOf(10));
    const { store, persistence } = setup({ adapter, dirty: true });
    await persistence.getState().save();
    store.getState().apply((f) => setMeta(f, { goal: "again" }));
    await persistence.getState().save();
    expect(store.getState().baseline.revision).toBe(12);
  });

  it("a_manual_revision_override_is_used", async () => {
    const adapter = disk(yamlOf(10));
    const { store, persistence } = setup({ adapter, dirty: true });
    store.getState().setRevisionOverride(30);
    await persistence.getState().save();
    expect(store.getState().baseline.revision).toBe(30);
  });

  it("save_without_handle_downloads_a_file_named_after_the_source", async () => {
    const { store, persistence, d } = setup({ fsSupported: false, dirty: true });
    await persistence.getState().save();
    expect(d.calls).toContain("download:flow.yaml");
    expect(store.getState().dirty).toBe(false);
    expect(store.getState().baseline.revision).toBe(11);
    expect(persistence.getState().adapter).toBeNull();
  });

  it("a_new_flow_asks_where_to_save_and_keeps_saving_there", async () => {
    const created = disk("", "my-flow.yaml");
    const store = createFlowStore({ flow: flow(0), format: "yaml", source: null });
    store.getState().apply((f) => setMeta(f, { name: "My Flow" }));
    const d = deps({
      saveAs: async (name, text) => {
        d.calls.push(`saveAs:${name}`);
        await created.write(text);
        return created;
      },
    });
    const persistence = createPersistence({ store, adapter: null, notice: null, needsPermission: false, deps: d });
    await persistence.getState().save();
    expect(d.calls).toContain("saveAs:my-flow.yaml");
    expect(store.getState()).toMatchObject({ dirty: false, source: "my-flow.yaml" });
    expect(persistence.getState().adapter).toBe(created);
    store.getState().apply((f) => setMeta(f, { goal: "more" }));
    await persistence.getState().save();
    expect(created.writes).toHaveLength(2);
  });

  it("a_cancelled_file_dialog_is_silent", async () => {
    const store = createFlowStore({ flow: flow(0), format: "yaml", source: null });
    store.getState().apply((f) => setMeta(f, { goal: "x" }));
    const persistence = createPersistence({ store, adapter: null, notice: null, needsPermission: false, deps: deps() });
    await persistence.getState().save();
    expect(persistence.getState().notice).toBeNull();
    expect(store.getState().dirty).toBe(true);
  });

  it("with_file_access_but_no_file_save_asks_where_to_save", async () => {
    const created = disk("", "f.yaml");
    const { store, persistence, d } = setup({
      dirty: true,
      d: {
        saveAs: async (name, text) => {
          d.calls.push(`saveAs:${name}`);
          await created.write(text);
          return created;
        },
      },
    });
    await persistence.getState().save();
    expect(d.calls).toContain("saveAs:f.yaml");
    expect(d.calls).toContain(`remember:${LAST_FILE_KEY}`);
    expect(persistence.getState().adapter).toBe(created);
    expect(store.getState()).toMatchObject({ dirty: false, source: "f.yaml" });
  });

  it("a_failed_write_is_reported_and_keeps_the_changes", async () => {
    const adapter = disk(yamlOf(10));
    adapter.write = async () => {
      throw new Error("disk full");
    };
    const { store, persistence } = setup({ adapter, dirty: true });
    await persistence.getState().save();
    expect(persistence.getState().notice).toMatchObject({ kind: "error" });
    expect(persistence.getState().notice?.text).toContain("disk full");
    expect(store.getState().dirty).toBe(true);
  });
});

describe("revision conflicts", () => {
  const conflicted = async () => {
    const adapter = disk(yamlOf(14, "agent changed this"));
    const ctx = setup({ adapter, dirty: true });
    await ctx.persistence.getState().save();
    return { ...ctx, adapter };
  };

  it("a_newer_file_opens_the_conflict_dialog_and_writes_nothing", async () => {
    const { persistence, adapter, store } = await conflicted();
    expect(persistence.getState().conflict).toEqual({ diskRevision: 14 });
    expect(adapter.writes).toEqual([]);
    expect(store.getState().dirty).toBe(true);
  });

  it("conflict_overwrite_writes_disk_plus_one", async () => {
    const { persistence, adapter, store } = await conflicted();
    await persistence.getState().resolveConflict("overwrite");
    expect(parseFlow(parseText(adapter.writes[0], "yaml"))).toMatchObject({ revision: 15, goal: "edited" });
    expect(persistence.getState().conflict).toBeNull();
    expect(store.getState().baseline.revision).toBe(15);
  });

  it("conflict_reload_takes_the_disk_version_and_drops_the_edits", async () => {
    const { persistence, adapter, store } = await conflicted();
    await persistence.getState().resolveConflict("reload");
    expect(adapter.writes).toEqual([]);
    expect(store.getState().draft.goal).toBe("agent changed this");
    expect(store.getState().dirty).toBe(false);
    expect(persistence.getState().conflict).toBeNull();
  });

  it("conflict_save_a_copy_writes_to_a_new_file_and_switches_to_it", async () => {
    const copy = disk("", "copy.yaml");
    const adapter = disk(yamlOf(14));
    const ctx = setup({
      adapter,
      dirty: true,
      d: {
        saveAs: async (_name, text) => {
          await copy.write(text);
          return copy;
        },
      },
    });
    await ctx.persistence.getState().save();
    await ctx.persistence.getState().resolveConflict("copy");
    expect(adapter.writes).toEqual([]);
    expect(copy.writes).toHaveLength(1);
    expect(ctx.persistence.getState().adapter).toBe(copy);
    expect(ctx.store.getState().dirty).toBe(false);
  });

  it("conflict_cancel_keeps_everything_as_it_was", async () => {
    const { persistence, adapter, store } = await conflicted();
    await persistence.getState().resolveConflict("cancel");
    expect(persistence.getState().conflict).toBeNull();
    expect(adapter.writes).toEqual([]);
    expect(store.getState().dirty).toBe(true);
  });

  it("an_unreadable_file_at_save_time_is_an_error_not_a_conflict", async () => {
    const adapter = disk(new Error("file is gone"));
    const { persistence, store } = setup({ adapter, dirty: true });
    await persistence.getState().save();
    expect(persistence.getState().conflict).toBeNull();
    expect(persistence.getState().notice).toMatchObject({ kind: "error" });
    expect(store.getState().dirty).toBe(true);
  });
});

describe("reload, open and new flow", () => {
  it("reload_when_clean_reads_the_file_immediately", async () => {
    const adapter = disk(yamlOf(12, "fresh"));
    const { store, persistence } = setup({ adapter });
    await persistence.getState().reload();
    expect(store.getState().draft.goal).toBe("fresh");
    expect(store.getState().baseline.revision).toBe(12);
  });

  it("reload_confirms_when_dirty_and_only_reloads_after_the_user_agrees", async () => {
    const adapter = disk(yamlOf(12, "fresh"));
    const { store, persistence } = setup({ adapter, dirty: true });
    await persistence.getState().reload();
    expect(persistence.getState().confirm).not.toBeNull();
    expect(store.getState().draft.goal).toBe("edited");
    await persistence.getState().confirm!.onConfirm();
    expect(store.getState().draft.goal).toBe("fresh");
    expect(persistence.getState().confirm).toBeNull();
  });

  it("cancelling_the_confirmation_keeps_the_edits", async () => {
    const adapter = disk(yamlOf(12, "fresh"));
    const { store, persistence } = setup({ adapter, dirty: true });
    await persistence.getState().reload();
    persistence.getState().cancelConfirm();
    expect(persistence.getState().confirm).toBeNull();
    expect(store.getState().draft.goal).toBe("edited");
  });

  it("reload_asks_for_permission_and_reports_a_refusal", async () => {
    const adapter = disk(yamlOf(12));
    const { store, persistence } = setup({
      adapter,
      d: { hasPermission: async () => "prompt", requestPermission: async () => "denied" },
    });
    await persistence.getState().reload();
    expect(persistence.getState().notice).toMatchObject({ kind: "error" });
    expect(store.getState().baseline.revision).toBe(10);
  });

  it("reload_reports_a_deleted_or_invalid_file_and_keeps_the_page", async () => {
    const adapter = disk("a: [");
    const { store, persistence } = setup({ adapter });
    await persistence.getState().reload();
    expect(persistence.getState().notice).toMatchObject({ kind: "error" });
    expect(store.getState().baseline.revision).toBe(10);
  });

  it("open_file_replaces_the_flow_with_the_chosen_file", async () => {
    const adapter = disk(yamlOf(3, "other flow"), "other.yaml");
    const { store, persistence } = setup({ d: { connectFile: async () => adapter } });
    await persistence.getState().openFile();
    expect(store.getState()).toMatchObject({ source: "other.yaml", format: "yaml" });
    expect(store.getState().draft.goal).toBe("other flow");
    expect(persistence.getState().adapter).toBe(adapter);
  });

  it("opening_a_file_remembers_it_as_the_last_file", async () => {
    const adapter = disk(yamlOf(3, "other flow"), "other.yaml");
    const { persistence, d } = setup({ d: { connectFile: async () => adapter } });
    await persistence.getState().openFile();
    expect(d.calls).toContain(`remember:${LAST_FILE_KEY}`);
  });

  it("a_cancelled_picker_changes_nothing", async () => {
    const { store, persistence } = setup();
    await persistence.getState().openFile();
    expect(persistence.getState().notice).toBeNull();
    expect(store.getState().baseline.revision).toBe(10);
  });

  it("new_flow_replaces_the_page_with_a_blank_flow_and_forgets_the_file", async () => {
    const adapter = disk(yamlOf(10));
    const { store, persistence } = setup({ adapter });
    await persistence.getState().newFlow();
    expect(store.getState()).toMatchObject({ source: null, format: "yaml", dirty: false });
    expect(store.getState().draft.name).toBe("new-flow");
    expect(persistence.getState().adapter).toBeNull();
  });

  it("new_flow_asks_before_discarding_edits", async () => {
    const { store, persistence } = setup({ dirty: true });
    await persistence.getState().newFlow();
    expect(persistence.getState().confirm).not.toBeNull();
    expect(store.getState().draft.goal).toBe("edited");
    await persistence.getState().confirm!.onConfirm();
    expect(store.getState().draft.name).toBe("new-flow");
  });

  it("open_file_asks_before_discarding_edits", async () => {
    const adapter = disk(yamlOf(3, "other flow"), "other.yaml");
    const { store, persistence } = setup({ dirty: true, d: { connectFile: async () => adapter } });
    await persistence.getState().openFile();
    expect(persistence.getState().confirm).not.toBeNull();
    expect(store.getState().draft.goal).toBe("edited");
    await persistence.getState().confirm!.onConfirm();
    expect(store.getState().draft.goal).toBe("other flow");
  });

  it("open_file_without_file_access_uses_the_file_input_and_downloads_on_save", async () => {
    const { store, persistence } = setup({
      fsSupported: false,
      d: { pickFile: async () => ({ text: yamlOf(3, "picked"), name: "picked.yaml" }) },
    });
    await persistence.getState().openFile();
    expect(store.getState()).toMatchObject({ source: "picked.yaml" });
    expect(store.getState().draft.goal).toBe("picked");
    expect(persistence.getState().adapter).toBeNull();
  });

  it("open_file_with_a_broken_file_reports_it_and_keeps_the_page", async () => {
    const adapter = disk("a: [", "bad.yaml");
    const { store, persistence } = setup({ d: { connectFile: async () => adapter } });
    await persistence.getState().openFile();
    expect(persistence.getState().notice).toMatchObject({ kind: "error" });
    expect(store.getState().baseline.revision).toBe(10);
  });

  it("dismissNotice_clears_the_notice", async () => {
    const adapter = disk("a: [");
    const { persistence } = setup({ adapter });
    await persistence.getState().reload();
    persistence.getState().dismissNotice();
    expect(persistence.getState().notice).toBeNull();
  });
});

describe("final review fixes", () => {
  it("save_asks_for_write_permission_first_when_the_browser_needs_a_click", async () => {
    const adapter = disk(yamlOf(10));
    const requested: string[] = [];
    const { store, persistence } = setup({
      adapter,
      dirty: true,
      d: {
        hasPermission: async () => "prompt",
        requestPermission: async (_a, mode) => {
          requested.push(mode);
          return "granted";
        },
      },
    });
    await persistence.getState().save();
    expect(requested).toEqual(["readwrite"]);
    expect(adapter.writes).toHaveLength(1);
    expect(store.getState().dirty).toBe(false);
  });

  it("save_stops_with_a_message_when_write_permission_is_refused", async () => {
    const adapter = disk(yamlOf(10));
    const { store, persistence } = setup({
      adapter,
      dirty: true,
      d: { hasPermission: async () => "prompt", requestPermission: async () => "denied" },
    });
    await persistence.getState().save();
    expect(adapter.writes).toEqual([]);
    expect(persistence.getState().notice).toMatchObject({ kind: "error" });
    expect(persistence.getState().notice?.text).toMatch(/permission/i);
    expect(store.getState().dirty).toBe(true);
  });

  it("edits_made_while_the_save_is_in_flight_are_kept", async () => {
    const adapter = disk(yamlOf(10));
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const write = adapter.write;
    adapter.write = async (text) => {
      await gate;
      return write(text);
    };
    const { store, persistence } = setup({ adapter, dirty: true });
    const saving = persistence.getState().save();
    await new Promise((resolve) => setTimeout(resolve, 0));
    store.getState().apply((f) => setMeta(f, { goal: "typed during the save" }));
    release();
    await saving;
    expect(adapter.writes).toHaveLength(1);
    expect(store.getState().baseline.revision).toBe(11);
    expect(store.getState().draft.goal).toBe("typed during the save");
    expect(store.getState().dirty).toBe(true);
  });
});
