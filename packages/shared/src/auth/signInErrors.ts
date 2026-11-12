/** Which part of the sign-in form an error belongs under. */
export type SignInErrorField = "email" | "password" | "code" | "form";

export interface SignInError {
  field: SignInErrorField;
  message: string;
}

/** What Clerk reports: a machine code, and its own (English) message. */
export interface ClerkErrorLike {
  code?: string | undefined;
  message?: string | undefined;
}

const KNOWN: Record<string, SignInError> = {
  form_identifier_not_found: {
    field: "email",
    message: "There's no Kineō account with that email. Check it for typos.",
  },
  form_param_format_invalid: {
    field: "email",
    message: "Enter your email address, like name@example.com.",
  },
  form_param_format_invalid__email_address: {
    field: "email",
    message: "Enter your email address, like name@example.com.",
  },
  form_password_incorrect: {
    field: "password",
    message: "That password isn't right. Try again, or sign in with an email code instead.",
  },
  form_password_pwned: {
    field: "password",
    message:
      "This password has appeared in a data breach elsewhere, so it can't be used. Sign in with an email code instead.",
  },
  form_password_pwned__sign_in: {
    field: "password",
    message:
      "This password has appeared in a data breach elsewhere, so it can't be used. Sign in with an email code instead.",
  },
  form_code_incorrect: {
    field: "code",
    message: "That code isn't right. Check the email and try again.",
  },
  verification_expired: {
    field: "code",
    message: "That code has expired. Send a new code and try again.",
  },
  verification_failed: {
    field: "code",
    message: "Too many tries with that code. Send a new code and try again.",
  },
  too_many_requests: {
    field: "form",
    message: "Too many attempts. Wait a minute, then try again.",
  },
  clerk_offline: {
    field: "form",
    message: "Couldn't reach the sign-in service. Check your internet connection and try again.",
  },
  network_error: {
    field: "form",
    message: "Couldn't reach the sign-in service. Check your internet connection and try again.",
  },
};

/**
 * Turns a Clerk sign-in error into plain wording that says what to do, and the
 * field it belongs under. Unknown errors keep Clerk's own message.
 */
export function signInError(error: ClerkErrorLike): SignInError {
  const known = error.code ? KNOWN[error.code] : undefined;
  if (known) return known;
  const message = error.message?.trim();
  return {
    field: "form",
    message: message ? message : "Something went wrong signing in. Try again.",
  };
}
