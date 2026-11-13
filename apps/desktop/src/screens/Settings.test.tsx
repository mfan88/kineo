import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "../test/render";
import { APPEARANCE_STORAGE_KEY } from "../theme/appearance";

describe("Settings", () => {
  it("lists the three sections", () => {
    renderApp("/settings");
    expect(screen.getByRole("button", { name: /^Your profile/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Price list and tax/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Invoice style/ })).toBeTruthy();
  });

  it("switches Appearance at once and remembers it on this computer", async () => {
    const { user } = renderApp("/settings");
    const group = screen.getByRole("radiogroup", { name: "Appearance" });
    expect(
      within(group).getByRole("radio", { name: "Match system" }).getAttribute("aria-checked"),
    ).toBe("true");
    await user.click(within(group).getByRole("radio", { name: "Dark" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem(APPEARANCE_STORAGE_KEY)).toBe("dark");
    expect(within(group).getByRole("radio", { name: "Dark" }).getAttribute("aria-checked")).toBe(
      "true",
    );
    await user.click(within(group).getByRole("radio", { name: "Match system" }));
    expect(localStorage.getItem(APPEARANCE_STORAGE_KEY)).toBe("system");
  });

  it("opens Your profile", async () => {
    const { user, router } = renderApp("/settings");
    await user.click(screen.getByRole("button", { name: /^Your profile/ }));
    expect(router.state.location.pathname).toBe("/settings/profile");
  });

  it("opens Price list and tax", async () => {
    const { user, router } = renderApp("/settings");
    await user.click(screen.getByRole("button", { name: /^Price list and tax/ }));
    expect(router.state.location.pathname).toBe("/settings/price-list");
  });

  it("opens Invoice style", async () => {
    const { user, router } = renderApp("/settings");
    await user.click(screen.getByRole("button", { name: /^Invoice style/ }));
    expect(router.state.location.pathname).toBe("/settings/invoice-style");
  });
});
