import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DemoPracticeStore } from "../data/demoPracticeStore";
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
    expect(screen.getByRole("heading", { level: 1, name: "INV-0003" })).toBeTruthy();
    expect(
      screen.getByRole("heading", { level: 2, name: "Visits for Casey Fictional" }),
    ).toBeTruthy();
    expect(screen.getByText("Draft")).toBeTruthy();
    expect(screen.getByText("Saved on this device")).toBeTruthy();
    expect(
      within(screen.getByRole("listitem", { name: "Initial assessment" })).getByText(
        "$120.00 each",
      ),
    ).toBeTruthy();
    // Without tax, only the total.
    expect(totals().queryByText("Subtotal")).toBeNull();
    expect(totals().getByText("Total").nextElementSibling?.textContent).toBe("$120.00");
  });

  it("adds a line from the price list and updates the totals", async () => {
    const { user, store } = renderApp(`/invoices/${draftInvoice}`);
    await user.click(screen.getByRole("button", { name: "+ Add from price list" }));
    await user.click(await screen.findByRole("menuitem", { name: /Exercise band/ }));

    const lines = store.getState().lineItems.filter((l) => l.invoiceId === draftInvoice);
    expect(lines.map((l) => l.name)).toEqual(["Initial assessment", "Exercise band"]);
    expect(totals().getByText("Total").nextElementSibling?.textContent).toBe("$135.00");
  });

  it("adds a new price list item from the menu and puts it on the invoice as a line", async () => {
    const { user, store } = renderApp(`/invoices/${draftInvoice}`);
    await user.click(screen.getByRole("button", { name: "+ Add from price list" }));
    await user.click(await screen.findByRole("menuitem", { name: "+ New price list item" }));
    const dialog = within(await screen.findByRole("dialog", { name: "New item" }));
    await user.type(dialog.getByRole("textbox", { name: "Name" }), "Dry needling");
    await user.type(dialog.getByRole("textbox", { name: "Price ($)" }), "80");
    await user.click(dialog.getByRole("button", { name: "Save item" }));

    expect(await screen.findByText("Item added")).toBeTruthy();
    expect(store.getState().priceItems.at(-1)).toMatchObject({
      name: "Dry needling",
      unitPriceCents: 8000,
    });
    const lines = store.getState().lineItems.filter((l) => l.invoiceId === draftInvoice);
    expect(lines.map((l) => l.name)).toEqual(["Initial assessment", "Dry needling"]);
    expect(totals().getByText("Total").nextElementSibling?.textContent).toBe("$200.00");
  });

  it("offers a new price list item even when the price list is empty", async () => {
    const state = createDemoState();
    const { user } = renderApp(
      `/invoices/${draftInvoice}`,
      new DemoStore({ ...state, priceItems: [] }),
    );
    await user.click(await screen.findByRole("button", { name: "+ Add from price list" }));
    expect(await screen.findByRole("menuitem", { name: "+ New price list item" })).toBeTruthy();
    expect(screen.getAllByRole("menuitem")).toHaveLength(1);
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
    expect(screen.getByText("No line items yet.")).toBeTruthy();
    expect(totals().getByText("Total").nextElementSibling?.textContent).toBe("$0.00");
  });

  it("turns tax on at the default rate", async () => {
    const { user } = renderApp(`/invoices/${draftInvoice}`);
    await user.click(screen.getByRole("switch", { name: "Add tax (5% from Settings)" }));
    expect(screen.getByRole("switch", { name: "Add tax (5%)" })).toBeTruthy();
    expect(totals().getByText("Subtotal").nextElementSibling?.textContent).toBe("$120.00");
    expect(totals().getByText("Tax (5%)").nextElementSibling?.textContent).toBe("$6.00");
    expect(totals().getByText("Total").nextElementSibling?.textContent).toBe("$126.00");
  });

  it("puts the patient's visits on and off a draft", async () => {
    const { store, invoice } = jordanDraft();
    const { user } = renderApp(`/invoices/${invoice.id}`, store);
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(2);
    for (const box of boxes) expect(box).toHaveProperty("checked", true);

    await user.click(screen.getByRole("checkbox", { name: "4 Nov" }));
    const onIt = store.getState().visits.filter((v) => v.invoiceId === invoice.id);
    expect(onIt).toHaveLength(1);
  });

  it("goes Home for an invoice that doesn't exist", () => {
    const { router } = renderApp("/invoices/missing");
    expect(router.state.location.pathname).toBe("/");
  });
});

