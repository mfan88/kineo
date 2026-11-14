import { DEFAULT_INVOICE_NUMBER_FORMAT, type ProfileFields } from "@kineo/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { PracticeWriter, WriteError } from "../src";
import { toInvoiceStyle, toPriceItem, toProfile, toSettings } from "../src/mappers";
import { ownRowId } from "../src/ownRowId";
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
      id: ownRowId("profiles", OWNER),
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

  it("puts a removed item back with the same id, name and price", async () => {
    const item = await writer.addPriceItem({ name: "Treatment", unitPriceCents: 9_000 });
    await writer.removePriceItem(item.id);
    const restored = await writer.restorePriceItem(item);
    expect(restored).toMatchObject({ id: item.id, name: "Treatment", unitPriceCents: 9_000 });
    expect(store.rows("price_items")).toHaveLength(1);
    expect(store.rows("price_items")[0]).toMatchObject({
      id: item.id,
      owner_id: OWNER,
      name: "Treatment",
      unit_price_cents: 9_000,
    });
  });

  it("leaves an item that's already there as it is when restoring", async () => {
    const item = await writer.addPriceItem({ name: "Treatment", unitPriceCents: 9_000 });
    const restored = await writer.restorePriceItem({ ...item, name: "Other", unitPriceCents: 1 });
    expect(restored).toMatchObject({ name: "Treatment", unitPriceCents: 9_000 });
    expect(store.rows("price_items")).toHaveLength(1);
  });

  it("refuses to restore an item that isn't valid", async () => {
    const item = await writer.addPriceItem({ name: "Treatment", unitPriceCents: 9_000 });
    await writer.removePriceItem(item.id);
    await expect(writer.restorePriceItem({ ...item, name: " " })).rejects.toThrow(
      new WriteError("Give the item a name."),
    );
    expect(store.rows("price_items")).toEqual([]);
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

/** Settings to save: the default numbers with these changes, and a tax rate. */
const settingsInput = (
  defaultTaxRateBasisPoints: number,
  format: Partial<typeof DEFAULT_INVOICE_NUMBER_FORMAT> = {},
  invoiceNumberStart = 1,
) => ({
  defaultTaxRateBasisPoints,
  invoiceNumberFormat: { ...DEFAULT_INVOICE_NUMBER_FORMAT, ...format },
  invoiceNumberStart,
});

describe("saveSettings", () => {
  it("saves the tax rate and invoice number format, then updates them", async () => {
    await writer.saveSettings(settingsInput(500, { prefix: " INV " }));
    await writer.saveSettings(
      settingsInput(
        0,
        {
          prefix: "KP",
          order: ["year", "prefix", "month", "number"],
          shown: { prefix: true, year: true, month: true },
          separator: "/",
          digits: 6,
        },
        1250,
      ),
    );
    const rows = store.rows<PracticeSettingsRow>("practice_settings");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      invoice_number_order: "year,prefix,month,number",
      invoice_number_show_month: 1,
      invoice_number_separator: "/",
    });
    expect(toSettings(rows[0], OWNER, T1)).toMatchObject({
      defaultTaxRateBasisPoints: 0,
      invoiceNumberFormat: {
        prefix: "KP",
        order: ["year", "prefix", "month", "number"],
        shown: { prefix: true, year: true, month: true },
        separator: "/",
        digits: 6,
      },
      invoiceNumberStart: 1250,
    });
  });

  it("trims the prefix", async () => {
    const saved = await writer.saveSettings(settingsInput(1200, { prefix: " INV " }));
    expect(saved.invoiceNumberFormat.prefix).toBe("INV");
  });

  it("refuses a rate outside 0–100% or a fractional one, a long prefix and bad digits", async () => {
    for (const rate of [-1, 10_001, 12.5]) {
      await expect(writer.saveSettings(settingsInput(rate))).rejects.toThrow(
        new WriteError("Enter a tax rate from 0 to 100%."),
      );
    }
    await expect(writer.saveSettings(settingsInput(0, { prefix: "x".repeat(21) }))).rejects.toThrow(
      new WriteError("Keep the invoice number prefix to 20 characters or fewer."),
    );
    await expect(writer.saveSettings(settingsInput(0, { digits: 7 }))).rejects.toThrow(
      new WriteError("That invoice number format can't be saved. Check its parts and digits."),
    );
    await expect(writer.saveSettings(settingsInput(0, {}, 0))).rejects.toThrow(
      new WriteError("Enter a whole number of at least 1."),
    );
    expect(store.rows("practice_settings")).toEqual([]);
  });

  it("refuses a starting number that would reuse numbers", async () => {
    store.run(
      "INSERT INTO invoices (id, owner_id, patient_id, number, status, tax_enabled, tax_rate_basis_points, created_at, updated_at) VALUES (?, ?, ?, 41, 'draft', 0, 0, ?, ?)",
      uuid(60),
      OWNER,
      uuid(61),
      T1,
      T1,
    );
    await expect(writer.saveSettings(settingsInput(0, {}, 41))).rejects.toThrow(
      new WriteError("Start at 42 or higher. Lower numbers are already used."),
    );
    await expect(writer.saveSettings(settingsInput(0, {}, 42))).resolves.toMatchObject({
      invoiceNumberStart: 42,
    });
  });

  it("keeps an earlier starting number that's now below the numbers used", async () => {
    await writer.saveSettings(settingsInput(0, {}, 5));
    store.run(
      "INSERT INTO invoices (id, owner_id, patient_id, number, status, tax_enabled, tax_rate_basis_points, created_at, updated_at) VALUES (?, ?, ?, 41, 'draft', 0, 0, ?, ?)",
      uuid(60),
      OWNER,
      uuid(61),
      T1,
      T1,
    );
    // Saving the tax rate again isn't blocked by a starting number nobody changed.
    await expect(writer.saveSettings(settingsInput(700, {}, 5))).resolves.toMatchObject({
      defaultTaxRateBasisPoints: 700,
      invoiceNumberStart: 5,
    });
  });
});

