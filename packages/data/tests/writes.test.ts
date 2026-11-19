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

const basePatient = {
  fullName: "Sky Example",
  reasonForVisit: "",
  email: "sky@example.com",
  phone: "604-555-0101",
};

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
      email: " sky@example.com ",
      phone: " 604-555-0101 ",
    });
    expect(patient).toMatchObject({
      id: IDS[0],
      ownerId: OWNER,
      fullName: "Sky Example",
      reasonForVisit: "Knee pain",
      isChild: false,
      parentNames: [],
      parentNamesOnInvoice: false,
      email: "sky@example.com",
      emailOnInvoice: false,
      phone: "604-555-0101",
      phoneOnInvoice: false,
      customDetails: [],
      detailsRequired: true,
      createdAt: T1,
      updatedAt: T1,
    });
    expect(patients().map(toPatient)).toEqual([{ ...patient, billingAddress: "" }]);
    expect(patients()[0]?.details_required).toBe(1);
  });

  it("adds a child with 2 parents and custom details, storing snake_case JSON and details_required = 1", async () => {
    const D1 = "5eed0000-0000-4000-8000-000000000701";
    const D2 = "5eed0000-0000-4000-8000-000000000702";
    const patient = await writer.addPatient({
      fullName: "Sky Example",
      reasonForVisit: "",
      isChild: true,
      parentNames: [" Jordan Example ", "  ", " Taylor Example "],
      parentNamesOnInvoice: true,
      email: "parent@example.com",
      emailOnInvoice: false,
      phone: "604-555-0102",
      phoneOnInvoice: true,
      customDetails: [
        { id: D1, label: " CareCard ", value: " 9000123456 ", showOnInvoice: true },
        { id: D2, label: "Emergency", value: "604-555-0199", showOnInvoice: false },
      ],
    });
    const [row] = patients();
    expect(row?.details_required).toBe(1);
    expect(row?.is_child).toBe(1);
    expect(JSON.parse(row?.parent_names ?? "")).toEqual(["Jordan Example", "Taylor Example"]);
    expect(JSON.parse(row?.custom_details ?? "")).toEqual([
      { id: D1, label: "CareCard", value: "9000123456", show_on_invoice: true },
      { id: D2, label: "Emergency", value: "604-555-0199", show_on_invoice: false },
    ]);
    expect(toPatient(row!)).toEqual({
      ...patient,
      billingAddress: "",
      isChild: true,
      parentNames: ["Jordan Example", "Taylor Example"],
      parentNamesOnInvoice: true,
      email: "parent@example.com",
      emailOnInvoice: false,
      phone: "604-555-0102",
      phoneOnInvoice: true,
      customDetails: [
        { id: D1, label: "CareCard", value: "9000123456", showOnInvoice: true },
        { id: D2, label: "Emergency", value: "604-555-0199", showOnInvoice: false },
      ],
      detailsRequired: true,
    });
  });

  it("stores an empty reason as none", async () => {
    await writer.addPatient({ ...basePatient, reasonForVisit: "   " });
    expect(patients()[0]?.reason_for_visit).toBeNull();
  });

  it("needs a name, email, phone, and parent name for a child, writing nothing on failure", async () => {
    await expect(writer.addPatient({ ...basePatient, fullName: "  " })).rejects.toThrow(
      new WriteError("Add the patient's name."),
    );
    await expect(writer.addPatient({ ...basePatient, email: "  " })).rejects.toThrow(
      new WriteError("Add an email so you can reach this patient."),
    );
    await expect(writer.addPatient({ ...basePatient, email: "bad-email" })).rejects.toThrow(
      new WriteError("Enter an email like name@example.com."),
    );
    await expect(writer.addPatient({ ...basePatient, phone: "  " })).rejects.toThrow(
      new WriteError("Add a phone number so you can reach this patient."),
    );
    await expect(
      writer.addPatient({ ...basePatient, isChild: true, parentNames: ["  "] }),
    ).rejects.toThrow(new WriteError("Add a parent's name."));
    expect(patients()).toEqual([]);
  });
});

