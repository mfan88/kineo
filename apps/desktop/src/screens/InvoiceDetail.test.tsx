import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createDemoState, DemoStore, StoreError } from "../data/store";
import { renderApp } from "../test/render";

// Made-up demo data (see @kineo/data/demo).
const paidInvoice = "5eed0000-0000-4000-8000-000000000301";
const sentInvoice = "5eed0000-0000-4000-8000-000000000302";
const jordan = "5eed0000-0000-4000-8000-000000000203";
const autism = "5eed0000-0000-4000-8000-000000000701";
const autismNumber = "5eed0000-0000-4000-8000-000000000702";
const followUp = "5eed0000-0000-4000-8000-000000000102";
const UNPAID = /^Mark .+ as unpaid\?$/;
const LOCKED = "Locked once sent. Later changes to the funding don't alter this invoice.";

const billTo = () =>
  within(screen.getByRole("heading", { name: "Bill to" }).parentElement ?? document.body);

/** Jordan, billed through Autism Funding, with a sent invoice on both visits. */
function sentFundedInvoice() {
  const store = new DemoStore(createDemoState());
  store.addPatientFunding({
    patientId: jordan,
    fundingTypeId: autism,
    detailValues: { [autismNumber]: "4821" },
    periodStart: null,
    periodEnd: null,
  });
  const invoice = store.createInvoice(jordan, [
    "5eed0000-0000-4000-8000-000000000405",
    "5eed0000-0000-4000-8000-000000000406",
  ]);
  store.addLine(invoice.id, followUp);
  store.sendInvoice(invoice.id);
  return { store, invoice };
}

describe("Invoice detail: Bill to", () => {
  it("shows a sent funded invoice's funding, recipient, client details and the lock", () => {
    const { store, invoice } = sentFundedInvoice();
    renderApp(`/invoices/${invoice.id}`, store);
    expect(screen.getByRole("heading", { level: 2, name: "Bill to" })).toBeTruthy();
    const card = billTo();
    expect(card.getByText("Autism Funding")).toBeTruthy();
    expect(card.getByText("Waiting on payment")).toBeTruthy();
    expect(
      card.getByText("Autism Funding Branch, Ministry of Children and Family Development"),
    ).toBeTruthy();
    expect(card.getByText("Bill for Jordan Sample · Billing number 4821")).toBeTruthy();
    expect(card.getByText(LOCKED)).toBeTruthy();
  });

  it("has nothing to change: no Change, no inputs, no address button", () => {
    const { store, invoice } = sentFundedInvoice();
    renderApp(`/invoices/${invoice.id}`, store);
    const card = billTo();
    expect(card.queryByRole("button")).toBeNull();
    expect(card.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: "Change" })).toBeNull();
  });

  it("keeps the Bill to it was sent with after its funding type is renamed", () => {
    const { store, invoice } = sentFundedInvoice();
    store.saveFundingType({
      id: autism,
      name: "Renamed Funder",
      recipientName: "New Recipient",
      recipientAddress: "New Address",
      details: [
        { id: autismNumber, label: "Authorization number", kind: "text", showOnInvoice: true },
      ],
    });
    renderApp(`/invoices/${invoice.id}`, store);
    const card = billTo();
    expect(card.getByText("Autism Funding")).toBeTruthy();
    expect(card.queryByText("Renamed Funder")).toBeNull();
    expect(card.getByText("Bill for Jordan Sample · Billing number 4821")).toBeTruthy();
    expect(card.queryByText("New Recipient")).toBeNull();
  });

  it("shows a self-pay sent invoice as Self-pay with the patient, and no client line", () => {
    renderApp(`/invoices/${sentInvoice}`);
    const card = billTo();
    expect(card.getByText("Self-pay")).toBeTruthy();
    expect(card.getByText("Morgan Testcase")).toBeTruthy();
    expect(card.queryByText(/^Bill for /)).toBeNull();
    expect(card.getByText(LOCKED)).toBeTruthy();
  });

  it("shows it on a paid invoice, with the Paid tag", () => {
    renderApp(`/invoices/${paidInvoice}`);
    const card = billTo();
    expect(card.getByText("Self-pay")).toBeTruthy();
    expect(card.getByText("Paid")).toBeTruthy();
    expect(card.getByText(LOCKED)).toBeTruthy();
  });

  it("shows it on a cancelled invoice, as a record", () => {
    const { store, invoice } = sentFundedInvoice();
    store.cancelInvoice(invoice.id);
    renderApp(`/invoices/${invoice.id}`, store);
    const card = billTo();
    expect(card.getByText("Autism Funding")).toBeTruthy();
    expect(card.getByText("Cancelled")).toBeTruthy();
    expect(card.getByText(LOCKED)).toBeTruthy();
  });
});

