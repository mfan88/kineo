import { screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderApp } from "../test/render";

const invoke = vi.hoisted(() =>
  vi.fn<(command: string, args?: unknown) => Promise<unknown>>(async () => null),
);
vi.mock("@tauri-apps/api/core", () => ({ invoke, isTauri: () => true }));

beforeEach(() => {
  invoke.mockReset();
  invoke.mockResolvedValue(null);
});

const SETTINGS_SCREENS = [
  "/settings",
  "/settings/profile",
  "/settings/price-list",
  "/settings/invoice-style",
];

describe("Wordmark and legal links", () => {
  it.each(["/", "/patients/new", "/invoices"])(
    "pins the wordmark top left on %s, with no legal footer",
    (path) => {
      renderApp(path);
      expect(screen.getAllByRole("img", { name: "Kineō" })).toHaveLength(1);
      expect(screen.queryByRole("navigation", { name: "Legal" })).toBeNull();
    },
  );

  it.each(SETTINGS_SCREENS)(
    "in %s, shows the wordmark only at the bottom, with Terms and Privacy",
    (path) => {
      renderApp(path);
      const footer = screen.getByRole("contentinfo");
      expect(within(footer).getByRole("img", { name: "Kineō" })).toBeTruthy();
      expect(screen.getAllByRole("img", { name: "Kineō" })).toHaveLength(1);
      const legal = within(footer).getByRole("navigation", { name: "Legal" });
      expect(within(legal).getByRole("link", { name: "Terms" }).getAttribute("href")).toBe(
        "https://getkineo.work/terms/",
      );
      expect(within(legal).getByRole("link", { name: "Privacy" }).getAttribute("href")).toBe(
        "https://getkineo.work/privacy/",
      );
    },
  );

  it("opens the legal pages in the default browser, not inside the app", async () => {
    const { user, router } = renderApp("/settings");
    await user.click(screen.getByRole("link", { name: "Privacy" }));
    expect(invoke).toHaveBeenCalledWith("open_in_browser", {
      url: "https://getkineo.work/privacy/",
    });
    expect(router.state.location.pathname).toBe("/settings");
  });

  it("says what to do if the page can't be opened", async () => {
    invoke.mockRejectedValueOnce("Couldn't open the page.");
    const { user } = renderApp("/settings");
    await user.click(screen.getByRole("link", { name: "Terms" }));
    expect(
      await screen.findByText(
        "Couldn't open the page. Visit https://getkineo.work/terms/ in your browser.",
      ),
    ).toBeTruthy();
  });

  it("draws the macron as a separate bar over a plain o", () => {
    renderApp("/");
    const wordmark = screen.getByRole("img", { name: "Kineō" });
    expect(wordmark.textContent).toBe("kineo");
    expect(wordmark.textContent).not.toContain("ō");
  });
});
