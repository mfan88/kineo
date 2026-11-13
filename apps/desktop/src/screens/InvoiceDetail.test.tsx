import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createDemoState, DemoStore } from "../data/store";
import { renderApp } from "../test/render";

// Made-up demo data (see @kineo/data/demo).
const paidInvoice = "5eed0000-0000-4000-8000-000000000301";
const sentInvoice = "5eed0000-0000-4000-8000-000000000302";
const jordan = "5eed0000-0000-4000-8000-000000000203";
const autism = "5eed0000-0000-4000-8000-000000000701";
const autismNumber = "5eed0000-0000-4000-8000-000000000702";
const followUp = "5eed0000-0000-4000-8000-000000000102";
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
    expect(card.getByText("Client Jordan Sample · Billing number 4821")).toBeTruthy();
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
    expect(card.getByText("Client Jordan Sample · Billing number 4821")).toBeTruthy();
    expect(card.queryByText("New Recipient")).toBeNull();
  });

  it("shows a self-pay sent invoice as Self-pay with the patient, and no client line", () => {
    renderApp(`/invoices/${sentInvoice}`);
    const card = billTo();
    expect(card.getByText("Self-pay")).toBeTruthy();
    expect(card.getByText("Morgan Testcase")).toBeTruthy();
    expect(card.queryByText(/^Client /)).toBeNull();
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
