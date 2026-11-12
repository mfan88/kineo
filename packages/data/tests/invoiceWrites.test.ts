import { InvoiceRuleError } from "@kineo/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { PracticeWriter, WriteError } from "../src";
import { toInvoice, toLineItem, toVisit } from "../src/mappers";
import type { InvoiceLineRow, InvoiceRow, VisitRow } from "../src/schema";
import { testDatabase } from "./sqlite";

const OWNER = "user_test";
const T1 = "2026-11-12T10:00:00.000Z";
const T2 = "2026-11-12T11:00:00.000Z";

let store: ReturnType<typeof testDatabase>;
let clock: string;
let writer: PracticeWriter;
let ids: number;

/** Fresh UUIDs, in order: 00000000-0000-4000-8000-000000000001, …002, … */
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const invoices = () => store.rows<InvoiceRow>("invoices").map(toInvoice);
const lines = () => store.rows<InvoiceLineRow>("invoice_lines").map(toLineItem);
const visits = () => store.rows<VisitRow>("visits").map(toVisit);

let patientId: string;
let otherPatientId: string;
let visitIds: string[];
let otherVisitId: string;
let assessment: string;
let treatment: string;

beforeEach(async () => {
  store = testDatabase();
  clock = T1;
  ids = 0;
  writer = new PracticeWriter(store.db, {
    ownerId: OWNER,
    now: () => clock,
    today: () => "2026-11-12",
    newId: () => uuid(++ids),
  });
  store.run(
    "INSERT INTO practice_settings (id, owner_id, default_tax_rate_basis_points, invoice_number_prefix, updated_at) VALUES (?, ?, 500, '', ?)",
    uuid(900),
    OWNER,
    T1,
  );
  for (const [n, name, cents] of [
    [901, "Assessment", 12_000],
    [902, "Treatment", 9_000],
  ] as const) {
    store.run(
      "INSERT INTO price_items (id, owner_id, name, unit_price_cents, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      uuid(n),
      OWNER,
      name,
      cents,
      T1,
      T1,
    );
  }
  assessment = uuid(901);
  treatment = uuid(902);
  patientId = (await writer.addPatient({ fullName: "Sky Example", reasonForVisit: "" })).id;
  otherPatientId = (await writer.addPatient({ fullName: "Rain Example", reasonForVisit: "" })).id;
  visitIds = [
    (await writer.saveVisit(patientId, "Visit one.")).id,
    (await writer.saveVisit(patientId, "Visit two.")).id,
  ];
  otherVisitId = (await writer.saveVisit(otherPatientId, "Other patient.")).id;
  clock = T2;
});

describe("createInvoice", () => {
  it("creates a draft, numbered after the highest, with the visits on it and tax off", async () => {
    const invoice = await writer.createInvoice(patientId, [visitIds[0] ?? ""]);
    expect(invoice).toMatchObject({
      patientId,
      number: 1,
      status: "draft",
      taxEnabled: false,
      taxRateBasisPoints: 500,
      sentAt: null,
      paidAt: null,
    });
    expect(invoices()).toEqual([invoice]);
    expect(visits().find((v) => v.id === visitIds[0])?.invoiceId).toBe(invoice.id);
    expect(visits().find((v) => v.id === visitIds[1])?.invoiceId).toBeNull();

    const second = await writer.createInvoice(patientId, [visitIds[1] ?? ""]);
    expect(second.number).toBe(2);
  });

  it("uses no tax rate if settings haven't been saved", async () => {
    store.run("DELETE FROM practice_settings");
    expect((await writer.createInvoice(patientId, visitIds)).taxRateBasisPoints).toBe(0);
  });

  it("needs at least one visit", async () => {
    await expect(writer.createInvoice(patientId, [])).rejects.toThrow(
      new InvoiceRuleError("Choose at least one visit to invoice."),
    );
    expect(invoices()).toEqual([]);
  });

  it("writes nothing if any visit can't go on it", async () => {
    await expect(
      writer.createInvoice(patientId, [visitIds[0] ?? "", otherVisitId]),
    ).rejects.toThrow(new InvoiceRuleError("Only this patient's visits can go on this invoice."));
    expect(invoices()).toEqual([]);
    expect(visits().every((v) => v.invoiceId === null)).toBe(true);
  });

  it("refuses a visit already on another invoice", async () => {
    await writer.createInvoice(patientId, [visitIds[0] ?? ""]);
    await expect(writer.createInvoice(patientId, [visitIds[0] ?? ""])).rejects.toThrow(
      new InvoiceRuleError("This visit is already on another invoice."),
    );
    expect(invoices()).toHaveLength(1);
  });

  it("refuses a patient that's gone", async () => {
    await expect(writer.createInvoice(uuid(999), visitIds)).rejects.toThrow(
      new WriteError("That patient no longer exists."),
    );
  });
});

