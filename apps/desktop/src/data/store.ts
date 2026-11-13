import {
  FundingRuleError,
  InvoiceRuleError,
  NoteRuleError,
  addToNote,
  addVisitToInvoice,
  billToFor,
  billToProblems,
  dayInputValue,
  defaultBillTo,
  fundingTypeErrors,
  fundingTypeSchema,
  fundingTypeUsage,
  invoiceLocks,
  isFundingActive,
  lineFromPriceItem,
  linesLosingDate,
  linesToAutoDate,
  markCancelled,
  markPaid,
  markSent,
  multiplyCents,
  nextInvoiceNumber,
  patientFundingErrors,
  patientFundingSchema,
  patientSchema,
  practiceSettingsSchema,
  priceItemSchema,
  invoiceStyleSchema,
  profileErrors,
  refreshDraftBillTo,
  removeVisitFromInvoice,
  replaceNote,
  resolvedBillTo,
  serviceDatesForNewLine,
  undoPaid,
  type FundingType,
  type FundingTypeDraft,
  type Invoice,
  type InvoiceBillTo,
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

/** The funding type if it fits the shared schema; otherwise the first problem, safe to show. */
function checkedFundingType(candidate: FundingType): FundingType {
  const result = fundingTypeSchema.safeParse(candidate);
  if (!result.success) {
    throw new FundingRuleError(result.error.issues[0]?.message ?? "Check this funding type.");
  }
  return result.data;
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

  private fundingType(id: string): FundingType {
    const found = this.state.fundingTypes.find((type) => type.id === id);
    if (!found) throw new StoreError("That funding type no longer exists.");
    return found;
  }

  private patientFunding(id: string): PatientFunding {
    const found = this.state.patientFundings.find((funding) => funding.id === id);
    if (!found) throw new StoreError("That funding no longer exists.");
    return found;
  }

  /** The invoice's Bill to; an invoice with none (or a blank self-pay name) bills its patient. */
  private billToOf(invoice: Invoice): InvoiceBillTo {
    const patient = this.state.patients.find((candidate) => candidate.id === invoice.patientId);
    return resolvedBillTo(invoice, patient ?? null);
  }

  private invoiceLines(invoiceId: string): LineItem[] {
    return this.state.lineItems
      .filter((line) => line.invoiceId === invoiceId)
      .toSorted((a, b) => a.position - b.position);
  }

  /** The dates of the visits on an invoice, oldest first. */
  private visitDates(invoiceId: string): string[] {
    return this.state.visits
      .filter((visit) => visit.invoiceId === invoiceId)
      .map((visit) => visit.visitDate)
      .toSorted();
  }

  /** Brings the Bill to of each draft invoice billed through this funding up to date. */
  private refreshDrafts(
    invoices: readonly Invoice[],
    type: FundingType,
    funding: PatientFunding,
  ): Invoice[] {
    const now = this.env.now();
    return invoices.map((invoice) => {
      if (
        invoice.status !== "draft" ||
        invoice.billTo?.kind !== "funding" ||
        invoice.billTo.patientFundingId !== funding.id
      ) {
        return invoice;
      }
      return {
        ...invoice,
        billTo: refreshDraftBillTo(invoice.billTo, type, funding),
        updatedAt: now,
      };
    });
  }

  /** The values to store: this type's details only, trimmed. Throws the first problem found. */
  private checkedFundingValues(
    type: FundingType,
    input: {
      detailValues: Record<string, string>;
      periodStart: string | null;
      periodEnd: string | null;
    },
  ): Record<string, string> {
    const detailValues: Record<string, string> = {};
    for (const detail of type.details) {
      detailValues[detail.id] = (input.detailValues[detail.id] ?? "").trim();
    }
    const [firstError] = patientFundingErrors({
      type,
      detailValues,
      periodStart: dayInputValue(input.periodStart),
      periodEnd: dayInputValue(input.periodEnd),
    });
    if (firstError) throw new FundingRuleError(firstError.message);
    return detailValues;
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
      billTo: defaultBillTo({
        patient,
        fundings: this.state.patientFundings,
        types: this.state.fundingTypes,
        today: this.env.today(),
      }),
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
    let lineItems = this.state.lineItems;
    if (!included) {
      // A line dated for the visit that just came off has no visit date left to point at.
      const remaining = this.state.visits
        .filter((candidate) => candidate.invoiceId === invoice.id && candidate.id !== visit.id)
        .map((candidate) => candidate.visitDate);
      const lost = linesLosingDate(this.invoiceLines(invoice.id), visit.visitDate, remaining);
      lineItems = lineItems.map((line) =>
        lost.includes(line.id) ? { ...line, serviceDate: null } : line,
      );
    }
    this.commit({
      ...this.state,
      visits: replaceById(this.state.visits, next),
      lineItems,
      invoices: replaceById(this.state.invoices, this.touch(invoice)),
    });
  }

  /**
   * Adds a line copied from a price list item to a draft invoice. On a funded invoice with
   * visits it adds one dated line per visit date (quantity 1 each); it returns the first.
   */
  addLine(invoiceId: string, priceItemId: string, quantity = 1): LineItem {
    const invoice = this.draftInvoice(invoiceId);
    const priceItem = this.state.priceItems.find((item) => item.id === priceItemId);
    if (!priceItem) throw new StoreError("That price list item no longer exists.");
    const first = this.state.lineItems.filter((line) => line.invoiceId === invoiceId).length;
    const dates = serviceDatesForNewLine(this.billToOf(invoice), this.visitDates(invoiceId));
    const added = dates.map((serviceDate, index): LineItem => ({
      id: this.env.newId(),
      ownerId: invoice.ownerId,
      invoiceId,
      position: first + index,
      serviceDate,
      ...lineFromPriceItem(priceItem, dates.length > 1 ? 1 : quantity),
    }));
    this.commit({
      ...this.state,
      lineItems: [...this.state.lineItems, ...added],
      invoices: replaceById(this.state.invoices, this.touch(invoice)),
    });
    const [firstLine] = added;
    if (!firstLine) throw new StoreError("That line couldn't be added.");
    return firstLine;
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
    // markSent checks the status and that there's a line, before anything about Bill to.
    const next = markSent(invoice, lineCount, this.env.now());
    const [problem] = billToProblems({
      billTo: this.billToOf(invoice),
      lines: this.invoiceLines(invoiceId),
      visitDates: this.visitDates(invoiceId),
    });
    if (problem) throw new InvoiceRuleError(problem.message);
    this.commit({ ...this.state, invoices: replaceById(this.state.invoices, next) });
    return next;
  }

  /**
   * Changes who a draft invoice is billed to: the patient (self-pay) or one of the
   * patient's current fundings. Undated lines are dated when the invoice has one visit date.
   */
  setBillTo(
    invoiceId: string,
    choice: { kind: "patient" } | { kind: "funding"; patientFundingId: string },
  ): Invoice {
    const invoice = this.draftInvoice(invoiceId);
    const patient = this.patient(invoice.patientId);
    let billTo: InvoiceBillTo;
    if (choice.kind === "patient") {
      billTo = billToFor({ patient, funding: null, type: null });
    } else {
      const funding = this.state.patientFundings.find(
        (candidate) =>
          candidate.id === choice.patientFundingId && candidate.patientId === patient.id,
      );
      const type = this.state.fundingTypes.find(
        (candidate) => candidate.id === funding?.fundingTypeId,
      );
      if (!funding || !type || !isFundingActive(funding, this.env.today())) {
        throw new InvoiceRuleError("Pick one of this patient's current fundings.");
      }
      billTo = billToFor({ patient, funding, type });
    }
    const next: Invoice = { ...invoice, billTo, updatedAt: this.env.now() };
    const visitDates = this.visitDates(invoiceId);
    const undated =
      billTo.kind === "funding" ? linesToAutoDate(this.invoiceLines(invoiceId), visitDates) : [];
    this.commit({
      ...this.state,
      invoices: replaceById(this.state.invoices, next),
      lineItems: this.state.lineItems.map((line) =>
        undated.includes(line.id) ? { ...line, serviceDate: visitDates[0] ?? null } : line,
      ),
    });
    return next;
  }

  /** Fills in one of a funded draft invoice's details. */
  setBillToDetail(invoiceId: string, detailId: string, value: string): void {
    const invoice = this.draftInvoice(invoiceId);
    const billTo = this.billToOf(invoice);
    if (billTo.kind !== "funding" || !billTo.details.some((detail) => detail.id === detailId)) {
      throw new InvoiceRuleError("That detail isn't on this invoice.");
    }
    const details = billTo.details.map((detail) =>
      detail.id === detailId ? { ...detail, value: value.trim() } : detail,
    );
    this.commit({
      ...this.state,
      invoices: replaceById(this.state.invoices, {
        ...invoice,
        billTo: { ...billTo, details },
        updatedAt: this.env.now(),
      }),
    });
  }

  /** Sets the address on a self-pay draft invoice, and keeps it on the patient for next time. */
  setSelfPayAddress(invoiceId: string, address: string): void {
    const invoice = this.draftInvoice(invoiceId);
    const billTo = this.billToOf(invoice);
    if (billTo.kind !== "patient") {
      throw new InvoiceRuleError("Only a self-pay invoice has the patient's address.");
    }
    const text = address.trim().slice(0, 500);
    const now = this.env.now();
    const patient = this.patient(invoice.patientId);
    this.commit({
      ...this.state,
      invoices: replaceById(this.state.invoices, {
        ...invoice,
        billTo: { ...billTo, address: text },
        updatedAt: now,
      }),
      patients: replaceById(this.state.patients, {
        ...patient,
        billingAddress: text,
        updatedAt: now,
      }),
    });
  }

  /** Dates a line on a draft invoice with one of the invoice's visit dates, or clears it. */
  setLineServiceDate(lineId: string, serviceDate: string | null): void {
    const line = this.state.lineItems.find((candidate) => candidate.id === lineId);
    if (!line) throw new StoreError("That line no longer exists.");
    const invoice = this.draftInvoice(line.invoiceId);
    if (serviceDate !== null && !this.visitDates(invoice.id).includes(serviceDate)) {
      throw new InvoiceRuleError("Pick one of this invoice's visit dates.");
    }
    this.commit({
      ...this.state,
      lineItems: replaceById(this.state.lineItems, { ...line, serviceDate }),
      invoices: replaceById(this.state.invoices, this.touch(invoice)),
    });
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

  // Funding types and patient fundings ------------------------------------------------

  /**
   * Saves a funding type: a new one without an `id`, otherwise that one. Draft invoices
   * billed through any funding of this type take the new recipient and detail labels.
   */
  saveFundingType(input: FundingTypeDraft & { id?: string }): FundingType {
    const draft: FundingTypeDraft = {
      name: input.name.trim(),
      recipientName: input.recipientName.trim(),
      recipientAddress: input.recipientAddress.trim(),
      details: input.details.map((detail) => ({ ...detail, label: detail.label.trim() })),
    };
    const [firstError] = fundingTypeErrors(draft);
    if (firstError) throw new FundingRuleError(firstError.message);
    const now = this.env.now();
    if (input.id === undefined) {
      const type = checkedFundingType({
        ...draft,
        id: this.env.newId(),
        ownerId: this.state.profile.ownerId,
        createdAt: now,
        updatedAt: now,
      });
      this.commit({ ...this.state, fundingTypes: [...this.state.fundingTypes, type] });
      return type;
    }
    const type = checkedFundingType({ ...this.fundingType(input.id), ...draft, updatedAt: now });
    const invoices = this.state.patientFundings
      .filter((funding) => funding.fundingTypeId === type.id)
      .reduce((all, funding) => this.refreshDrafts(all, type, funding), this.state.invoices);
    this.commit({
      ...this.state,
      fundingTypes: replaceById(this.state.fundingTypes, type),
      invoices,
    });
    return type;
  }

  /**
   * Deletes a funding type nobody is currently billed through; its ended fundings lose their
   * link to it. Invoices keep their own copy of the details.
   */
  deleteFundingType(id: string): void {
    this.fundingType(id);
    const own = this.state.patientFundings.filter((funding) => funding.fundingTypeId === id);
    if (fundingTypeUsage(id, own, this.env.today()) > 0) {
      throw new FundingRuleError("Move this type's patients to another type before deleting it.");
    }
    const now = this.env.now();
    this.commit({
      ...this.state,
      fundingTypes: this.state.fundingTypes.filter((type) => type.id !== id),
      patientFundings: this.state.patientFundings.map((funding) =>
        funding.fundingTypeId === id
          ? { ...funding, fundingTypeId: null, updatedAt: now }
          : funding,
      ),
    });
  }

  /** Starts a funding for a patient. Every detail shown on invoices needs a value. */
  addPatientFunding(input: {
    patientId: string;
    fundingTypeId: string;
    detailValues: Record<string, string>;
    periodStart: string | null;
    periodEnd: string | null;
  }): PatientFunding {
    const patient = this.patient(input.patientId);
    const type = this.fundingType(input.fundingTypeId);
    const detailValues = this.checkedFundingValues(type, input);
    const now = this.env.now();
    const funding = patientFundingSchema.parse({
      id: this.env.newId(),
      ownerId: patient.ownerId,
      patientId: patient.id,
      fundingTypeId: type.id,
      detailValues,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      endedOn: null,
      createdAt: now,
      updatedAt: now,
    });
    this.commit({ ...this.state, patientFundings: [...this.state.patientFundings, funding] });
    return funding;
  }

  /** Changes a funding's values and period. Draft invoices billed through it take the new values. */
  updatePatientFunding(
    id: string,
    input: {
      detailValues: Record<string, string>;
      periodStart: string | null;
      periodEnd: string | null;
    },
  ): PatientFunding {
    const existing = this.patientFunding(id);
    const type = this.fundingType(existing.fundingTypeId ?? "");
    const detailValues = this.checkedFundingValues(type, input);
    const funding = patientFundingSchema.parse({
      ...existing,
      detailValues,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      updatedAt: this.env.now(),
    });
    this.commit({
      ...this.state,
      patientFundings: replaceById(this.state.patientFundings, funding),
      invoices: this.refreshDrafts(this.state.invoices, type, funding),
    });
    return funding;
  }

  /** Ends a funding today. New invoices stop using it; invoices already made keep it. */
  endPatientFunding(id: string): PatientFunding {
    return this.setFundingEnded(id, this.env.today());
  }

  /** Takes back "End funding". */
  undoEndPatientFunding(id: string): PatientFunding {
    return this.setFundingEnded(id, null);
  }

  private setFundingEnded(id: string, endedOn: string | null): PatientFunding {
    const funding = { ...this.patientFunding(id), endedOn, updatedAt: this.env.now() };
    this.commit({
      ...this.state,
      patientFundings: replaceById(this.state.patientFundings, funding),
    });
    return funding;
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
