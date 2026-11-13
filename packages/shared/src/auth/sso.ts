/**
 * How a "Continue with Google" attempt ended:
 * - `signed-in`: an existing account, or a new one that needed nothing more;
 * - `cancelled`: the browser was closed before finishing;
 * - `needs-terms`: a new account waiting only for the Terms and Privacy agreement;
 * - `incomplete`: anything else (Clerk wants more than Kineō asks for).
 */
export type SsoOutcome = "signed-in" | "cancelled" | "needs-terms" | "incomplete";

export interface SsoAttempt {
  /** The browser session's result type ("success", "cancel", "dismiss"…), or null if it didn't open. */
  browserResult: string | null;
  /** The session a sign-in or new account created, if any. */
  createdSessionId: string | null;
  /** Whether an already-active session was used instead (signing in again). */
  usedExistingSession: boolean;
  /** The new account's sign-up status and missing fields, when Google's account was new. */
  signUpStatus: string | null;
  signUpMissingFields: readonly string[];
}

export function ssoOutcome(attempt: SsoAttempt): SsoOutcome {
  if (attempt.createdSessionId !== null || attempt.usedExistingSession) return "signed-in";
  if (attempt.browserResult !== null && attempt.browserResult !== "success") return "cancelled";
  if (
    attempt.signUpStatus === "missing_requirements" &&
    attempt.signUpMissingFields.length > 0 &&
    attempt.signUpMissingFields.every((field) => field === "legal_accepted")
  ) {
    return "needs-terms";
  }
  return "incomplete";
}

/** "Dana Example" from a first and last name, either of which may be missing. */
export function fullNameFrom(firstName: string | null, lastName: string | null): string {
  return [firstName, lastName]
    .map((part) => (part ?? "").trim())
    .filter((part) => part !== "")
    .join(" ");
}
