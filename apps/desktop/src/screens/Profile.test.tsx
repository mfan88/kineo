import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "../test/render";

function field(name: string) {
  return screen.getByRole("textbox", { name: new RegExp(`^${name}`) });
}

describe("Your profile", () => {
  it("opens from Settings", async () => {
    const { user, router } = renderApp("/settings");
    await user.click(screen.getByRole("button", { name: /^Your profile/ }));
    expect(router.state.location.pathname).toBe("/settings/profile");
    expect(screen.getByRole("heading", { level: 1, name: "Your profile" })).toBeTruthy();
  });

  it("shows the five fields with their current values and flags", () => {
    renderApp("/settings/profile");
    expect(field("Full name")).toHaveProperty("value", "Alex Example");
    expect(field("Title or certification")).toHaveProperty("value", "Registered Physiotherapist");
    expect(field("Clinic name")).toHaveProperty("value", "Example Physiotherapy");
    expect(field("Address")).toHaveProperty("value", "100 Sample Street, Vancouver BC V5K 0A1");
    expect(field("Phone")).toHaveProperty("value", "604-555-0100");
    expect(screen.getByRole("switch", { name: "Show phone on invoices" })).toHaveProperty(
      "checked",
      false,
    );
    expect(screen.getByRole("switch", { name: "Show full name on invoices" })).toHaveProperty(
      "checked",
      true,
    );
  });

  it("saves changes and confirms", async () => {
    const { user, store } = renderApp("/settings/profile");
    await user.clear(field("Clinic name"));
    await user.type(field("Clinic name"), "  Sample Clinic ");
    await user.click(screen.getByRole("switch", { name: "Show phone on invoices" }));
    await user.click(screen.getByRole("button", { name: "Save profile" }));

    const { profile } = store.getState();
    expect(profile.clinicName).toEqual({ value: "Sample Clinic", showOnInvoice: true });
    expect(profile.phone.showOnInvoice).toBe(true);
    expect(await screen.findByText("Profile saved")).toBeTruthy();
  });

  it("needs a field shown on invoices and says so under it", async () => {
    const { user, store } = renderApp("/settings/profile");
    await user.clear(field("Address"));
    await user.click(screen.getByRole("button", { name: "Save profile" }));

    expect(screen.getByText('Add your address or turn off "Show on invoice".')).toBeTruthy();
    expect(store.getState().profile.address.value).toBe("100 Sample Street, Vancouver BC V5K 0A1");

    // Turning off "Show on invoice" clears the error and lets it save.
    await user.click(screen.getByRole("switch", { name: "Show address on invoices" }));
    expect(screen.queryByText('Add your address or turn off "Show on invoice".')).toBeNull();
    await user.click(screen.getByRole("button", { name: "Save profile" }));
    expect(store.getState().profile.address).toEqual({ value: "", showOnInvoice: false });
  });

  it("doesn't show errors before the first save", async () => {
    const { user } = renderApp("/settings/profile");
    await user.clear(field("Full name"));
    expect(screen.queryByText(/Add your full name/)).toBeNull();
  });

  it("lets a hidden field stay empty", async () => {
    const { user, store } = renderApp("/settings/profile");
    await user.clear(field("Phone"));
    await user.click(screen.getByRole("button", { name: "Save profile" }));
    expect(store.getState().profile.phone).toEqual({ value: "", showOnInvoice: false });
  });
});
