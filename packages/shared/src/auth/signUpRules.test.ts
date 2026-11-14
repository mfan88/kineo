import { describe, expect, it } from "vitest";
import {
  SIGN_UP_CONSENT_MISSING,
  SIGN_UP_EMAIL_INVALID,
  SIGN_UP_NAME_MISSING,
  signUpError,
  signUpProblems,
} from "./signUpRules";

const READY = { fullName: "Dana Example", email: "dana@example.com", agreed: true };

describe("signUpProblems", () => {
  it("is empty when the form is ready", () => {
    expect(signUpProblems(READY)).toEqual([]);
    expect(signUpProblems({ ...READY, email: "  dana@example.com " })).toEqual([]);
  });

  it("names each missing piece, in the order of the form", () => {
    expect(signUpProblems({ fullName: " ", email: "dana@", agreed: false })).toEqual([
      { field: "fullName", message: SIGN_UP_NAME_MISSING },
      { field: "email", message: SIGN_UP_EMAIL_INVALID },
      { field: "consent", message: SIGN_UP_CONSENT_MISSING },
    ]);
    expect(signUpProblems({ ...READY, email: "dana example.com" })).toEqual([
      { field: "email", message: SIGN_UP_EMAIL_INVALID },
    ]);
  });
});

describe("signUpError", () => {
  it("says to sign in when the email already has an account", () => {
    expect(signUpError({ code: "form_identifier_exists" })).toEqual({
      field: "email",
      message: "That email already has a Kineō account. Sign in instead.",
    });
  });

  it("puts a missing agreement under the checkbox", () => {
    expect(signUpError({ code: "form_param_missing__legal_accepted" })).toEqual({
      field: "consent",
      message: SIGN_UP_CONSENT_MISSING,
    });
  });

  it("reads code, rate limit and network errors as signing in does", () => {
    expect(signUpError({ code: "form_code_incorrect" })).toEqual({
      field: "code",
      message: "That code isn't right. Check the email and try again.",
    });
    expect(signUpError({ code: "too_many_requests" })).toEqual({
      field: "form",
      message: "Too many attempts. Wait a minute, then try again.",
    });
  });

  it("explains a sign-up that needs more than Kineō asks for", () => {
    expect(signUpError({ code: "sign_up_incomplete" })).toEqual({
      field: "form",
      message: "Your account couldn't be finished. Try again later, or email support@fenna.tech.",
    });
  });

  it("keeps Clerk's own message for anything else, or a plain one", () => {
    expect(signUpError({ code: "something_new", message: "Clerk says no." })).toEqual({
      field: "form",
      message: "Clerk says no.",
    });
    expect(signUpError({})).toEqual({
      field: "form",
      message: "Something went wrong creating your account. Try again.",
    });
  });
});
