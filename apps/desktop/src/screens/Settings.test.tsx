import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createDemoState, DemoStore } from "../data/store";
import { renderApp } from "../test/render";
import { APPEARANCE_STORAGE_KEY } from "../theme/appearance";

describe("Settings", () => {
  it("lists the three sections", () => {
    renderApp("/settings");
    expect(screen.getByRole("button", { name: /^Your profile/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Price list and tax/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Invoice style/ })).toBeTruthy();
  });

  it("shows each row's current value", () => {
    renderApp("/settings");
    expect(screen.getByRole("button", { name: /^Your profile/ }).textContent).toContain(
      "Your name, clinic and contact details",
    );
    expect(screen.getByRole("button", { name: /^Price list and tax/ }).textContent).toContain(
      "items · Tax 5%",
    );
    expect(screen.getByRole("button", { name: /^Invoice style/ }).textContent).toContain(
      "Sky accent · Clean font · logo left",
    );
    // Nothing is wrong with the demo profile, so no problem line.
    expect(screen.queryByText(/shown on invoices but empty/)).toBeNull();
  });

  it("lists Funding types with how many there are and how many lack a recipient", () => {
    renderApp("/settings");
    const row = screen.getByRole("button", { name: /^Funding types/ });
    // The demo has Autism Funding (complete) and ICBC (no recipient yet).
    expect(row.textContent).toContain("2 types \u00b7 1 is missing a recipient");
  });

  it("opens Funding types", async () => {
    const { user, router } = renderApp("/settings");
    await user.click(screen.getByRole("button", { name: /^Funding types/ }));
    expect(router.state.location.pathname).toBe("/settings/funding-types");
  });

  it("says there are no funding types when there are none", () => {
    const store = new DemoStore({ ...createDemoState(), fundingTypes: [], patientFundings: [] });
    renderApp("/settings", store);
    expect(screen.getByRole("button", { name: /^Funding types/ }).textContent).toContain(
      "No funding types",
    );
  });

  it("says which profile field is shown on invoices but empty", () => {
    const state = createDemoState();
    const store = new DemoStore({
      ...state,
      profile: { ...state.profile, phone: { value: "", showOnInvoice: true } },
    });
    renderApp("/settings", store);
    expect(screen.getByText("Phone is shown on invoices but empty")).toBeTruthy();
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
