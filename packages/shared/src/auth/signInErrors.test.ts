import { describe, expect, it } from "vitest";
import { signInError } from "./signInErrors";

describe("signInError", () => {
  it("puts an unknown email under the email field", () => {
    expect(
      signInError({ code: "form_identifier_not_found", message: "Couldn't find your account." }),
    ).toEqual({
      field: "email",
      message: "There's no Kineō account with that email. Check it for typos.",
    });
  });

  it("explains a wrong or expired code under the code field", () => {
    expect(signInError({ code: "form_code_incorrect" }).field).toBe("code");
    expect(signInError({ code: "verification_expired" }).message).toMatch(/Send a new code/);
    expect(signInError({ code: "verification_failed" }).field).toBe("code");
  });

  it("points to an email code when the password is wrong or leaked", () => {
    for (const code of [
      "form_password_incorrect",
      "form_password_pwned",
      "form_password_pwned__sign_in",
    ]) {
      const result = signInError({ code });
      expect(result.field).toBe("password");
      expect(result.message).toMatch(/email code/);
    }
  });

  it("treats a malformed email as an email problem", () => {
    expect(signInError({ code: "form_param_format_invalid__email_address" }).field).toBe("email");
  });

  it("says to check the connection when offline", () => {
    for (const code of ["clerk_offline", "network_error"]) {
      expect(signInError({ code })).toEqual({
        field: "form",
        message:
          "Couldn't reach the sign-in service. Check your internet connection and try again.",
      });
    }
  });

  it("keeps Clerk's message for codes it doesn't know", () => {
    expect(signInError({ code: "something_new", message: " Clerk says no. " })).toEqual({
      field: "form",
      message: "Clerk says no.",
    });
  });

  it("falls back to a general message when there's nothing to go on", () => {
    const fallback = { field: "form", message: "Something went wrong signing in. Try again." };
    expect(signInError({})).toEqual(fallback);
    expect(signInError({ code: "", message: "   " })).toEqual(fallback);
  });

  it("has no exclamation marks", () => {
    const codes = [
      "form_identifier_not_found",
      "form_code_incorrect",
      "too_many_requests",
      "network_error",
    ];
    for (const code of codes) expect(signInError({ code }).message).not.toContain("!");
  });
});
