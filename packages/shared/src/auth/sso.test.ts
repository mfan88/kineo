import { describe, expect, it } from "vitest";
import { fullNameFrom, ssoOutcome, type SsoAttempt } from "./sso";

const attempt = (changes: Partial<SsoAttempt>): SsoAttempt => ({
  browserResult: "success",
  createdSessionId: null,
  usedExistingSession: false,
  signUpStatus: null,
  signUpMissingFields: [],
  ...changes,
});

describe("ssoOutcome", () => {
  it("is signed in with a new session, or one already open", () => {
    expect(ssoOutcome(attempt({ createdSessionId: "sess_1" }))).toBe("signed-in");
    expect(ssoOutcome(attempt({ usedExistingSession: true }))).toBe("signed-in");
  });

  it("is cancelled when the browser was closed", () => {
    expect(ssoOutcome(attempt({ browserResult: "cancel" }))).toBe("cancelled");
    expect(ssoOutcome(attempt({ browserResult: "dismiss" }))).toBe("cancelled");
  });

  it("waits for the agreement when that's all a new account is missing", () => {
    expect(
      ssoOutcome(
        attempt({ signUpStatus: "missing_requirements", signUpMissingFields: ["legal_accepted"] }),
      ),
    ).toBe("needs-terms");
  });

  it("is incomplete when Clerk wants anything more, or nothing happened", () => {
    expect(
      ssoOutcome(
        attempt({
          signUpStatus: "missing_requirements",
          signUpMissingFields: ["legal_accepted", "password"],
        }),
      ),
    ).toBe("incomplete");
    expect(ssoOutcome(attempt({ signUpStatus: "missing_requirements" }))).toBe("incomplete");
    expect(ssoOutcome(attempt({ browserResult: null }))).toBe("incomplete");
  });
});

describe("fullNameFrom", () => {
  it("joins the names that are there", () => {
    expect(fullNameFrom(" Dana ", "Example")).toBe("Dana Example");
    expect(fullNameFrom("Dana", null)).toBe("Dana");
    expect(fullNameFrom(null, " ")).toBe("");
  });
});
