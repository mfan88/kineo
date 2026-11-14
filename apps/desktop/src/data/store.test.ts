import {
  DEFAULT_INVOICE_NUMBER_FORMAT,
  FundingRuleError,
  InvoiceRuleError,
  NoteRuleError,
  invoiceSchema,
  VISIT_ITEMS_ON_INVOICE,
  visitSchema,
} from "@kineo/shared";
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

  describe("visit items", () => {
    const followUpDraft = {
      priceItemId: followUp,
      name: "Follow-up",
      unitPriceCents: 9500,
      quantity: 2,
    };
    const bandDraft = { priceItemId: band, name: "Band", unitPriceCents: 1500, quantity: 1 };

    it("starts with the demo visit's items", () => {
      const items = testStore()
        .getState()
        .visitItems.filter((i) => i.visitId === jordanVisit1);
      expect(items.map((i) => [i.name, i.quantity, i.position])).toEqual([
        ["Initial assessment", 1, 0],
        ["Follow-up treatment", 2, 1],
      ]);
    });

    it("saves items with a visit, in order from position 0", () => {
      const store = testStore();
      const visit = store.saveVisit(riley, "Made-up note.", undefined, [followUpDraft, bandDraft]);
      const items = store.getState().visitItems.filter((i) => i.visitId === visit.id);
      expect(items.map((i) => [i.name, i.unitPriceCents, i.quantity, i.position])).toEqual([
        ["Follow-up", 9500, 2, 0],
        ["Band", 1500, 1, 1],
      ]);
      expect(store.saveVisit(riley, "No items.").id).not.toBe(visit.id);
    });

    it("refuses a quantity under 1 and saves nothing", () => {
      const store = testStore();
      const before = store.getState();
      expect(() =>
        store.saveVisit(riley, "Note", undefined, [{ ...followUpDraft, quantity: 0 }]),
      ).toThrow(new NoteRuleError("Quantity must be a whole number of at least 1."));
      expect(store.getState()).toBe(before);
    });

    it("replaces a visit's items while it isn't on an invoice, and clears them with []", () => {
      const store = testStore();
      const next = store.setVisitItems(rileyVisit, [followUpDraft, bandDraft]);
      expect(next.map((i) => i.position)).toEqual([0, 1]);
      expect(store.getState().visitItems.filter((i) => i.visitId === rileyVisit)).toEqual(next);
      store.setVisitItems(rileyVisit, []);
      expect(store.getState().visitItems.filter((i) => i.visitId === rileyVisit)).toEqual([]);
    });

    it("refuses to change items once the visit is on an invoice", () => {
      const store = testStore();
      const before = store.getState();
      expect(() => store.setVisitItems(sentVisit, [followUpDraft])).toThrow(
        new NoteRuleError(VISIT_ITEMS_ON_INVOICE),
      );
      expect(() => store.setVisitItems("missing", [])).toThrow(StoreError);
      expect(store.getState()).toBe(before);
    });

    it("deletes a visit's items with it, and Undo puts both back", () => {
      const store = testStore();
      const visit = store.saveVisit(riley, "Made-up note.", undefined, [followUpDraft, bandDraft]);
      const removed = store.deleteVisit(visit.id);
      expect(removed.items.map((i) => i.name)).toEqual(["Follow-up", "Band"]);
      expect(store.getState().visitItems.some((i) => i.visitId === visit.id)).toBe(false);
      store.restoreVisit(removed);
      expect(store.getState().visitItems.filter((i) => i.visitId === visit.id)).toEqual(
        removed.items,
      );
      // The visit in state is a plain visit; its items live in visitItems.
      const stored = store.getState().visits.find((v) => v.id === visit.id);
      expect(stored).toBeDefined();
      expect(stored && "items" in stored).toBe(false);
      // A second restore doesn't double the items.
      store.restoreVisit(removed);
      expect(store.getState().visitItems.filter((i) => i.visitId === visit.id)).toHaveLength(2);
    });

    it("gives a line added on the invoice a null visit id", () => {
      const store = testStore();
      const invoice = store.createInvoice(jordan, [jordanVisit1]);
      const added = store.addLine(invoice.id, followUp);
      expect(added.visitId).toBeNull();
      expect(store.getState().lineItems.find((l) => l.id === added.id)?.visitId).toBeNull();
    });

    it("copies a visit's items onto a new invoice, undated on self-pay", () => {
      const store = testStore();
      store.setVisitItems(jordanVisit2, [bandDraft]);
      const invoice = store.createInvoice(jordan, [jordanVisit2, jordanVisit1]);
      const lines = store
        .getState()
        .lineItems.filter((l) => l.invoiceId === invoice.id)
        .toSorted((a, b) => a.position - b.position);
      // Oldest visit first, then each visit's item order.
      expect(lines.map((l) => [l.name, l.quantity, l.position, l.visitId, l.serviceDate])).toEqual([
        ["Initial assessment", 1, 0, jordanVisit1, null],
        ["Follow-up treatment", 2, 1, jordanVisit1, null],
        ["Band", 1, 2, jordanVisit2, null],
      ]);
    });

    it("dates the copied lines with their visit's date on a funded invoice", () => {
      const ctx = clockStore();
      ctx.store.addPatientFunding(fundingInput(jordan));
      ctx.store.setVisitItems(jordanVisit2, [bandDraft]);
      const invoice = ctx.store.createInvoice(jordan, [jordanVisit1, jordanVisit2]);
      const lines = ctx.store
        .getState()
        .lineItems.filter((l) => l.invoiceId === invoice.id)
        .toSorted((a, b) => a.position - b.position);
      expect(lines.map((l) => [l.name, l.visitId, l.serviceDate])).toEqual([
        ["Initial assessment", jordanVisit1, "2026-10-28"],
        ["Follow-up treatment", jordanVisit1, "2026-10-28"],
        ["Band", jordanVisit2, "2026-11-04"],
      ]);
    });

    it("ticking a visit off removes only its lines, closes up positions and keeps the rest", () => {
      const store = testStore();
      store.setVisitItems(jordanVisit2, [bandDraft]);
      const invoice = store.createInvoice(jordan, [jordanVisit1]);
      store.addLine(invoice.id, followUp);
      store.setVisitOnInvoice(invoice.id, jordanVisit2, true);
      const lines = () =>
        store
          .getState()
          .lineItems.filter((l) => l.invoiceId === invoice.id)
          .toSorted((a, b) => a.position - b.position);
      expect(lines().map((l) => [l.name, l.visitId])).toEqual([
        ["Initial assessment", jordanVisit1],
        ["Follow-up treatment", jordanVisit1],
        ["Follow-up treatment", null],
        ["Band", jordanVisit2],
      ]);

      store.setVisitOnInvoice(invoice.id, jordanVisit1, false);
      expect(lines().map((l) => [l.name, l.position])).toEqual([
        ["Follow-up treatment", 0],
        ["Band", 1],
      ]);
      // The visit keeps its items, and putting it back copies them again.
      expect(store.getState().visitItems.filter((i) => i.visitId === jordanVisit1)).toHaveLength(2);
      store.setVisitOnInvoice(invoice.id, jordanVisit1, true);
      expect(lines().map((l) => l.position)).toEqual([0, 1, 2, 3]);
      expect(lines().filter((l) => l.visitId === jordanVisit1)).toHaveLength(2);
    });

    it("takes the item's own price, not the price list's, when copying", () => {
      const store = testStore();
      store.updatePriceItem(followUp, { name: "Follow-up", unitPriceCents: 20000 });
      const invoice = store.createInvoice(jordan, [jordanVisit1]);
      const line = store
        .getState()
        .lineItems.find((l) => l.invoiceId === invoice.id && l.name === "Follow-up treatment");
      expect(line?.unitPriceCents).toBe(9500);
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

    it("cancels a sent invoice: keeps its number, copies the visit dates and releases the visits", () => {
      const store = testStore();
      const before = store.getState().invoices.find((i) => i.id === sentInvoice);
      const dates = store
        .getState()
        .visits.filter((v) => v.invoiceId === sentInvoice)
        .map((v) => v.visitDate)
        .toSorted();
      expect(dates.length).toBeGreaterThan(0);
      const cancelled = store.cancelInvoice(sentInvoice);
      expect(cancelled).toMatchObject({
        status: "cancelled",
        number: before?.number,
        cancelledAt: NOW,
        cancelledVisitDates: dates,
      });
      expect(invoiceSchema.safeParse(cancelled).success).toBe(true);
      expect(store.getState().visits.some((v) => v.invoiceId === sentInvoice)).toBe(false);
      // The next invoice takes the next number: the cancelled one's is never reused.
      const next = store.createInvoice(morgan, [sentVisit]);
      expect(next.number).toBe(Math.max(...store.getState().invoices.map((i) => i.number)));
      expect(next.number).toBeGreaterThan(cancelled.number);
    });

    it("won't cancel a draft, a paid invoice or a cancelled one", () => {
      const store = testStore();
      expect(() => store.cancelInvoice(draftInvoice)).toThrow(InvoiceRuleError);
      expect(() => store.cancelInvoice(paidInvoice)).toThrow(InvoiceRuleError);
      store.cancelInvoice(sentInvoice);
      expect(() => store.cancelInvoice(sentInvoice)).toThrow(InvoiceRuleError);
      expect(store.getState().visits.find((v) => v.id === paidVisit)?.invoiceId).toBe(paidInvoice);
    });

    it("won't send an invoice without line items", () => {
      const store = testStore();
      store.setVisitItems(jordanVisit1, []);
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

  describe("settings", () => {
    it("saves the profile with trimmed values", () => {
      const store = testStore();
      const { profile } = store.getState();
      const saved = store.saveProfile({
        ...profile,
        title: { value: "  Physiotherapist ", showOnInvoice: true },
      });
      expect(saved.title.value).toBe("Physiotherapist");
      expect(saved.updatedAt).toBe(NOW);
      expect(store.getState().profile).toBe(saved);
    });

    it("refuses a profile with an empty field shown on invoices", () => {
      const store = testStore();
      const { profile } = store.getState();
      expect(() =>
        store.saveProfile({ ...profile, fullName: { value: " ", showOnInvoice: true } }),
      ).toThrow(new StoreError('Add your full name or turn off "Show on invoice".'));
      expect(store.getState().profile).toBe(profile);
    });
  });

  describe("price list and settings", () => {
    it("adds, updates and removes price items", () => {
      const store = testStore();
      const item = store.addPriceItem({ name: " Dry needling ", unitPriceCents: 8550 });
      expect(item).toMatchObject({ name: "Dry needling", unitPriceCents: 8550 });
      expect(
        store.updatePriceItem(item.id, { name: "Needling", unitPriceCents: 0 }).unitPriceCents,
      ).toBe(0);
      store.removePriceItem(item.id);
      expect(store.getState().priceItems).toHaveLength(3);
    });

    it("refuses an empty name or a negative or fractional price", () => {
      const store = testStore();
      expect(() => store.addPriceItem({ name: " ", unitPriceCents: 100 })).toThrow(
        new StoreError("Give the item a name."),
      );
      expect(() => store.addPriceItem({ name: "X", unitPriceCents: -1 })).toThrow(
        new StoreError("Enter a price of $0.00 or more."),
      );
      expect(() => store.addPriceItem({ name: "X", unitPriceCents: 1.5 })).toThrow(StoreError);
    });

    it("keeps copied lines when their price item is removed", () => {
      const store = testStore();
      const line = store.addLine(draftInvoice, band);
      store.removePriceItem(band);
      const kept = store.getState().lineItems.find((l) => l.id === line.id);
      expect(kept).toMatchObject({
        priceItemId: null,
        name: "Exercise band",
        unitPriceCents: 1500,
      });
    });

    it("saves settings and refuses bad values", () => {
      const store = testStore();
      const numbers = { ...DEFAULT_INVOICE_NUMBER_FORMAT, prefix: " KP " };
      expect(
        store.saveSettings({
          defaultTaxRateBasisPoints: 1250,
          invoiceNumberFormat: numbers,
          invoiceNumberStart: 900,
        }),
      ).toMatchObject({
        defaultTaxRateBasisPoints: 1250,
        invoiceNumberFormat: { prefix: "KP" },
        invoiceNumberStart: 900,
      });
      expect(() =>
        store.saveSettings({
          defaultTaxRateBasisPoints: 10001,
          invoiceNumberFormat: numbers,
          invoiceNumberStart: 900,
        }),
      ).toThrow(new StoreError("Enter a tax rate from 0 to 100%."));
      expect(() =>
        store.saveSettings({
          defaultTaxRateBasisPoints: 0,
          invoiceNumberFormat: { ...numbers, prefix: "X".repeat(21) },
          invoiceNumberStart: 900,
        }),
      ).toThrow(new StoreError("Keep the invoice number prefix to 20 characters or fewer."));
      // The demo practice already has invoices 1 to 3.
      expect(() =>
        store.saveSettings({
          defaultTaxRateBasisPoints: 0,
          invoiceNumberFormat: numbers,
          invoiceNumberStart: 2,
        }),
      ).toThrow(new StoreError("Start at 4 or higher. Lower numbers are already used."));
    });

    it("numbers new invoices from the starting number, and keeps a sent one's number", () => {
      const store = testStore();
      store.saveSettings({
        defaultTaxRateBasisPoints: 0,
        invoiceNumberFormat: {
          ...DEFAULT_INVOICE_NUMBER_FORMAT,
          prefix: "KP",
          shown: { prefix: true, year: true, month: false },
        },
        invoiceNumberStart: 900,
      });
      const draft = store.getState().invoices.find((invoice) => invoice.status === "draft");
      if (!draft) throw new Error("No demo draft");
      const sent = store.sendInvoice(draft.id);
      // The year is the practitioner's today (2026-11-11 here).
      expect(sent.displayNumber).toBe(`KP-2026-${String(draft.number).padStart(4, "0")}`);
    });
  });

  describe("invoice style", () => {
    const style = {
      accentColor: "forest",
      font: "serif",
      headerLayout: "centred",
      footerNote: "  Thanks for coming in.  ",
      logoPath: null,
      footerLogoPath: null,
      showMadeWith: true,
    } as const;

    it("saves the style with a trimmed footer note", () => {
      const store = testStore();
      const saved = store.saveInvoiceStyle(style);
      expect(saved).toMatchObject({
        accentColor: "forest",
        font: "serif",
        headerLayout: "centred",
        footerNote: "Thanks for coming in.",
        logoPath: null,
        updatedAt: NOW,
      });
      expect(store.getState().invoiceStyle).toBe(saved);
    });

    it("allows an empty footer note and keeps a logo path", () => {
      const store = testStore();
      const saved = store.saveInvoiceStyle({
        ...style,
        footerNote: "",
        logoPath: "data:image/png;base64,AAAA",
      });
      expect(saved.footerNote).toBe("");
      expect(saved.logoPath).toBe("data:image/png;base64,AAAA");
    });

    it("refuses a footer note over 500 characters and leaves the style as it was", () => {
      const store = testStore();
      const before = store.getState().invoiceStyle;
      expect(() => store.saveInvoiceStyle({ ...style, footerNote: "x".repeat(501) })).toThrow(
        new StoreError("Keep the footer note to 500 characters or fewer."),
      );
      expect(store.getState().invoiceStyle).toBe(before);
    });

    it("saves a footer logo and the Made with switch, and refuses an empty footer logo path", () => {
      const store = testStore();
      const saved = store.saveInvoiceStyle({
        ...style,
        footerLogoPath: "data:image/png;base64,BBBB",
        showMadeWith: false,
      });
      expect(saved).toMatchObject({
        footerLogoPath: "data:image/png;base64,BBBB",
        showMadeWith: false,
      });
      expect(() => store.saveInvoiceStyle({ ...style, footerLogoPath: " " })).toThrow(
        new StoreError("That logo couldn't be used. Choose the image again."),
      );
    });

    it("refuses an empty logo path", () => {
      const store = testStore();
      expect(() => store.saveInvoiceStyle({ ...style, logoPath: " " })).toThrow(
        new StoreError("That logo couldn't be used. Choose the image again."),
      );
    });
  });
});

// Funding ---------------------------------------------------------------------------
// The same cases as the local database writer's tests (packages/data), with the same
// messages, so the demo store used by screen tests behaves as the app does.

const autism = "5eed0000-0000-4000-8000-000000000701";
const autismNumber = "5eed0000-0000-4000-8000-000000000702";
const icbc = "5eed0000-0000-4000-8000-000000000703";
const icbcClaim = "5eed0000-0000-4000-8000-000000000704";
const caseyFunding = "5eed0000-0000-4000-8000-000000000801";
const jordanOld = jordanVisit1; // 2026-10-28
const jordanNew = jordanVisit2; // 2026-11-04

/** A store whose clock the test can move, so fundings get different creation times. */
function clockStore() {
  let n = 0;
  let now = NOW;
  const env: StoreEnvironment = {
    now: () => now,
    today: () => "2026-11-11",
    newId: () => `00000000-0000-4000-8000-${(++n).toString().padStart(12, "0")}`,
  };
  return { store: new DemoStore(createDemoState(), env), setNow: (next: string) => (now = next) };
}

const autismDraft = (over: Record<string, unknown> = {}) => ({
  name: "Autism Funding",
  recipientName: "Example Branch",
  recipientAddress: "PO Box 1",
  details: [
    { id: autismNumber, label: "Billing number", kind: "text" as const, showOnInvoice: true },
  ],
  ...over,
});

const fundingInput = (patientId: string, fundingTypeId = autism, value = "4821") => ({
  patientId,
  fundingTypeId,
  detailValues: { [autismNumber]: value, [icbcClaim]: value },
  periodStart: null,
  periodEnd: null,
});

describe("DemoStore funding types", () => {
  it("saves a new type, trimmed, and one with no recipient yet", () => {
    const store = testStore();
    const type = store.saveFundingType(
      autismDraft({ name: "  New Funder ", recipientName: "", recipientAddress: "" }),
    );
    expect(type).toMatchObject({ name: "New Funder", recipientName: "", recipientAddress: "" });
    expect(store.getState().fundingTypes).toContainEqual(type);
  });

  it("updates an existing type and keeps when it was created", () => {
    const { store, setNow } = clockStore();
    const before = store.getState().fundingTypes.find((t) => t.id === autism);
    setNow("2026-11-12T10:00:00.000Z");
    const updated = store.saveFundingType({ ...autismDraft({ name: "Renamed" }), id: autism });
    expect(updated).toMatchObject({ id: autism, name: "Renamed", createdAt: before?.createdAt });
    expect(updated.updatedAt).toBe("2026-11-12T10:00:00.000Z");
  });

  it("refuses a blank name, a repeated label and a type that's gone, changing nothing", () => {
    const store = testStore();
    const before = store.getState();
    expect(() => store.saveFundingType(autismDraft({ name: "  " }))).toThrow(
      new FundingRuleError("Add a name for this funding type."),
    );
    expect(() =>
      store.saveFundingType(
        autismDraft({
          details: [
            { id: autismNumber, label: "Billing number", kind: "text", showOnInvoice: true },
            { id: icbcClaim, label: "billing number", kind: "text", showOnInvoice: true },
          ],
        }),
      ),
    ).toThrow(new FundingRuleError("Two details can't have the same name."));
    expect(() => store.saveFundingType({ ...autismDraft(), id: "gone" })).toThrow(
      new StoreError("That funding type no longer exists."),
    );
    expect(store.getState()).toBe(before);
  });

  it("deletes a type nobody uses, and refuses one with an active funding", () => {
    const store = testStore();
    store.deleteFundingType(icbc);
    expect(store.getState().fundingTypes.map((t) => t.id)).toEqual([autism]);
    expect(() => store.deleteFundingType(autism)).toThrow(
      new FundingRuleError("Move this type's patients to another type before deleting it."),
    );
    expect(() => store.deleteFundingType("gone")).toThrow(
      new StoreError("That funding type no longer exists."),
    );
  });

  it("allows deleting once the funding has ended or its period has passed, unlinking it", () => {
    const store = testStore();
    store.endPatientFunding(caseyFunding);
    store.deleteFundingType(autism);
    expect(store.getState().patientFundings[0]).toMatchObject({
      id: caseyFunding,
      fundingTypeId: null,
      endedOn: "2026-11-11",
    });

    const lapsed = testStore();
    lapsed.updatePatientFunding(caseyFunding, {
      detailValues: { [autismNumber]: "4821" },
      periodStart: null,
      periodEnd: "2026-11-10",
    });
    lapsed.deleteFundingType(autism);
    expect(lapsed.getState().fundingTypes.map((t) => t.id)).toEqual([icbc]);
  });
});

describe("DemoStore patient fundings", () => {
  it("adds a funding with trimmed values and a period, dropping values the type doesn't have", () => {
    const store = testStore();
    const funding = store.addPatientFunding({
      ...fundingInput(jordan, autism, " 4821 "),
      detailValues: { [autismNumber]: " 4821 ", stray: "x" },
      periodStart: "2026-04-01",
      periodEnd: "2027-03-31",
    });
    expect(funding).toMatchObject({
      patientId: jordan,
      fundingTypeId: autism,
      detailValues: { [autismNumber]: "4821" },
      periodStart: "2026-04-01",
      periodEnd: "2027-03-31",
      endedOn: null,
    });
    expect(store.getState().patientFundings).toContainEqual(funding);
  });

  it("asks for a shown detail's value and sensible dates, adding nothing", () => {
    const store = testStore();
    const before = store.getState();
    expect(() => store.addPatientFunding({ ...fundingInput(jordan), detailValues: {} })).toThrow(
      new FundingRuleError("Add the billing number."),
    );
    expect(() =>
      store.addPatientFunding({
        ...fundingInput(jordan),
        periodStart: "2027-04-01",
        periodEnd: "2027-03-31",
      }),
    ).toThrow(new FundingRuleError("The period can't end before it starts."));
    expect(() => store.addPatientFunding({ ...fundingInput("gone") })).toThrow(
      new StoreError("That patient no longer exists."),
    );
    expect(() => store.addPatientFunding({ ...fundingInput(jordan, "gone") })).toThrow(
      new StoreError("That funding type no longer exists."),
    );
    expect(store.getState()).toBe(before);
  });

  it("ends a funding today and undoes it, and says when it's gone", () => {
    const store = testStore();
    expect(store.endPatientFunding(caseyFunding)).toMatchObject({ endedOn: "2026-11-11" });
    expect(store.undoEndPatientFunding(caseyFunding)).toMatchObject({ endedOn: null });
    for (const run of [
      () => store.endPatientFunding("gone"),
      () => store.undoEndPatientFunding("gone"),
      () =>
        store.updatePatientFunding("gone", {
          detailValues: {},
          periodStart: null,
          periodEnd: null,
        }),
    ]) {
      expect(run).toThrow(new StoreError("That funding no longer exists."));
    }
  });

  it("refuses an update with a missing shown value, keeping the old one", () => {
    const store = testStore();
    expect(() =>
      store.updatePatientFunding(caseyFunding, {
        detailValues: { [autismNumber]: " " },
        periodStart: null,
        periodEnd: null,
      }),
    ).toThrow(new FundingRuleError("Add the billing number."));
    expect(store.getState().patientFundings[0]?.detailValues[autismNumber]).toBe("4821");
  });
});

/** Jordan, billed through Autism Funding, with an invoice on both of their visits. */
function fundedJordan() {
  const ctx = clockStore();
  const funding = ctx.store.addPatientFunding(fundingInput(jordan));
  // These cases are about lines added on the invoice, so the visits bring none of their own.
  ctx.store.setVisitItems(jordanOld, []);
  const invoice = ctx.store.createInvoice(jordan, [jordanOld, jordanNew]);
  return { ...ctx, funding, invoice };
}

describe("DemoStore Bill to", () => {
  it("bills the patient's active funding on a new invoice, copying its detail value", () => {
    const { funding, invoice } = fundedJordan();
    expect(invoice.billTo).toEqual({
      kind: "funding",
      patientFundingId: funding.id,
      fundingName: "Autism Funding",
      name: "Autism Funding Branch, Ministry of Children and Family Development",
      address: "PO Box 9776 STN PROV GOVT\nVictoria BC V8W 9S5",
      details: [{ id: autismNumber, label: "Billing number", value: "4821" }],
    });
  });

  it("is self-pay without a funding, with the patient's name", () => {
    const store = testStore();
    const invoice = store.createInvoice(riley, [rileyVisit]);
    expect(invoice.billTo).toEqual({ kind: "patient", name: "Riley Placeholder", address: "" });
  });

  it("uses the newest of several active fundings", () => {
    const { store, setNow } = clockStore();
    store.addPatientFunding(fundingInput(jordan));
    setNow("2026-11-12T10:00:00.000Z");
    const newer = store.addPatientFunding({
      ...fundingInput(jordan, icbc, "K1"),
      detailValues: { [icbcClaim]: "K1" },
    });
    const invoice = store.createInvoice(jordan, [jordanOld]);
    expect(invoice.billTo).toMatchObject({ patientFundingId: newer.id, fundingName: "ICBC" });
  });

  it("switches to self-pay and back, and refuses a funding that isn't current or the patient's", () => {
    const { store, funding, invoice } = fundedJordan();
    expect(store.setBillTo(invoice.id, { kind: "patient" }).billTo).toEqual({
      kind: "patient",
      name: "Jordan Sample",
      address: "",
    });
    expect(
      store.setBillTo(invoice.id, { kind: "funding", patientFundingId: funding.id }).billTo,
    ).toMatchObject({ kind: "funding", patientFundingId: funding.id });

    const message = new InvoiceRuleError("Pick one of this patient's current fundings.");
    expect(() =>
      store.setBillTo(invoice.id, { kind: "funding", patientFundingId: caseyFunding }),
    ).toThrow(message);
    expect(() =>
      store.setBillTo(invoice.id, { kind: "funding", patientFundingId: "gone" }),
    ).toThrow(message);
    store.endPatientFunding(funding.id);
    expect(() =>
      store.setBillTo(invoice.id, { kind: "funding", patientFundingId: funding.id }),
    ).toThrow(message);
  });

  it("is locked once the invoice is sent", () => {
    const store = testStore();
    expect(() => store.setBillTo(sentInvoice, { kind: "patient" })).toThrow(
      new InvoiceRuleError("This invoice has been sent and can't be changed."),
    );
  });

  it("dates undated lines when the invoice has one visit date, and not when it has several", () => {
    const { store, funding, invoice } = fundedJordan();
    store.setBillTo(invoice.id, { kind: "patient" });
    store.addLine(invoice.id, followUp);
    store.setBillTo(invoice.id, { kind: "funding", patientFundingId: funding.id });
    // Two visit dates: nothing to guess.
    expect(store.getState().lineItems.at(-1)?.serviceDate).toBeNull();

    const one = clockStore();
    const f = one.store.addPatientFunding(fundingInput(jordan));
    const single = one.store.createInvoice(jordan, [jordanOld]);
    one.store.setBillTo(single.id, { kind: "patient" });
    one.store.addLine(single.id, followUp);
    expect(one.store.getState().lineItems.at(-1)?.serviceDate).toBeNull();
    one.store.setBillTo(single.id, { kind: "funding", patientFundingId: f.id });
    expect(one.store.getState().lineItems.at(-1)?.serviceDate).toBe("2026-10-28");
  });

  it("fills in a detail, and refuses an unknown detail or a self-pay invoice", () => {
    const { store, invoice } = fundedJordan();
    store.setBillToDetail(invoice.id, autismNumber, " 9999 ");
    expect(store.getState().invoices.find((i) => i.id === invoice.id)?.billTo).toMatchObject({
      details: [{ id: autismNumber, label: "Billing number", value: "9999" }],
    });
    const message = new InvoiceRuleError("That detail isn't on this invoice.");
    expect(() => store.setBillToDetail(invoice.id, "gone", "x")).toThrow(message);
    store.setBillTo(invoice.id, { kind: "patient" });
    expect(() => store.setBillToDetail(invoice.id, autismNumber, "x")).toThrow(message);
  });

  it("saves a self-pay address on the invoice and the patient, and refuses it on a funded one", () => {
    const store = testStore();
    const invoice = store.createInvoice(riley, [rileyVisit]);
    store.setSelfPayAddress(invoice.id, "  5 Sample Ave\nBurnaby BC ");
    expect(store.getState().invoices.find((i) => i.id === invoice.id)?.billTo).toMatchObject({
      address: "5 Sample Ave\nBurnaby BC",
    });
    expect(store.getState().patients.find((p) => p.id === riley)?.billingAddress).toBe(
      "5 Sample Ave\nBurnaby BC",
    );
    store.setSelfPayAddress(invoice.id, "x".repeat(600));
    expect(store.getState().patients.find((p) => p.id === riley)?.billingAddress).toHaveLength(500);

    const funded = fundedJordan();
    expect(() => funded.store.setSelfPayAddress(funded.invoice.id, "x")).toThrow(
      new InvoiceRuleError("Only a self-pay invoice has the patient's address."),
    );
  });

  it("adds one dated line per visit date on a funded draft, and one undated line on self-pay", () => {
    const { store, invoice } = fundedJordan();
    const first = store.addLine(invoice.id, followUp, 3);
    expect(first).toMatchObject({ serviceDate: "2026-10-28", quantity: 1, position: 0 });
    expect(
      store
        .getState()
        .lineItems.filter((l) => l.invoiceId === invoice.id)
        .map((l) => [l.serviceDate, l.quantity, l.position]),
    ).toEqual([
      ["2026-10-28", 1, 0],
      ["2026-11-04", 1, 1],
    ]);

    const plain = testStore();
    const selfPay = plain.createInvoice(jordan, [jordanOld, jordanNew]);
    plain.addLine(selfPay.id, followUp, 2);
    expect(plain.getState().lineItems.at(-1)).toMatchObject({ serviceDate: null, quantity: 2 });
  });

  it("clears a line's date when its visit comes off, unless another visit has that date", () => {
    const { store, invoice } = fundedJordan();
    store.addLine(invoice.id, followUp);
    store.setVisitOnInvoice(invoice.id, jordanNew, false);
    const dates = () =>
      store
        .getState()
        .lineItems.filter((l) => l.invoiceId === invoice.id)
        .map((l) => l.serviceDate);
    expect(dates()).toEqual(["2026-10-28", null]);
  });

  it("sets a line's date to one of the invoice's visit dates, or clears it", () => {
    const { store, invoice } = fundedJordan();
    const line = store.addLine(invoice.id, followUp);
    store.setLineServiceDate(line.id, "2026-11-04");
    expect(store.getState().lineItems.find((l) => l.id === line.id)?.serviceDate).toBe(
      "2026-11-04",
    );
    store.setLineServiceDate(line.id, null);
    expect(store.getState().lineItems.find((l) => l.id === line.id)?.serviceDate).toBeNull();
    expect(() => store.setLineServiceDate(line.id, "2026-12-25")).toThrow(
      new InvoiceRuleError("Pick one of this invoice's visit dates."),
    );
    expect(() => store.setLineServiceDate("gone", null)).toThrow(
      new StoreError("That line no longer exists."),
    );
  });

  it("refuses to send each Bill to problem in order, then sends once they're fixed", () => {
    const { store, invoice } = fundedJordan();
    store.saveFundingType({
      ...autismDraft({ recipientName: "", recipientAddress: "" }),
      id: autism,
    });
    const line = store.addLine(invoice.id, followUp);
    store.setLineServiceDate(line.id, null);
    const send = () => store.sendInvoice(invoice.id);

    expect(send).toThrow(
      new InvoiceRuleError(
        "Autism Funding has no recipient name or address. Add them in Settings, then send.",
      ),
    );
    store.saveFundingType({ ...autismDraft(), id: autism });
    store.setBillToDetail(invoice.id, autismNumber, "");
    expect(send).toThrow(new InvoiceRuleError("Add the billing number before sending."));
    store.setBillToDetail(invoice.id, autismNumber, "4821");
    expect(send).toThrow(
      new InvoiceRuleError("Pick a visit date for each line item before sending."),
    );
    for (const l of store
      .getState()
      .lineItems.filter((candidate) => candidate.invoiceId === invoice.id)) {
      store.setLineServiceDate(l.id, "2026-11-04");
    }
    expect(send().status).toBe("sent");
  });

  it("asks for a line item before anything about Bill to", () => {
    const { store, invoice } = fundedJordan();
    expect(() => store.sendInvoice(invoice.id)).toThrow(
      new InvoiceRuleError("Add at least one line item before sending."),
    );
  });

  it("refreshes a draft's recipient when its type is saved or its funding updated, never a sent invoice's", () => {
    const { store, funding, invoice } = fundedJordan();
    const line = store.addLine(invoice.id, followUp);
    for (const l of store.getState().lineItems.filter((c) => c.invoiceId === invoice.id)) {
      store.setLineServiceDate(l.id, "2026-11-04");
    }
    expect(line.invoiceId).toBe(invoice.id);
    store.saveFundingType({
      ...autismDraft({
        name: "Renamed",
        recipientName: "New Recipient",
        details: [
          { id: autismNumber, label: "Authorization number", kind: "text", showOnInvoice: true },
        ],
      }),
      id: autism,
    });
    expect(store.getState().invoices.find((i) => i.id === invoice.id)?.billTo).toMatchObject({
      fundingName: "Renamed",
      name: "New Recipient",
      details: [{ id: autismNumber, label: "Authorization number", value: "4821" }],
    });

    store.updatePatientFunding(funding.id, {
      detailValues: { [autismNumber]: "9999" },
      periodStart: null,
      periodEnd: null,
    });
    expect(store.getState().invoices.find((i) => i.id === invoice.id)?.billTo).toMatchObject({
      details: [{ value: "9999" }],
    });

    store.sendInvoice(invoice.id);
    store.saveFundingType({ ...autismDraft({ name: "Later name" }), id: autism });
    expect(store.getState().invoices.find((i) => i.id === invoice.id)?.billTo).toMatchObject({
      fundingName: "Renamed",
      name: "New Recipient",
    });
  });
});
