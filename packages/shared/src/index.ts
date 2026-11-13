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
export { checkPriceItem } from "./priceList/item";
export type { PriceItemDraft, PriceItemErrors } from "./priceList/item";
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
  markCancelled,
  markPaid,
  markSent,
  undoPaid,
} from "./invoices/status";
export type { InvoiceLocks } from "./invoices/status";
export { addVisitToInvoice, removeVisitFromInvoice, uninvoicedVisits } from "./invoices/visits";
export {
  continueLabel,
  pickedVisitIds,
  readyPatients,
  uninvoicedVisitsFor,
} from "./invoices/visitPicker";
export type { ReadyPatient } from "./invoices/visitPicker";
export {
  INVOICE_GROUP_KEYS,
  INVOICE_GROUP_LABELS,
  INVOICE_GROUP_SHORT_LABELS,
  initialInvoiceGroup,
  invoiceDetailLine,
  invoiceGroupPill,
  invoiceGroups,
  invoiceTaxLabel,
  invoiceVisitDates,
  parseInvoiceGroup,
} from "./invoices/detail";
export type { InvoiceGroup, InvoiceGroupKey } from "./invoices/detail";
export { sendProblems } from "./invoices/sendProblems";
export type { SendProblem } from "./invoices/sendProblems";
export { NoteRuleError, addToNote, isNoteLocked, replaceNote } from "./notes/rules";
export type { NoteInvoiceStatus } from "./notes/rules";
export {
  PROFILE_FIELD_KEYS,
  PROFILE_FIELD_LABELS,
  invoiceProfileLines,
  isProfileComplete,
  profileErrors,
  profileFieldHint,
} from "./profile/rules";
export type { ProfileFieldError, ProfileFieldKey, ProfileFields } from "./profile/rules";
export { homeGroups, readyToInvoice } from "./home/grouping";
export type { HomeGroups, ReadyToInvoice } from "./home/grouping";
export { lastVisit, recentPatients, searchPatients, visitOnDate } from "./patients/lookup";
export {
  formatDayMonth,
  formatDayMonthYear,
  formatEdited,
  formatLastVisit,
  formatTodayTitle,
  localDateString,
  noteExcerpt,
} from "./dates/display";
export { countLabel, todoCounts } from "./home/todo";
export type { TodoCounts } from "./home/todo";
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
export {
  SKELETON_MIN_VISIBLE_MS,
  SKELETON_SHOW_AFTER_MS,
  createSkeletonGate,
} from "./loading/skeletonGate";
export type { SkeletonGate, SkeletonGateOptions } from "./loading/skeletonGate";
export {
  FIRST_SYNC_OFFLINE_AFTER_MS,
  SIGN_IN_TEXT_AFTER_MS,
  firstSyncCopy,
  firstSyncPhase,
} from "./loading/firstSync";
export type { FirstSyncPhase, SyncStatusSummary } from "./loading/firstSync";
export { notYetOnServerCopy } from "./invoices/offline";
export { recentRows } from "./patients/recentRows";
export type { RecentRow } from "./patients/recentRows";
export {
  invoiceStyleSummary,
  priceListSummary,
  profileProblem,
  profileSummary,
} from "./settings/summaries";
export type { SettingsSummary } from "./settings/summaries";
export { dayInputValue, parseDayInput } from "./funding/dates";
export type { DayInputResult } from "./funding/dates";
export { FUNDING_PRESETS, presetDraft } from "./funding/presets";
export type { FundingPreset, FundingPresetKey } from "./funding/presets";
export {
  activeFundingsFor,
  endedFundingsFor,
  formatFundingPeriod,
  fundingEndedOn,
  fundingNotice,
  fundingTypeErrors,
  fundingTypeProblem,
  fundingTypeRow,
  fundingTypesSummary,
  fundingTypeUsage,
  isFundingActive,
  patientFundingErrors,
  sentenceLabel,
} from "./funding/rules";
export type {
  FundingFormError,
  FundingTypeDraft,
  FundingTypeError,
  FundingTypeRow,
} from "./funding/rules";
