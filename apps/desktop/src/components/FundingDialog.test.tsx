import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDemoState, DemoStore } from "../data/store";
import { renderApp } from "../test/render";

// Made-up demo data: Casey has a funding (Autism Funding, 4821); Jordan has none.
const casey = "5eed0000-0000-4000-8000-000000000202";
const jordan = "5eed0000-0000-4000-8000-000000000203";
const icbc = "5eed0000-0000-4000-8000-000000000703";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 12, 10, 42));
});
afterEach(() => {
  vi.useRealTimers();
});

/** Opens the dialog from a patient's Billing card. */
async function openAdd(patientId = jordan, store = new DemoStore()) {
  const ctx = renderApp(`/patients/${patientId}`, store);
  const opener = screen.getByRole("button", { name: "Add funding" });
  await ctx.user.click(opener);
  const dialog = await screen.findByRole("dialog");
  return { ...ctx, opener, dialog: within(dialog) };
}

describe("Funding dialog", () => {
  it("titles the dialog with the patient's name and offers the funding types", async () => {
    const { dialog } = await openAdd();
    expect(screen.getByRole("dialog", { name: "Add funding for Jordan Sample" })).toBeTruthy();
    const select = dialog.getByRole("combobox", { name: "Funding type" });
    expect(
      within(select)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["Autism Funding", "ICBC"]);
    expect(dialog.getByText("Required")).toBeTruthy();
    expect(dialog.getAllByText("Optional")).toHaveLength(2);
    expect(dialog.getByRole("textbox", { name: "Period starts" }).getAttribute("placeholder")).toBe(
      "e.g. 1 Apr 2026",
    );
  });

  it("adds a funding with its values and period, says so and closes", async () => {
    const { user, store, dialog } = await openAdd();
    await user.type(dialog.getByRole("textbox", { name: "Billing number" }), " 4821 ");
    await user.type(dialog.getByRole("textbox", { name: "Period starts" }), "1 Apr 2026");
    await user.type(dialog.getByRole("textbox", { name: "Period ends" }), "31 March 2027");
    await user.click(dialog.getByRole("button", { name: "Save funding" }));

    expect(await screen.findByText("Funding added")).toBeTruthy();
    expect(store.getState().patientFundings.at(-1)).toMatchObject({
      patientId: jordan,
      detailValues: { "5eed0000-0000-4000-8000-000000000702": "4821" },
      periodStart: "2026-04-01",
      periodEnd: "2027-03-31",
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("asks for a missing required value under its field and focuses it, saving nothing", async () => {
    const { user, store, dialog } = await openAdd();
    const before = store.getState().patientFundings.length;
    expect(dialog.queryByText("Add the billing number.")).toBeNull();
    await user.click(dialog.getByRole("button", { name: "Save funding" }));
    expect(await dialog.findByText("Add the billing number.")).toBeTruthy();
    expect(document.activeElement).toBe(dialog.getByRole("textbox", { name: "Billing number" }));
    expect(store.getState().patientFundings).toHaveLength(before);
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("says how to write a date it can't read", async () => {
    const { user, dialog } = await openAdd();
    await user.type(dialog.getByRole("textbox", { name: "Billing number" }), "4821");
    await user.type(dialog.getByRole("textbox", { name: "Period starts" }), "April 1");
    await user.click(dialog.getByRole("button", { name: "Save funding" }));
    expect(await dialog.findByText("Enter a date like 1 Apr 2026.")).toBeTruthy();
    expect(document.activeElement).toBe(dialog.getByRole("textbox", { name: "Period starts" }));
  });

  it("shows who the invoices will go to, with where to change it", async () => {
    const { dialog } = await openAdd();
    const box = within(dialog.getByRole("group", { name: "Bill to" }));
    expect(
      box.getByText("Autism Funding Branch, Ministry of Children and Family Development"),
    ).toBeTruthy();
    expect(
      box.getByText("PO Box 9776 STN PROV GOVT, Victoria BC V8W 9S5. Change this in Settings."),
    ).toBeTruthy();
  });

  it("warns, with a link, when the type has no recipient yet, but still lets you save", async () => {
    const { user, router, dialog } = await openAdd();
    await user.selectOptions(dialog.getByRole("combobox", { name: "Funding type" }), icbc);
    const message = "ICBC has no recipient yet. Add it in Settings before you send.";
    expect(dialog.getByText(message, { exact: false })).toBeTruthy();
    expect(dialog.getByRole("button", { name: "Save funding" })).toBeTruthy();
    const link = dialog.getByRole("link", { name: "Open Funding types" });
    expect(link.getAttribute("href")).toBe(`/settings/funding-types/${icbc}`);
    await user.click(link);
    expect(router.state.location.pathname).toBe(`/settings/funding-types/${icbc}`);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("pre-fills an edit as typed, and fixes the type", async () => {
    const { user } = renderApp(`/patients/${casey}`);
    await user.click(screen.getByRole("button", { name: "Edit Autism Funding" }));
    const dialog = within(await screen.findByRole("dialog"));
    expect(screen.getByRole("dialog", { name: "Edit funding for Casey Fictional" })).toBeTruthy();
    expect(dialog.getByRole("textbox", { name: "Billing number" })).toHaveProperty("value", "4821");
    expect(dialog.getByRole("textbox", { name: "Period starts" })).toHaveProperty(
      "value",
      "1 Apr 2026",
    );
    expect(dialog.getByRole("textbox", { name: "Period ends" })).toHaveProperty(
      "value",
      "31 Mar 2027",
    );
    expect(dialog.getByRole("combobox", { name: "Funding type" })).toHaveProperty("disabled", true);
  });

  it("saves changes to the same funding and says so", async () => {
    const { user, store } = renderApp(`/patients/${casey}`);
    await user.click(screen.getByRole("button", { name: "Edit Autism Funding" }));
    const dialog = within(await screen.findByRole("dialog"));
    await user.clear(dialog.getByRole("textbox", { name: "Billing number" }));
    await user.type(dialog.getByRole("textbox", { name: "Billing number" }), "9999");
    await user.click(dialog.getByRole("button", { name: "Save funding" }));
    expect(await screen.findByText("Funding saved")).toBeTruthy();
    expect(store.getState().patientFundings).toHaveLength(1);
    expect(Object.values(store.getState().patientFundings[0]?.detailValues ?? {})).toEqual([
      "9999",
    ]);
  });

  it("says there are no funding types, with a link, and offers only Cancel", async () => {
    const store = new DemoStore({ ...createDemoState(), fundingTypes: [], patientFundings: [] });
    const { user, router, dialog } = await openAdd(jordan, store);
    expect(
      dialog.getByText("You haven't made any funding types yet.", { exact: false }),
    ).toBeTruthy();
    expect(dialog.queryByRole("button", { name: "Save funding" })).toBeNull();
    expect(dialog.getByRole("button", { name: "Cancel" })).toBeTruthy();
    await user.click(dialog.getByRole("link", { name: "Open Funding types" }));
    expect(router.state.location.pathname).toBe("/settings/funding-types");
  });

  it("closes on Escape and gives focus back to the button that opened it", async () => {
    const { user, opener } = await openAdd();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // Focus goes back once the dialog has finished closing.
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it("closes on Cancel without saving", async () => {
    const { user, store, dialog } = await openAdd();
    const before = store.getState().patientFundings.length;
    await user.click(dialog.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(store.getState().patientFundings).toHaveLength(before);
  });
});
