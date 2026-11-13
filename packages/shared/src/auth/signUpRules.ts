import { signInError, type ClerkErrorLike } from "./signInErrors";

/** What the sign-up form asks for before the emailed code. */
export interface SignUpDraft {
  fullName: string;
  email: string;
  /** Ticked "I agree to the Terms and Privacy policy". */
  agreed: boolean;
}

/** Which part of the sign-up form an error belongs under. */
export type SignUpErrorField = "fullName" | "email" | "consent" | "code" | "form";

export interface SignUpError {
  field: SignUpErrorField;
  message: string;
}

export const SIGN_UP_NAME_MISSING = "Add your full name. It goes on your invoices.";
export const SIGN_UP_EMAIL_INVALID = "Enter your email address, like name@example.com.";
export const SIGN_UP_CONSENT_MISSING =
  "Agree to the Terms and Privacy policy to create an account.";

/** Enough to catch typos; Clerk checks the address properly when it sends the code. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** What's wrong with the sign-up form, in the order the fields appear. Empty when it's ready. */
export function signUpProblems(draft: SignUpDraft): SignUpError[] {
  const problems: SignUpError[] = [];
  if (draft.fullName.trim() === "") {
    problems.push({ field: "fullName", message: SIGN_UP_NAME_MISSING });
  }
  if (!EMAIL.test(draft.email.trim())) {
    problems.push({ field: "email", message: SIGN_UP_EMAIL_INVALID });
  }
  if (!draft.agreed) {
    problems.push({ field: "consent", message: SIGN_UP_CONSENT_MISSING });
  }
  return problems;
}

const KNOWN: Record<string, SignUpError> = {
  form_identifier_exists: {
    field: "email",
    message: "That email already has a Kineō account. Sign in instead.",
  },
  form_identifier_exists__email_address: {
    field: "email",
    message: "That email already has a Kineō account. Sign in instead.",
  },
  form_param_format_invalid__email_address: { field: "email", message: SIGN_UP_EMAIL_INVALID },
  form_param_missing__legal_accepted: { field: "consent", message: SIGN_UP_CONSENT_MISSING },
  legal_accepted_required: { field: "consent", message: SIGN_UP_CONSENT_MISSING },
  // Kineō's own: Clerk wants more than this form collects (its settings need fixing).
  sign_up_incomplete: {
    field: "form",
    message: "Your account couldn't be finished. Try again later, or contact support.",
  },
};

/** Errors that read the same as when signing in: the emailed code, rate limits, network. */
const SAME_AS_SIGN_IN = new Set([
  "form_code_incorrect",
  "verification_expired",
  "verification_failed",
  "too_many_requests",
  "clerk_offline",
  "network_error",
]);

/**
 * Turns a Clerk sign-up error into plain wording that says what to do, and the field
 * it belongs under. Unknown errors keep Clerk's own message.
 */
export function signUpError(error: ClerkErrorLike): SignUpError {
  const known = error.code ? KNOWN[error.code] : undefined;
  if (known) return known;
  if (error.code && SAME_AS_SIGN_IN.has(error.code)) {
    const { field, message } = signInError(error);
    return { field: field === "code" ? "code" : "form", message };
  }
  const message = error.message?.trim();
  return {
    field: "form",
    message: message ? message : "Something went wrong creating your account. Try again.",
  };
}