describe("updatePatient", () => {
  it("corrects the name and reason, trimmed, and keeps the rest", async () => {
    const patient = await writer.addPatient({
      ...basePatient,
      fullName: "Sky Exmaple",
      reasonForVisit: "Knee",
    });
    clock = T2;
    const updated = await writer.updatePatient(patient.id, {
      ...basePatient,
      fullName: " Sky Example ",
      reasonForVisit: "  ",
    });
    expect(updated).toMatchObject({
      id: patient.id,
      fullName: "Sky Example",
      reasonForVisit: null,
      email: "sky@example.com",
      phone: "604-555-0101",
      detailsRequired: true,
      createdAt: T1,
      updatedAt: T2,
    });
    expect(patients().map(toPatient)).toEqual([updated]);
  });

  it("allows blank email/phone on an old patient (details_required = 0) while rejecting invalid email", async () => {
    store.run(
      `INSERT INTO patients (id, owner_id, full_name, reason_for_visit, email, phone, details_required, created_at, updated_at)
       VALUES (?, ?, 'Sky Exmaple', NULL, '', '', 0, ?, ?)`,
      IDS[0] ?? "",
      OWNER,
      T1,
      T1,
    );
    clock = T2;
    const updated = await writer.updatePatient(IDS[0] ?? "", {
      fullName: "Sky Example",
      reasonForVisit: "",
      email: "",
      phone: "",
    });
    expect(updated).toMatchObject({
      fullName: "Sky Example",
      email: "",
      phone: "",
      detailsRequired: false,
      updatedAt: T2,
    });
    expect(patients()[0]?.details_required).toBe(0);

    await expect(
      writer.updatePatient(IDS[0] ?? "", {
        fullName: "Sky Example",
        reasonForVisit: "",
        email: "not-an-email",
        phone: "",
      }),
    ).rejects.toThrow(new WriteError("Enter an email like name@example.com."));
  });

  it("requires email/phone on a new patient and clears parent fields when isChild turns off", async () => {
    const child = await writer.addPatient({
      ...basePatient,
      isChild: true,
      parentNames: ["Jordan Example"],
      parentNamesOnInvoice: true,
    });
    await expect(
      writer.updatePatient(child.id, {
        ...basePatient,
        isChild: true,
        parentNames: ["Jordan Example"],
        email: "  ",
      }),
    ).rejects.toThrow(new WriteError("Add an email so you can reach this patient."));
    await expect(
      writer.updatePatient(child.id, {
        ...basePatient,
        isChild: true,
        parentNames: ["Jordan Example"],
        phone: "  ",
      }),
    ).rejects.toThrow(new WriteError("Add a phone number so you can reach this patient."));

    const adult = await writer.updatePatient(child.id, {
      ...basePatient,
      isChild: false,
      parentNames: ["Jordan Example"],
      parentNamesOnInvoice: true,
    });
    expect(adult).toMatchObject({
      isChild: false,
      parentNames: [],
      parentNamesOnInvoice: false,
      detailsRequired: true,
    });
    expect(patients()[0]).toMatchObject({
      is_child: 0,
      parent_names: "[]",
      parent_names_on_invoice: 0,
      details_required: 1,
    });
  });

  it("renames drafts billed to the patient, never a sent invoice", async () => {
    const patient = await writer.addPatient({ ...basePatient, fullName: "Sky Exmaple" });
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
    await writer.updatePatient(patient.id, { ...basePatient, fullName: "Sky Example" });
    const names = store
      .rows<{ status: string; bill_to_name: string }>("invoices")
      .map((row) => [row.status, row.bill_to_name]);
    expect(names.toSorted((a, b) => String(a[0]).localeCompare(String(b[0])))).toEqual([
      ["draft", "Sky Example"],
      ["sent", "Sky Exmaple"],
    ]);
  });

  it("refreshes patient_details on all of the patient's draft invoices, never sent, paid, or cancelled", async () => {
    const patient = await writer.addPatient({
      ...basePatient,
      email: "old@example.com",
      emailOnInvoice: true,
    });
    const oldDetails = JSON.stringify([{ id: "email", label: "Email", value: "old@example.com" }]);
    const draft1 = "b4d3c2a1-0000-4000-8000-000000000011";
    const draft2 = "b4d3c2a1-0000-4000-8000-000000000012";
    const sentId = "b4d3c2a1-0000-4000-8000-000000000013";
    const paidId = "b4d3c2a1-0000-4000-8000-000000000014";
    const cancelledId = "b4d3c2a1-0000-4000-8000-000000000015";
    for (const [id, num, status, sentAt, paidAt, cancelledAt, cancelledDates] of [
      [draft1, 1, "draft", null, null, null, null],
      [draft2, 2, "draft", null, null, null, null],
      [sentId, 3, "sent", T1, null, null, null],
      [paidId, 4, "paid", T1, T1, null, null],
      [cancelledId, 5, "cancelled", T1, null, T1, "[]"],
    ] as const) {
      store.run(
        `INSERT INTO invoices (id, owner_id, patient_id, number, status, tax_enabled, tax_rate_basis_points,
           sent_at, paid_at, cancelled_at, cancelled_visit_dates, bill_to_kind, bill_to_name, patient_details, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, 'patient', 'Sky Example', ?, ?, ?)`,
        id,
        OWNER,
        patient.id,
        num,
        status,
        sentAt,
        paidAt,
        cancelledAt,
        cancelledDates,
        oldDetails,
        T1,
        T1,
      );
    }

    clock = T2;
    await writer.updatePatient(patient.id, {
      ...basePatient,
      email: "new@example.com",
      emailOnInvoice: true,
      phone: "604-555-0199",
      phoneOnInvoice: true,
    });

    const expectedNew = JSON.stringify([
      { id: "email", label: "Email", value: "new@example.com" },
      { id: "phone", label: "Phone", value: "604-555-0199" },
    ]);
    const rows = store.rows<{
      id: string;
      status: string;
      patient_details: string;
      updated_at: string;
    }>("invoices");
    expect(rows.map((r) => [r.id, r.patient_details, r.updated_at])).toEqual([
      [draft1, expectedNew, T2],
      [draft2, expectedNew, T2],
      [sentId, oldDetails, T1],
      [paidId, oldDetails, T1],
      [cancelledId, oldDetails, T1],
    ]);
  });

  it("needs a name, and refuses a patient that's gone", async () => {
    const patient = await writer.addPatient(basePatient);
    await expect(
      writer.updatePatient(patient.id, { ...basePatient, fullName: " " }),
    ).rejects.toThrow(new WriteError("Add the patient's name."));
    await expect(
      writer.updatePatient(INVOICE, { ...basePatient, fullName: "Someone" }),
    ).rejects.toThrow(new WriteError("That patient no longer exists."));
    expect(patients()[0]?.full_name).toBe("Sky Example");
  });
});

describe("correcting visits", () => {
  it("saves a visit on an earlier day, but never after today", async () => {
    const patient = await writer.addPatient(basePatient);
    const visit = await writer.saveVisit(patient.id, "Written the next morning.", "2026-11-11");
    expect(visit.visitDate).toBe("2026-11-11");
    expect(visits()[0]?.visit_date).toBe("2026-11-11");
    await expect(writer.saveVisit(patient.id, "Too soon.", "2026-11-13")).rejects.toThrow(
      new NoteRuleError("A visit can't be dated after today."),
    );
    expect(visits()).toHaveLength(1);
  });

  it("moves a visit to another day while it isn't on an invoice", async () => {
    const patient = await writer.addPatient(basePatient);
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
    const patient = await writer.addPatient(basePatient);
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
    const patient = await writer.addPatient(basePatient);
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
    const patient = await writer.addPatient(basePatient);
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
    const patient = await writer.addPatient(basePatient);
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
  const patient = await writer.addPatient(basePatient);
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
