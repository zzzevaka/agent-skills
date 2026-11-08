import { fireEvent, render, screen } from "@testing-library/react";
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
