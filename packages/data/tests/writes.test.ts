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

describe("updatePatient", () => {
  it("corrects the name and reason, trimmed, and keeps the rest", async () => {
    const patient = await writer.addPatient({ fullName: "Sky Exmaple", reasonForVisit: "Knee" });
    clock = T2;
    const updated = await writer.updatePatient(patient.id, {
      fullName: " Sky Example ",
      reasonForVisit: "  ",
    });
    expect(updated).toMatchObject({
      id: patient.id,
      fullName: "Sky Example",
      reasonForVisit: null,
      createdAt: T1,
      updatedAt: T2,
    });
    expect(patients().map(toPatient)).toEqual([updated]);
  });

  it("renames drafts billed to the patient, never a sent invoice", async () => {
    const patient = await writer.addPatient({ fullName: "Sky Exmaple", reasonForVisit: "" });
    const visit = await writer.saveVisit(patient.id, "Note.");
    onInvoice(visit.id, patient.id, "draft");
    store.run("UPDATE invoices SET bill_to_kind = 'patient', bill_to_name = 'Sky Exmaple'");
    store.run(
      `INSERT INTO invoices (id, owner_id, patient_id, number, status, tax_enabled, tax_rate_basis_points, sent_at, bill_to_kind, bill_to_name, created_at, updated_at)
       VALUES (?, ?, ?, 2, 'sent', 0, 0, ?, 'patient', 'Sky Exmaple', ?, ?)`,
      "b4d3c2a1-0000-4000-8000-000000000002",
      OWNER,
      patient.id,
      T1,
      T1,
      T1,
    );
    await writer.updatePatient(patient.id, { fullName: "Sky Example", reasonForVisit: "" });
    const names = store
      .rows<{ status: string; bill_to_name: string }>("invoices")
      .map((row) => [row.status, row.bill_to_name]);
    expect(names.toSorted((a, b) => String(a[0]).localeCompare(String(b[0])))).toEqual([
      ["draft", "Sky Example"],
      ["sent", "Sky Exmaple"],
    ]);
  });

  it("needs a name, and refuses a patient that's gone", async () => {
    const patient = await writer.addPatient({ fullName: "Sky Example", reasonForVisit: "" });
    await expect(
      writer.updatePatient(patient.id, { fullName: " ", reasonForVisit: "" }),
    ).rejects.toThrow(new WriteError("Add the patient's full name."));
    await expect(
      writer.updatePatient(INVOICE, { fullName: "Someone", reasonForVisit: "" }),
    ).rejects.toThrow(new WriteError("That patient no longer exists."));
    expect(patients()[0]?.full_name).toBe("Sky Example");
  });
});

describe("correcting visits", () => {
  it("saves a visit on an earlier day, but never after today", async () => {
    const patient = await writer.addPatient({ fullName: "Sky Example", reasonForVisit: "" });
    const visit = await writer.saveVisit(patient.id, "Written the next morning.", "2026-11-11");
    expect(visit.visitDate).toBe("2026-11-11");
    expect(visits()[0]?.visit_date).toBe("2026-11-11");
    await expect(writer.saveVisit(patient.id, "Too soon.", "2026-11-13")).rejects.toThrow(
      new NoteRuleError("A visit can't be dated after today."),
    );
    expect(visits()).toHaveLength(1);
  });

  it("moves a visit to another day while it isn't on an invoice", async () => {
    const patient = await writer.addPatient({ fullName: "Sky Example", reasonForVisit: "" });
    const visit = await writer.saveVisit(patient.id, "Note.");
    clock = T2;
    const moved = await writer.setVisitDate(visit.id, "2026-11-10");
    expect(moved).toMatchObject({ visitDate: "2026-11-10", updatedAt: T2 });
    expect(visits()[0]?.visit_date).toBe("2026-11-10");

    onInvoice(visit.id, patient.id, "draft");
    await expect(writer.setVisitDate(visit.id, "2026-11-09")).rejects.toThrow(
      new NoteRuleError(
        "This visit is on an invoice, so its date can't be changed. Take it off the invoice first.",
      ),
    );
    expect(visits()[0]?.visit_date).toBe("2026-11-10");
  });

  it("deletes a visit not on an invoice, and puts it back as it was on Undo", async () => {
    const patient = await writer.addPatient({ fullName: "Sky Example", reasonForVisit: "" });
    const visit = await writer.saveVisit(patient.id, "Saved on the wrong patient.");
    const before = visits()[0];
    const deleted = await writer.deleteVisit(visit.id);
    expect(visits()).toEqual([]);

    await writer.restoreVisit(deleted);
    expect(visits()).toHaveLength(1);
    expect(visits()[0]).toMatchObject({
      id: before?.id,
      visit_date: before?.visit_date,
      note: before?.note,
      note_edited_at: before?.note_edited_at,
      created_at: before?.created_at,
    });
    // A second Undo changes nothing.
    await writer.restoreVisit(deleted);
    expect(visits()).toHaveLength(1);
  });

  it("won't delete a visit that's on an invoice, or one that's gone", async () => {
    const patient = await writer.addPatient({ fullName: "Sky Example", reasonForVisit: "" });
    const visit = await writer.saveVisit(patient.id, "Note.");
    onInvoice(visit.id, patient.id, "sent");
    await expect(writer.deleteVisit(visit.id)).rejects.toThrow(
      new NoteRuleError(
        "This visit is on an invoice, so it can't be deleted. Take it off the invoice first.",
      ),
    );
    await expect(writer.deleteVisit(INVOICE)).rejects.toThrow(
      new WriteError("That visit no longer exists."),
    );
    expect(visits()).toHaveLength(1);
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
