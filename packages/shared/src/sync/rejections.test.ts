import { describe, expect, it } from "vitest";
import { uploadRejectionMessage } from "./rejections";

describe("uploadRejectionMessage", () => {
  it("shows Kineō's own lock messages as they are", () => {
    expect(
      uploadRejectionMessage({
        table: "visits",
        operation: "PATCH",
        status: 400,
        code: "23514",
        message: "Visits can't be added once an invoice is sent.",
      }),
    ).toBe("Visits can't be added once an invoice is sent. That change was undone.");
  });

  it("shows every server lock message as it is", () => {
    for (const message of [
      "Line items can't be changed once an invoice is sent.",
      "Tax can't be changed once an invoice is sent.",
      "A sent invoice can't go back to draft.",
      "An invoice has to be sent before it can be marked paid.",
      "Notes can't be changed once an invoice is paid.",
    ]) {
      expect(
        uploadRejectionMessage({
          table: "invoices",
          operation: "PATCH",
          status: 400,
          code: "23514",
          message,
        }),
      ).toBe(`${message} That change was undone.`);
    }
  });

  it("never shows Postgres's own constraint text", () => {
    const text = uploadRejectionMessage({
      table: "invoices",
      operation: "PUT",
      status: 400,
      code: "23514",
      message:
        'new row for relation "invoices" violates check constraint "invoices_dates_match_status"',
    });
    expect(text).toBe(
      "The server didn't accept a change to an invoice, so it was undone. Check it and try again.",
    );
  });

  it("uses a general message for other refusals, naming what changed", () => {
    expect(
      uploadRejectionMessage({ table: "patients", operation: "PUT", status: 403, code: "42501" }),
    ).toMatch(/to a patient,/);
    expect(uploadRejectionMessage({ table: "visits", operation: "DELETE", status: 409 })).toMatch(
      /to a visit note,/,
    );
    expect(uploadRejectionMessage({ table: "unknown", operation: "PUT", status: 0 })).toMatch(
      /to a change,/,
    );
  });

  it("falls back when a trigger-style refusal has no message", () => {
    expect(
      uploadRejectionMessage({
        table: "visits",
        operation: "PATCH",
        status: 400,
        code: "23514",
        message: "  ",
      }),
    ).toMatch(/to a visit note/);
  });

  it("has no exclamation marks", () => {
    expect(
      uploadRejectionMessage({ table: "invoices", operation: "PUT", status: 400 }),
    ).not.toContain("!");
  });
});
