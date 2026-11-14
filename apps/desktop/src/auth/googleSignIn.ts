import { fullNameFrom, ssoOutcome, type SsoOutcome } from "@kineo/shared";
import { invoke } from "@tauri-apps/api/core";
import { rememberSignUpName } from "./signUpName";

/**
 * Where Google (through Clerk) sends the browser back to: a page on Kineō's website
 * that forwards to the app's link below with the same query.
 */
export const SSO_REDIRECT = "https://www.getkineo.work/signed-in/";

/** The app's own link the website page forwards to; the only link the app accepts. */
export const SSO_APP_LINK = "kineo://sso-callback";

/** The parts of Clerk's sign-in and sign-up the Google flow uses (Clerk's classic objects). */
export interface GoogleClerk {
  client:
    | {
        signIn: {
          create(params: { strategy: "oauth_google"; redirectUrl: string }): Promise<{
            firstFactorVerification: { externalVerificationRedirectURL: URL | null };
          }>;
          reload(params: { rotatingTokenNonce: string }): Promise<{
            createdSessionId: string | null;
            firstFactorVerification: { status: string | null };
          }>;
        };
        signUp: {
          create(params: { transfer: true }): Promise<GoogleSignUp>;
          update(params: { legalAccepted: true }): Promise<GoogleSignUp>;
        };
      }
    | undefined;
  setActive(params: { session: string }): Promise<void>;
}

interface GoogleSignUp {
  status: string | null;
  missingFields: string[];
  createdSessionId: string | null;
  firstName: string | null;
  lastName: string | null;
}

/** Thrown when Clerk isn't ready or gives no Google page; the message is safe to show. */
export class GoogleSignInError extends Error {
  override name = "GoogleSignInError";
}

function clientOf(clerk: GoogleClerk) {
  if (!clerk.client) throw new GoogleSignInError("Sign-in isn't ready yet. Try again in a moment.");
  return clerk.client;
}

/** Starts "Continue with Google": asks Clerk for Google's page and opens it in the browser. */
export async function openGoogleSignIn(clerk: GoogleClerk): Promise<void> {
  const signIn = await clientOf(clerk).signIn.create({
    strategy: "oauth_google",
    redirectUrl: SSO_REDIRECT,
  });
  const page = signIn.firstFactorVerification.externalVerificationRedirectURL;
  if (!page) throw new GoogleSignInError("Google sign-in couldn't start. Try again.");
  await invoke("open_sign_in_page", { url: page.toString() });
}

/** The rotating token nonce from a `kineo://sso-callback?…` link, or null for any other link. */
export function nonceFromCallback(link: string): string | null {
  try {
    const url = new URL(link);
    const app = new URL(SSO_APP_LINK);
    if (url.protocol !== app.protocol || url.host !== app.host) return null;
    if (url.pathname !== "" && url.pathname !== "/") return null;
    return url.searchParams.get("rotating_token_nonce") ?? "";
  } catch {
    return null;
  }
}

/**
 * Finishes "Continue with Google" once the browser comes back with `nonce`: an
 * existing account signs in; a new one is created and signs in, unless it still
 * needs the Terms agreement (`needs-terms`, finished by `acceptGoogleTerms`). A new
 * account's name from Google is kept for Your profile.
 */
export async function finishGoogleSignIn(clerk: GoogleClerk, nonce: string): Promise<SsoOutcome> {
  const client = clientOf(clerk);
  const signIn = await client.signIn.reload({ rotatingTokenNonce: nonce });
  const isNew = signIn.firstFactorVerification.status === "transferable";
  const signUp = isNew ? await client.signUp.create({ transfer: true }) : null;
  const createdSessionId = signUp ? signUp.createdSessionId : signIn.createdSessionId;
  const outcome = ssoOutcome({
    browserResult: "success",
    createdSessionId,
    usedExistingSession: false,
    signUpStatus: signUp?.status ?? null,
    signUpMissingFields: signUp?.missingFields ?? [],
  });
  if (outcome === "signed-in" && createdSessionId) {
    if (signUp) rememberSignUpName(fullNameFrom(signUp.firstName, signUp.lastName));
    await clerk.setActive({ session: createdSessionId });
  }
  return outcome;
}

/** Finishes a new Google account that needed only the Terms agreement, and signs in. */
export async function acceptGoogleTerms(clerk: GoogleClerk): Promise<SsoOutcome> {
  const signUp = await clientOf(clerk).signUp.update({ legalAccepted: true });
  if (signUp.status !== "complete" || !signUp.createdSessionId) return "incomplete";
  rememberSignUpName(fullNameFrom(signUp.firstName, signUp.lastName));
  await clerk.setActive({ session: signUp.createdSessionId });
  return "signed-in";
}