describe("visits on a draft invoice", () => {
  it("adds and removes visits, touching the invoice", async () => {
    const invoice = await writer.createInvoice(patientId, [visitIds[0] ?? ""]);
    clock = "2026-11-12T12:00:00.000Z";
    await writer.setVisitOnInvoice(invoice.id, visitIds[1] ?? "", true);
    expect(visits().filter((v) => v.invoiceId === invoice.id)).toHaveLength(2);
    await writer.setVisitOnInvoice(invoice.id, visitIds[0] ?? "", false);
    expect(
      visits()
        .filter((v) => v.invoiceId === invoice.id)
        .map((v) => v.id),
    ).toEqual([visitIds[1]]);
    expect(invoices()[0]?.updatedAt).toBe("2026-11-12T12:00:00.000Z");
  });

  it("locks visits once sent", async () => {
    const invoice = await writer.createInvoice(patientId, [visitIds[0] ?? ""]);
    await writer.addLine(invoice.id, assessment);
    await writer.sendInvoice(invoice.id);
    await expect(writer.setVisitOnInvoice(invoice.id, visitIds[1] ?? "", true)).rejects.toThrow(
      InvoiceRuleError,
    );
    await expect(writer.setVisitOnInvoice(invoice.id, visitIds[0] ?? "", false)).rejects.toThrow(
      new InvoiceRuleError("Visits can't be removed once an invoice is sent."),
    );
  });
});

describe("line items", () => {
  it("copies name and price from the price list, in order", async () => {
    const invoice = await writer.createInvoice(patientId, visitIds);
    const first = await writer.addLine(invoice.id, assessment);
    const second = await writer.addLine(invoice.id, treatment, 3);
    expect(lines()).toEqual([first, second]);
    expect(second).toMatchObject({
      name: "Treatment",
      unitPriceCents: 9_000,
      quantity: 3,
      position: 1,
      priceItemId: treatment,
    });

    // Later price list changes don't touch the line.
    store.run("UPDATE price_items SET unit_price_cents = 1 WHERE id = ?", treatment);
    expect(lines()[1]?.unitPriceCents).toBe(9_000);
  });

  it("changes quantity to a whole number of at least 1 only", async () => {
    const invoice = await writer.createInvoice(patientId, visitIds);
    const line = await writer.addLine(invoice.id, assessment);
    await writer.setLineQuantity(line.id, 4);
    expect(lines()[0]?.quantity).toBe(4);
    for (const bad of [0, -1, 1.5]) {
      await expect(writer.setLineQuantity(line.id, bad)).rejects.toThrow(RangeError);
    }
    expect(lines()[0]?.quantity).toBe(4);
  });

  it("removes a line and closes the gap", async () => {
    const invoice = await writer.createInvoice(patientId, visitIds);
    const a = await writer.addLine(invoice.id, assessment);
    const b = await writer.addLine(invoice.id, treatment);
    const c = await writer.addLine(invoice.id, assessment);
    await writer.removeLine(a.id);
    expect(lines().map((l) => [l.id, l.position])).toEqual([
      [b.id, 0],
      [c.id, 1],
    ]);
  });

  it("refuses a price item or line that's gone", async () => {
    const invoice = await writer.createInvoice(patientId, visitIds);
    await expect(writer.addLine(invoice.id, uuid(999))).rejects.toThrow(
      new WriteError("That price list item no longer exists."),
    );
    await expect(writer.removeLine(uuid(999))).rejects.toThrow(
      new WriteError("That line no longer exists."),
    );
  });

  it("locks lines once sent", async () => {
    const invoice = await writer.createInvoice(patientId, visitIds);
    const line = await writer.addLine(invoice.id, assessment);
    await writer.sendInvoice(invoice.id);
    const locked = new InvoiceRuleError("This invoice has been sent and can't be changed.");
    await expect(writer.addLine(invoice.id, treatment)).rejects.toThrow(locked);
    await expect(writer.setLineQuantity(line.id, 2)).rejects.toThrow(locked);
    await expect(writer.removeLine(line.id)).rejects.toThrow(locked);
    expect(lines()).toEqual([line]);
  });
});

