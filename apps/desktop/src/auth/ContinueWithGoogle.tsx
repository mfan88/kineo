import { useClerk } from "@clerk/react";
import { clerkErrorDetails, signInError } from "@kineo/shared";
import { useState } from "react";
import { PendingButton } from "../components/PendingButton";
import { GoogleSignInError, openGoogleSignIn } from "./googleSignIn";

/**
 * "Continue with Google", on the sign-in and Create an account screens. It opens
 * Google in the browser; the auth gate finishes once the browser comes back.
 */
export function ContinueWithGoogle({
  onStarted,
  onError,
}: {
  /** Google's page is open in the browser. */
  onStarted: () => void;
  /** What went wrong, to show on the screen. */
  onError: (message: string) => void;
}) {
  const clerk = useClerk();
  const [opening, setOpening] = useState(false);

  async function continueWithGoogle() {
    setOpening(true);
    try {
      await openGoogleSignIn(clerk);
      onStarted();
    } catch (thrown) {
      onError(
        thrown instanceof GoogleSignInError
          ? thrown.message
          : signInError(clerkErrorDetails(thrown)).message,
      );
    } finally {
      setOpening(false);
    }
  }

  return (
    <PendingButton
      variant="secondary"
      className="h-11 w-full"
      pending={opening}
      pendingLabel="Opening Google…"
      onPress={() => void continueWithGoogle()}
    >
      Continue with Google
    </PendingButton>
  );
}
