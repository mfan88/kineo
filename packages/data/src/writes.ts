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
  invoiceSchema,
  invoiceStyleSchema,
  lineFromPriceItem,
  lineItemSchema,
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
  profileErrors,
  refreshDraftBillTo,
  removeVisitFromInvoice,
  resolvedBillTo,
  replaceNote,
  serviceDatesForNewLine,
  isFundingActive,
  undoPaid,
  visitSchema,
  type AccentColor,
  type FundingType,
  type FundingTypeDraft,
  type HeaderLayout,
  type InvoiceBillTo,
  type Invoice,
  type InvoiceFont,
  type InvoiceStatus,
  type InvoiceStyle,
  type LineItem,
  type Patient,
  type PatientFunding,
  type PracticeSettings,
  type PriceItem,
  type Profile,
  type ProfileFields,
  type Visit,
} from "@kineo/shared";
import type { WritableDatabase, WriteContext } from "./database";
import {
  RowError,
  toFundingType,
  toInvoice,
  toLineItem,
  toPatient,
  toPatientFunding,
  toPriceItem,
  toVisit,
} from "./mappers";
import { ownRowId, type OwnRowTable } from "./ownRowId";
import type {
  FundingTypeRow,
  InvoiceLineRow,
  InvoiceRow,
  PatientFundingRow,
  PatientRow,
  PriceItemRow,
  VisitRow,
} from "./schema";

/** A change that couldn't be made, such as a record that's gone. The message is safe to show. */
export class WriteError extends Error {
  override name = "WriteError";
}

/** What writes need from outside, so tests can fix them. */
export interface WriteEnvironment {
  /** The signed-in practitioner's Clerk user ID. */
  ownerId: string;
  /** Current time, ISO 8601. */
  now: () => string;
  /** Today's date, YYYY-MM-DD, in the practitioner's time zone. */
  today: () => string;
  newId: () => string;
}

/**
 * Writes to the local database, following the same rules as the screens' demo
 * store (`@kineo/shared`). Each write is one transaction: it reads the current
 * rows, applies the rule, then writes, so a sync arriving in between can't slip
 * past a lock. PowerSync uploads the change afterwards.
 */
export class PracticeWriter {
  constructor(
    private readonly db: WritableDatabase,
    private readonly env: WriteEnvironment,
  ) {}

  // Patients and notes (D9) --------------------------------------------------

  async addPatient(input: { fullName: string; reasonForVisit: string }): Promise<Patient> {
    if (input.fullName.trim() === "") throw new WriteError("Add the patient's full name.");
    const now = this.env.now();
    const reason = input.reasonForVisit.trim();
    const patient = patientSchema.parse({
      id: this.env.newId(),
      ownerId: this.env.ownerId,
      fullName: input.fullName,
      reasonForVisit: reason === "" ? null : reason,
      createdAt: now,
      updatedAt: now,
    });
    await this.db.writeTransaction((tx) =>
      tx.execute(
        `INSERT INTO patients (id, owner_id, full_name, reason_for_visit, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [patient.id, patient.ownerId, patient.fullName, patient.reasonForVisit, now, now],
      ),
    );
    return patient;
  }

  /** Saves a note as a new visit today. Empty notes are refused. */
  async saveVisit(patientId: string, note: string): Promise<Visit> {
    const text = note.trim();
    if (text === "") throw new NoteRuleError("Write a note before saving the visit.");
    return this.db.writeTransaction(async (tx) => {
      const patient = await tx.getOptional<{ id: string }>(
        "SELECT id FROM patients WHERE id = ? AND owner_id = ?",
        [patientId, this.env.ownerId],
      );
      if (!patient) throw new WriteError("That patient no longer exists.");
      const now = this.env.now();
      const visit = visitSchema.parse({
        id: this.env.newId(),
        ownerId: this.env.ownerId,
        patientId,
        visitDate: this.env.today(),
        note: text,
        noteEditedAt: now,
        invoiceId: null,
        createdAt: now,
        updatedAt: now,
      });
      await tx.execute(
        `INSERT INTO visits (id, owner_id, patient_id, visit_date, note, note_edited_at, invoice_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
        [visit.id, visit.ownerId, visit.patientId, visit.visitDate, visit.note, now, now, now],
      );
      return visit;
    });
  }

  /** "Add to note": appends. Refused once the visit's invoice is paid. */
  addToNote(visitId: string, text: string): Promise<Visit> {
    return this.editNote(visitId, (visit, status, now) => addToNote(visit, text, status, now));
  }

  /** "Replace note": overwrites. Refused once the visit's invoice is paid. */
  replaceNote(visitId: string, text: string): Promise<Visit> {
    return this.editNote(visitId, (visit, status, now) => replaceNote(visit, text, status, now));
  }

  private editNote(
    visitId: string,
    edit: (visit: Visit, invoiceStatus: InvoiceStatus | null, now: string) => Visit,
  ): Promise<Visit> {
    return this.db.writeTransaction(async (tx) => {
      const row = await tx.getOptional<VisitRow & { invoice_status: InvoiceStatus | null }>(
        `SELECT visits.*, invoices.status AS invoice_status
         FROM visits LEFT JOIN invoices ON invoices.id = visits.invoice_id
         WHERE visits.id = ? AND visits.owner_id = ?`,
        [visitId, this.env.ownerId],
      );
      if (!row) throw new WriteError("That visit no longer exists.");
      const next = edit(toVisit(row), row.invoice_status ?? null, this.env.now());
      await tx.execute(
        "UPDATE visits SET note = ?, note_edited_at = ?, updated_at = ? WHERE id = ?",
        [next.note, next.noteEditedAt, next.updatedAt, next.id],
      );
      return next;
    });
  }

