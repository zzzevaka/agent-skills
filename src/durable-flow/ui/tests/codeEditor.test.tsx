import { EditorView } from "@codemirror/view";
import { act, fireEvent, render } from "@testing-library/react";
import { CodeEditor } from "../src/ui/CodeEditor";

const view = (container: HTMLElement) =>
  EditorView.findFromDOM(container.querySelector(".cm-editor") as HTMLElement)!;

describe("CodeEditor", () => {
  it("shows_the_initial_value_with_an_accessible_name", () => {
    const { container, getByRole } = render(
      <CodeEditor value={"a: 1\nb: 2"} language="yaml" ariaLabel="Schema" onChange={() => {}} />,
    );
    expect(container.querySelector(".cm-content")?.textContent).toContain("a: 1");
    expect(getByRole("textbox", { name: "Schema" })).toBeInTheDocument();
  });

  it("follows_value_changes_from_outside_without_calling_onChange", () => {
    const onChange = vi.fn();
    const { container, rerender } = render(
      <CodeEditor value="one" language="json" ariaLabel="Out" onChange={onChange} />,
    );
    rerender(<CodeEditor value="two" language="json" ariaLabel="Out" onChange={onChange} />);
    expect(view(container).state.doc.toString()).toBe("two");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("reports_edits_made_in_the_editor", () => {
    const onChange = vi.fn();
    const { container } = render(
      <CodeEditor value="one" language="text" ariaLabel="Out" onChange={onChange} />,
    );
    act(() => view(container).dispatch({ changes: { from: 3, insert: "!" } }));
    expect(onChange).toHaveBeenCalledWith("one!");
  });

  it("reports_blur", () => {
    const onBlur = vi.fn();
    const { container } = render(
      <CodeEditor value="x" language="text" ariaLabel="Out" onChange={() => {}} onBlur={onBlur} />,
    );
    fireEvent.blur(container.querySelector(".cm-content") as HTMLElement);
    expect(onBlur).toHaveBeenCalledTimes(1);
  });

  it("handles_an_empty_value_and_unmounts_cleanly", () => {
    const { container, unmount } = render(
      <CodeEditor value="" language="yaml" ariaLabel="Out" onChange={() => {}} />,
    );
    expect(view(container).state.doc.length).toBe(0);
    expect(() => unmount()).not.toThrow();
  });
});
