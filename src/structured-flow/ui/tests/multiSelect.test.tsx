import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { MultiSelect } from "@/components/ui/multi-select";

const OPTIONS = ["alpha", "beta", "gamma", "delta"].map((value) => ({ value }));

let latest: string[];

function Harness({ initial = ["beta"] }: { initial?: string[] }) {
  const [value, setValue] = useState(initial);
  latest = value;
  return (
    <MultiSelect
      label="Dependencies"
      placeholder="Add a stage"
      emptyText="Nothing left to add."
      options={OPTIONS}
      value={value}
      onChange={(next) => {
        latest = next;
        setValue(next);
      }}
    />
  );
}

const open = () => fireEvent.click(screen.getByRole("combobox", { name: "Dependencies" }));
const listbox = () => within(screen.getByRole("listbox", { name: "Dependencies" }));

describe("MultiSelect", () => {
  it("shows_the_selected_values_as_chips_with_remove_buttons", () => {
    render(<Harness initial={["alpha", "gamma"]} />);
    expect(screen.getByRole("button", { name: "Remove alpha" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove gamma" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove beta" })).toBeNull();
  });

  it("removing_a_chip_drops_the_value", () => {
    render(<Harness initial={["alpha", "gamma"]} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove alpha" }));
    expect(latest).toEqual(["gamma"]);
  });

  it("the_list_offers_only_values_that_are_not_selected", () => {
    render(<Harness initial={["beta"]} />);
    expect(screen.queryByRole("listbox")).toBeNull();
    open();
    expect(listbox().getAllByRole("option").map((o) => o.textContent)).toEqual(["alpha", "gamma", "delta"]);
  });

  it("picking_adds_the_value_in_option_order_and_keeps_the_list_open", () => {
    render(<Harness initial={["beta"]} />);
    open();
    fireEvent.click(listbox().getByRole("option", { name: "delta" }));
    expect(latest).toEqual(["beta", "delta"]);
    fireEvent.click(listbox().getByRole("option", { name: "alpha" }));
    expect(latest).toEqual(["alpha", "beta", "delta"]);
    expect(listbox().getAllByRole("option").map((o) => o.textContent)).toEqual(["gamma"]);
  });

  it("typing_filters_the_list_and_enter_picks_the_first_match", () => {
    render(<Harness initial={[]} />);
    open();
    const search = screen.getByRole("textbox", { name: "Search Dependencies" });
    fireEvent.change(search, { target: { value: "ga" } });
    expect(listbox().getAllByRole("option").map((o) => o.textContent)).toEqual(["gamma"]);
    fireEvent.keyDown(search, { key: "Enter" });
    expect(latest).toEqual(["gamma"]);
  });

  it("says_so_when_nothing_matches_or_nothing_is_left", () => {
    render(<Harness initial={["alpha", "beta", "gamma", "delta"]} />);
    open();
    expect(screen.getByText("Nothing left to add.")).toBeInTheDocument();
  });

  it("no_options_and_no_value_shows_the_empty_text_instead_of_a_picker", () => {
    render(
      <MultiSelect label="Dependencies" placeholder="Add" emptyText="No earlier stages." options={[]} value={[]} onChange={() => {}} />,
    );
    expect(screen.getByText("No earlier stages.")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).toBeNull();
  });
});
