import { formatDayMonthYear } from "../dates/display";
import type { FundingDetail, FundingType, PatientFunding } from "../types/models";
import { parseDayInput } from "./dates";
import { FUNDING_PRESETS } from "./presets";

/** Rules for funding types and a patient's fundings. Messages match the server's where it has them. */

export interface FundingTypeDraft {
  name: string;
  recipientName: string;
  recipientAddress: string;
  details: FundingDetail[];
}

export type FundingTypeError =
  { field: "name"; message: string } | { field: "detail"; detailId: string; message: string };

export interface FundingFormError {
  /** A detail's id, "periodStart" or "periodEnd". */
  field: string;
  message: string;
}

export interface FundingTypeRow {
  billTo: string | null;
  problem: string | null;
  counts: string;
}

/** A funding change the rules refuse. The message is safe to show. */
export class FundingRuleError extends Error {
  override name = "FundingRuleError";
}

const MAX_DETAILS = 20;
const DATE_MESSAGE = "Enter a date like 1 Apr 2026.";

/** Problems that stop a funding type being saved, in the order they appear on screen. */
export function fundingTypeErrors(draft: FundingTypeDraft): FundingTypeError[] {
  const errors: FundingTypeError[] = [];
  if (draft.name.trim() === "") {
    errors.push({ field: "name", message: "Add a name for this funding type." });
  }
  for (const detail of draft.details) {
    if (detail.label.trim() === "") {
      errors.push({
        field: "detail",
        detailId: detail.id,
        message: "Name this detail, or remove it.",
      });
    }
  }
  const seen = new Set<string>();
  for (const detail of draft.details) {
    const label = detail.label.trim().toLowerCase();
    if (label === "") continue;
    if (seen.has(label)) {
      errors.push({
        field: "detail",
        detailId: detail.id,
        message: "Two details can't have the same name.",
      });
    }
    seen.add(label);
  }
  draft.details.slice(MAX_DETAILS).forEach((detail) => {
    errors.push({
      field: "detail",
      detailId: detail.id,
      message: "A funding type can have up to 20 details.",
    });
  });
  return errors;
}

/** What's missing from a type's recipient, or null. Sending is blocked while this is set. */
export function fundingTypeProblem(
  type: Pick<FundingType, "recipientName" | "recipientAddress">,
): string | null {
  const noName = type.recipientName.trim() === "";
  const noAddress = type.recipientAddress.trim() === "";
  if (noName && noAddress) return "Recipient name and address are empty";
  if (noName) return "Recipient name is empty";
  if (noAddress) return "Recipient address is empty";
  return null;
}

/** "billing number" for "Billing number"; "ICBC claim number" and "A" stay as they are. Matches the server's sentence_label. */
export function sentenceLabel(label: string): string {
  const second = label.charAt(1);
  if (label.length >= 2 && second !== second.toUpperCase()) {
    return label.charAt(0).toLowerCase() + label.slice(1);
  }
  return label;
}

/** Whether a funding can still be billed: its type exists, it wasn't ended and its period hasn't passed. */
export function isFundingActive(funding: PatientFunding, today: string): boolean {
  return (
    funding.fundingTypeId !== null &&
    funding.endedOn === null &&
    (funding.periodEnd === null || funding.periodEnd >= today)
  );
}

/** The day a funding stopped: when it was ended, or its period's end if that has passed. Null while active. */
export function fundingEndedOn(funding: PatientFunding, today: string): string | null {
  if (funding.endedOn !== null) return funding.endedOn;
  return funding.periodEnd !== null && funding.periodEnd < today ? funding.periodEnd : null;
}

function newestFirst(a: PatientFunding, b: PatientFunding): number {
  return a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0;
}

export function activeFundingsFor(
  patientId: string,
  fundings: readonly PatientFunding[],
  today: string,
): PatientFunding[] {
  return fundings
    .filter((f) => f.patientId === patientId && isFundingActive(f, today))
    .toSorted(newestFirst);
}

