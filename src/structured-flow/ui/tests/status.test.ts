import { parseFlow } from "../src/domain/flow";
import { computeStatuses, storedState } from "../src/domain/status";
import type { Stage, StageStatus } from "../src/domain/types";
import { loadParity } from "./fixtures";

interface StatusCase {
  label: string;
  flow: unknown;
  statuses: Record<string, StageStatus>;
}

describe("computeStatuses (parity corpus)", () => {
  const cases = loadParity<StatusCase[]>("status-cases.json");

  it.each(cases.map((c) => [c.label, c] as const))("%s", (_label, c) => {
    const flow = parseFlow(c.flow);
    const statuses = computeStatuses(flow.stages);
    expect(Object.fromEntries(flow.stages.map((s, i) => [s.name, statuses[i]]))).toEqual(
      c.statuses,
    );
  });
});

describe("computeStatuses", () => {
  const stage = (name: string, depends_on: string[], state: Stage["state"] = "pending"): Stage => ({
    name,
    prompt: "p",
    depends_on,
    output_schema: null,
    state,
    message: null,
    output: null,
  });

  it("treats_an_unknown_dependency_as_unfinished", () => {
    expect(computeStatuses([stage("a", ["ghost"])])).toEqual(["waiting_for_dependencies"]);
  });

  it("keeps_the_order_of_the_stages", () => {
    expect(computeStatuses([stage("a", [], "finished"), stage("b", ["a"]), stage("c", ["b"])])).toEqual([
      "finished",
      "ready_to_start",
      "waiting_for_dependencies",
    ]);
  });
});

describe("storedState", () => {
  it("maps_computed_pending_statuses_back_to_pending", () => {
    expect(storedState("ready_to_start")).toBe("pending");
    expect(storedState("waiting_for_dependencies")).toBe("pending");
    expect(storedState("waiting")).toBe("waiting");
    expect(storedState("failed")).toBe("failed");
  });
});
