import { render, screen } from "@testing-library/react";
import { parseFlow } from "../src/domain/flow";
import { createFlowStore, FlowStoreProvider } from "../src/store/flowStore";
import { ProgressSummary } from "../src/ui/ProgressSummary";

function renderSummary(stages: object[]) {
  const store = createFlowStore({ flow: parseFlow({ name: "f", goal: "g", stages }), format: "yaml", source: null });
  return render(
    <FlowStoreProvider store={store}>
      <ProgressSummary />
    </FlowStoreProvider>,
  );
}

describe("ProgressSummary", () => {
  const three = [
    { name: "a", prompt: "p", state: "finished", output: "x" },
    { name: "b", prompt: "p", state: "finished", output: "y" },
    { name: "c", prompt: "p", state: "inprogress" },
  ];

  it("shows_finished_over_total_next_to_the_bar", () => {
    renderSummary(three);
    expect(screen.getByText("2 / 3")).toBeInTheDocument();
    expect(screen.queryByText(/done/)).toBeNull();
  });

  it("has_one_segment_per_present_state_in_the_state_colours", () => {
    renderSummary(three);
    const [finished, inProgress, ...rest] = Array.from(screen.getByTestId("progress").children);
    expect(rest).toHaveLength(0);
    expect(finished).toHaveAttribute("title", "Finished: 2");
    expect(finished.className).toContain("bg-status-finished");
    expect(inProgress.className).toContain("bg-status-inprogress");
  });

  it("shows_nothing_for_a_flow_without_stages", () => {
    const { container } = renderSummary([]);
    expect(container).toBeEmptyDOMElement();
  });
});
