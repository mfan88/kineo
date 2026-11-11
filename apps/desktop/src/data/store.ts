import {
  InvoiceRuleError,
  NoteRuleError,
  addToNote,
  addVisitToInvoice,
  invoiceLocks,
  lineFromPriceItem,
  markPaid,
  markSent,
  multiplyCents,
  nextInvoiceNumber,
  patientSchema,
  removeVisitFromInvoice,
  replaceNote,
  undoPaid,
  type Invoice,
  type LineItem,
  type Patient,
  type PracticeSettings,
  type PriceItem,
  type Profile,
  type Visit,
} from "@kineo/shared";
import {
  demoInvoices,
  demoLineItems,
  demoPatients,
  demoPriceItems,
  demoProfile,
  demoSettings,
  demoVisits,
} from "./demo";

/**
 * In-memory demo store for the desktop screens until `packages/data` connects the
 * local database. Every change goes through the rules in `@kineo/shared`; a refused
 * change throws its rule error (with a message safe to show) and leaves the state
 * as it was. State is replaced, never mutated, so React sees every change.
 */

export interface DemoState {
  patients: Patient[];
  visits: Visit[];
  invoices: Invoice[];
  lineItems: LineItem[];
  priceItems: PriceItem[];
  profile: Profile;
  settings: PracticeSettings;
}

/** Things the store needs from outside, so tests can fix them. */
export interface StoreEnvironment {
  /** Current time as an ISO timestamp. */
  now: () => string;
  /** Today's date, YYYY-MM-DD, in the practitioner's time zone. */
  today: () => string;
  newId: () => string;
}

export function createDemoState(): DemoState {
  return {
    patients: [...demoPatients],
    visits: [...demoVisits],
    invoices: [...demoInvoices],
    lineItems: [...demoLineItems],
    priceItems: [...demoPriceItems],
    profile: demoProfile,
    settings: demoSettings,
  };
}

const pad = (n: number) => n.toString().padStart(2, "0");

function localDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export const browserEnvironment: StoreEnvironment = {
  now: () => new Date().toISOString(),
  today: () => localDate(new Date()),
  newId: () => crypto.randomUUID(),
};

/** A change the store couldn't make, such as a record that's gone. The message is safe to show. */
export class StoreError extends Error {
  override name = "StoreError";
}

function replaceById<T extends { id: string }>(items: readonly T[], next: T): T[] {
  return items.map((item) => (item.id === next.id ? next : item));
}

export class DemoStore {
  private state: DemoState;
  private readonly listeners = new Set<() => void>();

  constructor(
    initial: DemoState = createDemoState(),
    private readonly env: StoreEnvironment = browserEnvironment,
  ) {
    this.state = initial;
  }

  getState = (): DemoState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private commit(next: DemoState): void {
    this.state = next;
    for (const listener of this.listeners) listener();
  }

  // Lookups -------------------------------------------------------------------

  private patient(id: string): Patient {
    const found = this.state.patients.find((patient) => patient.id === id);
    if (!found) throw new StoreError("That patient no longer exists.");
    return found;
  }

  private visit(id: string): Visit {
    const found = this.state.visits.find((visit) => visit.id === id);
    if (!found) throw new StoreError("That visit no longer exists.");
    return found;
  }

  private invoice(id: string): Invoice {
    const found = this.state.invoices.find((invoice) => invoice.id === id);
    if (!found) throw new StoreError("That invoice no longer exists.");
    return found;
  }

  private draftInvoice(id: string): Invoice {
    const invoice = this.invoice(id);
    if (invoiceLocks(invoice.status).lineItems) {
      throw new InvoiceRuleError("This invoice has been sent and can't be changed.");
    }
    return invoice;
  }

  private invoiceStatusOf(visit: Visit) {
    return visit.invoiceId === null ? null : this.invoice(visit.invoiceId).status;
  }

  private touch(invoice: Invoice): Invoice {
    return { ...invoice, updatedAt: this.env.now() };
  }

  // Patients and notes --------------------------------------------------------

  /** Adds a patient. The full name is required. */
  addPatient(input: { fullName: string; reasonForVisit: string }): Patient {
    if (input.fullName.trim() === "") {
      throw new StoreError("Add the patient's full name.");
    }
    const now = this.env.now();
    const reason = input.reasonForVisit.trim();
    const patient = patientSchema.parse({
      id: this.env.newId(),
      ownerId: this.state.profile.ownerId,
      fullName: input.fullName,
      reasonForVisit: reason === "" ? null : reason,
      createdAt: now,
      updatedAt: now,
    });
    this.commit({ ...this.state, patients: [...this.state.patients, patient] });
    return patient;
  }

  /** Saves a note as a new visit today. Empty notes are refused. */
  saveVisit(patientId: string, note: string): Visit {
    const patient = this.patient(patientId);
    const text = note.trim();
    if (text === "") {
      throw new NoteRuleError("Write a note before saving the visit.");
    }
    const now = this.env.now();
    const visit: Visit = {
      id: this.env.newId(),
      ownerId: patient.ownerId,
      patientId: patient.id,
      visitDate: this.env.today(),
      note: text,
      noteEditedAt: now,
      invoiceId: null,
      createdAt: now,
      updatedAt: now,
    };
    this.commit({ ...this.state, visits: [...this.state.visits, visit] });
    return visit;
  }

  addToNote(visitId: string, text: string): Visit {
    const visit = this.visit(visitId);
    const next = addToNote(visit, text, this.invoiceStatusOf(visit), this.env.now());
    this.commit({ ...this.state, visits: replaceById(this.state.visits, next) });
    return next;
  }

