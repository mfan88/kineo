import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "../test/render";

describe("Settings", () => {
  it("lists the three sections", () => {
    renderApp("/settings");
    expect(screen.getByRole("button", { name: /^Your profile/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Price list and tax/ })).toBeTruthy();
    expect(screen.getByText("Invoice style")).toBeTruthy();
  });

  // Profile and Price list screens come in the next two tasks; until their routes
  // exist the app falls back to Home, so these only check that Settings moves on.
  it("opens Your profile", async () => {
    const { user, router } = renderApp("/settings");
    await user.click(screen.getByRole("button", { name: /^Your profile/ }));
    expect(router.state.location.pathname).not.toBe("/settings");
  });

  it("opens Price list and tax", async () => {
    const { user, router } = renderApp("/settings");
    await user.click(screen.getByRole("button", { name: /^Price list and tax/ }));
    expect(router.state.location.pathname).not.toBe("/settings");
  });

  it("shows Invoice style as not available yet, not as a link", () => {
    renderApp("/settings");
    expect(screen.queryByRole("button", { name: /^Invoice style/ })).toBeNull();
    expect(screen.getByText(/Coming with invoice PDFs\./)).toBeTruthy();
  });
});