describe("saveInvoiceStyle", () => {
  const style = {
    accentColor: "plum" as const,
    font: "serif" as const,
    headerLayout: "centred" as const,
    footerNote: " Thank you. ",
    logoPath: `${OWNER}/logo-1.png`,
    footerLogoPath: `${OWNER}/footer-1.png`,
    showMadeWith: false,
  };

  it("saves the style with the logo's Storage path, then updates it", async () => {
    const saved = await writer.saveInvoiceStyle(style);
    expect(saved).toMatchObject({
      footerNote: "Thank you.",
      logoPath: `${OWNER}/logo-1.png`,
      footerLogoPath: `${OWNER}/footer-1.png`,
      showMadeWith: false,
    });
    expect(
      toInvoiceStyle(store.rows<InvoiceStyleRow>("invoice_styles")[0], OWNER, T1),
    ).toMatchObject({ footerLogoPath: `${OWNER}/footer-1.png`, showMadeWith: false });
    await writer.saveInvoiceStyle({
      ...style,
      logoPath: null,
      footerLogoPath: null,
      showMadeWith: true,
    });
    const rows = store.rows<InvoiceStyleRow>("invoice_styles");
    expect(rows).toHaveLength(1);
    expect(toInvoiceStyle(rows[0], OWNER, T1)).toMatchObject({
      logoPath: null,
      footerLogoPath: null,
      showMadeWith: true,
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
    await expect(writer.saveInvoiceStyle({ ...style, footerLogoPath: "   " })).rejects.toThrow(
      new WriteError("That logo couldn't be used. Choose the image again."),
    );
    expect(store.rows("invoice_styles")).toEqual([]);
  });
});

describe("one row per practitioner", () => {
  it("creates each row with the practitioner's fixed ID", async () => {
    await writer.saveProfile(fields());
    await writer.saveSettings(settingsInput(500));
    await writer.saveInvoiceStyle({
      accentColor: "sky",
      font: "clean",
      headerLayout: "logo-left",
      footerNote: "",
      logoPath: null,
      footerLogoPath: null,
      showMadeWith: true,
    });
    expect(store.rows<ProfileRow>("profiles")[0]?.id).toBe(ownRowId("profiles", OWNER));
    expect(store.rows<PracticeSettingsRow>("practice_settings")[0]?.id).toBe(
      ownRowId("practice_settings", OWNER),
    );
    expect(store.rows<InvoiceStyleRow>("invoice_styles")[0]?.id).toBe(
      ownRowId("invoice_styles", OWNER),
    );
  });

  it("gives a second device the same ID for its first save", async () => {
    const other = testDatabase();
    const otherWriter = new PracticeWriter(other.db, {
      ownerId: OWNER,
      now: () => T2,
      today: () => "2026-11-12",
      newId: () => uuid(500),
    });
    await writer.saveProfile(fields());
    await otherWriter.saveProfile(fields({ phone: field("604-555-0199") }));
    expect(other.rows<ProfileRow>("profiles")[0]?.id).toBe(
      store.rows<ProfileRow>("profiles")[0]?.id,
    );
  });

  it("keeps updating a row that already has another ID (made before fixed IDs)", async () => {
    store.run(
      "INSERT INTO practice_settings (id, owner_id, default_tax_rate_basis_points, invoice_number_prefix, updated_at) VALUES (?, ?, 0, '', ?)",
      uuid(77),
      OWNER,
      T1,
    );
    await writer.saveSettings(settingsInput(700));
    const rows = store.rows<PracticeSettingsRow>("practice_settings");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: uuid(77), default_tax_rate_basis_points: 700 });
  });
});