describe("Invoice detail", () => {
  beforeEach(() => {
    // Only the date is faked, so typing and clicking carry on as normal.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 12, 9, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows a sent invoice's tag, total, number, patient and sent date, visits and tax", () => {
    renderApp(`/invoices/${sentInvoice}`);
    // $190 + $15 = $205, plus 5% tax.
    expect(screen.getByRole("heading", { level: 1, name: "$215.25" })).toBeTruthy();
    expect(screen.getAllByText("Waiting on payment").length).toBeGreaterThan(0);
    expect(screen.getByText(/^INV-0002 · Morgan Testcase · sent \d{1,2} Oct$/)).toBeTruthy();
    expect(screen.getByText("Visits").nextElementSibling?.textContent).toMatch(/Oct/);
    expect(screen.getByText("Tax").nextElementSibling?.textContent).toBe("5% · $10.25");
    // Nothing to change once sent.
    expect(screen.queryByRole("button", { name: /Remove/ })).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("button", { name: "Preview and send" })).toBeNull();
  });

  it("shows the invoice itself beside it, with Download PDF", () => {
    renderApp(`/invoices/${sentInvoice}`);
    const invoice = within(screen.getByRole("region", { name: "Invoice" }));
    expect(invoice.getByTitle("Invoice INV-0002 as the patient sees it")).toBeTruthy();
    expect(invoice.getByRole("button", { name: "Download PDF" })).toBeTruthy();
  });

  it("records a payment, with Undo", async () => {
    const { user, store } = renderApp(`/invoices/${sentInvoice}`);
    await user.click(screen.getByRole("button", { name: "Record payment" }));
    expect(store.getState().invoices.find((i) => i.id === sentInvoice)?.status).toBe("paid");
    expect(await screen.findByText("Marked paid")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Record payment" })).toBeNull();
    expect(screen.getByText(/^INV-0002 · Morgan Testcase · paid 12 Nov$/)).toBeTruthy();
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

  it("offers Cancel invoice on a sent invoice only", () => {
    const { unmount } = renderApp(`/invoices/${sentInvoice}`);
    expect(screen.getByRole("button", { name: "Cancel invoice" })).toBeTruthy();
    unmount();
    renderApp(`/invoices/${paidInvoice}`);
    expect(screen.queryByRole("button", { name: "Cancel invoice" })).toBeNull();
  });

  it("asks before cancelling, and Keep invoice changes nothing", async () => {
    const { user, store } = renderApp(`/invoices/${sentInvoice}`);
    await user.click(screen.getByRole("button", { name: "Cancel invoice" }));
    const dialog = within(await screen.findByRole("alertdialog", { name: "Cancel INV-0002?" }));
    expect(
      dialog.getByText(
        "Its visits go back to Ready to invoice. INV-0002 stays in your records as cancelled and won't be used again.",
      ),
    ).toBeTruthy();
    await user.click(dialog.getByRole("button", { name: "Keep invoice" }));
    expect(store.getState().invoices.find((i) => i.id === sentInvoice)?.status).toBe("sent");
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("cancels a sent invoice: tag, toast, record and released visits", async () => {
    const { user, store } = renderApp(`/invoices/${sentInvoice}`);
    const visitsBefore = screen.getByText("Visits").nextElementSibling?.textContent;
    await user.click(screen.getByRole("button", { name: "Cancel invoice" }));
    const dialog = within(await screen.findByRole("alertdialog", { name: "Cancel INV-0002?" }));
    await user.click(dialog.getByRole("button", { name: "Cancel invoice" }));

    expect(await screen.findByText("Invoice cancelled")).toBeTruthy();
    const invoice = store.getState().invoices.find((i) => i.id === sentInvoice);
    expect(invoice).toMatchObject({ status: "cancelled", number: 2 });
    expect(store.getState().visits.some((v) => v.invoiceId === sentInvoice)).toBe(false);

    // The page is now the cancelled record: its tag, total, line, and the dates it kept.
    expect(screen.getAllByText("Cancelled").length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { level: 1, name: "$215.25" })).toBeTruthy();
    expect(screen.getByText(/^INV-0002 · Morgan Testcase · cancelled 12 Nov$/)).toBeTruthy();
    expect(screen.getByText("Visits").nextElementSibling?.textContent).toBe(visitsBefore);
    expect(screen.queryByRole("button", { name: "Record payment" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancel invoice" })).toBeNull();
    expect(screen.getByRole("button", { name: "Download PDF" })).toBeTruthy();
  });

  it("says what happened when the invoice can't be cancelled any more", async () => {
    const { user, store } = renderApp(`/invoices/${sentInvoice}`);
    await user.click(screen.getByRole("button", { name: "Cancel invoice" }));
    const dialog = within(await screen.findByRole("alertdialog", { name: "Cancel INV-0002?" }));
    // Something else got there first.
    store.recordPayment(sentInvoice);
    await user.click(dialog.getByRole("button", { name: "Cancel invoice" }));
    expect(
      await screen.findByText("Undo the payment before cancelling this invoice."),
    ).toBeTruthy();
  });

  it("shows a paid invoice with the day it was paid, and only Download PDF", () => {
    renderApp(`/invoices/${paidInvoice}`);
    expect(screen.getByText(/^INV-0001 · Morgan Testcase · paid 12 Oct$/)).toBeTruthy();
    expect(screen.getByText("Tax").nextElementSibling?.textContent).toBe("None");
    expect(screen.queryByRole("button", { name: "Record payment" })).toBeNull();
    expect(screen.getByRole("button", { name: "Download PDF" })).toBeTruthy();
  });
});

/** The demo store, with some invoices still waiting to reach the server. */
class WithPendingInvoices extends DemoPracticeStore {
  constructor(
    demo: DemoStore,
    private readonly pending: ReadonlySet<string>,
  ) {
    super(demo);
  }
  override isInvoicePending = (invoiceId: string) => this.pending.has(invoiceId);
}

describe("A new invoice not yet on the server", () => {
  it("says it's offline, hides the number and explains the disabled send button", () => {
    const demo = new DemoStore();
    renderApp(
      `/invoices/${draftInvoice}`,
      demo,
      null,
      new WithPendingInvoices(demo, new Set([draftInvoice])),
    );
    expect(screen.getByRole("heading", { level: 1, name: "New invoice" })).toBeTruthy();
    expect(screen.queryByText(/INV-0003/)).toBeNull();
    expect(screen.getByText("Offline · saved on this computer")).toBeTruthy();
    expect(screen.getByText("Given when you're online")).toBeTruthy();
    expect(
      screen.getByText(
        "Waiting to reach the server before you can send. Your invoice is safe on this computer.",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send invoice" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "More ways to send" })).toHaveProperty(
      "disabled",
      true,
    );
    // Said once, under the title, not again in the alert.
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows the number and an enabled Send invoice once it has synced", () => {
    const demo = new DemoStore();
    renderApp(`/invoices/${draftInvoice}`, demo);
    expect(screen.getByRole("heading", { level: 1, name: "INV-0003" })).toBeTruthy();
    expect(screen.queryByText("Offline · saved on this computer")).toBeNull();
    expect(screen.getByRole("button", { name: "Send invoice" })).toHaveProperty("disabled", false);
  });

  it("doesn't block an invoice that's already been sent", () => {
    const demo = new DemoStore();
    renderApp(
      `/invoices/${sentInvoice}`,
      demo,
      null,
      new WithPendingInvoices(demo, new Set([sentInvoice])),
    );
    expect(screen.queryByText(/Offline/)).toBeNull();
    expect(screen.getByRole("button", { name: "Download PDF" })).toHaveProperty("disabled", false);
  });
});
