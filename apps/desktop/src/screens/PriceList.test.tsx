import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createDemoState, DemoStore } from "../data/store";
import { renderApp } from "../test/render";

const PATH = "/settings/price-list";

function item(name: string) {
  return within(screen.getByRole("listitem", { name }));
}

/** Add item opens the New item dialog; this is what's inside it. */
async function openDialog(user: ReturnType<typeof renderApp>["user"]) {
  await user.click(screen.getByRole("button", { name: "Add item" }));
  return within(await screen.findByRole("dialog", { name: "New item" }));
}

/** The number in "Your next invoice will be …". */
function nextInvoice(): string | undefined {
  const text = screen.getByText(/^Your next invoice will be/).textContent ?? "";
  return /will be (\S+)\./.exec(text)?.[1];
}

describe("Price list and tax", () => {
  it("opens from Settings", async () => {
    const { user, router } = renderApp("/settings");
    await user.click(screen.getByRole("button", { name: /^Price list and tax/ }));
    expect(router.state.location.pathname).toBe(PATH);
    expect(screen.getByRole("heading", { level: 1, name: "Price list and tax" })).toBeTruthy();
  });

  it("lists items with their prices", () => {
    renderApp(PATH);
    expect(item("Initial assessment").getByText("$120.00")).toBeTruthy();
    expect(item("Follow-up treatment").getByText("$95.00")).toBeTruthy();
    expect(item("Exercise band").getByText("$15.00")).toBeTruthy();
  });

  it("explains that changing a price leaves made invoices alone, and has the tax helper", () => {
    renderApp(PATH);
    expect(
      screen.getByText("Changing a price doesn't change invoices you've already made."),
    ).toBeTruthy();
    expect(
      screen.getByText("Used when you turn tax on for an invoice. Tax is off by default."),
    ).toBeTruthy();
  });

  it("adds an item from the New item dialog", async () => {
    const { user, store } = renderApp(PATH);
    const dialog = await openDialog(user);
    await user.type(dialog.getByRole("textbox", { name: "Name" }), "Dry needling");
    await user.type(dialog.getByRole("textbox", { name: "Price ($)" }), "$85.50");
    await user.click(dialog.getByRole("button", { name: "Save item" }));

    expect(store.getState().priceItems.at(-1)).toMatchObject({
      name: "Dry needling",
      unitPriceCents: 8550,
    });
    expect(await screen.findByText("Item added")).toBeTruthy();
    expect(item("Dry needling").getByText("$85.50")).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "New item" })).toBeNull();
  });

  it("says what's wrong with a new item, and Cancel adds nothing", async () => {
    const { user, store } = renderApp(PATH);
    const dialog = await openDialog(user);
    await user.type(dialog.getByRole("textbox", { name: "Price ($)" }), "12.345");
    await user.click(dialog.getByRole("button", { name: "Save item" }));
    expect(screen.getByText("Give the item a name.")).toBeTruthy();
    expect(screen.getByText("Enter a price in dollars, like 95 or 95.50.")).toBeTruthy();
    expect(store.getState().priceItems).toHaveLength(3);

    await user.click(dialog.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog", { name: "New item" })).toBeNull();
    expect(store.getState().priceItems).toHaveLength(3);
  });

  it("edits an item without changing invoices that already use it", async () => {
    const { user, store } = renderApp(PATH);
    await user.click(screen.getByRole("button", { name: "Edit Follow-up treatment" }));
    const editing = within(screen.getByRole("listitem", { name: "Editing Follow-up treatment" }));
    expect(editing.getByRole("textbox", { name: "Price ($)" })).toHaveProperty("value", "95.00");
    await user.clear(editing.getByRole("textbox", { name: "Price ($)" }));
    await user.type(editing.getByRole("textbox", { name: "Price ($)" }), "100");
    await user.click(editing.getByRole("button", { name: "Save item" }));

    expect(item("Follow-up treatment").getByText("$100.00")).toBeTruthy();
    expect(await screen.findByText("Item updated")).toBeTruthy();
    // The sent invoice's line keeps the price it copied.
    const line = store.getState().lineItems.find((l) => l.name === "Follow-up treatment");
    expect(line?.unitPriceCents).toBe(9500);
  });

  it("cancels an edit", async () => {
    const { user, store } = renderApp(PATH);
    await user.click(screen.getByRole("button", { name: "Edit Exercise band" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(item("Exercise band").getByText("$15.00")).toBeTruthy();
    expect(
      store.getState().priceItems.find((i) => i.name === "Exercise band")?.unitPriceCents,
    ).toBe(1500);
  });

  it("removes an item", async () => {
    const { user, store } = renderApp(PATH);
    await user.click(screen.getByRole("button", { name: "Remove Exercise band" }));
    expect(screen.queryByRole("listitem", { name: "Exercise band" })).toBeNull();
    expect(store.getState().priceItems).toHaveLength(2);
    expect(await screen.findByText("Item removed")).toBeTruthy();
  });

  it("says when the price list is empty", () => {
    const state = createDemoState();
    renderApp(PATH, new DemoStore({ ...state, priceItems: [] }));
    expect(screen.getByText(/No items yet\./)).toBeTruthy();
  });

  it("saves the default tax rate and prefix, and shows the next invoice number", async () => {
    const { user, store } = renderApp(PATH);
    const rate = screen.getByRole("textbox", { name: "Default tax rate (%)" });
    const prefix = screen.getByRole("textbox", { name: "Prefix text (optional)" });
    expect(rate).toHaveProperty("value", "5");
    expect(nextInvoice()).toBe("INV-0004");

    await user.clear(rate);
    await user.type(rate, "12.5");
    await user.clear(prefix);
    await user.type(prefix, "KP");
    expect(nextInvoice()).toBe("KP-0004");
    await user.click(screen.getByRole("button", { name: "Save settings" }));

    expect(store.getState().settings).toMatchObject({
      defaultTaxRateBasisPoints: 1250,
      invoiceNumberFormat: { prefix: "KP" },
      // Left alone: the next number wasn't changed.
      invoiceNumberStart: 1,
    });
    expect(await screen.findByText("Settings saved")).toBeTruthy();
  });

  it("builds the number from parts in the order chosen", async () => {
    const { user, store } = renderApp(PATH);
    const year = String(new Date().getFullYear());
    await user.click(screen.getByRole("switch", { name: "Show year" }));
    expect(nextInvoice()).toBe(`INV-${year}-0004`);
    await user.click(screen.getByRole("button", { name: "Move year earlier" }));
    await user.click(screen.getByRole("radio", { name: "Slash" }));
    await user.click(screen.getByRole("radio", { name: "3 digits" }));
    expect(nextInvoice()).toBe(`${year}/INV/004`);
    // The prefix is first and the number last, so they can't go further.
    expect(screen.getByRole("button", { name: "Move year earlier" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(screen.getByRole("button", { name: "Move number later" })).toHaveProperty(
      "disabled",
      true,
    );

    await user.click(screen.getByRole("button", { name: "Save settings" }));
    expect(store.getState().settings.invoiceNumberFormat).toEqual({
      prefix: "INV",
      order: ["year", "prefix", "month", "number"],
      shown: { prefix: true, year: true, month: false },
      separator: "/",
      digits: 3,
    });
  });

  it("carries on from a next number typed in, never below one already used", async () => {
    const { user, store } = renderApp(PATH);
    const next = screen.getByRole("textbox", { name: "Next invoice number" });
    expect(next).toHaveProperty("value", "4");

    await user.clear(next);
    await user.type(next, "3");
    await user.click(screen.getByRole("button", { name: "Save settings" }));
    expect(screen.getByText("Start at 4 or higher. Lower numbers are already used.")).toBeTruthy();
    expect(store.getState().settings.invoiceNumberStart).toBe(1);

    await user.clear(next);
    await user.type(next, "1250");
    expect(nextInvoice()).toBe("INV-1250");
    await user.click(screen.getByRole("button", { name: "Save settings" }));
    expect(store.getState().settings.invoiceNumberStart).toBe(1250);
  });

  it("refuses a tax rate over 100%", async () => {
    const { user, store } = renderApp(PATH);
    const rate = screen.getByRole("textbox", { name: "Default tax rate (%)" });
    await user.clear(rate);
    await user.type(rate, "120");
    await user.click(screen.getByRole("button", { name: "Save settings" }));
    expect(screen.getByText("Enter a tax rate from 0 to 100, like 5 or 12.5.")).toBeTruthy();
    expect(store.getState().settings.defaultTaxRateBasisPoints).toBe(500);
  });
});
