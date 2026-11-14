import type { z } from "zod";
import type {
  accentColorSchema,
  billToDetailSchema,
  fundingDetailKindSchema,
  fundingDetailSchema,
  fundingTypeSchema,
  headerLayoutSchema,
  invoiceBillToSchema,
  invoiceFontSchema,
  invoiceSchema,
  invoiceStatusSchema,
  invoiceStyleSchema,
  lineItemSchema,
  patientFundingSchema,
  patientSchema,
  practiceSettingsSchema,
  priceItemSchema,
  profileFieldSchema,
  profileSchema,
  visitItemSchema,
  visitSchema,
} from "../schemas/models";

export type InvoiceStatus = z.infer<typeof invoiceStatusSchema>;
export type Patient = z.infer<typeof patientSchema>;
export type Visit = z.infer<typeof visitSchema>;
export type VisitItem = z.infer<typeof visitItemSchema>;
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
export type FundingDetailKind = z.infer<typeof fundingDetailKindSchema>;
export type FundingDetail = z.infer<typeof fundingDetailSchema>;
export type FundingType = z.infer<typeof fundingTypeSchema>;
export type PatientFunding = z.infer<typeof patientFundingSchema>;
export type BillToDetail = z.infer<typeof billToDetailSchema>;
export type InvoiceBillTo = z.infer<typeof invoiceBillToSchema>;
