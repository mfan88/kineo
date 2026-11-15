import type { SignInError } from "./signInErrors";

/** The parts of Clerk's sign-in that say what it still needs once a step has gone through. */
export interface SignInProgress {
  status?: string | null | undefined;
  supportedSecondFactors?: readonly { strategy: string }[] | null | undefined;
}

/**
 * What to do after a sign-in step went through without opening a session:
 * - `none`: nothing more to do here (the screen moves on by itself, e.g. after sending a code).
 * - `email_code`: Clerk wants a code by email to check a new device or as a second
 *   factor. Send it with `signIn.mfa.sendEmailCode()` and ask for the code.
 * - `error`: a step Kineō can't do; show the message.
 */
export type SignInNextStep =
  { kind: "none" } | { kind: "email_code" } | { kind: "error"; error: SignInError };

const NEW_PASSWORD: SignInError = {
  field: "form",
  message: "This account needs a new password. Sign in with an email code instead.",
};

const UNSUPPORTED_STEP: SignInError = {
  field: "form",
  message:
    "This account needs an extra sign-in step that Kineō doesn't support yet. Try signing in with an email code instead.",
};

export function signInNextStep(signIn: SignInProgress | null | undefined): SignInNextStep {
  switch (signIn?.status) {
    case "needs_client_trust":
    case "needs_second_factor":
      return signIn.supportedSecondFactors?.some((factor) => factor.strategy === "email_code")
        ? { kind: "email_code" }
        : { kind: "error", error: UNSUPPORTED_STEP };
    case "needs_new_password":
      return { kind: "error", error: NEW_PASSWORD };
    case "needs_protect_check":
      return { kind: "error", error: UNSUPPORTED_STEP };
    default:
      // Not started, still on the first factor (a code was just sent), or complete.
      return { kind: "none" };
  }
}
