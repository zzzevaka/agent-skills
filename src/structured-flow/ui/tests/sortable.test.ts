import { announce, resolveDrop, uniqueIds } from "../src/ui/sortable";

const names = ["a", "b", "c", "d"];

describe("resolveDrop", () => {
  it("resolveDrop_returns_indexes_for_a_valid_drop", () => {
    expect(resolveDrop(names, "d", "a")).toEqual({ from: 3, to: 0 });
    expect(resolveDrop(names, "a", "c")).toEqual({ from: 0, to: 2 });
  });

  it.each([
    ["dropped outside the list", "b", null],
    ["dropped on itself", "b", "b"],
    ["dropped on something unknown", "b", "zzz"],
    ["unknown dragged item", "zzz", "a"],
  ])("resolveDrop_ignores_%s", (_label, active, over) => {
    expect(resolveDrop(names, active, over)).toBeNull();
  });
});

describe("announce", () => {
  it("announce_texts_are_exact", () => {
    expect(announce("start", "build", 2, 5)).toBe("Picked up build. Position 2 of 5.");
    expect(announce("over", "build", 3, 5)).toBe("build is over position 3 of 5.");
    expect(announce("end", "build", 3, 5)).toBe("Dropped build at position 3 of 5.");
    expect(announce("cancel", "build", 2, 5)).toBe(
      "Reordering cancelled. build returned to position 2 of 5.",
    );
  });
});

describe("uniqueIds", () => {
  it("keeps_unique_names_and_suffixes_duplicates", () => {
    expect(uniqueIds(["a", "b", "a", "a"])).toEqual(["a", "b", "a#1", "a#2"]);
  });
});
