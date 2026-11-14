import { InvoiceRuleError, NoteRuleError, VISIT_ITEMS_ON_INVOICE } from "@kineo/shared";
import type { VisitItemDraft } from "@kineo/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { PracticeWriter } from "../src";
import { toInvoice, toLineItem, toVisitItem } from "../src/mappers";
import type { InvoiceLineRow, InvoiceRow, VisitItemRow } from "../src/schema";
import { testDatabase } from "./sqlite";

const OWNER = "user_test";
const T1 = "2026-11-12T10:00:00.000Z";
const DETAIL = "d1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1";

let store: ReturnType<typeof testDatabase>;
let clock: string;
let writer: PracticeWriter;
let ids: number;
let patientId: string;

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const items = () =>
  store
    .rows<VisitItemRow>("visit_items")
    .map(toVisitItem)
    .toSorted((a, b) => a.visitId.localeCompare(b.visitId) || a.position - b.position);
const lines = () =>
  store
    .rows<InvoiceLineRow>("invoice_lines")
    .map(toLineItem)
    .toSorted((a, b) => a.position - b.position);
const invoices = () => store.rows<InvoiceRow>("invoices").map(toInvoice);

const assessment: VisitItemDraft = {
  priceItemId: uuid(901),
  name: "Assessment",
  unitPriceCents: 12_000,
  quantity: 1,
};
const treatment: VisitItemDraft = {
  priceItemId: uuid(902),
  name: "Treatment",
  unitPriceCents: 9_000,
  quantity: 2,
};

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
    "INSERT INTO practice_settings (id, owner_id, default_tax_rate_basis_points, invoice_number_prefix, updated_at) VALUES (?, ?, 0, '', ?)",
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
  patientId = (await writer.addPatient({ fullName: "Sky Example", reasonForVisit: "" })).id;
});

describe("saveVisit with items", () => {
  it("saves the items with the visit, positions from 0", async () => {
    const visit = await writer.saveVisit(patientId, "Note.", undefined, [assessment, treatment]);
    expect(items()).toMatchObject([
      { visitId: visit.id, name: "Assessment", quantity: 1, position: 0, createdAt: T1 },
      { visitId: visit.id, name: "Treatment", quantity: 2, unitPriceCents: 9_000, position: 1 },
    ]);
  });

  it("saves no items for an empty list", async () => {
    await writer.saveVisit(patientId, "Note.");
    expect(items()).toEqual([]);
  });

  it("refuses a quantity that isn't a whole number of at least 1, saving nothing", async () => {
    for (const quantity of [0, -1, 1.5]) {
      await expect(
        writer.saveVisit(patientId, "Note.", undefined, [{ ...assessment, quantity }]),
      ).rejects.toThrow(NoteRuleError);
    }
    expect(store.rows("visits")).toEqual([]);
    expect(items()).toEqual([]);
  });
});

describe("setVisitItems", () => {
  it("replaces the items and touches the visit", async () => {
    const visit = await writer.saveVisit(patientId, "Note.", undefined, [assessment, treatment]);
    clock = "2026-11-12T12:00:00.000Z";
    const next = await writer.setVisitItems(visit.id, [treatment]);
    expect(next).toMatchObject([{ name: "Treatment", position: 0, quantity: 2 }]);
    expect(items()).toEqual(next);
    expect(store.rows<{ updated_at: string }>("visits")[0]?.updated_at).toBe(clock);
    expect(await writer.setVisitItems(visit.id, [])).toEqual([]);
    expect(items()).toEqual([]);
  });

  it("is refused with the exact message once the visit is on an invoice", async () => {
    const visit = await writer.saveVisit(patientId, "Note.", undefined, [assessment]);
    await writer.createInvoice(patientId, [visit.id]);
    await expect(writer.setVisitItems(visit.id, [treatment])).rejects.toThrow(
      new NoteRuleError(VISIT_ITEMS_ON_INVOICE),
    );
    expect(items()).toMatchObject([{ name: "Assessment" }]);
  });
});

describe("deleting and restoring a visit", () => {
  it("brings the items back with their ids", async () => {
    const visit = await writer.saveVisit(patientId, "Note.", undefined, [assessment, treatment]);
    const before = items();
    const removed = await writer.deleteVisit(visit.id);
    expect(removed.items).toEqual(before);
    expect(items()).toEqual([]);
    await writer.restoreVisit(removed);
    expect(items()).toEqual(before);
  });

  it("still restores a plain visit", async () => {
    const visit = await writer.saveVisit(patientId, "Note.");
    const { items: none, ...plain } = await writer.deleteVisit(visit.id);
    expect(none).toEqual([]);
    await writer.restoreVisit(plain);
    expect(store.rows("visits")).toHaveLength(1);
  });
});

