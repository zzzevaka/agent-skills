import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { parseFlow } from "../src/domain/flow";
import { createFlowStore, FlowStoreProvider } from "../src/store/flowStore";
import { App } from "../src/ui/App";
import { navigate } from "../src/ui/route";

function setup(item: string | null = null, tab: "overview" | "stages" | "schemas" = "overview") {
  navigate({ tab, item }, { replace: true });
  const store = createFlowStore({
    flow: parseFlow({
      name: "My flow",
      goal: "g",
      revision: 4,
      schemas: { obj: { type: "object", properties: {} }, text: { type: "string" } },
      stages: [
        { name: "first", prompt: "p", state: "finished", output: "x", output_schema: "obj" },
        { name: "second", prompt: "p", depends_on: ["first"], state: "inprogress", output_schema: "obj" },
        { name: "third", prompt: "p" },
      ],
    }),
    format: "yaml",
    source: "flow.yaml",
  });
  render(
    <FlowStoreProvider store={store}>
      <App />
    </FlowStoreProvider>,
  );
  return store;
}

const stages = () => screen.getByRole("list", { name: "Stages" });
const schemas = () => screen.getByRole("list", { name: "Schemas" });
const stageRow = (name: string) => within(stages()).getByRole("button", { name: new RegExp(`^(?!Drag to reorder).*${name}`) });

beforeEach(() => {
  try {
    localStorage.clear();
  } catch {
    /* storage unavailable */
  }
  document.documentElement.classList.remove("dark");
});

describe("AppSidebar", () => {
  it("lists_stages_and_schemas_with_state_and_counts", () => {
    setup();
    expect(within(stages()).getAllByRole("button", { name: /^(?!Drag to reorder)/ })).toHaveLength(3);
    expect(stageRow("second").querySelector('[data-state="inprogress"]')).not.toBeNull();
    expect(stageRow("first")).toHaveTextContent("01");
    expect(within(schemas()).getByRole("button", { name: /obj/ })).toHaveTextContent("2 stages");
    expect(within(schemas()).getByRole("button", { name: /text/ })).toHaveTextContent("unused");
  });

  it("shows_the_flow_name_revision_and_source_in_the_header", () => {
    setup();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("My flow");
    expect(screen.getByText("rev 4 · flow.yaml")).toBeInTheDocument();
  });

  it("clicking_a_stage_selects_it_and_sets_the_hash", () => {
    setup();
    fireEvent.click(stageRow("third"));
    expect(window.location.hash).toBe("#/stages/third");
    expect(stageRow("third")).toHaveAttribute("aria-current", "true");
    expect(stageRow("second")).not.toHaveAttribute("aria-current");
  });

  it("clicking_a_schema_selects_it", () => {
    setup();
    fireEvent.click(within(schemas()).getByRole("button", { name: /text/ }));
    expect(window.location.hash).toBe("#/schemas/text");
    expect(within(schemas()).getByRole("button", { name: /text/ })).toHaveAttribute("aria-current", "true");
  });

  it("the_active_stage_is_selected_by_default_on_the_stages_route", () => {
    setup(null, "stages");
    expect(stageRow("second")).toHaveAttribute("aria-current", "true");
  });

  it("the_overview_item_is_current_on_the_overview", () => {
    setup();
    expect(screen.getByRole("button", { name: "Overview" })).toHaveAttribute("aria-current", "page");
    fireEvent.click(stageRow("first"));
    expect(screen.getByRole("button", { name: "Overview" })).not.toHaveAttribute("aria-current");
  });

  it("add_stage_and_add_schema_create_and_select", () => {
    const store = setup();
    fireEvent.click(screen.getByRole("button", { name: "Add stage" }));
    expect(store.getState().draft.stages.map((s) => s.name)).toContain("stage-4");
    expect(window.location.hash).toBe("#/stages/stage-4");
    fireEvent.click(screen.getByRole("button", { name: "Add schema" }));
    expect(Object.keys(store.getState().draft.schemas)).toContain("schema-3");
    expect(window.location.hash).toBe("#/schemas/schema-3");
  });
});

describe("collapsing", () => {
  const sidebarRoot = () => document.querySelector("[data-variant]") as HTMLElement;

  it("the_toggle_collapses_to_icons_and_rows_keep_their_names", () => {
    setup();
    expect(sidebarRoot()).toHaveAttribute("data-state", "expanded");
    fireEvent.click(screen.getByRole("button", { name: "Toggle sidebar" }));
    expect(sidebarRoot()).toHaveAttribute("data-state", "collapsed");
    expect(sidebarRoot()).toHaveAttribute("data-collapsible", "icon");
    expect(stageRow("second")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add stage" })).toBeInTheDocument();
    expect(localStorage.getItem("durable-flow-sidebar")).toBe("false");
  });

  it("a_remembered_collapsed_state_is_restored", () => {
    localStorage.setItem("durable-flow-sidebar", "false");
    setup();
    expect(sidebarRoot()).toHaveAttribute("data-state", "collapsed");
  });
});

describe("no top bar", () => {
  it("there_is_no_top_bar_and_the_sidebar_toggle_lives_in_the_sidebar_header", () => {
    setup("third", "stages");
    expect(screen.queryByRole("banner")).toBeNull();
    expect(screen.queryByRole("navigation", { name: "breadcrumb" })).toBeNull();
    const toggle = screen.getByRole("button", { name: "Toggle sidebar" });
    expect(toggle.closest("[data-sidebar='header']")).not.toBeNull();
  });

  it("the_toggle_stays_available_in_the_collapsed_rail", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Toggle sidebar" }));
    expect(screen.getByRole("button", { name: "Toggle sidebar" })).toBeInTheDocument();
  });

  it("the_change_controls_are_a_fixed_pill_shown_only_when_there_is_something_to_save", () => {
    const store = setup();
    expect(screen.queryByRole("group", { name: "Changes" })).toBeNull();
    act(() => store.getState().apply((f) => ({ ...f, goal: "changed" })));
    const pill = screen.getByRole("group", { name: "Changes" });
    expect(pill.className).toContain("fixed");
    expect(within(pill).getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("on_small_screens_a_floating_toggle_opens_the_drawer", () => {
    const original = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 500 });
    try {
      setup();
      const toggles = screen.getAllByRole("button", { name: "Toggle sidebar" });
      expect(toggles).toHaveLength(1);
      expect(toggles[0].className).toContain("fixed");
      fireEvent.click(toggles[0]);
      const drawer = screen.getByRole("dialog");
      expect(within(drawer).getByRole("list", { name: "Stages" })).toBeInTheDocument();
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: original });
    }
  });
});

describe("theme toggle", () => {
  it("theme_toggle_sets_dark_class_and_storage", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Dark theme" }));
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("durable-flow-theme")).toBe("dark");
    expect(screen.getByRole("button", { name: "Dark theme" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Light theme" }));
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("theme_toggle_survives_blocked_storage", () => {
    setup();
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => fireEvent.click(screen.getByRole("button", { name: "Dark theme" }))).not.toThrow();
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    spy.mockRestore();
  });
});
