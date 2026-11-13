import { z } from "zod";
import { parseDayInput } from "../funding/dates";
import { NoteRuleError } from "../notes/rules";

/** Refused deleting: the visit is on an invoice. Same words as the server. */
export const VISIT_ON_INVOICE_DELETE =
  "This visit is on an invoice, so it can't be deleted. Take it off the invoice first.";
/** Refused re-dating: the visit is on an invoice. Same words as the server. */
export const VISIT_ON_INVOICE_DATE =
  "This visit is on an invoice, so its date can't be changed. Take it off the invoice first.";
export const VISIT_DATE_IN_FUTURE = "A visit can't be dated after today.";
export const VISIT_DATE_MISSING = "Choose the day of the visit.";

const isoDate = z.iso.date();

/**
 * What's wrong with a visit date (YYYY-MM-DD), or null. `today` is the practitioner's
 * own date: notes are written after the visit, so a later day is refused.
 */
export function visitDateProblem(visitDate: string, today: string): string | null {
  if (!isoDate.safeParse(visitDate).success) return VISIT_DATE_MISSING;
  if (visitDate > today) return VISIT_DATE_IN_FUTURE;
  return null;
}

/** Refuses deleting a visit that's on an invoice. */
export function assertVisitDeletable(visit: { invoiceId: string | null }): void {
  if (visit.invoiceId !== null) throw new NoteRuleError(VISIT_ON_INVOICE_DELETE);
}

/**
 * Refuses moving a visit to `visitDate`: not while it's on an invoice (its lines and
 * the invoice keep their dates), and never to a day after today.
 */
export function assertVisitRedatable(
  visit: { invoiceId: string | null },
  visitDate: string,
  today: string,
): void {
  if (visit.invoiceId !== null) throw new NoteRuleError(VISIT_ON_INVOICE_DATE);
  const problem = visitDateProblem(visitDate, today);
  if (problem) throw new NoteRuleError(problem);
}

/**
 * Reads a visit date as typed ("11 Nov 2026", "11 November 2026" or "2026-11-11"),
 * giving the day (YYYY-MM-DD) or what to fix.
 */
export function readVisitDateInput(
  text: string,
  today: string,
): { ok: true; value: string } | { ok: false; message: string } {
  const parsed = parseDayInput(text);
  if (!parsed.ok) return parsed;
  if (parsed.value === null) return { ok: false, message: VISIT_DATE_MISSING };
  const problem = visitDateProblem(parsed.value, today);
  return problem ? { ok: false, message: problem } : { ok: true, value: parsed.value };
}
