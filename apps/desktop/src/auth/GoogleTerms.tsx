import { useClerk } from "@clerk/react";
import { Button } from "@heroui/react";
import { clerkErrorDetails, SIGN_UP_CONSENT_MISSING, signUpError } from "@kineo/shared";
import { useState } from "react";
import { acceptGoogleTerms } from "./googleSignIn";
import { TermsAgreement } from "./TermsAgreement";

/**
 * After "Continue with Google" made a new account: the Terms and Privacy agreement,
 * the one thing it still needs, then Create account signs in.
 */
export function GoogleTerms({ onBack }: { onBack: () => void }) {
  const clerk = useClerk();
  const [agreed, setAgreed] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function createAccount() {
    if (!agreed) {
      setConsentError(SIGN_UP_CONSENT_MISSING);
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      if ((await acceptGoogleTerms(clerk)) !== "signed-in") {
        setFormError(signUpError({ code: "sign_up_incomplete" }).message);
      }
    } catch (thrown) {
      setFormError(signUpError(clerkErrorDetails(thrown)).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-8 py-12 text-foreground">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col gap-1">
          <p className="text-sm text-muted">Kineō</p>
          <h1 className="text-[28px] leading-tight font-semibold">One more step</h1>
          <p className="text-muted">
            Agree to the Terms and Privacy policy to finish creating your account.
          </p>
        </div>
        <div className="flex flex-col gap-5">
          <TermsAgreement
            agreed={agreed}
            onChange={(selected) => {
              setAgreed(selected);
              setConsentError(null);
            }}
            error={consentError}
          />
          <Button
            variant="primary"
            className="h-11 w-full"
            isPending={busy}
            onPress={() => void createAccount()}
          >
            Create account
          </Button>
          <Button variant="ghost" className="h-11 w-full" onPress={onBack}>
            Back to sign in
          </Button>
        </div>
        {formError ? (
          <p role="alert" className="text-sm text-danger">
            {formError}
          </p>
        ) : null}
      </div>
    </main>
  );
}
