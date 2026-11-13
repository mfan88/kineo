import { InvoiceRuleError } from "@kineo/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { PracticeWriter } from "../src";
import { toInvoice, toLineItem, toPatient, toVisit } from "../src/mappers";
import type { InvoiceLineRow, InvoiceRow, PatientRow, VisitRow } from "../src/schema";
import { testDatabase } from "./sqlite";

// Made-up test data only.
const OWNER = "user_test";
const T1 = "2026-11-12T10:00:00.000Z";
const T2 = "2026-11-12T11:00:00.000Z";
const TODAY = "2026-11-12";
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const DETAIL = uuid(700);

let store: ReturnType<typeof testDatabase>;
let clock: string;
let writer: PracticeWriter;
let ids: number;
let patientId: string;
let typeId: string;
let assessment: string;

const invoices = () => store.rows<InvoiceRow>("invoices").map(toInvoice);
const lines = () => store.rows<InvoiceLineRow>("invoice_lines").map(toLineItem);
const visits = () => store.rows<VisitRow>("visits").map(toVisit);
const patient = () => store.rows<PatientRow>("patients").map(toPatient)[0];

/** A visit on a given day (the writer only saves visits for today). */
function insertVisit(id: string, date: string) {
  store.run(
    `INSERT INTO visits (id, owner_id, patient_id, visit_date, note, note_edited_at, invoice_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'note', ?, NULL, ?, ?)`,
    id,
    OWNER,
    patientId,
    date,
    T1,
    T1,
    T1,
  );
  return id;
}

async function addFunding(detailValue: string, over: { periodEnd?: string | null } = {}) {
  return writer.addPatientFunding({
    patientId,
    fundingTypeId: typeId,
    detailValues: { [DETAIL]: detailValue },
    periodStart: null,
    periodEnd: over.periodEnd ?? null,
  });
}

/** A funding whose shown detail is blank, as when a type gained a detail after the funding was made. */
async function addBlankFunding() {
  const funding = await addFunding("temporary");
  store.run("UPDATE patient_fundings SET detail_values = '{}' WHERE id = ?", funding.id);
  return funding;
}

beforeEach(async () => {
  store = testDatabase();
  clock = T1;
  ids = 0;
  writer = new PracticeWriter(store.db, {
    ownerId: OWNER,
    now: () => clock,
    today: () => TODAY,
    newId: () => uuid(++ids),
  });
  store.run(
    "INSERT INTO practice_settings (id, owner_id, default_tax_rate_basis_points, invoice_number_prefix, updated_at) VALUES (?, ?, 0, '', ?)",
    uuid(900),
    OWNER,
    T1,
  );
  assessment = uuid(901);
  store.run(
    "INSERT INTO price_items (id, owner_id, name, unit_price_cents, created_at, updated_at) VALUES (?, ?, 'Assessment', 12000, ?, ?)",
    assessment,
    OWNER,
    T1,
    T1,
  );
  patientId = (await writer.addPatient({ fullName: "Sky Example", reasonForVisit: "" })).id;
  typeId = (
    await writer.saveFundingType({
      name: "Autism Funding",
      recipientName: "Example Branch",
      recipientAddress: "PO Box 1",
      details: [{ id: DETAIL, label: "Billing number", kind: "text", showOnInvoice: true }],
    })
  ).id;
});

