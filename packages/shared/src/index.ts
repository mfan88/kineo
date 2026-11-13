// Public entry point for @kineo/shared. Apps import everything from here.
export {
  MAX_TAX_RATE_BASIS_POINTS,
  addCents,
  applyTax,
  assertCents,
  assertTaxRate,
  centsToInput,
  formatCad,
  formatPercent,
  multiplyCents,
  parseCad,
  parsePercent,
  taxCents,
} from "./money";
export * from "./schemas/models";
export type * from "./types/models";
export { formatInvoiceNumber, nextInvoiceNumber } from "./invoices/number";
export { invoiceTotals, lineFromPriceItem, lineTotalCents } from "./invoices/totals";
export type {
  InvoiceTaxSettings,
  InvoiceTotals,
  LineFromPriceItem,
  PricedLine,
} from "./invoices/totals";
export {
  InvoiceRuleError,
  canChangeStatus,
  invoiceLocks,
  markPaid,
  markSent,
  undoPaid,
} from "./invoices/status";
export type { InvoiceLocks } from "./invoices/status";
export { addVisitToInvoice, removeVisitFromInvoice, uninvoicedVisits } from "./invoices/visits";
export { NoteRuleError, addToNote, isNoteLocked, replaceNote } from "./notes/rules";
export type { NoteInvoiceStatus } from "./notes/rules";
export {
  PROFILE_FIELD_KEYS,
  PROFILE_FIELD_LABELS,
  invoiceProfileLines,
  isProfileComplete,
  profileErrors,
} from "./profile/rules";
export type { ProfileFieldError, ProfileFieldKey, ProfileFields } from "./profile/rules";
export { homeGroups, readyToInvoice } from "./home/grouping";
export type { HomeGroups, ReadyToInvoice } from "./home/grouping";
export { lastVisit, recentPatients, searchPatients } from "./patients/lookup";
export { LOGO_TYPES, MAX_LOGO_BYTES, logoFileError } from "./style/logo";
export { signInError } from "./auth/signInErrors";
export { clerkErrorDetails } from "./auth/clerkErrorDetails";
export type { ClerkErrorLike, SignInError, SignInErrorField } from "./auth/signInErrors";
export { uploadRejectionMessage } from "./sync/rejections";
export type { UploadRejection } from "./sync/rejections";
export {
  APPEARANCE_LABELS,
  APPEARANCE_SETTINGS,
  DEFAULT_APPEARANCE,
  appearanceSummary,
  parseAppearance,
  resolveAppearance,
} from "./appearance/appearance";
export type { AppearanceSetting, ResolvedAppearance } from "./appearance/appearance";
