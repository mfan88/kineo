import { describe, expect, it } from "vitest";
import { signInNextStep } from "./signInNextStep";

const email = [{ strategy: "email_code" }];
const totp = [{ strategy: "totp" }];

describe("signInNextStep", () => {
  it("asks for an email code to check a new device", () => {
    expect(signInNextStep({ status: "needs_client_trust", supportedSecondFactors: email })).toEqual(
      { kind: "email_code" },
    );
  });

  it("asks for an email code when it's the second factor on offer", () => {
    expect(
      signInNextStep({
        status: "needs_second_factor",
        supportedSecondFactors: [...totp, ...email],
      }),
    ).toEqual({ kind: "email_code" });
  });

  it("says the step isn't supported when no email code is on offer", () => {
    for (const status of ["needs_client_trust", "needs_second_factor"]) {
      for (const supportedSecondFactors of [totp, null, undefined]) {
        expect(signInNextStep({ status, supportedSecondFactors })).toEqual({
          kind: "error",
          error: { field: "form", message: expect.stringMatching(/doesn't support yet/) },
        });
      }
    }
  });

  it("points to an email code when the account needs a new password", () => {
    expect(signInNextStep({ status: "needs_new_password" })).toEqual({
      kind: "error",
      error: {
        field: "form",
        message: "This account needs a new password. Sign in with an email code instead.",
      },
    });
  });

  it("says a Protect check isn't supported", () => {
    expect(signInNextStep({ status: "needs_protect_check" }).kind).toBe("error");
  });

  it("does nothing more while on the first factor, when complete, or without a sign-in", () => {
    for (const status of ["needs_first_factor", "needs_identifier", "complete", null, undefined]) {
      expect(signInNextStep({ status })).toEqual({ kind: "none" });
    }
    expect(signInNextStep(null)).toEqual({ kind: "none" });
    expect(signInNextStep(undefined)).toEqual({ kind: "none" });
  });
});
