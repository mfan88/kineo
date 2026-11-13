import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PendingButton } from "./PendingButton";

function setup(pending: boolean) {
  const onPress = vi.fn<() => void>();
  render(
    <PendingButton pending={pending} pendingLabel="Saving…" onPress={onPress}>
      Save profile
    </PendingButton>,
  );
  return { onPress, user: userEvent.setup() };
}

describe("PendingButton", () => {
  it("shows its label and presses normally when idle", async () => {
    const { onPress, user } = setup(false);
    await user.click(screen.getByRole("button", { name: "Save profile" }));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("says what's happening as a status, and ignores clicks while pending", async () => {
    const { onPress, user } = setup(true);
    expect(screen.getByRole("status").textContent).toBe("Saving…");
    const button = screen.getByRole("button");
    expect(button.getAttribute("aria-disabled")).toBe("true");
    await user.click(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it("keeps both labels in the button, so its width never changes", () => {
    setup(true);
    const button = screen.getByRole("button");
    expect(button.textContent).toContain("Save profile");
    expect(button.textContent).toContain("Saving…");
  });
});
