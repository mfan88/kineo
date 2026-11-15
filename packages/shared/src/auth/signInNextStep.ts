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

const UNSUPPORTED_SECOND_FACTOR: SignInError = {
  field: "form",
  message:
    "This account needs a second sign-in step that Kineō doesn't support yet, like an authenticator app. Turn that step off for this account, then try again.",
};

/**
 * For a step that should have opened a session (checking a password or a code) but
 * didn't, and Clerk asked for nothing Kineō can do, so the screen never stays silent.
 */
export const SIGN_IN_UNFINISHED: SignInError = {
  field: "form",
  message: "Couldn't finish signing in. Try again, or sign in with an email code instead.",
};

export function signInNextStep(signIn: SignInProgress | null | undefined): SignInNextStep {
  switch (signIn?.status) {
    case "needs_client_trust":
    case "needs_second_factor":
      if (signIn.supportedSecondFactors?.some((factor) => factor.strategy === "email_code"))
        return { kind: "email_code" };
      return {
        kind: "error",
        // A new-device check only follows a password, so an email code avoids it.
        error:
          signIn.status === "needs_client_trust" ? UNSUPPORTED_STEP : UNSUPPORTED_SECOND_FACTOR,
      };
    case "needs_new_password":
      return { kind: "error", error: NEW_PASSWORD };
    case "needs_protect_check":
      return { kind: "error", error: UNSUPPORTED_STEP };
    default:
      // Not started, still on the first factor (a code was just sent), or complete.
      return { kind: "none" };
  }
}
