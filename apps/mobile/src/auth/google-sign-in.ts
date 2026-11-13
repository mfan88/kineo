import { useSignUp } from "@clerk/expo";
import { useSSO } from "@clerk/expo/experimental";
import { fullNameFrom, ssoOutcome, type SsoOutcome } from "@kineo/shared";
import * as WebBrowser from "expo-web-browser";
import { rememberSignUpName } from "./sign-up-name";

// Closes the browser sheet's session when the app is opened back through the link.
WebBrowser.maybeCompleteAuthSession();

/**
 * "Continue with Google" through Clerk: the browser sheet, back to the app by its
 * `kineo://` link. An existing account signs in; a new one is created, and if Clerk
 * still needs the Terms and Privacy agreement, `acceptTerms` finishes it. A new
 * account's name from Google goes into Your profile, as with email sign-up.
 */
export function useGoogleSignIn(): {
  start: () => Promise<SsoOutcome>;
  acceptTerms: () => Promise<{ error: unknown }>;
} {
  const { startSSOFlow } = useSSO();
  const { signUp } = useSignUp();

  async function start(): Promise<SsoOutcome> {
    const result = await startSSOFlow({ strategy: "oauth_google" });
    // The sign-up exists only when Google's account was new to Kineō.
    const created = result.signUp?.id ? result.signUp : null;
    const outcome = ssoOutcome({
      browserResult: result.authSessionResult?.type ?? null,
      createdSessionId: result.createdSessionId,
      usedExistingSession: result.signIn?.existingSession !== undefined,
      signUpStatus: created?.status ?? null,
      signUpMissingFields: created?.missingFields ?? [],
    });
    if (outcome === "signed-in" && created?.createdSessionId) {
      rememberSignUpName(fullNameFrom(created.firstName, created.lastName));
    }
    return outcome;
  }

  async function acceptTerms(): Promise<{ error: unknown }> {
    const { error } = await signUp.update({ legalAccepted: true });
    if (error) return { error };
    if (signUp.status !== "complete") return { error: { code: "sign_up_incomplete" } };
    rememberSignUpName(fullNameFrom(signUp.firstName, signUp.lastName));
    return signUp.finalize();
  }

  return { start, acceptTerms };
}