  replaceNote(visitId: string, text: string): Visit {
    const visit = this.visit(visitId);
    const next = replaceNote(visit, text, this.invoiceStatusOf(visit), this.env.now());
    this.commit({ ...this.state, visits: replaceById(this.state.visits, next) });
    return next;
  }

  // Invoices ------------------------------------------------------------------

  /** Creates a draft invoice for a patient with the given visits on it. Tax starts off. */
  createInvoice(patientId: string, visitIds: readonly string[]): Invoice {
    const patient = this.patient(patientId);
    if (visitIds.length === 0) {
      throw new InvoiceRuleError("Choose at least one visit to invoice.");
    }
    const now = this.env.now();
    const invoice: Invoice = {
      id: this.env.newId(),
      ownerId: patient.ownerId,
      patientId: patient.id,
      number: nextInvoiceNumber(this.state.invoices),
      status: "draft",
      taxEnabled: false,
      taxRateBasisPoints: this.state.settings.defaultTaxRateBasisPoints,
      sentAt: null,
      paidAt: null,
      createdAt: now,
      updatedAt: now,
    };
    let visits = this.state.visits;
    for (const id of visitIds) {
      const visit = visits.find((candidate) => candidate.id === id);
      if (!visit) throw new StoreError("That visit no longer exists.");
      visits = replaceById(visits, addVisitToInvoice(visit, invoice, now));
    }
    this.commit({ ...this.state, invoices: [...this.state.invoices, invoice], visits });
    return invoice;
  }

  /** Puts a visit on, or takes it off, a draft invoice. */
  setVisitOnInvoice(invoiceId: string, visitId: string, included: boolean): void {
    const invoice = this.invoice(invoiceId);
    const visit = this.visit(visitId);
    const now = this.env.now();
    const next = included
      ? addVisitToInvoice(visit, invoice, now)
      : removeVisitFromInvoice(visit, invoice, now);
    this.commit({
      ...this.state,
      visits: replaceById(this.state.visits, next),
      invoices: replaceById(this.state.invoices, this.touch(invoice)),
    });
  }

  /** Adds a line copied from a price list item to a draft invoice. */
  addLine(invoiceId: string, priceItemId: string, quantity = 1): LineItem {
    const invoice = this.draftInvoice(invoiceId);
    const priceItem = this.state.priceItems.find((item) => item.id === priceItemId);
    if (!priceItem) throw new StoreError("That price list item no longer exists.");
    const position = this.state.lineItems.filter((line) => line.invoiceId === invoiceId).length;
    const line: LineItem = {
      id: this.env.newId(),
      ownerId: invoice.ownerId,
      invoiceId,
      position,
      ...lineFromPriceItem(priceItem, quantity),
    };
    this.commit({
      ...this.state,
      lineItems: [...this.state.lineItems, line],
      invoices: replaceById(this.state.invoices, this.touch(invoice)),
    });
    return line;
  }

  setLineQuantity(lineId: string, quantity: number): void {
    const line = this.state.lineItems.find((candidate) => candidate.id === lineId);
    if (!line) throw new StoreError("That line no longer exists.");
    const invoice = this.draftInvoice(line.invoiceId);
    // Throws a RangeError unless quantity is a whole number of at least 1.
    multiplyCents(line.unitPriceCents, quantity);
    this.commit({
      ...this.state,
      lineItems: replaceById(this.state.lineItems, { ...line, quantity }),
      invoices: replaceById(this.state.invoices, this.touch(invoice)),
    });
  }

  removeLine(lineId: string): void {
    const line = this.state.lineItems.find((candidate) => candidate.id === lineId);
    if (!line) throw new StoreError("That line no longer exists.");
    const invoice = this.draftInvoice(line.invoiceId);
    const remaining = this.state.lineItems
      .filter((candidate) => candidate.id !== lineId)
      .map((candidate) =>
        candidate.invoiceId === line.invoiceId && candidate.position > line.position
          ? { ...candidate, position: candidate.position - 1 }
          : candidate,
      );
    this.commit({
      ...this.state,
      lineItems: remaining,
      invoices: replaceById(this.state.invoices, this.touch(invoice)),
    });
  }

  /** Turns tax on (at the practice's default rate) or off for a draft invoice. */
  setTax(invoiceId: string, enabled: boolean): void {
    const invoice = this.draftInvoice(invoiceId);
    const next: Invoice = {
      ...this.touch(invoice),
      taxEnabled: enabled,
      taxRateBasisPoints: enabled
        ? this.state.settings.defaultTaxRateBasisPoints
        : invoice.taxRateBasisPoints,
    };
    this.commit({ ...this.state, invoices: replaceById(this.state.invoices, next) });
  }

  sendInvoice(invoiceId: string): Invoice {
    const invoice = this.invoice(invoiceId);
    const lineCount = this.state.lineItems.filter((line) => line.invoiceId === invoiceId).length;
    const next = markSent(invoice, lineCount, this.env.now());
    this.commit({ ...this.state, invoices: replaceById(this.state.invoices, next) });
    return next;
  }

  recordPayment(invoiceId: string): Invoice {
    const next = markPaid(this.invoice(invoiceId), this.env.now());
    this.commit({ ...this.state, invoices: replaceById(this.state.invoices, next) });
    return next;
  }

  undoPayment(invoiceId: string): Invoice {
    const next = undoPaid(this.invoice(invoiceId), this.env.now());
    this.commit({ ...this.state, invoices: replaceById(this.state.invoices, next) });
    return next;
  }
}
