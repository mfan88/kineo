import { useClerk } from "@clerk/react";
import { Button } from "@heroui/react";
import { clerkErrorDetails, signInError } from "@kineo/shared";
import { useState } from "react";
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
    <Button
      variant="secondary"
      className="h-11 w-full"
      isPending={opening}
      onPress={() => void continueWithGoogle()}
    >
      Continue with Google
    </Button>
  );
}
