import { useAuth, useClerk } from "@clerk/react";
import { Button, Spinner } from "@heroui/react";
import type { ReactNode } from "react";
import { SignIn } from "./SignIn";

/** Shows the app only once signed in; until then, the sign-in screen. */
export function AuthGate({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const clerk = useClerk();

  if (clerk.status === "error") return <SignInUnavailable />;
  if (!isLoaded) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Spinner aria-label="Loading" />
      </main>
    );
  }
  if (!isSignedIn) return <SignIn />;
  return children;
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
