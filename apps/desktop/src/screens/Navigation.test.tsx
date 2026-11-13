import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "../test/render";

describe("navigation", () => {
  it("opens Settings from the tab bar's icon and comes back with the back arrow", async () => {
    const { user } = renderApp();
    expect(screen.getByRole("heading", { level: 1, name: "Who are you seeing?" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByRole("heading", { level: 1, name: "Settings" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Settings" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("heading", { level: 1, name: "Who are you seeing?" })).toBeTruthy();
  });

  it("goes Home from the back arrow when there's no screen to go back to", async () => {
    const { user, router } = renderApp("/settings");
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(router.state.location.pathname).toBe("/");
    expect(screen.getByRole("heading", { level: 1, name: "Who are you seeing?" })).toBeTruthy();
  });

  it("sends an unknown screen Home", () => {
    const { router } = renderApp("/nowhere");
    expect(router.state.location.pathname).toBe("/");
  });

  it("has a quiet tab bar (Home, Invoices, Settings) but no top bar or sidebar", () => {
    renderApp();
    const nav = within(screen.getByRole("navigation", { name: "Main" }));
    expect(nav.getAllByRole("link").map((link) => link.textContent)).toEqual(["Home", "Invoices"]);
    expect(nav.getByRole("link", { name: "Home" }).getAttribute("aria-current")).toBe("page");
    expect(nav.getByRole("link", { name: "Invoices" }).getAttribute("aria-current")).toBeNull();
    expect(nav.getByRole("button", { name: "Settings" })).toBeTruthy();
    expect(screen.queryByRole("banner")).toBeNull();
    expect(screen.queryByRole("complementary")).toBeNull();
  });

  it("goes Home from the tab bar", async () => {
    const { user, router } = renderApp("/invoices");
    await user.click(screen.getByRole("link", { name: "Home" }));
    expect(router.state.location.pathname).toBe("/");
  });

  it("leaves the tab bar out of Settings and its screens", () => {
    renderApp("/settings/profile");
    expect(screen.queryByRole("navigation", { name: "Main" })).toBeNull();
  });
});
