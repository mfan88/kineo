import { describe, expect, it } from "vitest";
import { visitOnDate } from "./lookup";

const v = (id: string, patientId: string, visitDate: string, createdAt: string) => ({
  id,
  patientId,
  visitDate,
  createdAt,
});

describe("visitOnDate", () => {
  const visits = [
    v("a", "p1", "2026-11-12", "2026-11-12T09:00:00Z"),
    v("b", "p1", "2026-11-12", "2026-11-12T15:00:00Z"),
    v("c", "p1", "2026-11-04", "2026-11-04T09:00:00Z"),
    v("d", "p2", "2026-11-12", "2026-11-12T10:00:00Z"),
  ];

  it("finds the patient's visit on that day", () => {
    expect(visitOnDate(visits, "p2", "2026-11-12")?.id).toBe("d");
  });

  it("takes the one created last when there are two that day", () => {
    expect(visitOnDate(visits, "p1", "2026-11-12")?.id).toBe("b");
  });

  it("is null when there's none that day, or for nobody", () => {
    expect(visitOnDate(visits, "p1", "2026-11-13")).toBeNull();
    expect(visitOnDate(visits, "p3", "2026-11-12")).toBeNull();
    expect(visitOnDate([], "p1", "2026-11-12")).toBeNull();
  });
});
