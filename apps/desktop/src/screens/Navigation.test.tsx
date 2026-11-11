import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "../test/render";

describe("navigation", () => {
  it("opens Settings from the icon on Home and comes back with the back arrow", async () => {
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

  it("has no top bar, sidebar or nav menu", () => {
    renderApp();
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(screen.queryByRole("banner")).toBeNull();
    expect(screen.queryByRole("complementary")).toBeNull();
  });
});
