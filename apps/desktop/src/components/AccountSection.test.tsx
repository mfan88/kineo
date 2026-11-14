import { screen, waitFor, within } from "@testing-library/react";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import type { Account } from "../auth/account";
import { DemoStore } from "../data/store";
import { renderApp } from "../test/render";

function account(results: Awaited<ReturnType<Account["signOut"]>>[] = ["signed-out"]) {
  const signOut = vi.fn<Account["signOut"]>();
  for (const result of results) signOut.mockResolvedValueOnce(result);
  return { email: "alex@example.com", signOut } satisfies Account;
}

describe("Sign out in Settings", () => {
  it("isn't shown without a signed-in account", () => {
    renderApp("/settings");
    expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
  });

  it("shows who's signed in and signs out straight away when everything is saved", async () => {
    const signedIn = account();
    const { user } = renderApp("/settings", new DemoStore(), signedIn);
    expect(screen.getByText("Signed in as alex@example.com")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Sign out" }));
    expect(signedIn.signOut).toHaveBeenCalledWith({ discardUnsynced: false });
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("shows Signing out… while signing out with everything saved", async () => {
    let resolveSignOut: ((result: "signed-out") => void) | undefined;
    const signedIn = {
      email: "jordan@example.com",
      signOut: vi.fn<Account["signOut"]>(
        () =>
          new Promise<"signed-out">((resolve) => {
            resolveSignOut = resolve;
          }),
      ),
    } satisfies Account;
    const { user } = renderApp("/settings", new DemoStore(), signedIn);

    const button = screen.getByRole("button", { name: "Sign out" });
    await user.click(button);
    expect(signedIn.signOut).toHaveBeenCalledWith({ discardUnsynced: false });

    expect(await screen.findByRole("status")).toHaveProperty("textContent", "Signing out…");

    await act(async () => {
      resolveSignOut?.("signed-out");
    });
  });

  it("warns about unsaved changes and stays signed in by default", async () => {
    const signedIn = account(["unsynced-changes"]);
    const { user } = renderApp("/settings", new DemoStore(), signedIn);
    await user.click(screen.getByRole("button", { name: "Sign out" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toContain("Some changes haven't been saved yet");
    await user.click(screen.getByRole("button", { name: "Stay signed in" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(signedIn.signOut).toHaveBeenCalledTimes(1);
  });

  it("signs out anyway, discarding unsaved changes, when chosen", async () => {
    const signedIn = account(["unsynced-changes", "signed-out"]);
    const { user } = renderApp("/settings", new DemoStore(), signedIn);
    await user.click(screen.getByRole("button", { name: "Sign out" }));
    await user.click(await screen.findByRole("button", { name: "Sign out anyway" }));

    await waitFor(() =>
      expect(signedIn.signOut).toHaveBeenLastCalledWith({ discardUnsynced: true }),
    );
  });

  it("shows Signing out… while signing out anyway from the dialog", async () => {
    let resolveSignOutAnyway: ((result: "signed-out") => void) | undefined;
    const signOut = vi.fn<Account["signOut"]>();
    signOut.mockResolvedValueOnce("unsynced-changes");
    signOut.mockImplementationOnce(
      () =>
        new Promise<"signed-out">((resolve) => {
          resolveSignOutAnyway = resolve;
        }),
    );
    const signedIn = { email: "jordan@example.com", signOut } satisfies Account;
    const { user } = renderApp("/settings", new DemoStore(), signedIn);

    await user.click(screen.getByRole("button", { name: "Sign out" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toContain("Some changes haven't been saved yet");

    const anywayButton = within(dialog).getByRole("button", { name: "Sign out anyway" });
    await user.click(anywayButton);

    expect(signOut).toHaveBeenLastCalledWith({ discardUnsynced: true });
    expect(await within(dialog).findByRole("status")).toHaveProperty("textContent", "Signing out…");

    await act(async () => {
      resolveSignOutAnyway?.("signed-out");
    });
  });

  it("says what to do if signing out fails", async () => {
    const signedIn = account([]);
    signedIn.signOut.mockRejectedValueOnce(new Error("disk"));
    const { user } = renderApp("/settings", new DemoStore(), signedIn);
    await user.click(screen.getByRole("button", { name: "Sign out" }));
    expect(
      await screen.findByText("Couldn't sign out. Quit Kineō, open it again and try again."),
    ).toBeTruthy();
  });
});
