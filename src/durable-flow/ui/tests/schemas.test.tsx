import { fireEvent, render, screen, within } from "@testing-library/react";
import { parseFlow } from "../src/domain/flow";
import { createFlowStore, FlowStoreProvider } from "../src/store/flowStore";
import { navigate, useRoute } from "../src/ui/route";
import { AppSidebar } from "../src/ui/AppSidebar";
import { SchemasTab } from "../src/ui/SchemasTab";
import { SidebarProvider } from "@/components/ui/sidebar";

function Harness() {
  const route = useRoute();
  return (
    <SidebarProvider>
      <AppSidebar route={route} />
      <SchemasTab selected={route.tab === "schemas" ? route.item : null} />
    </SidebarProvider>
  );
}

function renderSchemas(schemas: object) {
  const flow = parseFlow({
    name: "f",
    goal: "g",
    schemas,
    stages: [
      { name: "a", prompt: "p", output_schema: "obj" },
      { name: "b", prompt: "p", output_schema: "obj" },
      { name: "c", prompt: "p" },
    ],
  });
  const store = createFlowStore({ flow, format: "yaml", source: null });
  return render(
    <FlowStoreProvider store={store}>
      <Harness />
    </FlowStoreProvider>,
  );
}

const SCHEMAS = {
  obj: { type: "object", properties: { n: { type: "integer" } } },
  text: { type: "string" },
};

beforeEach(() => {
  navigate({ tab: "schemas", item: null }, { replace: true });
});

describe("SchemasTab", () => {
  it("schema_list_shows_used_by_count", () => {
    renderSchemas(SCHEMAS);
    const list = screen.getByRole("list", { name: "Schemas" });
    expect(within(list).getByText("obj").closest("button")).toHaveTextContent("2 stages");
    expect(within(list).getByText("text").closest("button")).toHaveTextContent("unused");
  });

  it("selects_the_first_schema_by_default_and_shows_its_yaml", () => {
    renderSchemas(SCHEMAS);
    expect(screen.getByTestId("schema-detail").textContent).toContain("type: object");
  });

  it("clicking_a_schema_shows_its_definition_and_sets_the_hash", () => {
    renderSchemas(SCHEMAS);
    fireEvent.click(screen.getByText("text"));
    expect(window.location.hash).toBe("#/schemas/text");
    expect(screen.getByTestId("schema-detail").textContent).toContain("type: string");
  });

  it("unknown_schema_in_the_hash_falls_back_to_the_first", () => {
    navigate({ tab: "schemas", item: "ghost" }, { replace: true });
    renderSchemas(SCHEMAS);
    expect(screen.getByTestId("schema-detail").textContent).toContain("type: object");
  });

  it("used_by_chips_link_to_the_stages", () => {
    renderSchemas(SCHEMAS);
    fireEvent.click(within(screen.getByTestId("schema-detail")).getByRole("button", { name: "b" }));
    expect(window.location.hash).toBe("#/stages/b");
  });

  it("says_when_there_are_no_schemas", () => {
    renderSchemas({});
    expect(screen.getByText("No schemas defined.")).toBeInTheDocument();
  });

  it("schema_names_are_shown_as_text", () => {
    renderSchemas({ "<b>x</b>": { type: "string" } });
    expect(screen.getAllByText("<b>x</b>").length).toBeGreaterThan(0);
    expect(document.querySelector("b")).toBeNull();
  });
});
