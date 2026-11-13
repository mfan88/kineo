import { clerkErrorDetails, signInError, signUpError } from "@kineo/shared";
import { useState } from "react";
import { PendingButton } from "@/components/pending-button";
import { useGoogleSignIn } from "./google-sign-in";

/**
 * "Continue with Google", on the sign-in and Create an account screens. A new account
 * that still needs the Terms agreement goes to `onNeedsTerms`, unless `agreed` (the
 * box on Create an account is already ticked), when it's finished straight away.
 */
export function ContinueWithGoogle({
  agreed = false,
  onNeedsTerms,
  onError,
}: {
  agreed?: boolean;
  onNeedsTerms: () => void;
  /** What went wrong, to show on the screen; null clears it. */
  onError: (message: string | null) => void;
}) {
  const { start, acceptTerms } = useGoogleSignIn();
  const [busy, setBusy] = useState(false);

  async function continueWithGoogle() {
    setBusy(true);
    onError(null);
    try {
      const outcome = await start();
      if (outcome === "needs-terms") {
        if (!agreed) {
          onNeedsTerms();
          return;
        }
        const { error } = await acceptTerms();
        if (error) onError(signUpError(clerkErrorDetails(error)).message);
      } else if (outcome === "incomplete") {
        onError(signUpError({ code: "sign_up_incomplete" }).message);
      }
    } catch (thrown) {
      onError(signInError(clerkErrorDetails(thrown)).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <PendingButton
      variant="secondary"
      pending={busy}
      pendingLabel="Opening Google…"
      label="Continue with Google"
      className="min-h-11"
      onPress={() => void continueWithGoogle()}
    />
  );
}
