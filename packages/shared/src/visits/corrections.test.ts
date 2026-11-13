import { describe, expect, it } from "vitest";
import { NoteRuleError } from "../notes/rules";
import {
  assertVisitDeletable,
  assertVisitRedatable,
  VISIT_DATE_IN_FUTURE,
  VISIT_DATE_MISSING,
  VISIT_ON_INVOICE_DATE,
  VISIT_ON_INVOICE_DELETE,
  readVisitDateInput,
  visitDateProblem,
} from "./corrections";

const TODAY = "2026-11-12";

describe("visitDateProblem", () => {
  it("accepts today and earlier days", () => {
    expect(visitDateProblem(TODAY, TODAY)).toBeNull();
    expect(visitDateProblem("2026-01-31", TODAY)).toBeNull();
  });

  it("refuses a day after today, and anything that isn't a day", () => {
    expect(visitDateProblem("2026-11-13", TODAY)).toBe(VISIT_DATE_IN_FUTURE);
    expect(visitDateProblem("", TODAY)).toBe(VISIT_DATE_MISSING);
    expect(visitDateProblem("2026-02-30", TODAY)).toBe(VISIT_DATE_MISSING);
    expect(visitDateProblem("12 Nov", TODAY)).toBe(VISIT_DATE_MISSING);
  });
});

describe("visit corrections", () => {
  it("deletes or re-dates only a visit that isn't on an invoice", () => {
    expect(() => assertVisitDeletable({ invoiceId: null })).not.toThrow();
    expect(() => assertVisitDeletable({ invoiceId: "inv" })).toThrow(
      new NoteRuleError(VISIT_ON_INVOICE_DELETE),
    );
    expect(() => assertVisitRedatable({ invoiceId: null }, "2026-11-01", TODAY)).not.toThrow();
    expect(() => assertVisitRedatable({ invoiceId: "inv" }, "2026-11-01", TODAY)).toThrow(
      new NoteRuleError(VISIT_ON_INVOICE_DATE),
    );
    expect(() => assertVisitRedatable({ invoiceId: null }, "2026-12-01", TODAY)).toThrow(
      new NoteRuleError(VISIT_DATE_IN_FUTURE),
    );
  });
});

describe("readVisitDateInput", () => {
  it("reads a typed day, and says what to fix", () => {
    expect(readVisitDateInput("11 Nov 2026", TODAY)).toEqual({ ok: true, value: "2026-11-11" });
    expect(readVisitDateInput("2026-11-12", TODAY)).toEqual({ ok: true, value: "2026-11-12" });
    expect(readVisitDateInput("", TODAY)).toEqual({ ok: false, message: VISIT_DATE_MISSING });
    expect(readVisitDateInput("13 Nov 2026", TODAY)).toEqual({
      ok: false,
      message: VISIT_DATE_IN_FUTURE,
    });
    expect(readVisitDateInput("Tuesday", TODAY)).toEqual({
      ok: false,
      message: "Enter a date like 1 Apr 2026.",
    });
  });
});
