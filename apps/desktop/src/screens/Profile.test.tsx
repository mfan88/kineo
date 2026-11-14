import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "../test/render";

function field(name: string) {
  return screen.getByRole("textbox", { name: new RegExp(`^${name}`) });
}

describe("Your profile", () => {
  it("introduces the rule and keeps Save profile at the top right", () => {
    renderApp("/settings/profile");
    expect(screen.getByText("Fields shown on invoices are required.")).toBeTruthy();
    const save = screen.getByRole("button", { name: "Save profile" });
    expect(save.getAttribute("form")).toBe("profile-form");
    expect(document.getElementById("profile-form")).toBeTruthy();
  });

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

    expect(screen.getByText("Shown on invoices. Add an address.")).toBeTruthy();
    expect(field("Address").getAttribute("aria-invalid")).toBe("true");
    expect(field("Address").getAttribute("aria-describedby")).toBeTruthy();
    expect(store.getState().profile.address.value).toBe("100 Sample Street, Vancouver BC V5K 0A1");

    // Turning off "Show on invoice" clears the error and lets it save.
    await user.click(screen.getByRole("switch", { name: "Show address on invoices" }));
    expect(screen.queryByText("Shown on invoices. Add an address.")).toBeNull();
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

  describe("warn before Back drops unsaved edits", () => {
    it("navigates straight back to Settings when Back is pressed with no edits", async () => {
      const { user, router } = renderApp("/settings");
      await user.click(screen.getByRole("button", { name: /^Your profile/ }));
      expect(router.state.location.pathname).toBe("/settings/profile");

      await user.click(screen.getByRole("button", { name: "Back" }));
      expect(screen.queryByRole("alertdialog", { name: "Discard your changes?" })).toBeNull();
      expect(router.state.location.pathname).toBe("/settings");
    });

    it("warns about unsaved edits before leaving when a field was edited", async () => {
      const { user, router } = renderApp("/settings");
      await user.click(screen.getByRole("button", { name: /^Your profile/ }));
      await user.type(field("Full name"), " Jr.");

      await user.click(screen.getByRole("button", { name: "Back" }));
      const dialog = within(
        await screen.findByRole("alertdialog", { name: "Discard your changes?" }),
      );
      expect(dialog.getByText("Your profile edits haven't been saved.")).toBeTruthy();
      expect(dialog.getByRole("button", { name: "Keep editing" })).toBeTruthy();
      expect(dialog.getByRole("button", { name: "Discard changes" })).toBeTruthy();
      expect(router.state.location.pathname).toBe("/settings/profile");
    });

    it("warns about unsaved edits before leaving when an invoice switch was toggled", async () => {
      const { user, router } = renderApp("/settings");
      await user.click(screen.getByRole("button", { name: /^Your profile/ }));
      await user.click(screen.getByRole("switch", { name: "Show phone on invoices" }));

      await user.click(screen.getByRole("button", { name: "Back" }));
      const dialog = within(
        await screen.findByRole("alertdialog", { name: "Discard your changes?" }),
      );
      expect(dialog.getByText("Your profile edits haven't been saved.")).toBeTruthy();
      expect(router.state.location.pathname).toBe("/settings/profile");
    });

    it("keeps edits and stays on Your profile when Keep editing is clicked", async () => {
      const { user, router } = renderApp("/settings");
      await user.click(screen.getByRole("button", { name: /^Your profile/ }));
      await user.clear(field("Clinic name"));
      await user.type(field("Clinic name"), "Sample Clinic");

      await user.click(screen.getByRole("button", { name: "Back" }));
      const dialog = within(
        await screen.findByRole("alertdialog", { name: "Discard your changes?" }),
      );
      await user.click(dialog.getByRole("button", { name: "Keep editing" }));

      await waitFor(() =>
        expect(screen.queryByRole("alertdialog", { name: "Discard your changes?" })).toBeNull(),
      );
      expect(router.state.location.pathname).toBe("/settings/profile");
      expect(field("Clinic name")).toHaveProperty("value", "Sample Clinic");
    });

    it("discards changes and navigates back to Settings when Discard changes is clicked", async () => {
      const { user, router } = renderApp("/settings");
      await user.click(screen.getByRole("button", { name: /^Your profile/ }));
      await user.type(field("Full name"), " Jr.");

      await user.click(screen.getByRole("button", { name: "Back" }));
      const dialog = within(
        await screen.findByRole("alertdialog", { name: "Discard your changes?" }),
      );
      await user.click(dialog.getByRole("button", { name: "Discard changes" }));

      await waitFor(() =>
        expect(screen.queryByRole("alertdialog", { name: "Discard your changes?" })).toBeNull(),
      );
      expect(router.state.location.pathname).toBe("/settings");
    });

    it("navigates straight back to Settings when Back is pressed after saving", async () => {
      const { user, router } = renderApp("/settings");
      await user.click(screen.getByRole("button", { name: /^Your profile/ }));
      await user.clear(field("Clinic name"));
      await user.type(field("Clinic name"), "Sample Clinic");
      await user.click(screen.getByRole("button", { name: "Save profile" }));
      expect(await screen.findByText("Profile saved")).toBeTruthy();

      await user.click(screen.getByRole("button", { name: "Back" }));
      expect(screen.queryByRole("alertdialog", { name: "Discard your changes?" })).toBeNull();
      expect(router.state.location.pathname).toBe("/settings");
    });
  });
});
