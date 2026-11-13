import { describe, expect, it } from "vitest";
import { recentRows } from "./recentRows";

const patient = (id: string, fullName: string) => ({ id, fullName });
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

  it("leaves out patients with no visits, and respects the limit", () => {
    const visits = [visit("a", "2026-11-01"), visit("b", "2026-11-02")];
    expect(recentRows(patients, visits, "2026-11-12").map((r) => r.patient.id)).toEqual(["b", "a"]);
    expect(recentRows(patients, visits, "2026-11-12", 1)).toHaveLength(1);
  });

  it("is empty with nothing recorded", () => {
    expect(recentRows(patients, [], "2026-11-12")).toEqual([]);
  });
});
