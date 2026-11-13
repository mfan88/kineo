import { describe, expect, it } from "vitest";
import { notYetOnServerCopy } from "./offline";

describe("notYetOnServerCopy", () => {
  it("names the phone", () => {
    expect(notYetOnServerCopy("phone")).toEqual({
      title: "New invoice",
      status: "Offline · saved on this phone",
      numberLabel: "Number",
      numberValue: "Given when you're online",
      explanation:
        "Waiting to reach the server before you can send. Your invoice is safe on this phone.",
    });
  });

  it("names the computer", () => {
    const copy = notYetOnServerCopy("computer");
    expect(copy.status).toBe("Offline · saved on this computer");
    expect(copy.explanation).toContain("safe on this computer");
  });
});
