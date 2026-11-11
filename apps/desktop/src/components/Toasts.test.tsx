import { act, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderApp } from "../test/render";
import { notify, notifyError } from "./Toasts";

describe("toasts", () => {
  it("shows a confirmation", async () => {
    renderApp();
    act(() => {
      notify("Note saved");
    });
    expect(await screen.findByText("Note saved")).toBeTruthy();
  });

  it("runs Undo and closes the toast", async () => {
    const { user } = renderApp();
    const undo = vi.fn<() => void>();
    act(() => {
      notify("Marked paid", undo);
    });
    await screen.findByText("Marked paid");
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(undo).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.queryByText("Marked paid")).toBeNull();
    });
  });

  it("shows an error", async () => {
    renderApp();
    act(() => {
      notifyError("Add at least one line item before sending.");
    });
    expect(await screen.findByText("Add at least one line item before sending.")).toBeTruthy();
  });
});
