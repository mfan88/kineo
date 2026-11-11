import { describe, expect, it } from "vitest";
import { lastVisit, recentPatients, searchPatients } from "../src/index";

// Made-up names only.
const alex = { id: "p1", fullName: "Alex Example" };
const jose = { id: "p2", fullName: "José Sample" };
const sam = { id: "p3", fullName: "Sam Alexander" };
const riley = { id: "p4", fullName: "Riley Placeholder" };
const patients = [riley, sam, jose, alex];

describe("searchPatients", () => {
  it("returns nothing for an empty or blank search", () => {
    expect(searchPatients(patients, "")).toEqual([]);
    expect(searchPatients(patients, "   ")).toEqual([]);
  });

  it("returns nothing when there are no patients", () => {
    expect(searchPatients([], "alex")).toEqual([]);
  });

  it("matches the start of any word, ignoring case", () => {
    expect(searchPatients(patients, "ALEX")).toEqual([alex, sam]);
    expect(searchPatients(patients, "place")).toEqual([riley]);
  });

  it("doesn't match the middle of a word", () => {
    expect(searchPatients(patients, "xample")).toEqual([]);
  });

  it("puts names starting with the search first, then A–Z", () => {
    expect(searchPatients(patients, "a").map((p) => p.id)).toEqual(["p1", "p3"]);
    expect(searchPatients(patients, "s").map((p) => p.id)).toEqual(["p3", "p2"]);
  });

  it("needs every word typed to match", () => {
    expect(searchPatients(patients, "al ex")).toEqual([alex]);
    expect(searchPatients(patients, "alex sam")).toEqual([sam]);
    expect(searchPatients(patients, "alex nobody")).toEqual([]);
  });

  it("ignores accents both ways", () => {
    expect(searchPatients(patients, "jose")).toEqual([jose]);
    expect(searchPatients([{ id: "p5", fullName: "Jose Plain" }], "josé")).toHaveLength(1);
  });

  it("doesn't change the list passed in", () => {
    const list = [sam, alex];
    searchPatients(list, "alex");
    expect(list).toEqual([sam, alex]);
  });
});

describe("recentPatients", () => {
  const visits = [
    { patientId: "p1", visitDate: "2026-11-01" },
    { patientId: "p2", visitDate: "2026-11-09" },
    { patientId: "p1", visitDate: "2026-11-10" },
    { patientId: "p3", visitDate: "2026-11-05" },
  ];

  it("lists patients by their latest visit, newest first", () => {
    expect(recentPatients(patients, visits).map((p) => p.id)).toEqual(["p1", "p2", "p3"]);
  });

  it("leaves out patients with no visits", () => {
    expect(recentPatients(patients, visits)).not.toContain(riley);
    expect(recentPatients(patients, [])).toEqual([]);
  });

  it("stops at the limit", () => {
    expect(recentPatients(patients, visits, 2).map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(recentPatients(patients, visits, 0)).toEqual([]);
  });

  it("orders patients seen the same day A–Z", () => {
    const sameDay = [
      { patientId: "p3", visitDate: "2026-11-10" },
      { patientId: "p1", visitDate: "2026-11-10" },
    ];
    expect(recentPatients(patients, sameDay).map((p) => p.id)).toEqual(["p1", "p3"]);
  });

  it("ignores visits for patients not in the list", () => {
    expect(recentPatients([alex], [{ patientId: "gone", visitDate: "2026-11-11" }])).toEqual([]);
  });

  it("rejects a negative or fractional limit", () => {
    expect(() => recentPatients(patients, visits, -1)).toThrow(RangeError);
    expect(() => recentPatients(patients, visits, 1.5)).toThrow(RangeError);
  });
});

const v = (id: string, patientId: string, visitDate: string, createdAt: string) => ({
  id,
  patientId,
  visitDate,
  createdAt,
});

describe("lastVisit", () => {
  it("is null for a patient with no visits", () => {
    expect(lastVisit([], "p1")).toBeNull();
    expect(lastVisit([v("a", "p2", "2026-11-01", "2026-11-01T10:00:00Z")], "p1")).toBeNull();
  });

  it("picks the latest visit date", () => {
    const visits = [
      v("a", "p1", "2026-11-04", "2026-11-04T10:00:00Z"),
      v("b", "p1", "2026-11-10", "2026-11-01T10:00:00Z"),
      v("c", "p2", "2026-11-12", "2026-11-12T10:00:00Z"),
    ];
    expect(lastVisit(visits, "p1")?.id).toBe("b");
  });

  it("breaks a same-day tie by when the visit was created", () => {
    const visits = [
      v("late", "p1", "2026-11-10", "2026-11-10T17:00:00-08:00"),
      v("early", "p1", "2026-11-10", "2026-11-10T20:00:00Z"),
    ];
    expect(lastVisit(visits, "p1")?.id).toBe("late");
  });
});
