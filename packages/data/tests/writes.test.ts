import { NoteRuleError } from "@kineo/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { PracticeWriter, WriteError } from "../src";
import { toPatient, toVisit } from "../src/mappers";
import type { PatientRow, VisitRow } from "../src/schema";
import { testDatabase } from "./sqlite";

const OWNER = "user_test";
const OTHER = "user_other";
const T1 = "2026-11-12T10:00:00.000Z";
const T2 = "2026-11-12T11:30:00.000Z";
const IDS = [
  "0f8fad5b-d9cb-469f-a165-70867728950e",
  "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "16fd2706-8baf-433b-82eb-8c7fada847da",
  "886313e1-3b8a-4372-9b90-0c9aee199e5d",
];
const INVOICE = "a3bb189e-8bf9-3888-9912-ace4e6543002";

let store: ReturnType<typeof testDatabase>;
let clock: string;
let writer: PracticeWriter;

beforeEach(() => {
  store = testDatabase();
  clock = T1;
  let next = 0;
  writer = new PracticeWriter(store.db, {
    ownerId: OWNER,
    now: () => clock,
    today: () => "2026-11-12",
    newId: () => IDS[next++] ?? "",
  });
});

const patients = () => store.rows<PatientRow>("patients");
const visits = () => store.rows<VisitRow>("visits");

/** Puts the visit on an invoice with the given status. */
function onInvoice(visitId: string, patientId: string, status: "draft" | "sent" | "paid") {
  store.run(
    `INSERT INTO invoices (id, owner_id, patient_id, number, status, tax_enabled, tax_rate_basis_points, sent_at, paid_at, created_at, updated_at)
     VALUES (?, ?, ?, 1, ?, 0, 0, ?, ?, ?, ?)`,
    INVOICE,
    OWNER,
    patientId,
    status,
    status === "draft" ? null : T1,
    status === "paid" ? T1 : null,
    T1,
    T1,
  );
  store.run("UPDATE visits SET invoice_id = ? WHERE id = ?", INVOICE, visitId);
}

describe("addPatient", () => {
  it("writes the patient, trimmed, and returns it", async () => {
    const patient = await writer.addPatient({
      fullName: "  Sky Example ",
      reasonForVisit: " Knee pain ",
    });
    expect(patient).toEqual({
      id: IDS[0],
      ownerId: OWNER,
      fullName: "Sky Example",
      reasonForVisit: "Knee pain",
      createdAt: T1,
      updatedAt: T1,
    });
    expect(patients().map(toPatient)).toEqual([{ ...patient, billingAddress: "" }]);
  });

  it("stores an empty reason as none", async () => {
    await writer.addPatient({ fullName: "Sky Example", reasonForVisit: "   " });
    expect(patients()[0]?.reason_for_visit).toBeNull();
  });

  it("needs a name, and writes nothing without one", async () => {
    await expect(writer.addPatient({ fullName: "  ", reasonForVisit: "" })).rejects.toThrow(
      new WriteError("Add the patient's full name."),
    );
    expect(patients()).toEqual([]);
  });
});

describe("saveVisit", () => {
  it("saves the note as a visit today, not on an invoice", async () => {
    const patient = await writer.addPatient({ fullName: "Sky Example", reasonForVisit: "" });
    const visit = await writer.saveVisit(patient.id, "  Knee: improving. ");
    expect(visit).toMatchObject({
      patientId: patient.id,
      visitDate: "2026-11-12",
      note: "Knee: improving.",
      invoiceId: null,
    });
    expect(visits().map(toVisit)).toEqual([visit]);
  });

  it("refuses an empty note", async () => {
    const patient = await writer.addPatient({ fullName: "Sky Example", reasonForVisit: "" });
    await expect(writer.saveVisit(patient.id, " \n ")).rejects.toThrow(NoteRuleError);
    expect(visits()).toEqual([]);
  });

  it("refuses a patient that's gone, or belongs to someone else", async () => {
    await expect(writer.saveVisit(IDS[3] ?? "", "Note")).rejects.toThrow(
      new WriteError("That patient no longer exists."),
    );
    store.run(
      "INSERT INTO patients (id, owner_id, full_name, created_at, updated_at) VALUES (?, ?, 'Other Example', ?, ?)",
      INVOICE,
      OTHER,
      T1,
      T1,
    );
    await expect(writer.saveVisit(INVOICE, "Note")).rejects.toThrow(WriteError);
    expect(visits()).toEqual([]);
  });
});

async function savedVisit() {
  const patient = await writer.addPatient({ fullName: "Sky Example", reasonForVisit: "" });
  const visit = await writer.saveVisit(patient.id, "First line.");
  clock = T2;
  return { patient, visit };
}

describe("editing a note", () => {
  it("adds to the note and updates the edit time", async () => {
    const { visit } = await savedVisit();
    const next = await writer.addToNote(visit.id, " Second line. ");
    expect(next.note).toBe("First line.\n\nSecond line.");
    expect(next.noteEditedAt).toBe(T2);
    expect(visits().map(toVisit)).toEqual([next]);
    expect(visits()[0]?.created_at).toBe(T1);
  });

  it("replaces the note", async () => {
    const { visit } = await savedVisit();
    const next = await writer.replaceNote(visit.id, " New note. ");
    expect(next.note).toBe("New note.");
    expect(visits()[0]?.note).toBe("New note.");
    expect(visits()[0]?.note_edited_at).toBe(T2);
  });

  it("refuses adding nothing", async () => {
    const { visit } = await savedVisit();
    await expect(writer.addToNote(visit.id, "  ")).rejects.toThrow(NoteRuleError);
    expect(visits()[0]?.note).toBe("First line.");
  });

  it("still allows edits while the invoice is a draft or sent", async () => {
    const { patient, visit } = await savedVisit();
    onInvoice(visit.id, patient.id, "sent");
    await expect(writer.addToNote(visit.id, "Follow-up.")).resolves.toMatchObject({
      invoiceId: INVOICE,
    });
  });

  it("locks the note once the invoice is paid, and changes nothing", async () => {
    const { patient, visit } = await savedVisit();
    onInvoice(visit.id, patient.id, "paid");
    await expect(writer.addToNote(visit.id, "More.")).rejects.toThrow(NoteRuleError);
    await expect(writer.replaceNote(visit.id, "Other.")).rejects.toThrow(NoteRuleError);
    expect(visits()[0]).toMatchObject({ note: "First line.", note_edited_at: T1 });
  });

  it("refuses a visit that's gone, or belongs to someone else", async () => {
    await expect(writer.replaceNote(IDS[3] ?? "", "x")).rejects.toThrow(
      new WriteError("That visit no longer exists."),
    );
    const { visit } = await savedVisit();
    store.run("UPDATE visits SET owner_id = ? WHERE id = ?", OTHER, visit.id);
    await expect(writer.addToNote(visit.id, "x")).rejects.toThrow(WriteError);
  });
});
