import { describe, expect, it } from "vitest";
import { homeGroups, readyToInvoice } from "../src/index";

// Made-up IDs and dates only.
const patientA = "aaaaaaaa-0000-4000-8000-000000000001";
const patientB = "bbbbbbbb-0000-4000-8000-000000000002";
const invoiceId = "cccccccc-0000-4000-8000-000000000003";

const visit = (id: string, patientId: string, visitDate: string, onInvoice = false) => ({
  id,
  patientId,
  visitDate,
  invoiceId: onInvoice ? invoiceId : null,
});

const invoice = (
  id: string,
  status: "draft" | "sent" | "paid",
  createdAt: string,
  sentAt: string | null = null,
) => ({ id, status, createdAt, sentAt });

describe("readyToInvoice", () => {
  it("is empty with no visits or when every visit is invoiced", () => {
    expect(readyToInvoice([])).toEqual([]);
    expect(readyToInvoice([visit("v1", patientA, "2026-11-01", true)])).toEqual([]);
  });

  it("groups uninvoiced visits by patient, oldest visit first", () => {
    const visits = [
      visit("v3", patientA, "2026-11-08"),
      visit("v1", patientA, "2026-11-01"),
      visit("v2", patientA, "2026-11-04", true),
    ];
    expect(readyToInvoice(visits)).toEqual([
      {
        patientId: patientA,
        visitIds: ["v1", "v3"],
        oldestVisitDate: "2026-11-01",
        latestVisitDate: "2026-11-08",
      },
    ]);
  });

  it("puts the patient waiting longest first", () => {
    const visits = [
      visit("v1", patientA, "2026-11-05"),
      visit("v2", patientB, "2026-11-02"),
      visit("v3", patientB, "2026-11-09"),
    ];
    expect(readyToInvoice(visits).map((group) => group.patientId)).toEqual([patientB, patientA]);
  });

  it("orders ties by ID so the list is stable", () => {
    const visits = [visit("v2", patientB, "2026-11-01"), visit("v1", patientA, "2026-11-01")];
    expect(readyToInvoice(visits).map((group) => group.patientId)).toEqual([patientA, patientB]);
    const sameDay = [visit("v2", patientA, "2026-11-01"), visit("v1", patientA, "2026-11-01")];
    expect(readyToInvoice(sameDay)[0]?.visitIds).toEqual(["v1", "v2"]);
  });

  it("doesn't change the list passed in", () => {
    const visits = [visit("v2", patientA, "2026-11-08"), visit("v1", patientA, "2026-11-01")];
    readyToInvoice(visits);
    expect(visits.map((v) => v.id)).toEqual(["v2", "v1"]);
  });
});

describe("homeGroups", () => {
  it("is all caught up with nothing to do", () => {
    expect(homeGroups([], [])).toEqual({
      readyToInvoice: [],
      notSentYet: [],
      waitingOnPayment: [],
      allCaughtUp: true,
    });
  });

  it("is all caught up when everything is invoiced and paid", () => {
    const groups = homeGroups(
      [visit("v1", patientA, "2026-11-01", true)],
      [invoice("i1", "paid", "2026-11-01T09:00:00Z", "2026-11-02T09:00:00Z")],
    );
    expect(groups.allCaughtUp).toBe(true);
  });

  it("puts drafts in Not sent yet, oldest first", () => {
    const newer = invoice("i2", "draft", "2026-11-05T09:00:00Z");
    const older = invoice("i1", "draft", "2026-11-01T09:00:00Z");
    const groups = homeGroups([], [newer, older]);
    expect(groups.notSentYet).toEqual([older, newer]);
    expect(groups.waitingOnPayment).toEqual([]);
    expect(groups.allCaughtUp).toBe(false);
  });

  it("puts sent invoices in Waiting on payment, sent longest ago first", () => {
    const recent = invoice("i1", "sent", "2026-11-01T09:00:00Z", "2026-11-09T09:00:00Z");
    const early = invoice("i2", "sent", "2026-11-03T09:00:00Z", "2026-11-04T09:00:00Z");
    expect(homeGroups([], [recent, early]).waitingOnPayment).toEqual([early, recent]);
  });

  it("compares times by instant across UTC offsets", () => {
    // 10:00-08:00 is 18:00Z, later than 12:00Z.
    const pacific = invoice("i1", "draft", "2026-11-01T10:00:00-08:00");
    const utc = invoice("i2", "draft", "2026-11-01T12:00:00Z");
    expect(homeGroups([], [pacific, utc]).notSentYet).toEqual([utc, pacific]);
  });

  it("leaves paid invoices out and fills all three groups", () => {
    const draft = invoice("i1", "draft", "2026-11-01T09:00:00Z");
    const sent = invoice("i2", "sent", "2026-11-01T09:00:00Z", "2026-11-02T09:00:00Z");
    const paid = invoice("i3", "paid", "2026-11-01T09:00:00Z", "2026-11-02T09:00:00Z");
    const groups = homeGroups([visit("v1", patientA, "2026-11-10")], [paid, sent, draft]);
    expect(groups.readyToInvoice.map((g) => g.patientId)).toEqual([patientA]);
    expect(groups.notSentYet).toEqual([draft]);
    expect(groups.waitingOnPayment).toEqual([sent]);
    expect(groups.allCaughtUp).toBe(false);
  });

  it("returns the same invoice objects it was given", () => {
    const draft = { ...invoice("i1", "draft" as const, "2026-11-01T09:00:00Z"), number: 7 };
    expect(homeGroups([], [draft]).notSentYet[0]).toBe(draft);
  });
});