describe("createInvoice's Bill to", () => {
  it("bills an active funding, copying its detail value", async () => {
    const funding = await addFunding("4821");
    const visit = insertVisit(uuid(801), "2026-11-04");
    const invoice = await writer.createInvoice(patientId, [visit]);
    expect(invoice.billTo).toEqual({
      kind: "funding",
      patientFundingId: funding.id,
      fundingName: "Autism Funding",
      name: "Example Branch",
      address: "PO Box 1",
      details: [{ id: DETAIL, label: "Billing number", value: "4821" }],
    });
    expect(invoices()).toEqual([invoice]);
  });

  it("is self-pay without a funding, using the patient's name and billing address", async () => {
    store.run("UPDATE patients SET billing_address = '5 Sample Ave' WHERE id = ?", patientId);
    const visit = insertVisit(uuid(801), "2026-11-04");
    const invoice = await writer.createInvoice(patientId, [visit]);
    expect(invoice.billTo).toEqual({
      kind: "patient",
      name: "Sky Example",
      address: "5 Sample Ave",
    });
    const [row] = store.rows<InvoiceRow>("invoices");
    expect(row).toMatchObject({
      bill_to_kind: "patient",
      bill_to_funding_name: "",
      patient_funding_id: null,
      bill_to_details: "[]",
    });
  });

  it("uses the newest of several active fundings, and ignores an ended one", async () => {
    const older = await addFunding("1111");
    clock = T2;
    const newer = await addFunding("2222");
    clock = "2026-11-12T12:00:00.000Z";
    const newest = await addFunding("3333");
    await writer.endPatientFunding(newest.id);
    expect(older.id).not.toBe(newer.id);
    const visit = insertVisit(uuid(801), "2026-11-04");
    const invoice = await writer.createInvoice(patientId, [visit]);
    expect(invoice.billTo).toMatchObject({ patientFundingId: newer.id });
  });

  it("writes the bill-to columns in the invoice's own INSERT, which the uploader reads", async () => {
    const funding = await addFunding("4821");
    const visit = insertVisit(uuid(801), "2026-11-04");
    await writer.createInvoice(patientId, [visit]);
    const [row] = store.rows<InvoiceRow>("invoices");
    expect(row).toMatchObject({
      bill_to_kind: "funding",
      bill_to_name: "Example Branch",
      bill_to_address: "PO Box 1",
      bill_to_funding_name: "Autism Funding",
      patient_funding_id: funding.id,
    });
    expect(JSON.parse(row?.bill_to_details ?? "")).toEqual([
      { id: DETAIL, label: "Billing number", value: "4821" },
    ]);
  });
});

describe("setBillTo", () => {
  it("switches to self-pay and back to the funding", async () => {
    const funding = await addFunding("4821");
    const invoice = await writer.createInvoice(patientId, [insertVisit(uuid(801), "2026-11-04")]);
    const selfPay = await writer.setBillTo(invoice.id, { kind: "patient" });
    expect(selfPay.billTo).toEqual({ kind: "patient", name: "Sky Example", address: "" });
    expect(store.rows<InvoiceRow>("invoices")[0]).toMatchObject({
      bill_to_funding_name: "",
      patient_funding_id: null,
      bill_to_details: "[]",
    });
    const back = await writer.setBillTo(invoice.id, {
      kind: "funding",
      patientFundingId: funding.id,
    });
    expect(back.billTo).toMatchObject({ kind: "funding", patientFundingId: funding.id });
  });

  it("refuses a funding that isn't the patient's, is ended, or is gone", async () => {
    const funding = await addFunding("4821");
    const invoice = await writer.createInvoice(patientId, [insertVisit(uuid(801), "2026-11-04")]);
    const other = (await writer.addPatient({ fullName: "Rain Example", reasonForVisit: "" })).id;
    const foreign = await writer.addPatientFunding({
      patientId: other,
      fundingTypeId: typeId,
      detailValues: { [DETAIL]: "9" },
      periodStart: null,
      periodEnd: null,
    });
    const message = new InvoiceRuleError("Pick one of this patient's current fundings.");
    await expect(
      writer.setBillTo(invoice.id, { kind: "funding", patientFundingId: foreign.id }),
    ).rejects.toThrow(message);
    await expect(
      writer.setBillTo(invoice.id, { kind: "funding", patientFundingId: uuid(999) }),
    ).rejects.toThrow(message);
    await writer.endPatientFunding(funding.id);
    await expect(
      writer.setBillTo(invoice.id, { kind: "funding", patientFundingId: funding.id }),
    ).rejects.toThrow(message);
  });

  it("is refused once the invoice is sent", async () => {
    await addFunding("4821");
    const invoice = await writer.createInvoice(patientId, [insertVisit(uuid(801), "2026-11-04")]);
    await writer.addLine(invoice.id, assessment);
    await writer.sendInvoice(invoice.id);
    await expect(writer.setBillTo(invoice.id, { kind: "patient" })).rejects.toThrow(
      new InvoiceRuleError("This invoice has been sent and can't be changed."),
    );
  });

  it("dates undated lines when the invoice has one visit date", async () => {
    const funding = await addFunding("4821");
    const invoice = await writer.createInvoice(patientId, [insertVisit(uuid(801), "2026-11-04")]);
    await writer.setBillTo(invoice.id, { kind: "patient" });
    await writer.addLine(invoice.id, assessment);
    expect(lines()[0]?.serviceDate).toBeNull();
    await writer.setBillTo(invoice.id, { kind: "funding", patientFundingId: funding.id });
    expect(lines()[0]?.serviceDate).toBe("2026-11-04");
  });

  it("leaves lines undated when there are several visit dates", async () => {
    const funding = await addFunding("4821");
    const invoice = await writer.createInvoice(patientId, [
      insertVisit(uuid(801), "2026-11-04"),
      insertVisit(uuid(802), "2026-11-06"),
    ]);
    await writer.setBillTo(invoice.id, { kind: "patient" });
    await writer.addLine(invoice.id, assessment);
    await writer.setBillTo(invoice.id, { kind: "funding", patientFundingId: funding.id });
    expect(lines()[0]?.serviceDate).toBeNull();
  });
});

