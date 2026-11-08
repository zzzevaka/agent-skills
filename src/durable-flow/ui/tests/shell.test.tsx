import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { parseFlow } from "../src/domain/flow";
import { createFlowStore, FlowStoreProvider } from "../src/store/flowStore";
import { App } from "../src/ui/App";
import { formatHash, parseHash } from "../src/ui/route";

function renderApp() {
  const flow = parseFlow({
    name: "My flow",
    goal: "g",
    revision: 4,
    stages: [
      { name: "first", prompt: "p" },
      { name: "second", prompt: "p", depends_on: ["first"] },
      { name: "it's a", prompt: "p" },
    ],
  });
  const store = createFlowStore({ flow, format: "yaml", source: "flow.yaml" });
  return render(
    <FlowStoreProvider store={store}>
      <App />
    </FlowStoreProvider>,
  );
}

const content = () => screen.getByTestId("content");
const row = (name: string) =>
  within(screen.getByRole("list", { name: "Stages" })).getByRole("button", { name: new RegExp(`^(?!Drag to reorder).*${name}`) });

beforeEach(() => {
  window.location.hash = "";
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-theme-mode");
  try {
    localStorage.clear();
  } catch {
    /* storage unavailable */
  }
});

describe("route", () => {
  it.each([
    ["", { tab: "overview", item: null }],
    ["#", { tab: "overview", item: null }],
    ["#/overview", { tab: "overview", item: null }],
    ["#/stages", { tab: "stages", item: null }],
    ["#/stages/a%20b", { tab: "stages", item: "a b" }],
    ["#/schemas/s1", { tab: "schemas", item: "s1" }],
    ["#/unknown", { tab: "overview", item: null }],
    ["#legacy-stage", { tab: "stages", item: "legacy-stage" }],
    ["#it%27s", { tab: "stages", item: "it's" }],
    ["#/stages/%E0%A4%A", { tab: "stages", item: "%E0%A4%A" }],
  ])("parseHash(%j)", (hash, expected) => {
    expect(parseHash(hash)).toEqual(expected);
  });

  it.each([
    { tab: "overview", item: null },
    { tab: "stages", item: "it's a/b#c%" },
    { tab: "schemas", item: "ключ" },
  ] as const)("formatHash_round_trips_%j", (route) => {
    expect(parseHash(formatHash({ ...route }))).toEqual(route);
  });
});

describe("App shell", () => {
  it("header_shows_name_revision_and_source", () => {
    renderApp();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("My flow");
    expect(screen.getByText("rev 4 · flow.yaml")).toBeInTheDocument();
  });

  it("the_pane_follows_the_hash", () => {
    window.location.hash = "#/schemas";
    renderApp();
    expect(content()).toHaveAttribute("data-tab", "schemas");
  });

  it("clicking_a_stage_row_updates_hash_and_pane", () => {
    renderApp();
    expect(content()).toHaveAttribute("data-tab", "overview");
    fireEvent.click(row("second"));
    expect(window.location.hash).toBe("#/stages/second");
    expect(content()).toHaveAttribute("data-tab", "stages");
    expect(content()).toHaveAttribute("data-item", "second");
  });

  it("the_overview_item_goes_back_to_the_overview", () => {
    window.location.hash = "#/stages/second";
    renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Overview" }));
    expect(window.location.hash).toBe("#/overview");
    expect(content()).toHaveAttribute("data-tab", "overview");
  });

  it("reacts_to_back_and_forward_navigation", async () => {
    renderApp();
    await act(async () => {
      window.location.hash = "#/schemas";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(content()).toHaveAttribute("data-tab", "schemas");
  });

  it("legacy_stage_hash_opens_stage", () => {
    window.location.hash = "#second";
    renderApp();
    expect(content()).toHaveAttribute("data-tab", "stages");
    expect(content()).toHaveAttribute("data-item", "second");
  });

  it("encoded_stage_name_in_hash_is_decoded", () => {
    window.location.hash = "#/stages/it%27s%20a";
    renderApp();
    expect(content()).toHaveAttribute("data-item", "it's a");
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("it's a");
  });

  it("theme_buttons_set_localStorage_key_and_theme_attributes", () => {
    renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Dark theme" }));
    expect(localStorage.getItem("durable-flow-theme")).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.dataset.themeMode).toBe("dark");
    fireEvent.click(screen.getByRole("button", { name: "Light theme" }));
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("theme_still_applies_when_storage_throws", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    renderApp();
    expect(() =>
      fireEvent.click(screen.getByRole("button", { name: "Dark theme" })),
    ).not.toThrow();
    expect(document.documentElement.dataset.theme).toBe("dark");
    spy.mockRestore();
  });
});
