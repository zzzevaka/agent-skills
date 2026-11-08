import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { parseFlow } from "../src/domain/flow";
import { parseText, serializeFlow } from "../src/domain/serialize";
import type { Flow } from "../src/domain/types";
import type { FlowFileAdapter } from "../src/io/adapter";
import type { Deps } from "../src/io/deps";
import { saveFlow } from "../src/io/saveFlow";
import { navigate } from "../src/ui/route";
import { Root } from "../src/ui/Root";

const flow = (revision: number, goal = "the goal"): Flow =>
  parseFlow({ name: "My flow", goal, revision, stages: [{ name: "a", prompt: "p" }] });

interface Disk extends FlowFileAdapter {
  text: string | Error;
  writes: string[];
}

function disk(text: string | Error, name = "flow.yaml"): Disk {
  const adapter: Disk = {
    kind: "handle",
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

const yamlOf = (revision: number, goal?: string) => serializeFlow(flow(revision, goal), "yaml");

function deps(over: Partial<Deps> = {}): Deps & { downloads: string[] } {
  const downloads: string[] = [];
  return {
    downloads,
    fsSupported: true,
    connectFile: async () => {
      throw new DOMException("cancelled", "AbortError");
    },
    saveAs: async () => {
      throw new DOMException("cancelled", "AbortError");
    },
    pickFile: async () => null,
    downloadAdapter: (name) => ({
      kind: "download",
      name,
      read: async () => {
        throw new Error("cannot read");
      },
      write: async () => {
        downloads.push(name);
      },
    }),
    hasPermission: async () => "granted",
    requestPermission: async () => "granted",
    rememberHandle: async () => {},
    restoreHandle: async () => null,
    saveFlow,
    ...over,
  };
}

const click = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));
const findButton = (name: string | RegExp) => screen.findByRole("button", { name });

async function renderRoot(d: Deps) {
  const view = render(<Root deps={d} />);
  await waitFor(() => expect(screen.queryByText("Loading…")).toBeNull());
  return view;
}

async function editGoal(text: string) {
  const goal = screen.getByRole("textbox", { name: "Goal" });
  fireEvent.change(goal, { target: { value: text } });
  fireEvent.blur(goal);
}

const remembered = (adapter: FlowFileAdapter, over: Partial<Deps> = {}) =>
  deps({ restoreHandle: async () => adapter, ...over });

beforeEach(() => navigate({ tab: "overview", item: null }, { replace: true }));