describe("setBillToDetail and setSelfPayAddress", () => {
  it("fills in a detail on a funded draft", async () => {
    await addBlankFunding();
    const invoice = await writer.createInvoice(patientId, [insertVisit(uuid(801), "2026-11-04")]);
    await writer.setBillToDetail(invoice.id, DETAIL, " 7777 ");
    expect(invoices()[0]?.billTo).toMatchObject({
      details: [{ id: DETAIL, label: "Billing number", value: "7777" }],
    });
  });

  it("refuses an unknown detail and a self-pay invoice", async () => {
    await addFunding("4821");
    const funded = await writer.createInvoice(patientId, [insertVisit(uuid(801), "2026-11-04")]);
    const message = new InvoiceRuleError("That detail isn't on this invoice.");
    await expect(writer.setBillToDetail(funded.id, uuid(999), "x")).rejects.toThrow(message);
    await writer.setBillTo(funded.id, { kind: "patient" });
    await expect(writer.setBillToDetail(funded.id, DETAIL, "x")).rejects.toThrow(message);
  });

  it("saves a self-pay address on the invoice and the patient", async () => {
    const invoice = await writer.createInvoice(patientId, [insertVisit(uuid(801), "2026-11-04")]);
    clock = T2;
    await writer.setSelfPayAddress(invoice.id, "  5 Sample Ave\nBurnaby BC ");
    expect(invoices()[0]?.billTo).toMatchObject({ address: "5 Sample Ave\nBurnaby BC" });
    expect(patient()).toMatchObject({ billingAddress: "5 Sample Ave\nBurnaby BC", updatedAt: T2 });
    await writer.setSelfPayAddress(invoice.id, "x".repeat(600));
    expect(patient()?.billingAddress).toHaveLength(500);
  });

  it("refuses an address on a funded invoice", async () => {
    await addFunding("4821");
    const invoice = await writer.createInvoice(patientId, [insertVisit(uuid(801), "2026-11-04")]);
    await expect(writer.setSelfPayAddress(invoice.id, "x")).rejects.toThrow(
      new InvoiceRuleError("Only a self-pay invoice has the patient's address."),
    );
    expect(patient()?.billingAddress).toBe("");
  });
});

describe("dated lines", () => {
  it("adds one dated line per visit date on a funded draft", async () => {
    await addFunding("4821");
    const invoice = await writer.createInvoice(patientId, [
      insertVisit(uuid(801), "2026-11-06"),
      insertVisit(uuid(802), "2026-11-04"),
    ]);
    const first = await writer.addLine(invoice.id, assessment, 3);
    expect(first).toMatchObject({ serviceDate: "2026-11-04", quantity: 1, position: 0 });
    expect(lines().map((l) => [l.serviceDate, l.quantity, l.position])).toEqual([
      ["2026-11-04", 1, 0],
      ["2026-11-06", 1, 1],
    ]);
  });

  it("adds a single undated line, with the given quantity, on a self-pay draft", async () => {
    const invoice = await writer.createInvoice(patientId, [
      insertVisit(uuid(801), "2026-11-04"),
      insertVisit(uuid(802), "2026-11-06"),
    ]);
    await writer.addLine(invoice.id, assessment, 2);
    expect(lines().map((l) => [l.serviceDate, l.quantity])).toEqual([[null, 2]]);
  });

  it("clears the date on lines whose visit comes off, but not when another visit has that date", async () => {
    await addFunding("4821");
    const a = insertVisit(uuid(801), "2026-11-04");
    const b = insertVisit(uuid(802), "2026-11-06");
    const sameDay = insertVisit(uuid(803), "2026-11-06");
    const invoice = await writer.createInvoice(patientId, [a, b, sameDay]);
    await writer.addLine(invoice.id, assessment);
    expect(lines().map((l) => l.serviceDate)).toEqual(["2026-11-04", "2026-11-06"]);
    await writer.setVisitOnInvoice(invoice.id, b, false);
    expect(lines().map((l) => l.serviceDate)).toEqual(["2026-11-04", "2026-11-06"]);
    await writer.setVisitOnInvoice(invoice.id, sameDay, false);
    expect(lines().map((l) => l.serviceDate)).toEqual(["2026-11-04", null]);
    expect(visits().find((v) => v.id === sameDay)?.invoiceId).toBeNull();
  });

  it("sets a line's date to one of the invoice's visit dates, or clears it", async () => {
    await addFunding("4821");
    const invoice = await writer.createInvoice(patientId, [
      insertVisit(uuid(801), "2026-11-04"),
      insertVisit(uuid(802), "2026-11-06"),
    ]);
    const line = await writer.addLine(invoice.id, assessment);
    await writer.setLineServiceDate(line.id, "2026-11-06");
    expect(lines()[0]?.serviceDate).toBe("2026-11-06");
    await writer.setLineServiceDate(line.id, null);
    expect(lines()[0]?.serviceDate).toBeNull();
    await expect(writer.setLineServiceDate(line.id, "2026-12-25")).rejects.toThrow(
      new InvoiceRuleError("Pick one of this invoice's visit dates."),
    );
  });
});