describe("tax", () => {
  it("turns tax on at the current default rate, and off keeping the rate", async () => {
    const invoice = await writer.createInvoice(patientId, visitIds);
    store.run("UPDATE practice_settings SET default_tax_rate_basis_points = 1200");
    await writer.setTax(invoice.id, true);
    expect(invoices()[0]).toMatchObject({ taxEnabled: true, taxRateBasisPoints: 1200 });
    await writer.setTax(invoice.id, false);
    expect(invoices()[0]).toMatchObject({ taxEnabled: false, taxRateBasisPoints: 1200 });
  });

  it("locks tax once sent", async () => {
    const invoice = await writer.createInvoice(patientId, visitIds);
    await writer.addLine(invoice.id, assessment);
    await writer.sendInvoice(invoice.id);
    await expect(writer.setTax(invoice.id, true)).rejects.toThrow(InvoiceRuleError);
    expect(invoices()[0]?.taxEnabled).toBe(false);
  });
});

describe("sending and payment", () => {
  it("sends, records payment and undoes it", async () => {
    const invoice = await writer.createInvoice(patientId, visitIds);
    await writer.addLine(invoice.id, assessment);

    const sent = await writer.sendInvoice(invoice.id);
    expect(sent).toMatchObject({ status: "sent", sentAt: T2, paidAt: null });
    expect(invoices()).toEqual([sent]);

    clock = "2026-11-20T09:00:00.000Z";
    const paid = await writer.recordPayment(invoice.id);
    expect(paid).toMatchObject({ status: "paid", sentAt: T2, paidAt: "2026-11-20T09:00:00.000Z" });
    expect(invoices()).toEqual([paid]);

    const undone = await writer.undoPayment(invoice.id);
    expect(undone).toMatchObject({ status: "sent", sentAt: T2, paidAt: null });
    expect(invoices()).toEqual([undone]);
  });

  it("won't send without a line item, or twice", async () => {
    const invoice = await writer.createInvoice(patientId, visitIds);
    await expect(writer.sendInvoice(invoice.id)).rejects.toThrow(
      new InvoiceRuleError("Add at least one line item before sending."),
    );
    expect(invoices()[0]?.status).toBe("draft");
    await writer.addLine(invoice.id, assessment);
    await writer.sendInvoice(invoice.id);
    await expect(writer.sendInvoice(invoice.id)).rejects.toThrow(InvoiceRuleError);
  });

  it("won't record payment on a draft or undo it on an unpaid invoice", async () => {
    const invoice = await writer.createInvoice(patientId, visitIds);
    await expect(writer.recordPayment(invoice.id)).rejects.toThrow(InvoiceRuleError);
    await expect(writer.undoPayment(invoice.id)).rejects.toThrow(InvoiceRuleError);
    expect(invoices()[0]?.status).toBe("draft");
  });

  it("refuses an invoice that's gone", async () => {
    await expect(writer.recordPayment(uuid(999))).rejects.toThrow(
      new WriteError("That invoice no longer exists."),
    );
  });
});
