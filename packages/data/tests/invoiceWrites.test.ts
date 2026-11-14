import { DEFAULT_INVOICE_NUMBER_FORMAT, InvoiceRuleError } from "@kineo/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { PracticeWriter, WriteError } from "../src";
import { ownRowId } from "../src/ownRowId";
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
      cancelledAt: null,
      cancelledVisitDates: null,
    });
    // With no funding, the invoice bills the patient.
    expect(invoice.billTo).toEqual({ kind: "patient", name: "Sky Example", address: "" });
    expect(invoices()).toEqual([invoice]);
    expect(visits().find((v) => v.id === visitIds[0])?.invoiceId).toBe(invoice.id);
    expect(visits().find((v) => v.id === visitIds[1])?.invoiceId).toBeNull();

    const second = await writer.createInvoice(otherPatientId, [otherVisitId]);
    expect(second.number).toBe(2);
  });

  it("starts at the starting number from Settings, then carries on", async () => {
    await writer.saveSettings({
      defaultTaxRateBasisPoints: 500,
      invoiceNumberFormat: DEFAULT_INVOICE_NUMBER_FORMAT,
      invoiceNumberStart: 1250,
    });
    expect((await writer.createInvoice(patientId, [visitIds[0] ?? ""])).number).toBe(1250);
    expect((await writer.createInvoice(otherPatientId, [otherVisitId])).number).toBe(1251);
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
    const first = await writer.createInvoice(patientId, [visitIds[0] ?? ""]);
    setStatus(first.id, "sent");
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
    expect(lines()).toEqual(
      [first, second].map((l) => ({ ...l, serviceDate: null, visitId: null })),
    );
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
    expect(lines()).toEqual([{ ...line, serviceDate: null, visitId: null }]);
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
    expect(sent).toMatchObject({ status: "sent", sentAt: T2, paidAt: null, displayNumber: "0001" });
    expect(invoices()).toEqual([sent]);

    clock = "2026-11-20T09:00:00.000Z";
    const paid = await writer.recordPayment(invoice.id);
    expect(paid).toMatchObject({ status: "paid", sentAt: T2, paidAt: "2026-11-20T09:00:00.000Z" });
    expect(invoices()).toEqual([paid]);

    const undone = await writer.undoPayment(invoice.id);
    expect(undone).toMatchObject({
      status: "sent",
      sentAt: T2,
      paidAt: null,
      displayNumber: "0001",
    });
    expect(invoices()).toEqual([undone]);
  });

  it("keeps the number as printed on the day it's sent, whatever the settings say later", async () => {
    await writer.saveSettings({
      defaultTaxRateBasisPoints: 500,
      invoiceNumberFormat: {
        prefix: "INV",
        order: ["prefix", "year", "month", "number"],
        shown: { prefix: true, year: true, month: false },
        separator: "-",
        digits: 3,
      },
      invoiceNumberStart: 1,
    });
    const invoice = await writer.createInvoice(patientId, visitIds);
    await writer.addLine(invoice.id, assessment);
    // The year comes from the practitioner's today, not the UTC timestamp.
    const sent = await writer.sendInvoice(invoice.id);
    expect(sent.displayNumber).toBe("INV-2026-001");

    await writer.saveSettings({
      defaultTaxRateBasisPoints: 500,
      invoiceNumberFormat: { ...DEFAULT_INVOICE_NUMBER_FORMAT, prefix: "NEW" },
      invoiceNumberStart: 2,
    });
    expect(invoices()[0]?.displayNumber).toBe("INV-2026-001");
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

async function sentInvoice(visitsOnIt = visitIds) {
  const invoice = await writer.createInvoice(patientId, visitsOnIt);
  await writer.addLine(invoice.id, assessment);
  return writer.sendInvoice(invoice.id);
}

describe("cancelling a sent invoice", () => {
  it("cancels it in one write: keeps the number, copies the visit dates and releases the visits", async () => {
    store.run("UPDATE visits SET visit_date = '2026-11-04' WHERE id = ?", visitIds[0] ?? "");
    store.run("UPDATE visits SET visit_date = '2026-11-01' WHERE id = ?", visitIds[1] ?? "");
    const sent = await sentInvoice();
    clock = "2026-11-14T09:00:00.000Z";

    const cancelled = await writer.cancelInvoice(sent.id);

    expect(cancelled).toMatchObject({
      status: "cancelled",
      number: sent.number,
      sentAt: T2,
      paidAt: null,
      cancelledAt: "2026-11-14T09:00:00.000Z",
      cancelledVisitDates: ["2026-11-01", "2026-11-04"],
    });
    expect(invoices()).toEqual([cancelled]);
    expect(visits().filter((v) => v.invoiceId !== null)).toEqual([]);
    expect(visits().find((v) => v.id === visitIds[0])?.updatedAt).toBe("2026-11-14T09:00:00.000Z");
    // The invoice's lines stay as the record of what was billed.
    expect(lines()).toHaveLength(1);
  });

  it("changes the invoice before it releases the visits, so they upload in that order", async () => {
    const sent = await sentInvoice();
    const tables: string[] = [];
    const recording = {
      writeTransaction: <T>(callback: Parameters<typeof store.db.writeTransaction<T>>[0]) =>
        store.db.writeTransaction((tx) =>
          callback({
            ...tx,
            execute: (sql, values) => {
              tables.push(sql.match(/UPDATE (\w+)/)?.[1] ?? "other");
              return tx.execute(sql, values);
            },
          }),
        ),
    };
    await new PracticeWriter(recording, {
      ownerId: OWNER,
      now: () => clock,
      today: () => "2026-11-12",
      newId: () => uuid(++ids),
    }).cancelInvoice(sent.id);
    expect(tables).toEqual(["invoices", "visits", "visits"]);
  });

  it("lets the released visits go on a new invoice, which takes the next number", async () => {
    const sent = await sentInvoice();
    await writer.cancelInvoice(sent.id);
    const again = await writer.createInvoice(patientId, visitIds);
    expect(again.number).toBe(sent.number + 1);
    expect(
      visits()
        .filter((v) => v.patientId === patientId)
        .every((v) => v.invoiceId === again.id),
    ).toBe(true);
  });

  it("can cancel a sent invoice that has no visits left on it", async () => {
    const sent = await sentInvoice([visitIds[0] ?? ""]);
    store.run("UPDATE visits SET invoice_id = NULL");
    const cancelled = await writer.cancelInvoice(sent.id);
    expect(cancelled.cancelledVisitDates).toEqual([]);
  });

  it("leaves other invoices' visits alone", async () => {
    const sent = await sentInvoice([visitIds[0] ?? ""]);
    const draft = await writer.createInvoice(patientId, [visitIds[1] ?? ""]);
    await writer.cancelInvoice(sent.id);
    expect(visits().find((v) => v.id === visitIds[1])?.invoiceId).toBe(draft.id);
  });

  it("won't cancel a draft, a paid invoice or one already cancelled", async () => {
    const draft = await writer.createInvoice(patientId, [visitIds[0] ?? ""]);
    await expect(writer.cancelInvoice(draft.id)).rejects.toThrow(
      new InvoiceRuleError("Only a sent invoice can be cancelled."),
    );
    await writer.addLine(draft.id, assessment);
    await writer.sendInvoice(draft.id);
    await writer.recordPayment(draft.id);
    await expect(writer.cancelInvoice(draft.id)).rejects.toThrow(
      new InvoiceRuleError("Undo the payment before cancelling this invoice."),
    );
    expect(visits().find((v) => v.id === visitIds[0])?.invoiceId).toBe(draft.id);

    await writer.undoPayment(draft.id);
    await writer.cancelInvoice(draft.id);
    await expect(writer.cancelInvoice(draft.id)).rejects.toThrow(
      new InvoiceRuleError("This invoice is already cancelled."),
    );
  });

  it("keeps a cancelled invoice read-only", async () => {
    const sent = await sentInvoice();
    await writer.cancelInvoice(sent.id);
    await expect(writer.recordPayment(sent.id)).rejects.toThrow(InvoiceRuleError);
    await expect(writer.sendInvoice(sent.id)).rejects.toThrow(InvoiceRuleError);
    await expect(writer.addLine(sent.id, treatment)).rejects.toThrow(InvoiceRuleError);
    await expect(writer.setTax(sent.id, true)).rejects.toThrow(InvoiceRuleError);
  });

  it("refuses an invoice that's gone", async () => {
    await expect(writer.cancelInvoice(uuid(999))).rejects.toThrow(
      new WriteError("That invoice no longer exists."),
    );
  });
});

/** Marks an invoice as sent, paid or cancelled the way the server leaves its columns. */
function setStatus(id: string, status: "sent" | "paid" | "cancelled") {
  store.run(
    `UPDATE invoices SET status = ?, display_number = '1', sent_at = ?, paid_at = ?,
       cancelled_at = ?, cancelled_visit_dates = ? WHERE id = ?`,
    status,
    T2,
    status === "paid" ? T2 : null,
    status === "cancelled" ? T2 : null,
    status === "cancelled" ? "[]" : null,
    id,
  );
}

describe("createInvoice with a draft already open", () => {
  it("adds the visits to the patient's newest draft and returns it", async () => {
    const older = await writer.createInvoice(patientId, [visitIds[0] ?? ""]);
    // A second, newer draft for the same patient (the older one is sent, then a new one made).
    setStatus(older.id, "sent");
    const newest = await writer.createInvoice(patientId, [visitIds[1] ?? ""]);
    const third = (await writer.saveVisit(patientId, "Visit three.")).id;
    store.run(
      "UPDATE invoices SET status = 'draft', display_number = NULL, sent_at = NULL WHERE id = ?",
      older.id,
    );

    clock = "2026-11-12T12:00:00.000Z";
    const result = await writer.createInvoice(patientId, [third]);
    expect(result.id).toBe(newest.id);
    expect(result.updatedAt).toBe(clock);
    expect(invoices()).toHaveLength(2);
    expect(visits().find((v) => v.id === third)?.invoiceId).toBe(newest.id);
    expect(visits().find((v) => v.id === visitIds[0])?.invoiceId).toBe(older.id);
  });

  it("copies the visit's items as lines after the existing ones", async () => {
    const first = await writer.createInvoice(patientId, [visitIds[0] ?? ""]);
    await writer.addLine(first.id, assessment);
    const third = (
      await writer.saveVisit(patientId, "Visit three.", undefined, [
        { priceItemId: treatment, name: "Treatment", unitPriceCents: 9_000, quantity: 2 },
      ])
    ).id;
    await writer.createInvoice(patientId, [third]);
    const own = lines()
      .filter((line) => line.invoiceId === first.id)
      .toSorted((a, b) => a.position - b.position);
    expect(own.map((line) => [line.name, line.position])).toEqual([
      ["Assessment", 0],
      ["Treatment", 1],
    ]);
  });

  it("doesn't touch another patient's drafts", async () => {
    const other = await writer.createInvoice(otherPatientId, [otherVisitId]);
    const mine = await writer.createInvoice(patientId, [visitIds[0] ?? ""]);
    expect(mine.id).not.toBe(other.id);
    expect(invoices()).toHaveLength(2);
    const again = await writer.createInvoice(patientId, [visitIds[1] ?? ""]);
    expect(again.id).toBe(mine.id);
    expect(visits().find((v) => v.id === otherVisitId)?.invoiceId).toBe(other.id);
  });

  it("makes a new invoice when the patient's earlier one is sent", async () => {
    const sent = await writer.createInvoice(patientId, [visitIds[0] ?? ""]);
    setStatus(sent.id, "sent");
    const next = await writer.createInvoice(patientId, [visitIds[1] ?? ""]);
    expect(next.id).not.toBe(sent.id);
    expect(next.number).toBe(2);
  });

  it("writes nothing if a visit can't go on the draft", async () => {
    const draft = await writer.createInvoice(patientId, [visitIds[0] ?? ""]);
    await expect(
      writer.createInvoice(patientId, [visitIds[1] ?? "", otherVisitId]),
    ).rejects.toThrow(new InvoiceRuleError("Only this patient's visits can go on this invoice."));
    expect(visits().find((v) => v.id === visitIds[1])?.invoiceId).toBeNull();
    expect(visits().filter((v) => v.invoiceId === draft.id)).toHaveLength(1);
  });
});

const startOf = () =>
  store.rows<{ invoice_number_start: number | null }>("practice_settings")[0]?.invoice_number_start;

describe("deleteDraftInvoice", () => {
  it("deletes the invoice and its lines and frees its visits", async () => {
    const invoice = await writer.createInvoice(patientId, visitIds);
    await writer.addLine(invoice.id, assessment);
    const other = await writer.createInvoice(otherPatientId, [otherVisitId]);
    await writer.addLine(other.id, treatment);

    clock = "2026-11-12T13:00:00.000Z";
    await writer.deleteDraftInvoice(invoice.id);

    expect(invoices().map((i) => i.id)).toEqual([other.id]);
    expect(lines().every((line) => line.invoiceId === other.id)).toBe(true);
    expect(lines()).toHaveLength(1);
    for (const id of visitIds) {
      const visit = visits().find((v) => v.id === id);
      expect(visit?.invoiceId).toBeNull();
      expect(visit?.updatedAt).toBe(clock);
    }
    expect(visits().find((v) => v.id === otherVisitId)?.invoiceId).toBe(other.id);
  });

  it.each(["sent", "paid", "cancelled"] as const)("refuses a %s invoice", async (status) => {
    const invoice = await writer.createInvoice(patientId, [visitIds[0] ?? ""]);
    setStatus(invoice.id, status);
    await expect(writer.deleteDraftInvoice(invoice.id)).rejects.toThrow(
      new InvoiceRuleError("Only a draft invoice can be deleted."),
    );
    expect(invoices().map((i) => i.id)).toEqual([invoice.id]);
    expect(
      store.rows<{ invoice_number_start: number | null }>("practice_settings")[0]
        ?.invoice_number_start ?? null,
    ).toBeNull();
  });

  it("refuses a sent invoice, keeping its visits and lines", async () => {
    const invoice = await writer.createInvoice(patientId, [visitIds[0] ?? ""]);
    await writer.addLine(invoice.id, assessment);
    setStatus(invoice.id, "sent");
    await expect(writer.deleteDraftInvoice(invoice.id)).rejects.toThrow(
      new InvoiceRuleError("Only a draft invoice can be deleted."),
    );
    expect(visits().find((v) => v.id === visitIds[0])?.invoiceId).toBe(invoice.id);
    expect(lines()).toHaveLength(1);
  });

  it("refuses an invoice that's gone, or belongs to someone else", async () => {
    await expect(writer.deleteDraftInvoice(uuid(99))).rejects.toThrow(WriteError);
    store.run(
      "INSERT INTO invoices (id, owner_id, patient_id, number, status, created_at, updated_at) VALUES (?, 'user_other', ?, 7, 'draft', ?, ?)",
      uuid(98),
      patientId,
      T1,
      T1,
    );
    await expect(writer.deleteDraftInvoice(uuid(98))).rejects.toThrow(WriteError);
    expect(store.rows("invoices")).toHaveLength(1);
  });

  it("raises the starting number to the deleted number + 1 when that's higher", async () => {
    await writer.createInvoice(patientId, [visitIds[0] ?? ""]);
    const second = await writer.createInvoice(otherPatientId, [otherVisitId]);
    expect(second.number).toBe(2);
    expect(startOf() ?? null).toBeNull();
    await writer.deleteDraftInvoice(second.id);
    expect(startOf()).toBe(3);
    // The next invoice carries on from there, never reusing 2.
    const third = (await writer.saveVisit(otherPatientId, "Another.")).id;
    expect((await writer.createInvoice(otherPatientId, [third])).number).toBe(3);
  });

  it("leaves settings alone, creating no row, when a higher number is still in use", async () => {
    store.run("DELETE FROM practice_settings");
    const first = await writer.createInvoice(patientId, [visitIds[0] ?? ""]);
    const second = await writer.createInvoice(otherPatientId, [otherVisitId]);
    await writer.deleteDraftInvoice(first.id);
    expect(store.rows("practice_settings")).toEqual([]);
    expect(invoices().map((i) => i.id)).toEqual([second.id]);
  });

  it("leaves the starting number alone when it's already higher", async () => {
    await writer.saveSettings({
      defaultTaxRateBasisPoints: 500,
      invoiceNumberFormat: DEFAULT_INVOICE_NUMBER_FORMAT,
      invoiceNumberStart: 1,
    });
    const invoice = await writer.createInvoice(patientId, [visitIds[0] ?? ""]);
    store.run("UPDATE practice_settings SET invoice_number_start = 50");
    await writer.deleteDraftInvoice(invoice.id);
    expect(startOf()).toBe(50);
  });

  it("creates the settings row, at the defaults, when there isn't one", async () => {
    store.run("DELETE FROM practice_settings");
    const invoice = await writer.createInvoice(patientId, [visitIds[0] ?? ""]);
    await writer.deleteDraftInvoice(invoice.id);
    const rows = store.rows<{ id: string; owner_id: string; invoice_number_start: number }>(
      "practice_settings",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ owner_id: OWNER, invoice_number_start: 2 });
    expect(rows[0]?.id).toBe(ownRowId("practice_settings", OWNER));
    // It reads back as the default settings with only the start changed.
    await writer.saveSettings({
      defaultTaxRateBasisPoints: 0,
      invoiceNumberFormat: DEFAULT_INVOICE_NUMBER_FORMAT,
      invoiceNumberStart: 2,
    });
    expect(store.rows("practice_settings")).toHaveLength(1);
  });
});
