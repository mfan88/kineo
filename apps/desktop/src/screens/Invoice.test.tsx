import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createDemoState, DemoStore } from "../data/store";
import { renderApp } from "../test/render";

// Made-up demo IDs.
const paidInvoice = "5eed0000-0000-4000-8000-000000000301";
const sentInvoice = "5eed0000-0000-4000-8000-000000000302";
const draftInvoice = "5eed0000-0000-4000-8000-000000000303";
const jordan = "5eed0000-0000-4000-8000-000000000203";

function totals() {
  return within(screen.getByRole("region", { name: "Totals" }));
}

/** A draft for Jordan with both visits, no lines. */
function jordanDraft() {
  const store = new DemoStore(createDemoState());
  const invoice = store.createInvoice(jordan, [
    "5eed0000-0000-4000-8000-000000000405",
    "5eed0000-0000-4000-8000-000000000406",
  ]);
  return { store, invoice };
}

describe("Invoice editor", () => {
  it("shows a draft's number, patient, status, lines and totals", () => {
    renderApp(`/invoices/${draftInvoice}`);
    expect(screen.getByRole("heading", { level: 1, name: "Invoice INV-0003" })).toBeTruthy();
    expect(screen.getByText("Casey Fictional")).toBeTruthy();
    expect(screen.getByText("Draft")).toBeTruthy();
    expect(
      within(screen.getByRole("listitem", { name: "Initial assessment" })).getByText(
        "$120.00 each",
      ),
    ).toBeTruthy();
    expect(totals().getByText("Subtotal").nextElementSibling?.textContent).toBe("$120.00");
    expect(totals().getByText("Total").nextElementSibling?.textContent).toBe("$120.00");
  });

  it("adds a line from the price list and updates the totals", async () => {
    const { user, store } = renderApp(`/invoices/${draftInvoice}`);
    await user.click(screen.getByRole("button", { name: /Add a line item/ }));
    await user.click(await screen.findByRole("option", { name: /Exercise band/ }));

    const lines = store.getState().lineItems.filter((l) => l.invoiceId === draftInvoice);
    expect(lines.map((l) => l.name)).toEqual(["Initial assessment", "Exercise band"]);
    expect(totals().getByText("Total").nextElementSibling?.textContent).toBe("$135.00");
  });

  it("changes a quantity", async () => {
    const { user, store } = renderApp(`/invoices/${draftInvoice}`);
    await user.click(screen.getByRole("button", { name: /Increase/ }));
    expect(store.getState().lineItems.find((l) => l.invoiceId === draftInvoice)?.quantity).toBe(2);
    expect(totals().getByText("Total").nextElementSibling?.textContent).toBe("$240.00");
  });

  it("removes a line and says so when none are left", async () => {
    const { user } = renderApp(`/invoices/${draftInvoice}`);
    await user.click(screen.getByRole("button", { name: "Remove Initial assessment" }));
    expect(screen.getByText("No line items yet. Add one from your price list.")).toBeTruthy();
    expect(totals().getByText("Total").nextElementSibling?.textContent).toBe("$0.00");
  });

  it("turns tax on at the default rate", async () => {
    const { user } = renderApp(`/invoices/${draftInvoice}`);
    await user.click(screen.getByRole("switch", { name: "Add tax (5%)" }));
    expect(totals().getByText("Tax (5%)").nextElementSibling?.textContent).toBe("$6.00");
    expect(totals().getByText("Total").nextElementSibling?.textContent).toBe("$126.00");
  });

  it("puts the patient's visits on and off a draft", async () => {
    const { store, invoice } = jordanDraft();
    const { user } = renderApp(`/invoices/${invoice.id}`, store);
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(2);
    for (const box of boxes) expect(box).toHaveProperty("checked", true);

    await user.click(screen.getByRole("checkbox", { name: "Wed, Nov 4" }));
    const onIt = store.getState().visits.filter((v) => v.invoiceId === invoice.id);
    expect(onIt).toHaveLength(1);
  });

  it("locks everything once sent and offers Record payment", async () => {
    const { user, store } = renderApp(`/invoices/${sentInvoice}`);
    expect(screen.getByText("Sent invoices can't be changed.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Remove/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Add a line item/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Preview and send" })).toBeNull();
    expect(screen.getByRole("switch")).toHaveProperty("disabled", true);
    for (const box of screen.getAllByRole("checkbox")) expect(box).toHaveProperty("disabled", true);
    // $190 + $15 = $205, plus 5% tax.
    expect(totals().getByText("Total").nextElementSibling?.textContent).toBe("$215.25");

    await user.click(screen.getByRole("button", { name: "Record payment" }));
    expect(store.getState().invoices.find((i) => i.id === sentInvoice)?.status).toBe("paid");
    expect(await screen.findByText("Marked paid")).toBeTruthy();
    expect(screen.getByText(/Kept for your tax records\./)).toBeTruthy();
  });

  it("undoes a payment from the Marked paid toast", async () => {
    const { user, store } = renderApp(`/invoices/${sentInvoice}`);
    await user.click(screen.getByRole("button", { name: "Record payment" }));
    await screen.findByText("Marked paid");
    await user.click(screen.getByRole("button", { name: "Undo" }));

    const invoice = store.getState().invoices.find((i) => i.id === sentInvoice);
    expect(invoice).toMatchObject({ status: "sent", paidAt: null });
    expect(invoice?.sentAt).not.toBeNull();
    expect(screen.getByRole("button", { name: "Record payment" })).toBeTruthy();
    expect(screen.queryByText(/Kept for your tax records\./)).toBeNull();
  });

  it("says so when Undo comes too late", async () => {
    const { user, store } = renderApp(`/invoices/${sentInvoice}`);
    await user.click(screen.getByRole("button", { name: "Record payment" }));
    await screen.findByText("Marked paid");
    // Something else already moved it back (e.g. a second Undo).
    store.undoPayment(sentInvoice);
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(
      await screen.findByText("Only a paid invoice can be moved back to unpaid."),
    ).toBeTruthy();
  });

  it("shows a paid invoice's payment date and no actions", () => {
    renderApp(`/invoices/${paidInvoice}`);
    expect(screen.getByText("Paid on October 12, 2026. Kept for your tax records.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Record payment" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Preview and send" })).toBeNull();
  });

  it("goes Home for an invoice that doesn't exist", () => {
    const { router } = renderApp("/invoices/missing");
    expect(router.state.location.pathname).toBe("/");
  });
});
