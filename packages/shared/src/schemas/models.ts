import { z } from "zod";
import { invoiceNumberFormatSchema, MAX_INVOICE_NUMBER_START } from "../invoices/number";
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

export const invoiceStatusSchema = z.enum(["draft", "sent", "paid", "cancelled"]);

export const patientSchema = z.object({
  id,
  ownerId,
  fullName: requiredText,
  reasonForVisit: z.string().trim().nullable(),
  /** Where self-pay invoices are addressed; undefined is the same as "". */
  billingAddress: z.string().trim().max(500).optional(),
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
  /** The visit date (YYYY-MM-DD) this line is for; funded invoices need one, self-pay keeps null. */
  serviceDate: z.iso.date().nullable().optional(),
});

export const fundingDetailKindSchema = z.enum(["text", "date"]);

export const fundingDetailSchema = z.object({
  id,
  label: z.string().trim().min(1).max(80),
  kind: fundingDetailKindSchema,
  showOnInvoice: z.boolean(),
});

/** A kind of funder (e.g. a ministry or insurer) with the recipient and details its invoices need. */
export const fundingTypeSchema = z
  .object({
    id,
    ownerId,
    name: z.string().trim().min(1).max(80),
    /** May be empty; sending is blocked until it is filled in. */
    recipientName: z.string().trim().max(200),
    recipientAddress: z.string().trim().max(500),
    details: z.array(fundingDetailSchema).max(20),
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  .superRefine((type, ctx) => {
    const labels = new Set<string>();
    const ids = new Set<string>();
    type.details.forEach((detail, index) => {
      const label = detail.label.trim().toLowerCase();
      if (labels.has(label)) {
        ctx.addIssue({
          code: "custom",
          path: ["details", index, "label"],
          message: "Two details can't have the same name.",
        });
      }
      labels.add(label);
      if (ids.has(detail.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["details", index, "id"],
          message: "Each detail needs its own id.",
        });
      }
      ids.add(detail.id);
    });
  });

/** One patient's funding: their own values and period. Name, recipient and detail labels come from the type. */
export const patientFundingSchema = z
  .object({
    id,
    ownerId,
    patientId: id,
    /** Null once the type is deleted; such a funding is hidden. */
    fundingTypeId: id.nullable(),
    /** Keyed by the type's detail id. */
    detailValues: z.record(z.uuid(), z.string().trim().max(200)),
    periodStart: z.iso.date().nullable(),
    periodEnd: z.iso.date().nullable(),
    endedOn: z.iso.date().nullable(),
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  .superRefine((funding, ctx) => {
    if (funding.periodStart && funding.periodEnd && funding.periodEnd < funding.periodStart) {
      ctx.addIssue({
        code: "custom",
        path: ["periodEnd"],
        message: "The period can't end before it starts.",
      });
    }
  });

/** A shown detail copied onto an invoice. */
export const billToDetailSchema = z.object({
  id,
  label: z.string().trim().min(1).max(80),
  value: z.string().trim().max(200),
});

/** Who an invoice is addressed to, copied onto the invoice when it is created. */
export const invoiceBillToSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("patient"),
    name: z.string().trim().max(200),
    address: z.string().trim().max(500),
  }),
  z.object({
    kind: z.literal("funding"),
    patientFundingId: id.nullable(),
    fundingName: z.string().trim().min(1).max(80),
    name: z.string().trim().max(200),
    address: z.string().trim().max(500),
    details: z.array(billToDetailSchema).max(20),
  }),
]);

export const invoiceSchema = z
  .object({
    id,
    ownerId,
    patientId: id,
    /** Whole number unique per practitioner; shown in the practice's number format. */
    number: z.int().min(1),
    /**
     * The number as printed when the invoice was sent ("INV-2026-0042"), kept so it
     * never changes afterwards; null while it's a draft.
     */
    displayNumber: z.string().trim().min(1).max(60).nullable().optional(),
    status: invoiceStatusSchema,
    taxEnabled: z.boolean(),
    taxRateBasisPoints: taxRateSchema,
    sentAt: timestamp.nullable(),
    paidAt: timestamp.nullable(),
    /** When a sent invoice was cancelled; only a cancelled invoice has one. */
    cancelledAt: timestamp.nullable(),
    /** The dates (YYYY-MM-DD) of the visits a cancelled invoice let go of; null otherwise. */
    cancelledVisitDates: z.array(z.iso.date()).nullable(),
    /** Who the invoice is for; undefined means self-pay, addressed to the patient. */
    billTo: invoiceBillToSchema.optional(),
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
          ? "A sent, paid or cancelled invoice needs a sent date."
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
    const cancelled = invoice.status === "cancelled";
    if (cancelled !== (invoice.cancelledAt !== null)) {
      ctx.addIssue({
        code: "custom",
        path: ["cancelledAt"],
        message: cancelled
          ? "A cancelled invoice needs a cancelled date."
          : "Only a cancelled invoice can have a cancelled date.",
      });
    }
    if (cancelled !== (invoice.cancelledVisitDates !== null)) {
      ctx.addIssue({
        code: "custom",
        path: ["cancelledVisitDates"],
        message: cancelled
          ? "A cancelled invoice keeps the dates of its visits."
          : "Only a cancelled invoice keeps visit dates.",
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
  /** How invoice numbers are built: parts, separator, digits and prefix text. */
  invoiceNumberFormat: invoiceNumberFormatSchema,
  /** The lowest number for the next invoice, to carry on from numbers used before. */
  invoiceNumberStart: z.int().min(1).max(MAX_INVOICE_NUMBER_START),
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
