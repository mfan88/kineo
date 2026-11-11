import { z } from "zod";
import { MAX_TAX_RATE_BASIS_POINTS } from "../money";

/**
 * Zod schemas for every record Kineō stores. Shapes use camelCase; the data
 * layer maps them to snake_case columns. Every practitioner-owned record has
 * `ownerId`, the Clerk user ID that row-level security is keyed on.
 */

const id = z.uuid();
const ownerId = z.string().trim().min(1);
const timestamp = z.iso.datetime({ offset: true });
const requiredText = z.string().trim().min(1);

/** A whole number of cents that is zero or more. */
export const centsSchema = z.int().nonnegative();

/** A tax rate in basis points (5% = 500), from 0 to 100%. */
export const taxRateSchema = z.int().min(0).max(MAX_TAX_RATE_BASIS_POINTS);

export const invoiceStatusSchema = z.enum(["draft", "sent", "paid"]);

export const patientSchema = z.object({
  id,
  ownerId,
  fullName: requiredText,
  reasonForVisit: z.string().trim().nullable(),
  createdAt: timestamp,
  updatedAt: timestamp,
});

export const visitSchema = z.object({
  id,
  ownerId,
  patientId: id,
  /** Calendar date of the visit, YYYY-MM-DD. */
  visitDate: z.iso.date(),
  note: z.string(),
  noteEditedAt: timestamp,
  /** The one invoice this visit is on, if any. */
  invoiceId: id.nullable(),
  createdAt: timestamp,
  updatedAt: timestamp,
});

export const priceItemSchema = z.object({
  id,
  ownerId,
  name: requiredText,
  unitPriceCents: centsSchema,
  createdAt: timestamp,
  updatedAt: timestamp,
});

/**
 * A line on an invoice. Name and price are copied from the price list when the
 * line is added, so later price list changes never alter an existing invoice.
 */
export const lineItemSchema = z.object({
  id,
  ownerId,
  invoiceId: id,
  /** The price list item this line was copied from; null if that item was deleted. */
  priceItemId: id.nullable(),
  name: requiredText,
  unitPriceCents: centsSchema,
  quantity: z.int().min(1),
  /** Display order on the invoice, starting at 0. */
  position: z.int().nonnegative(),
});

export const invoiceSchema = z
  .object({
    id,
    ownerId,
    patientId: id,
    /** Whole number unique per practitioner; shown with the practice's prefix. */
    number: z.int().min(1),
    status: invoiceStatusSchema,
    taxEnabled: z.boolean(),
    taxRateBasisPoints: taxRateSchema,
    sentAt: timestamp.nullable(),
    paidAt: timestamp.nullable(),
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  .superRefine((invoice, ctx) => {
    const needsSentAt = invoice.status !== "draft";
    const needsPaidAt = invoice.status === "paid";
    if (needsSentAt !== (invoice.sentAt !== null)) {
      ctx.addIssue({
        code: "custom",
        path: ["sentAt"],
        message: needsSentAt
          ? "A sent or paid invoice needs a sent date."
          : "A draft invoice can't have a sent date.",
      });
    }
    if (needsPaidAt !== (invoice.paidAt !== null)) {
      ctx.addIssue({
        code: "custom",
        path: ["paidAt"],
        message: needsPaidAt
          ? "A paid invoice needs a paid date."
          : "Only a paid invoice can have a paid date.",
      });
    }
  });

/** One profile field and whether it appears on invoices. */
export const profileFieldSchema = z.object({
  value: z.string().trim(),
  showOnInvoice: z.boolean(),
});

export const profileSchema = z.object({
  ownerId,
  fullName: profileFieldSchema,
  title: profileFieldSchema,
  clinicName: profileFieldSchema,
  address: profileFieldSchema,
  phone: profileFieldSchema,
  updatedAt: timestamp,
});

/** Settings from "Price list and tax" that aren't price list items. */
export const practiceSettingsSchema = z.object({
  ownerId,
  defaultTaxRateBasisPoints: taxRateSchema,
  /** Constant text shown before every invoice number, e.g. "INV-". May be empty. */
  invoiceNumberPrefix: z.string().trim().max(20),
  updatedAt: timestamp,
});

export const accentColorSchema = z.enum(["sky", "forest", "ocean", "plum", "charcoal"]);
export const invoiceFontSchema = z.enum(["nunito", "serif", "clean"]);
export const headerLayoutSchema = z.enum(["logo-left", "centred"]);

/** Invoice style. Desktop only; the phone app never edits this. */
export const invoiceStyleSchema = z.object({
  ownerId,
  /** Storage path of the uploaded logo, or null for no logo. */
  logoPath: z.string().trim().min(1).nullable(),
  accentColor: accentColorSchema,
  font: invoiceFontSchema,
  headerLayout: headerLayoutSchema,
  footerNote: z.string().trim().max(500),
  updatedAt: timestamp,
});
