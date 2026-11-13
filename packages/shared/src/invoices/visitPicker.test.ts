import { describe, expect, it } from "vitest";
import { continueLabel, pickedVisitIds, readyPatients, uninvoicedVisitsFor } from "./visitPicker";

// Made-up test data only.
const visit = (
  id: string,
  patientId: string,
  visitDate: string,
  invoiceId: string | null = null,
  createdAt = `${visitDate}T09:00:00Z`,
) => ({ id, patientId, visitDate, invoiceId, createdAt });

describe("uninvoicedVisitsFor", () => {
  it("is empty with no visits", () => {
    expect(uninvoicedVisitsFor([], "p1")).toEqual([]);
  });

  it("keeps only this patient's visits not on an invoice, newest first", () => {
    const visits = [
      visit("v1", "p1", "2026-11-04"),
      visit("v2", "p1", "2026-11-12"),
      visit("v3", "p1", "2026-10-28", "i1"),
      visit("v4", "p2", "2026-11-10"),
      visit("v5", "p1", "2026-11-08"),
    ];
    expect(uninvoicedVisitsFor(visits, "p1").map((v) => v.id)).toEqual(["v2", "v5", "v1"]);
  });

  it("puts the later-created visit first on the same day", () => {
    const visits = [
      visit("a", "p1", "2026-11-12", null, "2026-11-12T09:00:00Z"),
      visit("b", "p1", "2026-11-12", null, "2026-11-12T15:30:00Z"),
    ];
    expect(uninvoicedVisitsFor(visits, "p1").map((v) => v.id)).toEqual(["b", "a"]);
  });

  it("compares created times as instants, whatever their offset", () => {
    const visits = [
      // 17:00 UTC, created after b's 16:00 UTC, though its text sorts first.
      visit("a", "p1", "2026-11-12", null, "2026-11-12T09:00:00-08:00"),
      visit("b", "p1", "2026-11-12", null, "2026-11-12T16:00:00Z"),
    ];
    expect(uninvoicedVisitsFor(visits, "p1").map((v) => v.id)).toEqual(["a", "b"]);
  });

  it("is empty when every visit is invoiced", () => {
    const visits = [visit("v1", "p1", "2026-11-04", "i1")];
    expect(uninvoicedVisitsFor(visits, "p1")).toEqual([]);
  });

  it("doesn't change the visits passed in", () => {
    const visits = [visit("v1", "p1", "2026-11-04"), visit("v2", "p1", "2026-11-12")];
    const copy = structuredClone(visits);
    uninvoicedVisitsFor(visits, "p1");
    expect(visits).toEqual(copy);
  });
});

describe("pickedVisitIds", () => {
  const offered = [{ id: "v1" }, { id: "v2" }, { id: "v3" }];

  it("ticks every visit to start with", () => {
    expect(pickedVisitIds(offered, new Set())).toEqual(["v1", "v2", "v3"]);
  });

  it("leaves out unticked visits and keeps the order", () => {
    expect(pickedVisitIds(offered, new Set(["v2"]))).toEqual(["v1", "v3"]);
  });

  it("is empty when everything is unticked", () => {
    expect(pickedVisitIds(offered, new Set(["v1", "v2", "v3"]))).toEqual([]);
  });

  it("ignores unticked visits that are no longer offered", () => {
    expect(pickedVisitIds(offered, new Set(["gone"]))).toEqual(["v1", "v2", "v3"]);
  });
});

describe("continueLabel", () => {
  it("counts the visits", () => {
    expect(continueLabel(2)).toBe("Continue with 2 visits");
    expect(continueLabel(1)).toBe("Continue with 1 visit");
  });

  it("says just Continue with none picked", () => {
    expect(continueLabel(0)).toBe("Continue");
    expect(continueLabel(-1)).toBe("Continue");
  });
});

describe("readyPatients", () => {
  const patients = [
    { id: "p1", fullName: "Jordan Sample" },
    { id: "p2", fullName: "Riley Placeholder" },
    { id: "p3", fullName: "Casey Fictional" },
  ];

  it("is empty with nothing to invoice", () => {
    expect(readyPatients(patients, [])).toEqual([]);
    expect(readyPatients(patients, [visit("v1", "p1", "2026-11-01", "i1")])).toEqual([]);
  });

  it("lists patients with visits waiting, the one waiting longest first", () => {
    const visits = [
      visit("v1", "p1", "2026-11-10"),
      visit("v2", "p2", "2026-11-02"),
      visit("v3", "p2", "2026-11-09"),
      visit("v4", "p3", "2026-10-30", "i1"),
    ];
    expect(readyPatients(patients, visits)).toEqual([
      { patient: patients[1], visitCount: 2, oldestVisitDate: "2026-11-02" },
      { patient: patients[0], visitCount: 1, oldestVisitDate: "2026-11-10" },
    ]);
  });

  it("leaves out visits of a patient it can't find", () => {
    const visits = [visit("v1", "missing", "2026-11-01"), visit("v2", "p1", "2026-11-05")];
    expect(readyPatients(patients, visits).map((row) => row.patient.id)).toEqual(["p1"]);
  });
});
