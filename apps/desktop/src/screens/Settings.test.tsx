import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "../test/render";

describe("Settings", () => {
  it("lists the three sections", () => {
    renderApp("/settings");
    expect(screen.getByRole("button", { name: /^Your profile/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Price list and tax/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Invoice style/ })).toBeTruthy();
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
