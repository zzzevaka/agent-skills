import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { parseFlow } from "../src/domain/flow";
import { createFlowStore, FlowStoreProvider } from "../src/store/flowStore";
import { navigate, useRoute } from "../src/ui/route";
import { AppSidebar } from "../src/ui/AppSidebar";
import { StagesTab } from "../src/ui/StagesTab";
import { SidebarProvider } from "@/components/ui/sidebar";

function Harness() {
  const route = useRoute();
  return (
    <SidebarProvider>
      <AppSidebar route={route} />
      <StagesTab selected={route.tab === "stages" ? route.item : null} />
    </SidebarProvider>
  );
}

function renderStages(stages: object[], schemas: object = {}) {
  const flow = parseFlow({ name: "f", goal: "g", schemas, stages });
  const store = createFlowStore({ flow, format: "yaml", source: null });
  return render(
    <FlowStoreProvider store={store}>
      <Harness />
    </FlowStoreProvider>,
  );
}

const trio = () => [
  { name: "first", prompt: "Do **first**", state: "finished", output: "out1" },
  {
    name: "second",
    prompt: "Use <project-id>",
    depends_on: ["first"],
    state: "inprogress",
    message: "Working on it",
    output: "partial",
  },
  { name: "third", prompt: "p", depends_on: ["second"] },
];

const openTab = (name: string) => fireEvent.mouseDown(screen.getByRole("tab", { name }), { button: 0 });
const detail = () => screen.getByTestId("stage-detail");
const inList = (name: string) => within(screen.getByRole("list", { name: "Stages" })).getByText(name);

beforeEach(() => {
  navigate({ tab: "stages", item: null }, { replace: true });
});

describe("StagesTab list", () => {
  it("lists_every_stage_with_order_and_state", () => {
    renderStages(trio());
    const list = screen.getByRole("list", { name: "Stages" });
    expect(within(list).getAllByRole("button", { name: /^(?!Drag to reorder)/ })).toHaveLength(3);
    const row = within(list).getByText("second").closest("button")!;
    expect(row).toHaveTextContent("02");
    expect(row.querySelector('[data-state="inprogress"]')).not.toBeNull();
  });

  it("defaults_to_the_active_stage", () => {
    renderStages(trio());
    expect(within(detail()).getByRole("heading", { level: 2 })).toHaveTextContent("second");
  });

  it("defaults_to_the_first_stage_when_nothing_is_active", () => {
    renderStages([{ name: "a", prompt: "p" }, { name: "b", prompt: "p" }]);
    expect(within(detail()).getByRole("heading", { level: 2 })).toHaveTextContent("a");
  });

  it("clicking_a_stage_selects_it_and_sets_the_hash", () => {
    renderStages(trio());
    fireEvent.click(inList("third"));
    expect(window.location.hash).toBe("#/stages/third");
    expect(within(detail()).getByRole("heading", { level: 2 })).toHaveTextContent("third");
  });

  it("an_unknown_stage_in_the_hash_falls_back_to_the_default", () => {
    navigate({ tab: "stages", item: "ghost" }, { replace: true });
    renderStages(trio());
    expect(within(detail()).getByRole("heading", { level: 2 })).toHaveTextContent("second");
  });
});