describe("createInvoice copies visit items", () => {
  it("makes undated lines on a self-pay invoice, oldest visit first, then by position", async () => {
    const newer = await writer.saveVisit(patientId, "Newer.", "2026-11-10", [treatment]);
    const older = await writer.saveVisit(patientId, "Older.", "2026-11-03", [
      assessment,
      treatment,
    ]);
    const invoice = await writer.createInvoice(patientId, [newer.id, older.id]);
    expect(lines().map((l) => [l.position, l.visitId, l.name, l.serviceDate])).toEqual([
      [0, older.id, "Assessment", null],
      [1, older.id, "Treatment", null],
      [2, newer.id, "Treatment", null],
    ]);
    expect(lines().every((l) => l.invoiceId === invoice.id)).toBe(true);
  });

  it("dates the lines with the visit date on a funded invoice", async () => {
    const type = await writer.saveFundingType({
      name: "Autism Funding",
      recipientName: "Example Branch",
      recipientAddress: "PO Box 1",
      details: [{ id: DETAIL, label: "Billing number", kind: "text", showOnInvoice: true }],
    });
    await writer.addPatientFunding({
      patientId,
      fundingTypeId: type.id,
      detailValues: { [DETAIL]: "4821" },
      periodStart: null,
      periodEnd: null,
    });
    const a = await writer.saveVisit(patientId, "A.", "2026-11-04", [assessment]);
    const b = await writer.saveVisit(patientId, "B.", "2026-11-02", [treatment]);
    await writer.createInvoice(patientId, [a.id, b.id]);
    expect(lines().map((l) => [l.visitId, l.serviceDate])).toEqual([
      [b.id, "2026-11-02"],
      [a.id, "2026-11-04"],
    ]);
  });

  it("copies price and name from the visit item, not the current price list", async () => {
    const visit = await writer.saveVisit(patientId, "Note.", undefined, [assessment]);
    store.run(
      "UPDATE price_items SET unit_price_cents = 99999, name = 'Renamed' WHERE id = ?",
      uuid(901),
    );
    await writer.createInvoice(patientId, [visit.id]);
    expect(lines()).toMatchObject([
      {
        visitId: visit.id,
        priceItemId: uuid(901),
        name: "Assessment",
        unitPriceCents: 12_000,
        quantity: 1,
      },
    ]);
  });

  it("writes the invoice and visit updates before the lines", async () => {
    const visit = await writer.saveVisit(patientId, "Note.", undefined, [assessment]);
    const tables: string[] = [];
    const original = store.db.writeTransaction.bind(store.db);
    store.db.writeTransaction = (fn) =>
      original((tx) =>
        fn({
          ...tx,
          execute: (sql: string, params?: unknown[]) => {
            tables.push(/^\s*(?:INSERT INTO|UPDATE)\s+(\w+)/i.exec(sql)?.[1] ?? "");
            return tx.execute(sql, params);
          },
        }),
      );
    await writer.createInvoice(patientId, [visit.id]);
    expect(tables.filter((t) => ["invoices", "visits", "invoice_lines"].includes(t))).toEqual([
      "invoices",
      "visits",
      "invoice_lines",
    ]);
  });
});

describe("ticking visits on and off a draft", () => {
  it("appends a visit's lines, removes only its lines, renumbers and re-adds them", async () => {
    const first = await writer.saveVisit(patientId, "One.", "2026-11-01", [assessment]);
    const second = await writer.saveVisit(patientId, "Two.", "2026-11-02", [treatment]);
    const invoice = await writer.createInvoice(patientId, [first.id]);
    await writer.addLine(invoice.id, uuid(902), 3);

    await writer.setVisitOnInvoice(invoice.id, second.id, true);
    expect(lines().map((l) => [l.position, l.visitId, l.name])).toEqual([
      [0, first.id, "Assessment"],
      [1, null, "Treatment"],
      [2, second.id, "Treatment"],
    ]);

    await writer.setVisitOnInvoice(invoice.id, first.id, false);
    expect(lines().map((l) => [l.position, l.visitId, l.quantity])).toEqual([
      [0, null, 3],
      [1, second.id, 2],
    ]);

    await writer.setVisitOnInvoice(invoice.id, first.id, true);
    expect(lines().map((l) => [l.position, l.visitId])).toEqual([
      [0, null],
      [1, second.id],
      [2, first.id],
    ]);
    expect(items()).toHaveLength(2);
  });

  it("refuses to change a sent invoice's visits and leaves its lines", async () => {
    const visit = await writer.saveVisit(patientId, "One.", undefined, [assessment]);
    const invoice = await writer.createInvoice(patientId, [visit.id]);
    await writer.sendInvoice(invoice.id);
    await expect(writer.setVisitOnInvoice(invoice.id, visit.id, false)).rejects.toThrow(
      InvoiceRuleError,
    );
    expect(lines()).toHaveLength(1);
  });
});

describe("cancelling an invoice", () => {
  it("keeps its lines, and the visit keeps its items", async () => {
    const visit = await writer.saveVisit(patientId, "One.", undefined, [assessment, treatment]);
    const invoice = await writer.createInvoice(patientId, [visit.id]);
    await writer.sendInvoice(invoice.id);
    await writer.cancelInvoice(invoice.id);
    expect(invoices()[0]?.status).toBe("cancelled");
    expect(lines()).toHaveLength(2);
    expect(items()).toHaveLength(2);
    expect(store.rows<{ invoice_id: string | null }>("visits")[0]?.invoice_id).toBeNull();
    // Off the invoice again, the visit's items can be edited.
    await expect(writer.setVisitItems(visit.id, [assessment])).resolves.toHaveLength(1);
  });
});
