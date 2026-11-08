import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { parseFlow } from "../src/domain/flow";
import { setMeta } from "../src/domain/ops";
import { createFlowStore, FlowStoreProvider } from "../src/store/flowStore";
import { App } from "../src/ui/App";
import { HARNESSES, installCommand, runCommands, runFileName } from "../src/ui/runCommands";
import * as download from "../src/io/download";

const FLOW = { name: "My flow", goal: "g", revision: 4, stages: [{ name: "a", prompt: "p" }] };

function setup(source: string | null = "my-flow.yaml") {
  const store = createFlowStore({ flow: parseFlow(FLOW), format: "yaml", source });
  render(
    <FlowStoreProvider store={store}>
      <App onSave={() => {}} />
    </FlowStoreProvider>,
  );
  return { store, user: userEvent.setup() };
}

const open = async (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole("button", { name: "How to run?" }));

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("run commands", () => {
  const [opencode, claude, codex] = HARNESSES;

  it("each_harness_has_its_own_invocation", () => {
    expect(runCommands(opencode, "f.yaml")[0].command).toBe('opencode run "@structured-flow run f.yaml"');
    expect(runCommands(claude, "f.yaml")[0].command).toBe('claude "/structured-flow run f.yaml"');
    expect(runCommands(codex, "f.yaml")[0].command).toBe("codex '$structured-flow run f.yaml'");
  });

  it("the_second_command_runs_only_the_next_stage", () => {
    expect(runCommands(opencode, "f.yaml")[1].command).toContain("run only next stage and stop f.yaml");
  });

  it("install_targets_the_chosen_agent", () => {
    expect(installCommand(claude)).toBe(
      "npx skills add https://github.com/zzzevaka/agent-skills --skill structured-flow -a claude-code",
    );
  });

  it("file_names_never_carry_shell_syntax", () => {
    expect(runFileName("a b;rm -rf $HOME.yaml", "yaml")).toBe("a_b_rm_-rf_HOME.yaml");
    expect(runFileName("../../x.json", "json")).toBe("x.json");
    expect(runFileName("--help", "yaml")).toBe("help");
    expect(runFileName(null, "json")).toBe("flow.json");
    expect(runFileName("", "yaml")).toBe("flow.yaml");
  });
});

describe("run dialog", () => {
  it("run_opens_a_dialog_with_the_three_steps", async () => {
    const { user } = setup();
    await open(user);
    const dialog = screen.getByRole("alertdialog", { name: "How to run this flow" });
    for (const step of ["Install the skill", "Download the flow file", "Start the run"]) {
      expect(within(dialog).getByRole("region", { name: step })).toBeInTheDocument();
    }
    expect(within(dialog).getByLabelText("Install command")).toHaveTextContent("-a opencode");
    expect(within(dialog).getByLabelText("Run the whole flow")).toHaveTextContent(
      'opencode run "@structured-flow run path/to/my-flow.yaml"',
    );
  });

  it("choosing_a_system_switches_the_commands_and_is_remembered", async () => {
    const { user } = setup();
    await open(user);
    await user.click(screen.getByRole("tab", { name: "Codex" }));
    expect(screen.getByLabelText("Install command")).toHaveTextContent("-a codex");
    expect(screen.getByLabelText("Run the whole flow")).toHaveTextContent("codex '$structured-flow run path/to/my-flow.yaml'");
    await user.keyboard("{Escape}");
    await open(user);
    expect(screen.getByRole("tab", { name: "Codex" })).toHaveAttribute("aria-selected", "true");
  });

  it("the_download_button_saves_the_saved_flow_under_the_file_name", async () => {
    const spy = vi.spyOn(download, "downloadText").mockImplementation(() => {});
    const { user, store } = setup();
    act(() => store.getState().apply((f) => setMeta(f, { goal: "unsaved" })));
    await open(user);
    expect(within(screen.getByRole("alertdialog")).getByRole("status")).toHaveTextContent(/unsaved changes/i);
    await user.click(screen.getByRole("button", { name: "Download my-flow.yaml" }));
    expect(spy).toHaveBeenCalledTimes(1);
    const [name, text] = spy.mock.calls[0];
    expect(name).toBe("my-flow.yaml");
    expect(text).toContain("goal: g");
    expect(text).not.toContain("unsaved");
  });

  it("a_new_flow_gets_a_default_file_name", async () => {
    const { user } = setup(null);
    await open(user);
    expect(screen.getByRole("button", { name: "Download flow.yaml" })).toBeInTheDocument();
  });

  it("close_dismisses_the_dialog", async () => {
    const { user } = setup();
    await open(user);
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});
