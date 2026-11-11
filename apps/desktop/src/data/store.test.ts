import { InvoiceRuleError, NoteRuleError, invoiceSchema, visitSchema } from "@kineo/shared";
import { describe, expect, it, vi } from "vitest";
import { DemoStore, StoreError, createDemoState, type StoreEnvironment } from "./store";

// Demo IDs (made-up data from demo.ts).
const morgan = "5eed0000-0000-4000-8000-000000000201";
const jordan = "5eed0000-0000-4000-8000-000000000203";
const riley = "5eed0000-0000-4000-8000-000000000204";
const paidInvoice = "5eed0000-0000-4000-8000-000000000301";
const sentInvoice = "5eed0000-0000-4000-8000-000000000302";
const draftInvoice = "5eed0000-0000-4000-8000-000000000303";
const paidVisit = "5eed0000-0000-4000-8000-000000000401";
const sentVisit = "5eed0000-0000-4000-8000-000000000402";
const jordanVisit1 = "5eed0000-0000-4000-8000-000000000405";
const jordanVisit2 = "5eed0000-0000-4000-8000-000000000406";
const rileyVisit = "5eed0000-0000-4000-8000-000000000407";
const followUp = "5eed0000-0000-4000-8000-000000000102";
const band = "5eed0000-0000-4000-8000-000000000103";

const NOW = "2026-11-11T18:00:00.000Z";

function testStore() {
  let n = 0;
  const env: StoreEnvironment = {
    now: () => NOW,
    today: () => "2026-11-11",
    newId: () => `00000000-0000-4000-8000-${(++n).toString().padStart(12, "0")}`,
  };
  return new DemoStore(createDemoState(), env);
}