  // Invoices (D10) -------------------------------------------------------------

  /**
   * Creates a draft invoice for a patient with the given visits on it. Tax starts off.
   * It bills the patient's newest active funding, or the patient (self-pay) without one;
   * the invoice keeps its own copy of who that is.
   */
  createInvoice(patientId: string, visitIds: readonly string[]): Promise<Invoice> {
    return this.db.writeTransaction(async (tx) => {
      const patientRow = await tx.getOptional<PatientRow>(
        "SELECT * FROM patients WHERE id = ? AND owner_id = ?",
        [patientId, this.env.ownerId],
      );
      if (!patientRow) throw new WriteError("That patient no longer exists.");
      if (visitIds.length === 0)
        throw new InvoiceRuleError("Choose at least one visit to invoice.");
      const patient = toPatient(patientRow);

      const highest = await tx.getOptional<{ number: number | null }>(
        "SELECT MAX(number) AS number FROM invoices WHERE owner_id = ?",
        [this.env.ownerId],
      );
      const billTo = defaultBillTo({
        patient,
        fundings: await this.readFundings(tx, patientId),
        types: await this.readFundingTypes(tx),
        today: this.env.today(),
      });
      const now = this.env.now();
      const invoice = invoiceSchema.parse({
        id: this.env.newId(),
        ownerId: this.env.ownerId,
        patientId,
        number: nextInvoiceNumber(highest?.number ? [{ number: highest.number }] : []),
        status: "draft",
        taxEnabled: false,
        taxRateBasisPoints: await this.defaultTaxRate(tx),
        sentAt: null,
        paidAt: null,
        cancelledAt: null,
        cancelledVisitDates: null,
        billTo,
        createdAt: now,
        updatedAt: now,
      });
      // The uploader reads the bill-to columns from this one INSERT (see create_invoice).
      await tx.execute(
        `INSERT INTO invoices (id, owner_id, patient_id, number, status, tax_enabled, tax_rate_basis_points, sent_at, paid_at,
           bill_to_kind, bill_to_name, bill_to_address, bill_to_funding_name, patient_funding_id, bill_to_details,
           created_at, updated_at)
         VALUES (?, ?, ?, ?, 'draft', 0, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          invoice.id,
          invoice.ownerId,
          patientId,
          invoice.number,
          invoice.taxRateBasisPoints,
          ...billToColumns(billTo),
          now,
          now,
        ],
      );
      for (const visitId of visitIds) {
        const visit = await this.loadVisit(tx, visitId);
        await this.writeVisitInvoice(tx, addVisitToInvoice(visit, invoice, now));
      }
      return invoice;
    });
  }

  /** Puts a visit on, or takes it off, a draft invoice. */
  setVisitOnInvoice(invoiceId: string, visitId: string, included: boolean): Promise<void> {
    return this.db.writeTransaction(async (tx) => {
      const invoice = await this.loadInvoice(tx, invoiceId);
      const visit = await this.loadVisit(tx, visitId);
      const now = this.env.now();
      const next = included
        ? addVisitToInvoice(visit, invoice, now)
        : removeVisitFromInvoice(visit, invoice, now);
      await this.writeVisitInvoice(tx, next);
      if (!included) {
        // A line dated for the visit that just came off has no visit date left to point at.
        const lost = linesLosingDate(
          await this.invoiceLines(tx, invoice.id),
          visit.visitDate,
          await this.visitDates(tx, invoice.id),
        );
        for (const lineId of lost) {
          await tx.execute("UPDATE invoice_lines SET service_date = NULL WHERE id = ?", [lineId]);
        }
      }
      await this.touchInvoice(tx, invoice.id, now);
    });
  }

  /**
   * Adds a line copied from a price list item to a draft invoice. On a funded invoice
   * with visits it adds one line per visit date, each dated and with quantity 1; it
   * returns the first line added.
   */
  addLine(invoiceId: string, priceItemId: string, quantity = 1): Promise<LineItem> {
    return this.db.writeTransaction(async (tx) => {
      const invoice = await this.loadDraftInvoice(tx, invoiceId);
      const itemRow = await tx.getOptional<PriceItemRow>(
        "SELECT * FROM price_items WHERE id = ? AND owner_id = ?",
        [priceItemId, this.env.ownerId],
      );
      if (!itemRow) throw new WriteError("That price list item no longer exists.");
      const count = await tx.getOptional<{ count: number }>(
        "SELECT COUNT(*) AS count FROM invoice_lines WHERE invoice_id = ? AND owner_id = ?",
        [invoiceId, this.env.ownerId],
      );
      const item = toPriceItem(itemRow);
      const dates = serviceDatesForNewLine(
        await this.billToOf(tx, invoice),
        await this.visitDates(tx, invoiceId),
      );
      const first = count?.count ?? 0;
      const added: LineItem[] = [];
      for (const [index, serviceDate] of dates.entries()) {
        const line = lineItemSchema.parse({
          id: this.env.newId(),
          ownerId: this.env.ownerId,
          invoiceId,
          position: first + index,
          serviceDate,
          ...lineFromPriceItem(item, dates.length > 1 ? 1 : quantity),
        });
        await tx.execute(
          `INSERT INTO invoice_lines (id, owner_id, invoice_id, price_item_id, name, unit_price_cents, quantity, position, service_date)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            line.id,
            line.ownerId,
            invoiceId,
            line.priceItemId,
            line.name,
            line.unitPriceCents,
            line.quantity,
            line.position,
            line.serviceDate ?? null,
          ],
        );
        added.push(line);
      }
      await this.touchInvoice(tx, invoice.id, this.env.now());
      const [firstLine] = added;
      if (!firstLine) throw new WriteError("That line couldn't be added.");
      return firstLine;
    });
  }

  /** Changes a line's quantity on a draft invoice (a whole number of at least 1). */
  setLineQuantity(lineId: string, quantity: number): Promise<void> {
    return this.db.writeTransaction(async (tx) => {
      const line = await this.loadLine(tx, lineId);
      const invoice = await this.loadDraftInvoice(tx, line.invoiceId);
      // Throws a RangeError unless quantity is a whole number of at least 1.
      multiplyCents(line.unitPriceCents, quantity);
      await tx.execute("UPDATE invoice_lines SET quantity = ? WHERE id = ?", [quantity, line.id]);
      await this.touchInvoice(tx, invoice.id, this.env.now());
    });
  }

  /** Removes a line from a draft invoice; later lines move up one place. */
  removeLine(lineId: string): Promise<void> {
    return this.db.writeTransaction(async (tx) => {
      const line = await this.loadLine(tx, lineId);
      const invoice = await this.loadDraftInvoice(tx, line.invoiceId);
      await tx.execute("DELETE FROM invoice_lines WHERE id = ?", [line.id]);
      await tx.execute(
        "UPDATE invoice_lines SET position = position - 1 WHERE invoice_id = ? AND owner_id = ? AND position > ?",
        [invoice.id, this.env.ownerId, line.position],
      );
      await this.touchInvoice(tx, invoice.id, this.env.now());
    });
  }

  /** Turns tax on (at the practice's default rate) or off for a draft invoice. */
  setTax(invoiceId: string, enabled: boolean): Promise<void> {
    return this.db.writeTransaction(async (tx) => {
      const invoice = await this.loadDraftInvoice(tx, invoiceId);
      const rate = enabled ? await this.defaultTaxRate(tx) : invoice.taxRateBasisPoints;
      await tx.execute(
        "UPDATE invoices SET tax_enabled = ?, tax_rate_basis_points = ?, updated_at = ? WHERE id = ?",
        [enabled ? 1 : 0, rate, this.env.now(), invoice.id],
      );
    });
  }

  /** Marks a draft invoice sent. It needs at least one line. */
  sendInvoice(invoiceId: string): Promise<Invoice> {
    return this.db.writeTransaction(async (tx) => {
      const invoice = await this.loadInvoice(tx, invoiceId);
      const count = await tx.getOptional<{ count: number }>(
        "SELECT COUNT(*) AS count FROM invoice_lines WHERE invoice_id = ? AND owner_id = ?",
        [invoiceId, this.env.ownerId],
      );
      // markSent checks the status and that there's a line, before anything about Bill to.
      const sent = markSent(invoice, count?.count ?? 0, this.env.now());
      const [problem] = billToProblems({
        billTo: await this.billToOf(tx, invoice),
        lines: await this.invoiceLines(tx, invoiceId),
        visitDates: await this.visitDates(tx, invoiceId),
      });
      if (problem) throw new InvoiceRuleError(problem.message);
      return this.writeStatus(tx, sent);
    });
  }

  /**
   * Changes who a draft invoice is billed to: the patient (self-pay) or one of the
   * patient's current fundings. Lines left undated are dated when the invoice has just
   * one visit date.
   */
  setBillTo(
    invoiceId: string,
    choice: { kind: "patient" } | { kind: "funding"; patientFundingId: string },
  ): Promise<Invoice> {
    return this.db.writeTransaction(async (tx) => {
      const invoice = await this.loadDraftInvoice(tx, invoiceId);
      const patientRow = await tx.getOptional<PatientRow>(
        "SELECT * FROM patients WHERE id = ? AND owner_id = ?",
        [invoice.patientId, this.env.ownerId],
      );
      if (!patientRow) throw new WriteError("That patient no longer exists.");
      const patient = toPatient(patientRow);
      let billTo: InvoiceBillTo;
      if (choice.kind === "patient") {
        billTo = billToFor({ patient, funding: null, type: null });
      } else {
        const funding = (await this.readFundings(tx, invoice.patientId)).find(
          (candidate) => candidate.id === choice.patientFundingId,
        );
        const type = (await this.readFundingTypes(tx)).find(
          (candidate) => candidate.id === funding?.fundingTypeId,
        );
        if (!funding || !type || !isFundingActive(funding, this.env.today())) {
          throw new InvoiceRuleError("Pick one of this patient's current fundings.");
        }
        billTo = billToFor({ patient, funding, type });
      }
      const now = this.env.now();
      await this.writeBillTo(tx, invoice.id, billTo, now);
      const visitDates = await this.visitDates(tx, invoice.id);
      const undated = linesToAutoDate(await this.invoiceLines(tx, invoice.id), visitDates);
      for (const lineId of billTo.kind === "funding" ? undated : []) {
        await tx.execute("UPDATE invoice_lines SET service_date = ? WHERE id = ?", [
          visitDates[0] ?? null,
          lineId,
        ]);
      }
      return this.loadInvoice(tx, invoice.id);
    });
  }

  /** Fills in one of a funded draft invoice's details (e.g. a missing billing number). */
  setBillToDetail(invoiceId: string, detailId: string, value: string): Promise<void> {
    return this.db.writeTransaction(async (tx) => {
      const invoice = await this.loadDraftInvoice(tx, invoiceId);
      const billTo = await this.billToOf(tx, invoice);
      if (billTo.kind !== "funding" || !billTo.details.some((detail) => detail.id === detailId)) {
        throw new InvoiceRuleError("That detail isn't on this invoice.");
      }
      const details = billTo.details.map((detail) =>
        detail.id === detailId ? { ...detail, value: value.trim() } : detail,
      );
      await tx.execute("UPDATE invoices SET bill_to_details = ?, updated_at = ? WHERE id = ?", [
        JSON.stringify(details),
        this.env.now(),
        invoice.id,
      ]);
    });
  }

  /** Sets the address on a self-pay draft invoice, and keeps it on the patient for next time. */
  setSelfPayAddress(invoiceId: string, address: string): Promise<void> {
    return this.db.writeTransaction(async (tx) => {
      const invoice = await this.loadDraftInvoice(tx, invoiceId);
      if ((await this.billToOf(tx, invoice)).kind !== "patient") {
        throw new InvoiceRuleError("Only a self-pay invoice has the patient's address.");
      }
      const text = address.trim().slice(0, 500);
      const now = this.env.now();
      await tx.execute("UPDATE invoices SET bill_to_address = ?, updated_at = ? WHERE id = ?", [
        text,
        now,
        invoice.id,
      ]);
      await tx.execute(
        "UPDATE patients SET billing_address = ?, updated_at = ? WHERE id = ? AND owner_id = ?",
        [text, now, invoice.patientId, this.env.ownerId],
      );
    });
  }

  /** Dates a line on a draft invoice with one of the invoice's visit dates, or clears it. */
  setLineServiceDate(lineId: string, serviceDate: string | null): Promise<void> {
    return this.db.writeTransaction(async (tx) => {
      const line = await this.loadLine(tx, lineId);
      const invoice = await this.loadDraftInvoice(tx, line.invoiceId);
      if (serviceDate !== null && !(await this.visitDates(tx, invoice.id)).includes(serviceDate)) {
        throw new InvoiceRuleError("Pick one of this invoice's visit dates.");
      }
      await tx.execute("UPDATE invoice_lines SET service_date = ? WHERE id = ?", [
        serviceDate,
        line.id,
      ]);
      await this.touchInvoice(tx, invoice.id, this.env.now());
    });
  }

  recordPayment(invoiceId: string): Promise<Invoice> {
    return this.db.writeTransaction(async (tx) =>
      this.writeStatus(tx, markPaid(await this.loadInvoice(tx, invoiceId), this.env.now())),
    );
  }

  undoPayment(invoiceId: string): Promise<Invoice> {
    return this.db.writeTransaction(async (tx) =>
      this.writeStatus(tx, undoPaid(await this.loadInvoice(tx, invoiceId), this.env.now())),
    );
  }

  /**
   * Cancels a sent invoice. It keeps its number, gets a copy of its visit dates and
   * lets go of its visits, which go back to Ready to invoice. One write: the new
   * status first, then the release of each visit, so they upload in that order.
   */
  cancelInvoice(invoiceId: string): Promise<Invoice> {
    return this.db.writeTransaction(async (tx) => {
      const invoice = await this.loadInvoice(tx, invoiceId);
      const now = this.env.now();
      const rows = await tx.getAll<VisitRow>(
        "SELECT * FROM visits WHERE invoice_id = ? AND owner_id = ?",
        [invoiceId, this.env.ownerId],
      );
      const visits = rows.map(toVisit);
      const cancelled = await this.writeStatus(
        tx,
        markCancelled(
          invoice,
          visits.map((visit) => visit.visitDate),
          now,
        ),
      );
      for (const visit of visits) {
        await this.writeVisitInvoice(tx, { ...visit, invoiceId: null, updatedAt: now });
      }
      return cancelled;
    });
  }

  // Helpers for invoice writes ---------------------------------------------------

  private async loadInvoice(tx: WriteContext, id: string): Promise<Invoice> {
    const row = await tx.getOptional<InvoiceRow>(
      "SELECT * FROM invoices WHERE id = ? AND owner_id = ?",
      [id, this.env.ownerId],
    );
    if (!row) throw new WriteError("That invoice no longer exists.");
    return toInvoice(row);
  }

  private async loadDraftInvoice(tx: WriteContext, id: string): Promise<Invoice> {
    const invoice = await this.loadInvoice(tx, id);
    if (invoiceLocks(invoice.status).lineItems) {
      throw new InvoiceRuleError("This invoice has been sent and can't be changed.");
    }
    return invoice;
  }

  /** The invoice's Bill to; an invoice with none (or a blank self-pay name) bills its patient. */
  private async billToOf(tx: WriteContext, invoice: Invoice): Promise<InvoiceBillTo> {
    const row = await tx.getOptional<PatientRow>(
      "SELECT * FROM patients WHERE id = ? AND owner_id = ?",
      [invoice.patientId, this.env.ownerId],
    );
    return resolvedBillTo(invoice, row ? toPatient(row) : null);
  }

  private async invoiceLines(tx: WriteContext, invoiceId: string): Promise<LineItem[]> {
    const rows = await tx.getAll<InvoiceLineRow>(
      "SELECT * FROM invoice_lines WHERE invoice_id = ? AND owner_id = ? ORDER BY position",
      [invoiceId, this.env.ownerId],
    );
    return rows.map(toLineItem);
  }

  /** The dates of the visits on an invoice, oldest first. */
  private async visitDates(tx: WriteContext, invoiceId: string): Promise<string[]> {
    const rows = await tx.getAll<{ visit_date: string }>(
      "SELECT visit_date FROM visits WHERE invoice_id = ? AND owner_id = ? ORDER BY visit_date",
      [invoiceId, this.env.ownerId],
    );
    return rows.map((row) => row.visit_date);
  }

  /** A patient's fundings; one that can't be read is left out rather than blocking the write. */
  private async readFundings(tx: WriteContext, patientId: string) {
    const rows = await tx.getAll<PatientFundingRow>(
      "SELECT * FROM patient_fundings WHERE patient_id = ? AND owner_id = ?",
      [patientId, this.env.ownerId],
    );
    return readable(rows, toPatientFunding);
  }

  private async readFundingTypes(tx: WriteContext) {
    const rows = await tx.getAll<FundingTypeRow>("SELECT * FROM funding_types WHERE owner_id = ?", [
      this.env.ownerId,
    ]);
    return readable(rows, toFundingType);
  }

  private async writeBillTo(
    tx: WriteContext,
    invoiceId: string,
    billTo: InvoiceBillTo,
    now: string,
  ): Promise<void> {
    await tx.execute(
      `UPDATE invoices SET bill_to_kind = ?, bill_to_name = ?, bill_to_address = ?, bill_to_funding_name = ?,
         patient_funding_id = ?, bill_to_details = ?, updated_at = ? WHERE id = ?`,
      [...billToColumns(billTo), now, invoiceId],
    );
  }

  private async loadVisit(tx: WriteContext, id: string): Promise<Visit> {
    const row = await tx.getOptional<VisitRow>(
      "SELECT * FROM visits WHERE id = ? AND owner_id = ?",
      [id, this.env.ownerId],
    );
    if (!row) throw new WriteError("That visit no longer exists.");
    return toVisit(row);
  }

  private async loadLine(tx: WriteContext, id: string): Promise<LineItem> {
    const row = await tx.getOptional<InvoiceLineRow>(
      "SELECT * FROM invoice_lines WHERE id = ? AND owner_id = ?",
      [id, this.env.ownerId],
    );
    if (!row) throw new WriteError("That line no longer exists.");
    return toLineItem(row);
  }

  private async defaultTaxRate(tx: WriteContext): Promise<number> {
    const settings = await tx.getOptional<{ rate: number | null }>(
      "SELECT default_tax_rate_basis_points AS rate FROM practice_settings WHERE owner_id = ?",
      [this.env.ownerId],
    );
    return settings?.rate ?? 0;
  }

  private async writeVisitInvoice(tx: WriteContext, visit: Visit): Promise<void> {
    await tx.execute("UPDATE visits SET invoice_id = ?, updated_at = ? WHERE id = ?", [
      visit.invoiceId,
      visit.updatedAt,
      visit.id,
    ]);
  }

  private async touchInvoice(tx: WriteContext, id: string, now: string): Promise<void> {
    await tx.execute("UPDATE invoices SET updated_at = ? WHERE id = ?", [now, id]);
  }

  private async writeStatus(tx: WriteContext, invoice: Invoice): Promise<Invoice> {
    await tx.execute(
      `UPDATE invoices SET status = ?, sent_at = ?, paid_at = ?, cancelled_at = ?,
         cancelled_visit_dates = ?, updated_at = ? WHERE id = ?`,
      [
        invoice.status,
        invoice.sentAt,
        invoice.paidAt,
        invoice.cancelledAt,
        invoice.cancelledVisitDates === null ? null : JSON.stringify(invoice.cancelledVisitDates),
        invoice.updatedAt,
        invoice.id,
      ],
    );
    return invoice;
  }

  // Funding types and patient fundings (F10) ------------------------------------------

  /**
   * Saves a funding type: a new one without an `id`, otherwise that one. Draft invoices
   * billed through any funding of this type take the new recipient and detail labels;
   * sent invoices are left as they were.
   */
  async saveFundingType(input: FundingTypeDraft & { id?: string }): Promise<FundingType> {
    const draft: FundingTypeDraft = {
      name: input.name.trim(),
      recipientName: input.recipientName.trim(),
      recipientAddress: input.recipientAddress.trim(),
      details: input.details.map((detail) => ({ ...detail, label: detail.label.trim() })),
    };
    const [firstError] = fundingTypeErrors(draft);
    if (firstError) throw new FundingRuleError(firstError.message);
    return this.db.writeTransaction(async (tx) => {
      const now = this.env.now();
      const details = JSON.stringify(
        draft.details.map((detail) => ({
          id: detail.id,
          label: detail.label,
          kind: detail.kind,
          show_on_invoice: detail.showOnInvoice,
        })),
      );
      let type: FundingType;
      if (input.id === undefined) {
        type = checkedFundingType({
          ...draft,
          id: this.env.newId(),
          ownerId: this.env.ownerId,
          createdAt: now,
          updatedAt: now,
        });
        await tx.execute(
          `INSERT INTO funding_types (id, owner_id, name, recipient_name, recipient_address, details, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            type.id,
            type.ownerId,
            type.name,
            type.recipientName,
            type.recipientAddress,
            details,
            now,
            now,
          ],
        );
        return type;
      }
      const existing = await this.loadFundingType(tx, input.id);
      type = checkedFundingType({ ...existing, ...draft, updatedAt: now });
      await tx.execute(
        `UPDATE funding_types SET name = ?, recipient_name = ?, recipient_address = ?, details = ?, updated_at = ?
         WHERE id = ?`,
        [type.name, type.recipientName, type.recipientAddress, details, now, type.id],
      );
      const rows = await tx.getAll<PatientFundingRow>(
        "SELECT * FROM patient_fundings WHERE funding_type_id = ? AND owner_id = ?",
        [type.id, this.env.ownerId],
      );
      for (const funding of rows.map(toPatientFunding)) {
        await this.refreshDraftInvoices(tx, type, funding, now);
      }
      return type;
    });
  }

  /**
   * Deletes a funding type nobody is currently billed through. Its ended fundings lose
   * their link to it (the local database has no foreign keys, so that's done here);
   * invoices keep their own copy of the details.
   */
  deleteFundingType(id: string): Promise<void> {
    return this.db.writeTransaction(async (tx) => {
      await this.loadFundingType(tx, id);
      const rows = await tx.getAll<PatientFundingRow>(
        "SELECT * FROM patient_fundings WHERE funding_type_id = ? AND owner_id = ?",
        [id, this.env.ownerId],
      );
      if (fundingTypeUsage(id, rows.map(toPatientFunding), this.env.today()) > 0) {
        throw new FundingRuleError("Move this type's patients to another type before deleting it.");
      }
      await tx.execute(
        "UPDATE patient_fundings SET funding_type_id = NULL, updated_at = ? WHERE funding_type_id = ? AND owner_id = ?",
        [this.env.now(), id, this.env.ownerId],
      );
      await tx.execute("DELETE FROM funding_types WHERE id = ?", [id]);
    });
  }

  /** Starts a funding for a patient. Every detail shown on invoices needs a value. */
  async addPatientFunding(input: {
    patientId: string;
    fundingTypeId: string;
    detailValues: Record<string, string>;
    periodStart: string | null;
    periodEnd: string | null;
  }): Promise<PatientFunding> {
    return this.db.writeTransaction(async (tx) => {
      const patient = await tx.getOptional<{ id: string }>(
        "SELECT id FROM patients WHERE id = ? AND owner_id = ?",
        [input.patientId, this.env.ownerId],
      );
      if (!patient) throw new WriteError("That patient no longer exists.");
      const type = await this.loadFundingType(tx, input.fundingTypeId);
      const detailValues = this.checkedFundingValues(type, input);
      const now = this.env.now();
      const funding = patientFundingSchema.parse({
        id: this.env.newId(),
        ownerId: this.env.ownerId,
        patientId: input.patientId,
        fundingTypeId: type.id,
        detailValues,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        endedOn: null,
        createdAt: now,
        updatedAt: now,
      });
      await tx.execute(
        `INSERT INTO patient_fundings (id, owner_id, patient_id, funding_type_id, detail_values, period_start, period_end, ended_on, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
        [
          funding.id,
          funding.ownerId,
          funding.patientId,
          type.id,
          JSON.stringify(detailValues),
          funding.periodStart,
          funding.periodEnd,
          now,
          now,
        ],
      );
      return funding;
    });
  }

  /** Changes a funding's values and period. Draft invoices billed through it take the new values. */
  updatePatientFunding(
    id: string,
    input: {
      detailValues: Record<string, string>;
      periodStart: string | null;
      periodEnd: string | null;
    },
  ): Promise<PatientFunding> {
    return this.db.writeTransaction(async (tx) => {
      const existing = await this.loadPatientFunding(tx, id);
      const type = await this.loadFundingType(tx, existing.fundingTypeId ?? "");
      const detailValues = this.checkedFundingValues(type, input);
      const now = this.env.now();
      const funding = patientFundingSchema.parse({
        ...existing,
        detailValues,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        updatedAt: now,
      });
      await tx.execute(
        "UPDATE patient_fundings SET detail_values = ?, period_start = ?, period_end = ?, updated_at = ? WHERE id = ?",
        [JSON.stringify(detailValues), funding.periodStart, funding.periodEnd, now, id],
      );
      await this.refreshDraftInvoices(tx, type, funding, now);
      return funding;
    });
  }

  /** Ends a funding today. New invoices stop using it; invoices already made keep it. */
  endPatientFunding(id: string): Promise<PatientFunding> {
    return this.setFundingEnded(id, this.env.today());
  }

  /** Takes back "End funding". */
  undoEndPatientFunding(id: string): Promise<PatientFunding> {
    return this.setFundingEnded(id, null);
  }

  private setFundingEnded(id: string, endedOn: string | null): Promise<PatientFunding> {
    return this.db.writeTransaction(async (tx) => {
      const existing = await this.loadPatientFunding(tx, id);
      const now = this.env.now();
      await tx.execute("UPDATE patient_fundings SET ended_on = ?, updated_at = ? WHERE id = ?", [
        endedOn,
        now,
        id,
      ]);
      return { ...existing, endedOn, updatedAt: now };
    });
  }

  private async loadFundingType(tx: WriteContext, id: string): Promise<FundingType> {
    const row = await tx.getOptional<FundingTypeRow>(
      "SELECT * FROM funding_types WHERE id = ? AND owner_id = ?",
      [id, this.env.ownerId],
    );
    if (!row) throw new WriteError("That funding type no longer exists.");
    return toFundingType(row);
  }

  private async loadPatientFunding(tx: WriteContext, id: string): Promise<PatientFunding> {
    const row = await tx.getOptional<PatientFundingRow>(
      "SELECT * FROM patient_fundings WHERE id = ? AND owner_id = ?",
      [id, this.env.ownerId],
    );
    if (!row) throw new WriteError("That funding no longer exists.");
    return toPatientFunding(row);
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

  /** Brings the Bill to of each draft invoice billed through this funding up to date. */
  private async refreshDraftInvoices(
    tx: WriteContext,
    type: FundingType,
    funding: PatientFunding,
    now: string,
  ): Promise<void> {
    const rows = await tx.getAll<InvoiceRow>(
      "SELECT * FROM invoices WHERE patient_funding_id = ? AND status = 'draft' AND owner_id = ?",
      [funding.id, this.env.ownerId],
    );
    for (const invoice of rows.map(toInvoice)) {
      const billTo = refreshDraftBillTo(
        invoice.billTo ?? { kind: "patient", name: "", address: "" },
        type,
        funding,
      );
      if (billTo.kind !== "funding") continue;
      await tx.execute(
        `UPDATE invoices SET bill_to_name = ?, bill_to_address = ?, bill_to_funding_name = ?,
           bill_to_details = ?, updated_at = ? WHERE id = ?`,
        [
          billTo.name,
          billTo.address,
          billTo.fundingName,
          JSON.stringify(billTo.details),
          now,
          invoice.id,
        ],
      );
    }
  }

  // Settings (D11) ------------------------------------------------------------------

  /**
   * Saves the profile with trimmed values. Refused while a field shown on invoices
   * is empty; screens show `profileErrors` under each field before calling this.
   */
  async saveProfile(fields: ProfileFields): Promise<Profile> {
    const trimmed: ProfileFields = {
      fullName: { ...fields.fullName, value: fields.fullName.value.trim() },
      title: { ...fields.title, value: fields.title.value.trim() },
      clinicName: { ...fields.clinicName, value: fields.clinicName.value.trim() },
      address: { ...fields.address, value: fields.address.value.trim() },
      phone: { ...fields.phone, value: fields.phone.value.trim() },
    };
    const [firstError] = profileErrors(trimmed);
    if (firstError) throw new WriteError(firstError.message);
    const now = this.env.now();
    const profile = { ownerId: this.env.ownerId, ...trimmed, updatedAt: now };
    const { fullName, title, clinicName, address, phone } = trimmed;
    await this.db.writeTransaction((tx) =>
      this.upsertOwnRow(tx, "profiles", {
        full_name: fullName.value,
        full_name_on_invoice: fullName.showOnInvoice ? 1 : 0,
        title: title.value,
        title_on_invoice: title.showOnInvoice ? 1 : 0,
        clinic_name: clinicName.value,
        clinic_name_on_invoice: clinicName.showOnInvoice ? 1 : 0,
        address: address.value,
        address_on_invoice: address.showOnInvoice ? 1 : 0,
        phone: phone.value,
        phone_on_invoice: phone.showOnInvoice ? 1 : 0,
        updated_at: now,
      }),
    );
    return profile;
  }

  /** Adds a price list item. The name is required and the price is in whole cents. */
  async addPriceItem(input: { name: string; unitPriceCents: number }): Promise<PriceItem> {
    const now = this.env.now();
    const item = validPriceItem({
      id: this.env.newId(),
      ownerId: this.env.ownerId,
      name: input.name,
      unitPriceCents: input.unitPriceCents,
      createdAt: now,
      updatedAt: now,
    });
    await this.db.writeTransaction((tx) =>
      tx.execute(
        `INSERT INTO price_items (id, owner_id, name, unit_price_cents, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [item.id, item.ownerId, item.name, item.unitPriceCents, now, now],
      ),
    );
    return item;
  }

  /** Changes a price list item. Invoice lines already copied from it don't change. */
  updatePriceItem(id: string, input: { name: string; unitPriceCents: number }): Promise<PriceItem> {
    return this.db.writeTransaction(async (tx) => {
      const row = await tx.getOptional<PriceItemRow>(
        "SELECT * FROM price_items WHERE id = ? AND owner_id = ?",
        [id, this.env.ownerId],
      );
      if (!row) throw new WriteError("That price list item no longer exists.");
      const item = validPriceItem({
        ...toPriceItem(row),
        name: input.name,
        unitPriceCents: input.unitPriceCents,
        updatedAt: this.env.now(),
      });
      await tx.execute(
        "UPDATE price_items SET name = ?, unit_price_cents = ?, updated_at = ? WHERE id = ?",
        [item.name, item.unitPriceCents, item.updatedAt, item.id],
      );
      return item;
    });
  }

  /**
   * Removes a price list item. Lines copied from it keep their name and price; the
   * server clears their link to it, and sync brings that back.
   */
  removePriceItem(id: string): Promise<void> {
    return this.db.writeTransaction(async (tx) => {
      const row = await tx.getOptional<{ id: string }>(
        "SELECT id FROM price_items WHERE id = ? AND owner_id = ?",
        [id, this.env.ownerId],
      );
      if (!row) throw new WriteError("That price list item no longer exists.");
      await tx.execute("DELETE FROM price_items WHERE id = ?", [id]);
    });
  }

  /** Saves the default tax rate (basis points) and invoice number prefix. */
  async saveSettings(input: {
    defaultTaxRateBasisPoints: number;
    invoiceNumberPrefix: string;
  }): Promise<PracticeSettings> {
    const parsed = practiceSettingsSchema.safeParse({
      ownerId: this.env.ownerId,
      ...input,
      updatedAt: this.env.now(),
    });
    if (!parsed.success) {
      const prefixIssue = parsed.error.issues.some(
        (issue) => issue.path[0] === "invoiceNumberPrefix",
      );
      throw new WriteError(
        prefixIssue
          ? "Keep the invoice number prefix to 20 characters or fewer."
          : "Enter a tax rate from 0 to 100%.",
      );
    }
    const settings = parsed.data;
    await this.db.writeTransaction((tx) =>
      this.upsertOwnRow(tx, "practice_settings", {
        default_tax_rate_basis_points: settings.defaultTaxRateBasisPoints,
        invoice_number_prefix: settings.invoiceNumberPrefix,
        updated_at: settings.updatedAt,
      }),
    );
    return settings;
  }

  /**
   * Saves the invoice style (desktop only). `logoPath` is the logo's Storage path,
   * or null for no logo. Invoices show the new style straight away, including sent
   * ones, since the style isn't stored per invoice.
   */
  async saveInvoiceStyle(input: {
    accentColor: AccentColor;
    font: InvoiceFont;
    headerLayout: HeaderLayout;
    footerNote: string;
    logoPath: string | null;
  }): Promise<InvoiceStyle> {
    const parsed = invoiceStyleSchema.safeParse({
      ownerId: this.env.ownerId,
      ...input,
      updatedAt: this.env.now(),
    });
    if (!parsed.success) {
      const field = parsed.error.issues[0]?.path[0];
      throw new WriteError(
        field === "footerNote"
          ? "Keep the footer note to 500 characters or fewer."
          : field === "logoPath"
            ? "That logo couldn't be used. Choose the image again."
            : "Choose one of the listed options.",
      );
    }
    const style = parsed.data;
    await this.db.writeTransaction((tx) =>
      this.upsertOwnRow(tx, "invoice_styles", {
        logo_path: style.logoPath,
        accent_color: style.accentColor,
        font: style.font,
        header_layout: style.headerLayout,
        footer_note: style.footerNote,
        updated_at: style.updatedAt,
      }),
    );
    return style;
  }

  /**
   * Updates the practitioner's one row in a table (profile, settings, style), or
   * inserts it if there isn't one yet, with its fixed ID (ownRowId), so a first
   * save on two devices writes the same row and the server merges them (the later
   * save wins) instead of refusing one. Only the given columns are written.
   */
  private async upsertOwnRow(
    tx: WriteContext,
    table: OwnRowTable,
    values: Record<string, string | number | null>,
  ): Promise<void> {
    const columns = Object.keys(values);
    const existing = await tx.getOptional<{ id: string }>(
      `SELECT id FROM ${table} WHERE owner_id = ? LIMIT 1`,
      [this.env.ownerId],
    );
    if (existing) {
      await tx.execute(
        `UPDATE ${table} SET ${columns.map((column) => `${column} = ?`).join(", ")} WHERE id = ?`,
        [...Object.values(values), existing.id],
      );
    } else {
      await tx.execute(
        `INSERT INTO ${table} (id, owner_id, ${columns.join(", ")}) VALUES (?, ?, ${columns.map(() => "?").join(", ")})`,
        [ownRowId(table, this.env.ownerId), this.env.ownerId, ...Object.values(values)],
      );
    }
  }
}

/**
 * The Bill to as the six invoice columns, in column order: kind, name, address, funding
 * name, funding id and details (JSON text). Self-pay must have an empty funding name,
 * no funding and "[]" or the server refuses the invoice.
 */
function billToColumns(
  billTo: InvoiceBillTo,
): [string, string, string, string, string | null, string] {
  if (billTo.kind === "patient") {
    return ["patient", billTo.name, billTo.address, "", null, "[]"];
  }
  return [
    "funding",
    billTo.name,
    billTo.address,
    billTo.fundingName,
    billTo.patientFundingId,
    JSON.stringify(billTo.details),
  ];
}

/** Maps rows, leaving out any that can't be read. */
function readable<R, T>(rows: R[], map: (row: R) => T): T[] {
  const mapped: T[] = [];
  for (const row of rows) {
    try {
      mapped.push(map(row));
    } catch (error) {
      if (!(error instanceof RowError)) throw error;
    }
  }
  return mapped;
}

/** The funding type if it fits the shared schema; otherwise the first problem, safe to show. */
function checkedFundingType(candidate: FundingType): FundingType {
  const result = fundingTypeSchema.safeParse(candidate);
  if (!result.success) {
    throw new FundingRuleError(result.error.issues[0]?.message ?? "Check this funding type.");
  }
  return result.data;
}

function validPriceItem(candidate: PriceItem): PriceItem {
  if (candidate.name.trim() === "") throw new WriteError("Give the item a name.");
  if (!Number.isSafeInteger(candidate.unitPriceCents) || candidate.unitPriceCents < 0) {
    throw new WriteError("Enter a price of $0.00 or more.");
  }
  return priceItemSchema.parse(candidate);
}
