import type { PracticeData } from "@kineo/data";
import { createDemoPractice } from "@kineo/data/demo";
import { describe, expect, it } from "vitest";
import { formatVisitDate, homeSummary } from "./home-summary";

function emptyPractice(): PracticeData {
  return { ...createDemoPractice(), patients: [], visits: [], invoices: [], lineItems: [] };
}

describe("formatVisitDate", () => {
  it("formats a calendar date without shifting it by time zone", () => {
    expect(formatVisitDate("2026-11-03")).toBe("Nov 3");
    expect(formatVisitDate("2026-01-01")).toBe("Jan 1");
  });
});

describe("homeSummary", () => {
  it("words the demo practice's groups as desktop does", () => {
    const summary = homeSummary(createDemoPractice());
    expect(summary.allCaughtUp).toBe(false);
    expect(summary.readyToInvoice.map((row) => [row.title, row.detail])).toEqual([
      ["Jordan Sample", "2 visits · Oct 28 – Nov 4"],
      ["Riley Placeholder", "1 visit · Nov 6"],
    ]);
    expect(summary.notSentYet).toEqual([
      expect.objectContaining({
        title: "Casey Fictional",
        detail: "INV-0003 · Draft",
        amount: "$120.00",
      }),
    ]);
    expect(summary.waitingOnPayment[0]).toMatchObject({ title: "Morgan Testcase" });
    expect(summary.waitingOnPayment[0]?.detail).toMatch(/^INV-0002 · Sent [A-Z][a-z]{2} \d{1,2}$/);
    expect(summary.readyToInvoice.every((row) => row.amount === null)).toBe(true);
  });

  it("lists recent patients", () => {
    expect(homeSummary(createDemoPractice()).recentPatients.length).toBeGreaterThan(0);
  });

  it("is all caught up with nothing to do", () => {
    const summary = homeSummary(emptyPractice());
    expect(summary).toMatchObject({
      allCaughtUp: true,
      readyToInvoice: [],
      notSentYet: [],
      waitingOnPayment: [],
      recentPatients: [],
    });
  });

  it("names a patient it can't find rather than failing", () => {
    const practice = createDemoPractice();
    const invoice = practice.invoices.find((candidate) => candidate.status === "draft");
    const summary = homeSummary({
      ...practice,
      patients: practice.patients.filter((patient) => patient.id !== invoice?.patientId),
    });
    expect(summary.notSentYet[0]?.title).toBe("Unknown patient");
  });

  it("shows a draft with no lines as $0.00", () => {
    const practice = createDemoPractice();
    const draft = practice.invoices.find((invoice) => invoice.status === "draft");
    const summary = homeSummary({
      ...practice,
      lineItems: practice.lineItems.filter((line) => line.invoiceId !== draft?.id),
    });
    expect(summary.notSentYet[0]?.amount).toBe("$0.00");
  });
});