describe("Invoice detail: payment", () => {
  it("shows Record payment on a sent invoice and no Mark as unpaid", () => {
    renderApp(`/invoices/${sentInvoice}`);
    expect(screen.getByRole("button", { name: "Record payment" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Mark as unpaid" })).toBeNull();
  });

  it("records the payment once, with a Marked paid toast", async () => {
    const { user, store } = renderApp(`/invoices/${sentInvoice}`);
    await user.click(screen.getByRole("button", { name: "Record payment" }));
    expect(await screen.findByText("Marked paid")).toBeTruthy();
    expect(store.getState().invoices.find((i) => i.id === sentInvoice)?.status).toBe("paid");
    expect(screen.queryByRole("button", { name: "Record payment" })).toBeNull();
  });

  it("shows a ghost Mark as unpaid, not Record payment, on a paid invoice", () => {
    renderApp(`/invoices/${paidInvoice}`);
    expect(screen.getByRole("button", { name: "Mark as unpaid" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Record payment" })).toBeNull();
  });

  it("shows neither on a cancelled invoice", () => {
    const { store, invoice } = sentFundedInvoice();
    store.cancelInvoice(invoice.id);
    renderApp(`/invoices/${invoice.id}`, store);
    expect(screen.queryByRole("button", { name: "Mark as unpaid" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Record payment" })).toBeNull();
  });

  it("asks first, and Keep as paid leaves it paid", async () => {
    const { user, store } = renderApp(`/invoices/${paidInvoice}`);
    await user.click(screen.getByRole("button", { name: "Mark as unpaid" }));
    const dialog = await screen.findByRole("alertdialog", { name: UNPAID });
    expect(within(dialog).getByText(/^Mark .+ as unpaid\?$/)).toBeTruthy();
    expect(within(dialog).getByText("It goes back to Waiting on payment.")).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "Keep as paid" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog", { name: UNPAID })).toBeNull());
    expect(store.getState().invoices.find((i) => i.id === paidInvoice)?.status).toBe("paid");
  });

  it("marks it unpaid, toasts, and Undo records the payment again", async () => {
    const { user, store } = renderApp(`/invoices/${paidInvoice}`);
    await user.click(screen.getByRole("button", { name: "Mark as unpaid" }));
    const dialog = await screen.findByRole("alertdialog", { name: UNPAID });
    await user.click(within(dialog).getByRole("button", { name: "Mark as unpaid" }));
    expect(await screen.findByText("Marked unpaid")).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole("alertdialog", { name: UNPAID })).toBeNull());
    expect(store.getState().invoices.find((i) => i.id === paidInvoice)?.status).toBe("sent");
    await user.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() =>
      expect(store.getState().invoices.find((i) => i.id === paidInvoice)?.status).toBe("paid"),
    );
  });

  it("keeps the dialog open and shows the message when it can't be saved", async () => {
    const { user, store } = renderApp(`/invoices/${paidInvoice}`);
    await user.click(screen.getByRole("button", { name: "Mark as unpaid" }));
    const dialog = await screen.findByRole("alertdialog", { name: UNPAID });
    vi.spyOn(store, "undoPayment").mockImplementation(() => {
      throw new StoreError("That invoice changed. Reload and try again.");
    });
    await user.click(within(dialog).getByRole("button", { name: "Mark as unpaid" }));
    const alert = await within(screen.getByRole("alertdialog", { name: UNPAID })).findByRole(
      "alert",
    );
    expect(alert.textContent).toBe("That invoice changed. Reload and try again.");
    expect(store.getState().invoices.find((i) => i.id === paidInvoice)?.status).toBe("paid");
  });
});
