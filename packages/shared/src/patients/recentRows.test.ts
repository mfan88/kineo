import { describe, expect, it } from "vitest";
import { recentRows } from "./recentRows";

const patient = (id: string, fullName: string, createdAt = "2026-01-01T12:00:00Z") => ({
  id,
  fullName,
  createdAt,
});
const visit = (patientId: string, visitDate: string) => ({
  patientId,
  visitDate,
  createdAt: `${visitDate}T09:00:00Z`,
});

describe("recentRows", () => {
  const patients = [
    patient("a", "Ada Example"),
    patient("b", "Ben Example"),
    patient("c", "Cy Example"),
  ];

  it("lists the newest first with when each was last seen", () => {
    const rows = recentRows(
      patients,
      [
        visit("a", "2026-10-29"),
        visit("b", "2026-11-04"),
        visit("b", "2026-10-01"),
        visit("c", "2026-11-12"),
      ],
      "2026-11-12",
    );
    expect(rows.map((row) => [row.patient.fullName, row.lastVisit])).toEqual([
      ["Cy Example", "Last visit today"],
      ["Ben Example", "Last visit 4 Nov"],
      ["Ada Example", "Last visit 29 Oct"],
    ]);
  });

  it("respects the limit", () => {
    const visits = [visit("a", "2026-11-01"), visit("b", "2026-11-02"), visit("c", "2026-11-03")];
    expect(recentRows(patients, visits, "2026-11-12", 2).map((r) => r.patient.id)).toEqual([
      "c",
      "b",
    ]);
    expect(recentRows(patients, visits, "2026-11-12", 0)).toEqual([]);
  });

  it("includes patients with no visits, saying so", () => {
    const rows = recentRows(
      [patient("n", "New Example", "2026-11-10T12:00:00Z")],
      [],
      "2026-11-12",
    );
    expect(rows.map((r) => [r.patient.id, r.lastVisit])).toEqual([["n", "No visits yet"]]);
  });

  it("ranks new patients by when they were added among last visits", () => {
    const all = [
      ...patients,
      patient("n", "New Example", "2026-11-05T12:00:00Z"),
      patient("o", "Old Example", "2026-01-01T12:00:00Z"),
    ];
    const visits = [visit("a", "2026-10-29"), visit("b", "2026-11-04"), visit("c", "2026-11-12")];
    expect(recentRows(all, visits, "2026-11-12", 10).map((r) => r.patient.id)).toEqual([
      "c",
      "n",
      "b",
      "a",
      "o",
    ]);
    expect(recentRows(all, visits, "2026-11-12", 3).map((r) => r.patient.id)).toEqual([
      "c",
      "n",
      "b",
    ]);
  });

  it("lists no one when there are no patients", () => {
    expect(recentRows([], [], "2026-11-12")).toEqual([]);
  });
});