/** Fundings that have stopped. Ones whose type was deleted are hidden. */
export function endedFundingsFor(
  patientId: string,
  fundings: readonly PatientFunding[],
  today: string,
): PatientFunding[] {
  return fundings
    .filter(
      (f) => f.patientId === patientId && f.fundingTypeId !== null && !isFundingActive(f, today),
    )
    .toSorted(newestFirst);
}

/** How many patients have an active funding of this type. */
export function fundingTypeUsage(
  typeId: string,
  fundings: readonly PatientFunding[],
  today: string,
): number {
  return new Set(
    fundings
      .filter((f) => f.fundingTypeId === typeId && isFundingActive(f, today))
      .map((f) => f.patientId),
  ).size;
}

/** "1 Apr 2026 – 31 Mar 2027", "From 1 Apr 2026", "To 31 Mar 2027", or null with no period. */
export function formatFundingPeriod(start: string | null, end: string | null): string | null {
  if (start !== null && end !== null) {
    return `${formatDayMonthYear(start)} – ${formatDayMonthYear(end)}`;
  }
  if (start !== null) return `From ${formatDayMonthYear(start)}`;
  if (end !== null) return `To ${formatDayMonthYear(end)}`;
  return null;
}

/** Problems with a patient's funding form. The period arguments are the text typed in the fields. */
export function patientFundingErrors(input: {
  type: FundingType;
  detailValues: Record<string, string>;
  periodStart: string;
  periodEnd: string;
}): FundingFormError[] {
  const errors: FundingFormError[] = [];
  const valueOf = (detail: FundingDetail) => (input.detailValues[detail.id] ?? "").trim();

  for (const detail of input.type.details) {
    if (detail.showOnInvoice && valueOf(detail) === "") {
      errors.push({ field: detail.id, message: `Add the ${sentenceLabel(detail.label)}.` });
    }
  }
  for (const detail of input.type.details) {
    if (detail.kind === "date" && !parseDayInput(valueOf(detail)).ok) {
      errors.push({ field: detail.id, message: DATE_MESSAGE });
    }
  }
  const start = parseDayInput(input.periodStart);
  const end = parseDayInput(input.periodEnd);
  if (!start.ok) errors.push({ field: "periodStart", message: DATE_MESSAGE });
  if (!end.ok) errors.push({ field: "periodEnd", message: DATE_MESSAGE });
  if (start.ok && end.ok && start.value !== null && end.value !== null && end.value < start.value) {
    errors.push({ field: "periodEnd", message: "The period can't end before it starts." });
  }
  return errors;
}

/** The pieces of a row in the Funding types list. */
export function fundingTypeRow(type: FundingType, usage: number): FundingTypeRow {
  const problem = fundingTypeProblem(type);
  const shown = type.details.filter((detail) => detail.showOnInvoice).length;
  const details =
    shown === 0
      ? "No details on invoices"
      : `${shown} ${shown === 1 ? "detail" : "details"} on invoices`;
  const patients = usage === 0 ? "no patients" : `${usage} ${usage === 1 ? "patient" : "patients"}`;
  return {
    billTo: problem === null ? `Bill to ${type.recipientName.trim()}` : null,
    problem,
    counts: `${details} · ${patients}`,
  };
}

/** The line beside Funding types in Settings. */
export function fundingTypesSummary(types: readonly FundingType[]): string {
  if (types.length === 0) return "No funding types";
  const base = types.length === 1 ? "1 type" : `${types.length} types`;
  const missing = types.filter((type) => fundingTypeProblem(type) !== null).length;
  if (missing === 0) return base;
  return `${base} · ${missing === 1 ? "1 is" : `${missing} are`} missing a recipient`;
}

/** A heads-up about a starting point's funder (e.g. Autism Funding ending), while it still applies. */
export function fundingNotice(types: readonly FundingType[], today: string): string | null {
  for (const preset of FUNDING_PRESETS) {
    if (!preset.notice || today > preset.notice.until) continue;
    const present = types.some(
      (type) => type.name.trim().toLowerCase() === preset.name.toLowerCase(),
    );
    if (present) return preset.notice.text;
  }
  return null;
}
