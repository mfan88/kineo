import type { ProfileFields } from "@kineo/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { PracticeWriter, WriteError } from "../src";
import { toInvoiceStyle, toPriceItem, toProfile, toSettings } from "../src/mappers";
import type { InvoiceStyleRow, PracticeSettingsRow, PriceItemRow, ProfileRow } from "../src/schema";
import { testDatabase } from "./sqlite";

const OWNER = "user_test";
const T1 = "2026-11-12T10:00:00.000Z";
const T2 = "2026-11-12T11:00:00.000Z";
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

let store: ReturnType<typeof testDatabase>;
let clock: string;
let writer: PracticeWriter;

beforeEach(() => {
  store = testDatabase();
  clock = T1;
  let ids = 0;
  writer = new PracticeWriter(store.db, {
    ownerId: OWNER,
    now: () => clock,
    today: () => "2026-11-12",
    newId: () => uuid(++ids),
  });
});

const field = (value: string, showOnInvoice = false) => ({ value, showOnInvoice });
const fields = (overrides: Partial<ProfileFields> = {}): ProfileFields => ({
  fullName: field("Alex Example", true),
  title: field("Physiotherapist"),
  clinicName: field(""),
  address: field(""),
  phone: field(""),
  ...overrides,
});

describe("saveProfile", () => {
  it("inserts the profile the first time, then updates the same row", async () => {
    const saved = await writer.saveProfile(fields({ title: field("  Physiotherapist  ", true) }));
    expect(saved.title).toEqual({ value: "Physiotherapist", showOnInvoice: true });
    expect(store.rows<ProfileRow>("profiles").map((row) => toProfile(row, OWNER, T1))).toEqual([
      saved,
    ]);

    clock = T2;
    await writer.saveProfile(fields({ phone: field("604-555-0100", true) }));
    const rows = store.rows<ProfileRow>("profiles");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: uuid(1),
      phone: "604-555-0100",
      phone_on_invoice: 1,
      updated_at: T2,
    });
  });

  it("refuses an empty field that's shown on invoices, and writes nothing", async () => {
    await expect(writer.saveProfile(fields({ clinicName: field("   ", true) }))).rejects.toThrow(
      WriteError,
    );
    expect(store.rows("profiles")).toEqual([]);
  });
});

describe("price list", () => {
  it("adds, renames and reprices items in whole cents, including zero", async () => {
    const item = await writer.addPriceItem({ name: " Assessment ", unitPriceCents: 0 });
    expect(item).toMatchObject({ name: "Assessment", unitPriceCents: 0 });
    clock = T2;
    const updated = await writer.updatePriceItem(item.id, {
      name: "Initial assessment",
      unitPriceCents: 12_550,
    });
    expect(store.rows<PriceItemRow>("price_items").map(toPriceItem)).toEqual([updated]);
    expect(updated).toMatchObject({ createdAt: T1, updatedAt: T2, unitPriceCents: 12_550 });
  });

  it("needs a name and a whole, non-negative price", async () => {
    await expect(writer.addPriceItem({ name: " ", unitPriceCents: 100 })).rejects.toThrow(
      new WriteError("Give the item a name."),
    );
    for (const bad of [-1, 12.5, Number.NaN]) {
      await expect(writer.addPriceItem({ name: "Treatment", unitPriceCents: bad })).rejects.toThrow(
        new WriteError("Enter a price of $0.00 or more."),
      );
    }
    expect(store.rows("price_items")).toEqual([]);
  });

  it("removes an item, leaving copied invoice lines alone", async () => {
    const item = await writer.addPriceItem({ name: "Treatment", unitPriceCents: 9_000 });
    store.run(
      "INSERT INTO invoice_lines (id, owner_id, invoice_id, price_item_id, name, unit_price_cents, quantity, position) VALUES (?, ?, ?, ?, 'Treatment', 9000, 1, 0)",
      uuid(50),
      OWNER,
      uuid(51),
      item.id,
    );
    await writer.removePriceItem(item.id);
    expect(store.rows("price_items")).toEqual([]);
    expect(store.rows("invoice_lines")).toHaveLength(1);
  });

  it("refuses an item that's gone, or belongs to someone else", async () => {
    await expect(
      writer.updatePriceItem(uuid(99), { name: "x", unitPriceCents: 1 }),
    ).rejects.toThrow(WriteError);
    store.run(
      "INSERT INTO price_items (id, owner_id, name, unit_price_cents, created_at, updated_at) VALUES (?, 'user_other', 'Theirs', 1, ?, ?)",
      uuid(98),
      T1,
      T1,
    );
    await expect(writer.removePriceItem(uuid(98))).rejects.toThrow(
      new WriteError("That price list item no longer exists."),
    );
    expect(store.rows("price_items")).toHaveLength(1);
  });
});