describe("StageDetail", () => {
  it("shows_the_state_but_not_the_position_the_sidebar_already_shows", () => {
    renderStages(trio());
    expect(detail().textContent).not.toMatch(/STAGE \d+ \/ \d+/i);
    expect(within(detail()).getByTestId("state-pill")).toHaveTextContent("In progress");
  });

  it("shows_the_prompt_in_the_editor_with_placeholders_literal", () => {
    renderStages(trio());
    expect((within(detail()).getByRole("textbox", { name: "Prompt" }) as HTMLTextAreaElement).value).toContain(
      "<project-id>",
    );
    fireEvent.click(inList("first"));
    expect(within(detail()).getByRole("textbox", { name: "Prompt" })).toHaveValue("Do **first**");
  });

  it("shows_the_reason_note_for_a_waiting_stage", () => {
    renderStages([{ name: "a", prompt: "p", state: "waiting", message: "Working on it" }]);
    expect(within(detail()).getByTestId("reason-note")).toHaveTextContent("Working on it");
  });

  it("shows_input_only_when_every_dependency_is_finished", () => {
    renderStages(trio());
    expect(within(detail()).getByText("Outputs of dependencies")).toBeInTheDocument();
    fireEvent.click(inList("third"));
    expect(within(detail()).queryByText("Outputs of dependencies")).toBeNull();
  });

  it("shows_no_output_yet_for_a_stage_without_output", () => {
    renderStages(trio());
    fireEvent.click(inList("third"));
    expect(within(detail()).getByText("No output yet.")).toBeInTheDocument();
  });

  it("output_value_is_text_not_html", () => {
    renderStages([{ name: "a", prompt: "p", state: "finished", output: "<b>x</b>" }]);
    expect(within(detail()).getByText("<b>x</b>")).toBeInTheDocument();
    expect(detail().querySelector("b")).toBeNull();
  });

  it("structured_output_is_pretty_printed_json", () => {
    renderStages(
      [{ name: "a", prompt: "p", state: "finished", output: { n: 1 }, output_schema: "s" }],
      { s: { type: "object", properties: { n: { type: "integer" } } } },
    );
    expect(detail().textContent).toContain('"n": 1');
  });

  it("large_output_is_truncated_with_show_all", () => {
    const big = "x".repeat(50_000);
    renderStages([{ name: "a", prompt: "p", state: "finished", output: big }]);
    const block = within(detail()).getByTestId("value");
    expect(block.textContent!.length).toBeLessThanOrEqual(20_000);
    fireEvent.click(within(detail()).getByRole("button", { name: "Show all" }));
    expect(within(detail()).getByTestId("value").textContent).toHaveLength(50_000);
    expect(within(detail()).queryByRole("button", { name: "Show all" })).toBeNull();
  });

  it("output_schema_panel_shows_the_name_and_yaml_definition", () => {
    renderStages(
      [{ name: "a", prompt: "p", output_schema: "s" }],
      { s: { type: "object", properties: { n: { type: "integer" } } } },
    );
    openTab("Output schema");
    expect(detail()).toHaveTextContent("s");
    expect(detail().textContent).toContain("type: object");
  });

  it("output_schema_panel_explains_the_string_default", () => {
    renderStages([{ name: "a", prompt: "p" }]);
    openTab("Output schema");
    expect(detail()).toHaveTextContent("No output schema");
  });

  it("dependencies_panel_shows_chips_and_required_by_links", () => {
    renderStages(trio());
    const panel = within(detail());
    expect(panel.getByRole("button", { name: "Remove first" })).toBeInTheDocument();
    fireEvent.click(panel.getByRole("button", { name: /third/ }));
    expect(window.location.hash).toBe("#/stages/third");
  });

  it("dependencies_panel_says_when_there_are_none", () => {
    renderStages([{ name: "a", prompt: "p" }]);
    expect(detail()).toHaveTextContent("No earlier stages.");
    expect(detail()).toHaveTextContent("No dependent stages.");
  });
});

describe("StageDetail chrome", () => {
  it("stage_panels_are_tabs_and_arrow_keys_move_between_them", async () => {
    const user = userEvent.setup();
    renderStages(trio());
    const tabs = within(detail()).getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["Current state", "Output schema"]);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    tabs[0].focus();
    await user.keyboard("{ArrowRight}");
    expect(within(detail()).getByRole("tab", { name: "Output schema" })).toHaveAttribute("aria-selected", "true");
    expect(within(detail()).getByRole("tabpanel")).toHaveTextContent("No output schema");
  });

  it("dependencies_are_their_own_block_beside_the_tabs", () => {
    renderStages(trio());
    const block = within(detail()).getByRole("region", { name: "Dependencies" });
    expect(block).toHaveTextContent("Depends on");
    expect(block).toHaveTextContent("Required by");
    expect(within(detail()).queryByRole("tab", { name: "Dependencies" })).toBeNull();
    expect(within(detail()).getByRole("tabpanel")).not.toContainElement(block);
  });

  it("toolbar_buttons_keep_their_names_and_show_tooltips", async () => {
    const user = userEvent.setup();
    renderStages(trio());
    const duplicate = within(detail()).getByRole("button", { name: "Duplicate stage" });
    await user.hover(duplicate);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Duplicate stage");
    expect(within(detail()).getByRole("button", { name: "Delete stage" })).toBeInTheDocument();
  });

  it("the_header_shows_a_state_badge_with_a_coloured_dot", () => {
    renderStages(trio());
    const pill = within(detail()).getByTestId("state-pill");
    expect(pill).toHaveTextContent("In progress");
    expect(pill.querySelector("span.bg-status-inprogress")).not.toBeNull();
  });
});
