import type { Transaction } from "@powersync/common";
import {
  NoteRuleError,
  addToNote,
  patientSchema,
  replaceNote,
  visitSchema,
  type InvoiceStatus,
  type Patient,
  type Visit,
} from "@kineo/shared";
import { toVisit } from "./mappers";
import type { VisitRow } from "./schema";

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

/** The parts of a PowerSync transaction writes use. */
export type WriteContext = Pick<Transaction, "execute" | "getOptional">;

/** The part of a PowerSync database writes use, so tests can run them on plain SQLite. */
export interface WritableDatabase {
  writeTransaction<T>(callback: (tx: WriteContext) => Promise<T>): Promise<T>;
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
}
