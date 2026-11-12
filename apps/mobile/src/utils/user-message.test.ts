import { WriteError } from "@kineo/data";
import { InvoiceRuleError, NoteRuleError } from "@kineo/shared";
import { describe, expect, it } from "vitest";
import { userMessage } from "./user-message";

describe("userMessage", () => {
  it("passes on the message of a refused change", () => {
    expect(userMessage(new WriteError("Add the patient's full name."))).toBe(
      "Add the patient's full name.",
    );
    expect(userMessage(new NoteRuleError("Locked."))).toBe("Locked.");
    expect(userMessage(new InvoiceRuleError("Sent."))).toBe("Sent.");
  });

  it("gives nothing for any other error, which may hold details", () => {
    expect(userMessage(new Error("SQLITE_FULL: row for Jordan Sample"))).toBeNull();
    expect(userMessage("oops")).toBeNull();
    expect(userMessage(null)).toBeNull();
  });
});
