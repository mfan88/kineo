import {
  InvoiceRuleError,
  NoteRuleError,
  addToNote,
  addVisitToInvoice,
  invoiceLocks,
  lineFromPriceItem,
  markCancelled,
  markPaid,
  markSent,
  multiplyCents,
  nextInvoiceNumber,
  patientSchema,
  practiceSettingsSchema,
  priceItemSchema,
  invoiceStyleSchema,
  profileErrors,
  removeVisitFromInvoice,
  replaceNote,
  undoPaid,
  type FundingType,
  type Invoice,
  type InvoiceStyle,
  type AccentColor,
  type HeaderLayout,
  type InvoiceFont,
  type LineItem,
  type Patient,
  type PatientFunding,
  type PracticeSettings,
  type PriceItem,
  type Profile,
  type ProfileFields,
  type Visit,
} from "@kineo/shared";
import { createDemoPractice } from "@kineo/data/demo";

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
  invoiceStyle: InvoiceStyle;
  fundingTypes: FundingType[];
  patientFundings: PatientFunding[];
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
  return createDemoPractice();
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
      cancelledAt: null,
      cancelledVisitDates: null,
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

  /**
   * Cancels a sent invoice: it keeps its number and a copy of its visit dates, and
   * its visits go back to Ready to invoice.
   */
  cancelInvoice(invoiceId: string): Invoice {
    const invoice = this.invoice(invoiceId);
    const now = this.env.now();
    const onIt = this.state.visits.filter((visit) => visit.invoiceId === invoiceId);
    const next = markCancelled(
      invoice,
      onIt.map((visit) => visit.visitDate),
      now,
    );
    let visits = this.state.visits;
    for (const visit of onIt) {
      visits = replaceById(visits, { ...visit, invoiceId: null, updatedAt: now });
    }
    this.commit({ ...this.state, invoices: replaceById(this.state.invoices, next), visits });
    return next;
  }

  // Settings ------------------------------------------------------------------

  /**
   * Saves the profile with trimmed values. Refused while a field shown on invoices
   * is empty; screens show `profileErrors` under each field before calling this.
   */
  saveProfile(fields: ProfileFields): Profile {
    const trimmed: ProfileFields = {
      fullName: { ...fields.fullName, value: fields.fullName.value.trim() },
      title: { ...fields.title, value: fields.title.value.trim() },
      clinicName: { ...fields.clinicName, value: fields.clinicName.value.trim() },
      address: { ...fields.address, value: fields.address.value.trim() },
      phone: { ...fields.phone, value: fields.phone.value.trim() },
    };
    const [firstError] = profileErrors(trimmed);
    if (firstError) throw new StoreError(firstError.message);
    const profile: Profile = { ...this.state.profile, ...trimmed, updatedAt: this.env.now() };
    this.commit({ ...this.state, profile });
    return profile;
  }

  /** Adds a price list item. The name is required and the price is in whole cents. */
  addPriceItem(input: { name: string; unitPriceCents: number }): PriceItem {
    const now = this.env.now();
    const item = this.validPriceItem({
      id: this.env.newId(),
      ownerId: this.state.profile.ownerId,
      name: input.name,
      unitPriceCents: input.unitPriceCents,
      createdAt: now,
      updatedAt: now,
    });
    this.commit({ ...this.state, priceItems: [...this.state.priceItems, item] });
    return item;
  }

  /**
   * Changes a price list item. Invoices already holding it keep the name and price
   * they copied.
   */
  updatePriceItem(id: string, input: { name: string; unitPriceCents: number }): PriceItem {
    const current = this.state.priceItems.find((item) => item.id === id);
    if (!current) throw new StoreError("That price list item no longer exists.");
    const item = this.validPriceItem({
      ...current,
      name: input.name,
      unitPriceCents: input.unitPriceCents,
      updatedAt: this.env.now(),
    });
    this.commit({ ...this.state, priceItems: replaceById(this.state.priceItems, item) });
    return item;
  }

  /** Removes a price list item. Lines copied from it stay as they are. */
  removePriceItem(id: string): void {
    if (!this.state.priceItems.some((item) => item.id === id)) {
      throw new StoreError("That price list item no longer exists.");
    }
    this.commit({
      ...this.state,
      priceItems: this.state.priceItems.filter((item) => item.id !== id),
      lineItems: this.state.lineItems.map((line) =>
        line.priceItemId === id ? { ...line, priceItemId: null } : line,
      ),
    });
  }

  /** Saves the default tax rate (basis points) and invoice number prefix. */
  saveSettings(input: {
    defaultTaxRateBasisPoints: number;
    invoiceNumberPrefix: string;
  }): PracticeSettings {
    const parsed = practiceSettingsSchema.safeParse({
      ...this.state.settings,
      ...input,
      updatedAt: this.env.now(),
    });
    if (!parsed.success) {
      const prefixIssue = parsed.error.issues.some(
        (issue) => issue.path[0] === "invoiceNumberPrefix",
      );
      throw new StoreError(
        prefixIssue
          ? "Keep the invoice number prefix to 20 characters or fewer."
          : "Enter a tax rate from 0 to 100%.",
      );
    }
    this.commit({ ...this.state, settings: parsed.data });
    return parsed.data;
  }

  /**
   * Saves the invoice style (desktop only). Invoices show the new style straight
   * away, including ones already sent, since the style isn't stored per invoice.
   */
  saveInvoiceStyle(input: {
    accentColor: AccentColor;
    font: InvoiceFont;
    headerLayout: HeaderLayout;
    footerNote: string;
    logoPath: string | null;
  }): InvoiceStyle {
    const parsed = invoiceStyleSchema.safeParse({
      ...this.state.invoiceStyle,
      ...input,
      updatedAt: this.env.now(),
    });
    if (!parsed.success) {
      const field = parsed.error.issues[0]?.path[0];
      throw new StoreError(
        field === "footerNote"
          ? "Keep the footer note to 500 characters or fewer."
          : field === "logoPath"
            ? "That logo couldn't be used. Choose the image again."
            : "Choose one of the listed options.",
      );
    }
    this.commit({ ...this.state, invoiceStyle: parsed.data });
    return parsed.data;
  }

  private validPriceItem(candidate: PriceItem): PriceItem {
    if (candidate.name.trim() === "") throw new StoreError("Give the item a name.");
    if (!Number.isSafeInteger(candidate.unitPriceCents) || candidate.unitPriceCents < 0) {
      throw new StoreError("Enter a price of $0.00 or more.");
    }
    return priceItemSchema.parse(candidate);
  }
}