describe("saveSettings", () => {
  it("saves the default tax rate and prefix, then updates them", async () => {
    await writer.saveSettings({ defaultTaxRateBasisPoints: 500, invoiceNumberPrefix: " INV- " });
    await writer.saveSettings({ defaultTaxRateBasisPoints: 0, invoiceNumberPrefix: "" });
    const rows = store.rows<PracticeSettingsRow>("practice_settings");
    expect(rows).toHaveLength(1);
    expect(toSettings(rows[0], OWNER, T1)).toMatchObject({
      defaultTaxRateBasisPoints: 0,
      invoiceNumberPrefix: "",
    });
  });

  it("trims the prefix", async () => {
    const saved = await writer.saveSettings({
      defaultTaxRateBasisPoints: 1200,
      invoiceNumberPrefix: " INV- ",
    });
    expect(saved.invoiceNumberPrefix).toBe("INV-");
  });

  it("refuses a rate outside 0–100% or a fractional one, and a long prefix", async () => {
    for (const rate of [-1, 10_001, 12.5]) {
      await expect(
        writer.saveSettings({ defaultTaxRateBasisPoints: rate, invoiceNumberPrefix: "" }),
      ).rejects.toThrow(new WriteError("Enter a tax rate from 0 to 100%."));
    }
    await expect(
      writer.saveSettings({ defaultTaxRateBasisPoints: 0, invoiceNumberPrefix: "x".repeat(21) }),
    ).rejects.toThrow(new WriteError("Keep the invoice number prefix to 20 characters or fewer."));
    expect(store.rows("practice_settings")).toEqual([]);
  });
});

describe("saveInvoiceStyle", () => {
  const style = {
    accentColor: "plum" as const,
    font: "serif" as const,
    headerLayout: "centred" as const,
    footerNote: " Thank you. ",
    logoPath: `${OWNER}/logo-1.png`,
  };

  it("saves the style with the logo's Storage path, then updates it", async () => {
    const saved = await writer.saveInvoiceStyle(style);
    expect(saved).toMatchObject({ footerNote: "Thank you.", logoPath: `${OWNER}/logo-1.png` });
    await writer.saveInvoiceStyle({ ...style, logoPath: null });
    const rows = store.rows<InvoiceStyleRow>("invoice_styles");
    expect(rows).toHaveLength(1);
    expect(toInvoiceStyle(rows[0], OWNER, T1)).toMatchObject({
      logoPath: null,
      accentColor: "plum",
    });
  });

  it("refuses a long footer and an empty logo path", async () => {
    await expect(
      writer.saveInvoiceStyle({ ...style, footerNote: "x".repeat(501) }),
    ).rejects.toThrow(new WriteError("Keep the footer note to 500 characters or fewer."));
    await expect(writer.saveInvoiceStyle({ ...style, logoPath: "   " })).rejects.toThrow(
      new WriteError("That logo couldn't be used. Choose the image again."),
    );
    expect(store.rows("invoice_styles")).toEqual([]);
  });
});
