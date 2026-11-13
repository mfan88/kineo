import { useAuth, useClerk } from "@clerk/react";
import { Button } from "@heroui/react";
import { SIGN_IN_TEXT_AFTER_MS } from "@kineo/shared";
import { useState, type ReactNode } from "react";
import { Splash } from "../components/Splash";
import { useElapsed } from "../components/useElapsed";
import { SignIn } from "./SignIn";
import { SignUp } from "./SignUp";

/** Shows the app only once signed in; until then, sign-in (or creating an account). */
export function AuthGate({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const clerk = useClerk();
  const [creating, setCreating] = useState(false);

  if (clerk.status === "error") return <SignInUnavailable />;
  if (!isLoaded) return <CheckingSignIn />;
  if (!isSignedIn) {
    return creating ? (
      <SignUp onSignIn={() => setCreating(false)} />
    ) : (
      <SignIn onCreateAccount={() => setCreating(true)} />
    );
  }
  return children;
}

/** The wordmark and a spinner; "Signing you in" only if the check takes over 2 seconds. */
function CheckingSignIn() {
  const slow = useElapsed(SIGN_IN_TEXT_AFTER_MS);
  return (
    <Splash label="Loading">{slow ? <p className="text-muted">Signing you in</p> : null}</Splash>
  );
}

function SignInUnavailable() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-8 text-foreground">
      <div className="flex max-w-sm flex-col items-start gap-4">
        <h1 className="text-[28px] leading-tight font-semibold">Can't reach sign-in</h1>
        <p className="text-muted">
          Kineō needs an internet connection to sign in. Check your connection, then try again.
        </p>
        <Button variant="primary" className="h-11 px-5" onPress={() => window.location.reload()}>
          Try again
        </Button>
      </div>
    </main>
  );
}
