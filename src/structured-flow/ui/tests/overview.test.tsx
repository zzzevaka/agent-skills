import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import { parseFlow } from "../src/domain/flow";
import { createFlowStore, FlowStoreProvider } from "../src/store/flowStore";
import { Overview } from "../src/ui/Overview";
import { navigate, useRoute } from "../src/ui/route";

function Harness() {
  const route = useRoute();
  return <Overview selected={route.tab === "overview" ? route.item : null} />;
}

function renderOverview(goal = "Ship <project-id> **now**") {
  const flow = parseFlow({
    name: "f",
    goal,
    stages: [
      { name: "first", prompt: "p", state: "finished", output: "x" },
      { name: "second", prompt: "p", depends_on: ["first"], state: "finished", output: "y" },
      { name: "third", prompt: "p", depends_on: ["second"], state: "inprogress" },
    ],
  });
  const store = createFlowStore({ flow, format: "yaml", source: null });
  return render(
    <FlowStoreProvider store={store}>
      <Harness />
    </FlowStoreProvider>,
  );
}

const node = (name: string) => screen.getByTitle(name);

beforeEach(() => {
  navigate({ tab: "overview", item: null }, { replace: true });
});

describe("Overview", () => {
  it("shows_the_goal_in_the_editor_with_placeholders_literal", () => {
    renderOverview();
    const goal = screen.getByRole("textbox", { name: "Goal" }) as HTMLTextAreaElement;
    expect(goal.value).toContain("**now**");
    expect(goal.value).toContain("<project-id>");
  });

  it("the_flow_card_sits_below_the_goal_and_spans_the_full_width", () => {
    renderOverview();
    const card = screen.getByTestId("flow-card");
    const goal = screen.getByRole("textbox", { name: "Goal" });
    expect(goal.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Not in a side-by-side grid with the goal.
    expect(card.parentElement!.className).not.toMatch(/grid-cols/);
    expect(card.className).not.toMatch(/sticky/);
  });

  it("an_empty_goal_is_an_empty_editor", () => {
    renderOverview("");
    expect(screen.getByRole("textbox", { name: "Goal" })).toHaveValue("");
  });

  it("renders_one_node_per_stage_with_order_and_state", () => {
    renderOverview();
    expect(node("second")).toHaveTextContent("02");
    expect(node("second")).toHaveTextContent("Finished");
    expect(node("third")).toHaveClass("s-inprogress");
  });

  it("marks_a_pending_stage_as_ready_or_blocked_by_its_dependencies", () => {
    const flow = parseFlow({
      name: "f",
      goal: "g",
      stages: [
        { name: "root", prompt: "p" },
        { name: "child", prompt: "p", depends_on: ["root"] },
      ],
    });
    const store = createFlowStore({ flow, format: "yaml", source: null });
    render(
      <FlowStoreProvider store={store}>
        <Harness />
      </FlowStoreProvider>,
    );
    expect(node("root")).toHaveClass("s-ready_to_start");
    expect(node("root")).toHaveTextContent("Ready to start");
    expect(node("child")).toHaveClass("s-waiting_for_dependencies");
    expect(node("child")).toHaveTextContent("Waiting for dependencies");
  });

  const renderStages = (stages: object[]) => {
    const store = createFlowStore({ flow: parseFlow({ name: "f", goal: "g", stages }), format: "yaml", source: null });
    return render(
      <FlowStoreProvider store={store}>
        <Harness />
      </FlowStoreProvider>,
    );
  };
  const place = (name: string) => {
    const el = node(name);
    return { left: el.style.left, top: el.style.top };
  };

  it("the_graph_runs_left_to_right_by_default_and_the_button_switches_to_top_to_bottom", () => {
    renderStages([
      { name: "a", prompt: "p" },
      { name: "b", prompt: "p", depends_on: ["a"] },
    ]);
    expect(place("a").top).toBe(place("b").top);
    expect(parseFloat(place("b").left)).toBeGreaterThan(parseFloat(place("a").left));
    fireEvent.click(screen.getByRole("button", { name: "Lay out stages top to bottom" }));
    expect(place("a").left).toBe(place("b").left);
    expect(parseFloat(place("b").top)).toBeGreaterThan(parseFloat(place("a").top));
    expect(screen.getByRole("button", { name: "Lay out stages left to right" })).toBeInTheDocument();
  });

  describe("fitting the card", () => {
    // Four chained stages at the minimum node width make a 980px wide graph left to right.
    const chain = ["a", "b", "c", "d"].map((name, i) => ({
      name,
      prompt: "p",
      ...(i ? { depends_on: [["a", "b", "c", "d"][i - 1]] } : {}),
    }));
    const graph = () => document.querySelector(".graph") as HTMLElement;
    const withCardWidth = (width: number) =>
      vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(width);
    afterEach(() => vi.restoreAllMocks());

    it("a_graph_wider_than_its_card_is_scaled_down_to_fit", () => {
      withCardWidth(600);
      renderStages(chain);
      expect(graph().style.transform).toMatch(/^scale\(0\.61/);
      expect(graph().parentElement!.style.width).toMatch(/^599|^600/);
    });

    it("a_graph_that_fits_is_left_alone_and_positions_do_not_change", () => {
      withCardWidth(2000);
      renderStages(chain);
      expect(graph().style.transform).toBe("");
      expect(place("a")).toEqual({ left: "32px", top: "32px" });
    });

    it("an_unknown_card_width_does_not_scale", () => {
      renderStages(chain);
      expect(graph().style.transform).toBe("");
    });
  });

  it("independent_stages_are_drawn_side_by_side", () => {
    renderStages([
      { name: "a", prompt: "p" },
      { name: "b", prompt: "p" },
      { name: "c", prompt: "p", depends_on: ["a", "b"] },
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Lay out stages top to bottom" }));
    expect(place("a").top).toBe(place("b").top);
    expect(place("a").left).not.toBe(place("b").left);
    expect(parseFloat(place("c").top)).toBeGreaterThan(parseFloat(place("a").top));
  });

  it("draws_one_arrow_per_dependency_that_no_other_path_implies", () => {
    renderStages([
      { name: "a", prompt: "p" },
      { name: "b", prompt: "p", depends_on: ["a"] },
      { name: "c", prompt: "p", depends_on: ["a", "b"] },
    ]);
    // a>c is implied by a>b>c, so only a>b and b>c are drawn.
    expect(document.querySelectorAll("svg.edges g path.edge-line")).toHaveLength(2);
  });

  it("selecting_a_stage_also_draws_its_implied_dependencies_dashed", () => {
    renderStages([
      { name: "a", prompt: "p" },
      { name: "b", prompt: "p", depends_on: ["a"] },
      { name: "c", prompt: "p", depends_on: ["a", "b"] },
    ]);
    fireEvent.click(node("c"));
    expect(document.querySelectorAll("svg.edges path.hl")).toHaveLength(2);
    expect(document.querySelectorAll("svg.edges path.hl.implied")).toHaveLength(1);
    fireEvent.click(node("a"));
    expect(document.querySelectorAll("svg.edges path.hl")).toHaveLength(2); // a>b and the implied a>c
    expect(document.querySelectorAll("svg.edges path.hl.implied")).toHaveLength(1);
  });

  it("the_ends_of_an_implied_dependency_count_as_related_to_the_selection", () => {
    renderStages([
      { name: "a", prompt: "p" },
      { name: "b", prompt: "p", depends_on: ["a"] },
      { name: "c", prompt: "p", depends_on: ["a", "b"] },
    ]);
    fireEvent.click(node("c"));
    expect(node("a")).toHaveClass("related");
    expect(node("b")).toHaveClass("related");
  });

  it("selecting_a_stage_highlights_only_its_edges_and_keeps_positions", () => {
    renderStages([
      { name: "a", prompt: "p" },
      { name: "b", prompt: "p", depends_on: ["a"] },
      { name: "c", prompt: "p", depends_on: ["b"] },
      { name: "d", prompt: "p" },
    ]);
    const before = ["a", "b", "c", "d"].map(place);
    fireEvent.click(node("b"));
    expect(document.querySelectorAll("svg.edges path.hl")).toHaveLength(2);
    expect(["a", "b", "c", "d"].map(place)).toEqual(before);
  });

  it("clicking_node_selects_and_sets_hash", () => {
    renderOverview();
    fireEvent.click(node("second"));
    expect(window.location.hash).toBe("#/overview/second");
    expect(node("second")).toHaveClass("selected");
    expect(node("first")).toHaveClass("related");
    expect(node("third")).toHaveClass("related");
  });

  it("hash_selects_node_on_load_and_unknown_stage_selects_nothing", () => {
    navigate({ tab: "overview", item: "third" }, { replace: true });
    const { unmount } = renderOverview();
    expect(node("third")).toHaveClass("selected");
    unmount();
    navigate({ tab: "overview", item: "ghost" }, { replace: true });
    renderOverview();
    expect(document.querySelector(".node.selected")).toBeNull();
  });

  it("escape_clears_selection", () => {
    renderOverview();
    fireEvent.click(node("second"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(window.location.hash).toBe("#/overview");
    expect(document.querySelector(".node.selected")).toBeNull();
  });

  it("selection_offers_a_link_to_the_stage_details", () => {
    renderOverview();
    expect(screen.queryByRole("button", { name: /open stage/i })).toBeNull();
    fireEvent.click(node("second"));
    fireEvent.click(screen.getByRole("button", { name: /open stage/i }));
    expect(window.location.hash).toBe("#/stages/second");
  });

  it("edges_are_drawn_and_finished_sources_are_marked_done", () => {
    renderOverview();
    // one line per source stage
    const paths = document.querySelectorAll(".edges path");
    expect(paths).toHaveLength(2);
    expect(paths[0]).toHaveClass("done");
  });
});

describe("Overview page", () => {
  it("has_a_heading_and_the_flow_card_but_no_duplicated_progress_or_goal_titles", () => {
    renderOverview();
    expect(screen.getByRole("heading", { level: 2, name: "Overview" })).toBeInTheDocument();
    expect(screen.getByText("Flow", { selector: "h3" })).toBeInTheDocument();
    expect(screen.queryByText("Goal", { selector: "h3" })).toBeNull();
    expect(screen.queryByText("Progress", { selector: "h3" })).toBeNull();
    expect(screen.queryByText(/stages finished/)).toBeNull();
    expect(screen.queryByTestId("progress")).toBeNull();
  });

  it("the_goal_editor_has_its_own_placeholder", () => {
    renderOverview("");
    expect(screen.getByRole("textbox", { name: "Goal" })).toHaveAttribute("placeholder", "Please enter flow goal ...");
  });
});

describe("Overview flow full screen", () => {
  it("the_flow_card_expands_to_full_screen_and_back", () => {
    renderOverview();
    const card = screen.getByTestId("flow-card");
    expect(card).not.toHaveAttribute("data-fullscreen");
    fireEvent.click(screen.getByRole("button", { name: "Expand flow to full screen" }));
    expect(card).toHaveAttribute("data-fullscreen", "true");
    fireEvent.click(screen.getByRole("button", { name: "Exit full screen" }));
    expect(card).not.toHaveAttribute("data-fullscreen");
  });

  it("escape_leaves_full_screen_first_and_keeps_the_selection", () => {
    renderOverview();
    fireEvent.click(node("second"));
    fireEvent.click(screen.getByRole("button", { name: "Expand flow to full screen" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByTestId("flow-card")).not.toHaveAttribute("data-fullscreen");
    expect(window.location.hash).toBe("#/overview/second");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(window.location.hash).toBe("#/overview");
  });

  it("selection_still_works_in_full_screen", () => {
    renderOverview();
    fireEvent.click(screen.getByRole("button", { name: "Expand flow to full screen" }));
    fireEvent.click(node("third"));
    expect(node("third")).toHaveClass("selected");
    expect(screen.getByRole("button", { name: /open stage/i })).toBeInTheDocument();
  });
});