describe("DemoStore", () => {
  it("starts with the demo data", () => {
    const state = testStore().getState();
    expect(state.patients).toHaveLength(4);
    expect(state.visits).toHaveLength(7);
    expect(state.invoices).toHaveLength(3);
    expect(state.priceItems).toHaveLength(3);
  });

  it("tells subscribers about changes and stops when unsubscribed", () => {
    const store = testStore();
    const listener = vi.fn<() => void>();
    const unsubscribe = store.subscribe(listener);
    store.addPatient({ fullName: "New Person", reasonForVisit: "" });
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    store.addPatient({ fullName: "Another Person", reasonForVisit: "" });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("replaces the state object on every change", () => {
    const store = testStore();
    const before = store.getState();
    store.addPatient({ fullName: "New Person", reasonForVisit: "" });
    expect(store.getState()).not.toBe(before);
    expect(before.patients).toHaveLength(4);
  });

  describe("patients and notes", () => {
    it("adds a patient with a trimmed name and no reason when blank", () => {
      const store = testStore();
      const patient = store.addPatient({ fullName: "  Sky Example ", reasonForVisit: "   " });
      expect(patient.fullName).toBe("Sky Example");
      expect(patient.reasonForVisit).toBeNull();
      expect(store.getState().patients).toContainEqual(patient);
    });

    it("refuses a patient without a name and leaves the state alone", () => {
      const store = testStore();
      expect(() => store.addPatient({ fullName: "  ", reasonForVisit: "" })).toThrow(
        new StoreError("Add the patient's full name."),
      );
      expect(store.getState().patients).toHaveLength(4);
    });

    it("saves a note as today's visit", () => {
      const store = testStore();
      const visit = store.saveVisit(riley, "  Made-up note.  ");
      expect(visit).toMatchObject({
        patientId: riley,
        visitDate: "2026-11-11",
        note: "Made-up note.",
        noteEditedAt: NOW,
        invoiceId: null,
      });
      expect(visitSchema.safeParse(visit).success).toBe(true);
    });

    it("refuses an empty note or an unknown patient", () => {
      const store = testStore();
      expect(() => store.saveVisit(riley, " ")).toThrow(NoteRuleError);
      expect(() => store.saveVisit("missing", "Note")).toThrow(StoreError);
    });

    it("adds to and replaces notes until the invoice is paid", () => {
      const store = testStore();
      expect(store.addToNote(rileyVisit, "First line.").note).toBe("First line.");
      expect(store.addToNote(sentVisit, "More.").note).toBe("Made-up note.\n\nMore.");
      expect(store.replaceNote(sentVisit, "Rewritten.").note).toBe("Rewritten.");
      expect(() => store.addToNote(paidVisit, "More.")).toThrow(NoteRuleError);
      expect(() => store.replaceNote(paidVisit, "Rewritten.")).toThrow(NoteRuleError);
    });
  });

  describe("invoices", () => {
    it("creates a draft with the next number and the chosen visits on it", () => {
      const store = testStore();
      const invoice = store.createInvoice(jordan, [jordanVisit1, jordanVisit2]);
      expect(invoice).toMatchObject({
        patientId: jordan,
        number: 4,
        status: "draft",
        taxEnabled: false,
        taxRateBasisPoints: 500,
      });
      expect(invoiceSchema.safeParse(invoice).success).toBe(true);
      const onInvoice = store.getState().visits.filter((v) => v.invoiceId === invoice.id);
      expect(onInvoice.map((v) => v.id)).toEqual([jordanVisit1, jordanVisit2]);
    });

    it("refuses an invoice with no visits, or with another patient's visit", () => {
      const store = testStore();
      expect(() => store.createInvoice(jordan, [])).toThrow(InvoiceRuleError);
      expect(() => store.createInvoice(jordan, [rileyVisit])).toThrow(InvoiceRuleError);
      expect(store.getState().invoices).toHaveLength(3);
    });

    it("refuses a visit already on another invoice", () => {
      const store = testStore();
      expect(() => store.createInvoice(morgan, [sentVisit])).toThrow(InvoiceRuleError);
    });

    it("adds, changes and removes lines on a draft, keeping positions in order", () => {
      const store = testStore();
      const first = store.addLine(draftInvoice, followUp, 2);
      const second = store.addLine(draftInvoice, band);
      expect(first).toMatchObject({
        name: "Follow-up treatment",
        unitPriceCents: 9500,
        quantity: 2,
        position: 1,
      });
      expect(second.position).toBe(2);

      store.setLineQuantity(second.id, 3);
      store.removeLine(first.id);
      const lines = store.getState().lineItems.filter((line) => line.invoiceId === draftInvoice);
      expect(lines.map((line) => [line.name, line.quantity, line.position])).toEqual([
        ["Initial assessment", 1, 0],
        ["Exercise band", 3, 1],
      ]);
    });

    it("refuses a quantity below 1", () => {
      const store = testStore();
      const line = store.addLine(draftInvoice, band);
      expect(() => store.setLineQuantity(line.id, 0)).toThrow(RangeError);
      expect(() => store.addLine(draftInvoice, band, 0)).toThrow(RangeError);
    });

    it("locks lines, visits and tax once sent", () => {
      const store = testStore();
      const sentLine = store.getState().lineItems.find((line) => line.invoiceId === sentInvoice);
      if (!sentLine) throw new Error("demo data has no line on the sent invoice");
      expect(() => store.addLine(sentInvoice, band)).toThrow(InvoiceRuleError);
      expect(() => store.setLineQuantity(sentLine.id, 5)).toThrow(InvoiceRuleError);
      expect(() => store.removeLine(sentLine.id)).toThrow(InvoiceRuleError);
      expect(() => store.setTax(sentInvoice, false)).toThrow(InvoiceRuleError);
      expect(() => store.setVisitOnInvoice(sentInvoice, sentVisit, false)).toThrow(
        InvoiceRuleError,
      );
      expect(() => store.addLine(paidInvoice, band)).toThrow(InvoiceRuleError);
    });

    it("turns tax on at the default rate and off again", () => {
      const store = testStore();
      store.setTax(draftInvoice, true);
      expect(store.getState().invoices.find((i) => i.id === draftInvoice)).toMatchObject({
        taxEnabled: true,
        taxRateBasisPoints: 500,
      });
      store.setTax(draftInvoice, false);
      expect(store.getState().invoices.find((i) => i.id === draftInvoice)?.taxEnabled).toBe(false);
    });

    it("moves visits on and off a draft", () => {
      const store = testStore();
      const invoice = store.createInvoice(jordan, [jordanVisit1]);
      store.setVisitOnInvoice(invoice.id, jordanVisit2, true);
      store.setVisitOnInvoice(invoice.id, jordanVisit1, false);
      const onInvoice = store.getState().visits.filter((v) => v.invoiceId === invoice.id);
      expect(onInvoice.map((v) => v.id)).toEqual([jordanVisit2]);
    });

    it("sends, records payment and undoes it", () => {
      const store = testStore();
      expect(store.sendInvoice(draftInvoice)).toMatchObject({ status: "sent", sentAt: NOW });
      expect(store.recordPayment(draftInvoice)).toMatchObject({ status: "paid", paidAt: NOW });
      expect(store.undoPayment(draftInvoice)).toMatchObject({ status: "sent", paidAt: null });
    });

    it("won't send an invoice without line items", () => {
      const store = testStore();
      const invoice = store.createInvoice(jordan, [jordanVisit1]);
      expect(() => store.sendInvoice(invoice.id)).toThrow(
        new InvoiceRuleError("Add at least one line item before sending."),
      );
    });

    it("refuses payment on a draft and undo on an unpaid invoice", () => {
      const store = testStore();
      expect(() => store.recordPayment(draftInvoice)).toThrow(InvoiceRuleError);
      expect(() => store.undoPayment(sentInvoice)).toThrow(InvoiceRuleError);
    });

    it("says when an invoice, line or price item is missing", () => {
      const store = testStore();
      expect(() => store.sendInvoice("missing")).toThrow(StoreError);
      expect(() => store.removeLine("missing")).toThrow(StoreError);
      expect(() => store.addLine(draftInvoice, "missing")).toThrow(StoreError);
    });
  });
});
