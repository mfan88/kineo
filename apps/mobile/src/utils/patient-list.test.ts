import { describe, expect, it } from "vitest";
import { patientList } from "./patient-list";

const PATIENTS = [
  { id: "3", fullName: "Riley Example" },
  { id: "1", fullName: "alex Sample" },
  { id: "2", fullName: "Édith Test" },
  { id: "4", fullName: "Riley Example" },
];

describe("patientList", () => {
  it("lists everyone A–Z when nothing is typed, ignoring case and accents", () => {
    for (const query of ["", "   "]) {
      expect(patientList(PATIENTS, query).map((p) => p.id)).toEqual(["1", "2", "3", "4"]);
    }
  });

  it("leaves the original list as it was", () => {
    const before = PATIENTS.map((p) => p.id);
    patientList(PATIENTS, "");
    expect(PATIENTS.map((p) => p.id)).toEqual(before);
  });

  it("shows only matches once something is typed", () => {
    expect(patientList(PATIENTS, "ril").map((p) => p.id)).toEqual(["3", "4"]);
    expect(patientList(PATIENTS, "edith").map((p) => p.id)).toEqual(["2"]);
    expect(patientList(PATIENTS, "nobody")).toEqual([]);
  });

  it("is empty for an empty practice", () => {
    expect(patientList([], "")).toEqual([]);
    expect(patientList([], "a")).toEqual([]);
  });
});