/** A funded draft with a blank detail, no recipient and an undated line. */
async function problemInvoice() {
  const type = await writer.saveFundingType({
    id: typeId,
    name: "Autism Funding",
    recipientName: "",
    recipientAddress: "",
    details: [{ id: DETAIL, label: "Billing number", kind: "text", showOnInvoice: true }],
  });
  expect(type.recipientName).toBe("");
  await addBlankFunding();
  const invoice = await writer.createInvoice(patientId, [
    insertVisit(uuid(801), "2026-11-04"),
    insertVisit(uuid(802), "2026-11-06"),
  ]);
  store.run(
    `INSERT INTO invoice_lines (id, owner_id, invoice_id, price_item_id, name, unit_price_cents, quantity, position, service_date)
     VALUES (?, ?, ?, NULL, 'Assessment', 12000, 1, 0, NULL)`,
    uuid(850),
    OWNER,
    invoice.id,
  );
  return invoice;
}

const send = (id: string) => writer.sendInvoice(id);

describe("sendInvoice's Bill to checks", () => {
  it("refuses each problem in order, then sends once they're fixed", async () => {
    const invoice = await problemInvoice();
    await expect(send(invoice.id)).rejects.toThrow(
      new InvoiceRuleError(
        "Autism Funding has no recipient name or address. Add them in Settings, then send.",
      ),
    );
    await writer.saveFundingType({
      id: typeId,
      name: "Autism Funding",
      recipientName: "Example Branch",
      recipientAddress: "PO Box 1",
      details: [{ id: DETAIL, label: "Billing number", kind: "text", showOnInvoice: true }],
    });
    await expect(send(invoice.id)).rejects.toThrow(
      new InvoiceRuleError("Add the billing number before sending."),
    );
    await writer.setBillToDetail(invoice.id, DETAIL, "4821");
    await expect(send(invoice.id)).rejects.toThrow(
      new InvoiceRuleError("Pick a visit date for each line item before sending."),
    );
    await writer.setLineServiceDate(uuid(850), "2026-11-04");
    const sent = await send(invoice.id);
    expect(sent.status).toBe("sent");
    expect(invoices()[0]?.status).toBe("sent");
  });

  it("names a missing recipient name or address on its own", async () => {
    await addFunding("4821");
    const invoice = await writer.createInvoice(patientId, [insertVisit(uuid(801), "2026-11-04")]);
    await writer.addLine(invoice.id, assessment);
    store.run("UPDATE invoices SET bill_to_name = '' WHERE id = ?", invoice.id);
    await expect(send(invoice.id)).rejects.toThrow(
      "Autism Funding has no recipient name. Add it in Settings, then send.",
    );
    store.run(
      "UPDATE invoices SET bill_to_name = 'N', bill_to_address = ' ' WHERE id = ?",
      invoice.id,
    );
    await expect(send(invoice.id)).rejects.toThrow(
      "Autism Funding has no recipient address. Add it in Settings, then send.",
    );
  });

  it("asks for a line item before anything about Bill to", async () => {
    const invoice = await problemInvoice();
    store.run("DELETE FROM invoice_lines");
    await expect(send(invoice.id)).rejects.toThrow(
      new InvoiceRuleError("Add at least one line item before sending."),
    );
  });

  it("sends a self-pay invoice with undated lines", async () => {
    const invoice = await writer.createInvoice(patientId, [insertVisit(uuid(801), "2026-11-04")]);
    await writer.addLine(invoice.id, assessment);
    expect((await send(invoice.id)).status).toBe("sent");
  });
});
