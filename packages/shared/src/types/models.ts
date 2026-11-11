import type { z } from "zod";
import type {
  accentColorSchema,
  headerLayoutSchema,
  invoiceFontSchema,
  invoiceSchema,
  invoiceStatusSchema,
  invoiceStyleSchema,
  lineItemSchema,
  patientSchema,
  practiceSettingsSchema,
  priceItemSchema,
  profileFieldSchema,
  profileSchema,
  visitSchema,
} from "../schemas/models";

export type InvoiceStatus = z.infer<typeof invoiceStatusSchema>;
export type Patient = z.infer<typeof patientSchema>;
export type Visit = z.infer<typeof visitSchema>;
export type PriceItem = z.infer<typeof priceItemSchema>;
export type LineItem = z.infer<typeof lineItemSchema>;
export type Invoice = z.infer<typeof invoiceSchema>;
export type ProfileField = z.infer<typeof profileFieldSchema>;
export type Profile = z.infer<typeof profileSchema>;
export type PracticeSettings = z.infer<typeof practiceSettingsSchema>;
export type AccentColor = z.infer<typeof accentColorSchema>;
export type InvoiceFont = z.infer<typeof invoiceFontSchema>;
export type HeaderLayout = z.infer<typeof headerLayoutSchema>;
export type InvoiceStyle = z.infer<typeof invoiceStyleSchema>;
