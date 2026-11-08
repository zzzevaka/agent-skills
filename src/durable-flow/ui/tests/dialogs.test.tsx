import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmDialog } from "../src/ui/ConfirmDialog";

function setup() {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <ConfirmDialog title="Delete stage 'a'?" confirmLabel="Delete" onConfirm={onConfirm} onCancel={onCancel}>
      <p>It is required by: b.</p>
    </ConfirmDialog>,
  );
  return { onConfirm, onCancel };
}

describe("ConfirmDialog", () => {
  it("confirm_dialog_is_an_alertdialog_with_a_title_and_description", () => {
    setup();
    const dialog = screen.getByRole("alertdialog", { name: "Delete stage 'a'?" });
    expect(dialog).toHaveTextContent("It is required by: b.");
  });

  it("focus_starts_on_the_safe_choice", () => {
    setup();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
  });

  it("escape_cancels", async () => {
    const { onCancel, onConfirm } = setup();
    await userEvent.setup().keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("cancel_button_cancels", async () => {
    const { onCancel } = setup();
    await userEvent.setup().click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("confirm_runs_only_the_confirm_handler", async () => {
    const { onCancel, onConfirm } = setup();
    await userEvent.setup().click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("a_dialog_without_a_body_still_has_a_description_for_screen_readers", () => {
    render(<ConfirmDialog title="Sure?" confirmLabel="Yes" onConfirm={() => {}} onCancel={() => {}} />);
    expect(screen.getByRole("alertdialog")).toHaveAccessibleDescription(/cannot be undone/i);
  });
});