describe("start screen", () => {
  it("shows_a_loading_state_until_the_page_is_ready", async () => {
    let release!: () => void;
    const d = deps({ restoreHandle: () => new Promise((resolve) => (release = () => resolve(null))) });
    render(<Root deps={d} />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
    release();
    await screen.findByRole("button", { name: "New flow" });
  });

  it("offers_open_file_and_new_flow_when_nothing_is_remembered", async () => {
    await renderRoot(deps());
    expect(screen.getByRole("button", { name: "Open file" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New flow" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Reopen/ })).toBeNull();
  });

  it("explains_that_other_browsers_download_instead_of_saving_in_place", async () => {
    await renderRoot(deps({ fsSupported: false }));
    expect(screen.getByText(/downloads a copy/i)).toBeInTheDocument();
  });

  it("new_flow_starts_a_valid_blank_flow", async () => {
    await renderRoot(deps());
    click("New flow");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("new-flow");
    expect(screen.getByTestId("problems-summary")).toHaveTextContent("No problems");
  });

  it("open_file_loads_the_chosen_file", async () => {
    const adapter = disk(yamlOf(12, "on disk"));
    await renderRoot(deps({ connectFile: async () => adapter }));
    click("Open file");
    expect(await screen.findByText("rev 12 · flow.yaml")).toBeInTheDocument();
    expect(screen.getByText("on disk")).toBeInTheDocument();
  });

  it("a_cancelled_picker_leaves_the_start_screen_without_an_error", async () => {
    await renderRoot(deps());
    click("Open file");
    await act(async () => {});
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: "New flow" })).toBeInTheDocument();
  });

  it("a_remembered_file_is_opened_on_load", async () => {
    await renderRoot(remembered(disk(yamlOf(12, "on disk"))));
    expect(screen.getByText("rev 12 · flow.yaml")).toBeInTheDocument();
    expect(screen.getByText("on disk")).toBeInTheDocument();
  });

  it("a_remembered_file_that_needs_a_click_can_be_reopened", async () => {
    const adapter = disk(yamlOf(12, "on disk"));
    await renderRoot(remembered(adapter, { hasPermission: async () => "prompt" }));
    expect(screen.queryByText("rev 12 · flow.yaml")).toBeNull();
    click("Reopen flow.yaml");
    expect(await screen.findByText("rev 12 · flow.yaml")).toBeInTheDocument();
  });

  it("a_broken_remembered_file_is_reported_on_the_start_screen_and_can_be_dismissed", async () => {
    await renderRoot(remembered(disk("a: [")));
    expect(await screen.findByText(/invalid YAML/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New flow" })).toBeInTheDocument();
    click("Close toast");
    await waitFor(() => expect(screen.queryByText(/invalid YAML/)).toBeNull());
  });

  it("a_refused_reopen_stays_on_the_start_screen_with_a_message", async () => {
    const adapter = disk(yamlOf(12));
    await renderRoot(
      remembered(adapter, { hasPermission: async () => "prompt", requestPermission: async () => "denied" }),
    );
    click("Reopen flow.yaml");
    expect(await screen.findByText(/permission/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New flow" })).toBeInTheDocument();
  });
});

describe("editing a file", () => {
  it("reload_from_file_shows_the_latest_revision", async () => {
    const adapter = disk(yamlOf(10));
    await renderRoot(remembered(adapter));
    adapter.text = yamlOf(13, "changed by the agent");
    click("Reload from file");
    expect(await screen.findByText("rev 13 · flow.yaml")).toBeInTheDocument();
    expect(screen.getByText("changed by the agent")).toBeInTheDocument();
  });

  it("reload_with_unsaved_changes_asks_first", async () => {
    const adapter = disk(yamlOf(10));
    await renderRoot(remembered(adapter));
    await editGoal("my edit");
    adapter.text = yamlOf(13, "agent");
    click("Reload from file");
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Reload from file?");
    fireEvent.click(within(dialog).getByRole("button", { name: "Discard changes" }));
    expect(await screen.findByText("rev 13 · flow.yaml")).toBeInTheDocument();
    expect(screen.getByText("agent")).toBeInTheDocument();
  });

  it("save_with_a_newer_file_opens_the_conflict_dialog_and_overwrite_writes_disk_plus_one", async () => {
    const adapter = disk(yamlOf(10));
    await renderRoot(remembered(adapter));
    await editGoal("my edit");
    adapter.text = yamlOf(14, "agent");
    click("Save");
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("The file changed on disk");
    expect(dialog).toHaveTextContent("14");
    expect(adapter.writes).toEqual([]);
    fireEvent.click(within(dialog).getByRole("button", { name: /Overwrite/ }));
    await waitFor(() => expect(adapter.writes).toHaveLength(1));
    expect(parseFlow(parseText(adapter.writes[0], "yaml"))).toMatchObject({ revision: 15, goal: "my edit" });
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });

  it("the_conflict_dialog_offers_reload_save_a_copy_and_cancel", async () => {
    const adapter = disk(yamlOf(10));
    await renderRoot(remembered(adapter));
    await editGoal("my edit");
    adapter.text = yamlOf(14, "agent");
    click("Save");
    const dialog = await screen.findByRole("alertdialog");
    for (const name of [/Reload/, /Save a copy/, "Cancel", /Overwrite/]) {
      expect(within(dialog).getByRole("button", { name })).toBeInTheDocument();
    }
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("new_flow_save_asks_where_to_save", async () => {
    const created = disk("", "new-flow.yaml");
    const d = deps({
      saveAs: async (name, text) => {
        await created.write(text);
        expect(name).toBe("new-flow.yaml");
        return created;
      },
    });
    await renderRoot(d);
    click("New flow");
    await editGoal("make it");
    click("Save");
    await waitFor(() => expect(created.writes).toHaveLength(1));
    expect(parseFlow(parseText(created.writes[0], "yaml"))).toMatchObject({ goal: "make it", revision: 1 });
    expect(await screen.findByText(/Saved new-flow.yaml/)).toBeInTheDocument();
  });

  it("the_file_format_can_be_chosen_until_a_file_is_saved", async () => {
    const created = disk("", "new-flow.json");
    const d = deps({
      saveAs: async (name, text) => {
        expect(name).toBe("new-flow.json");
        await created.write(text);
        return created;
      },
    });
    await renderRoot(d);
    click("New flow");
    fireEvent.change(screen.getByRole("combobox", { name: "File format" }), { target: { value: "json" } });
    await editGoal("x");
    click("Save");
    await waitFor(() => expect(created.writes).toHaveLength(1));
    expect(JSON.parse(created.writes[0]).goal).toBe("x");
    expect(screen.queryByRole("combobox", { name: "File format" })).toBeNull();
  });

  it("the_new_flow_action_asks_before_discarding_edits", async () => {
    await renderRoot(remembered(disk(yamlOf(10))));
    await editGoal("my edit");
    click("New flow");
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Start a new flow?");
    fireEvent.click(within(dialog).getByRole("button", { name: "Discard changes" }));
    await waitFor(() => expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("new-flow"));
  });
});

describe("browsers without file access", () => {
  const picked = (name = "flow.yaml", text = yamlOf(10)) => ({ fsSupported: false, pickFile: async () => ({ text, name }) });

  it("open_loads_the_file_and_save_downloads", async () => {
    const d = deps(picked());
    await renderRoot(d);
    click("Open file");
    expect(await screen.findByText("rev 10 · flow.yaml")).toBeInTheDocument();
    await editGoal("my edit");
    click("Save");
    await waitFor(() => expect(d.downloads).toEqual(["flow.yaml"]));
    expect(await screen.findByText(/Downloaded flow.yaml/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });

  it("reload_and_save_as_are_hidden", async () => {
    await renderRoot(deps(picked()));
    click("Open file");
    await screen.findByText("rev 10 · flow.yaml");
    expect(screen.queryByRole("button", { name: "Reload from file" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Save as" })).toBeNull();
    expect(screen.getByRole("button", { name: "Open file" })).toBeInTheDocument();
  });
});
