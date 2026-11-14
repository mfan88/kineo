import { useAuth, useClerk } from "@clerk/react";
import { Button } from "@heroui/react";
import { clerkErrorDetails, SIGN_IN_TEXT_AFTER_MS, signInError, signUpError } from "@kineo/shared";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrent, onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { useEffect, useState, type ReactNode } from "react";
import { Splash } from "../components/Splash";
import { useElapsed } from "../components/useElapsed";
import { ContinueWithGoogle } from "./ContinueWithGoogle";
import { finishGoogleSignIn, nonceFromCallback } from "./googleSignIn";
import { GoogleTerms } from "./GoogleTerms";
import { SignIn } from "./SignIn";
import { SignUp } from "./SignUp";

/** Where "Continue with Google" is up to, for the line under its button. */
type GoogleState =
  | { kind: "idle" }
  | { kind: "waiting" }
  | { kind: "finishing" }
  | { kind: "error"; message: string };

const GOOGLE_NOTE: Record<"waiting" | "finishing", string> = {
  waiting: "Finish signing in with Google in your browser. Kineō opens again when you're done.",
  finishing: "Signing you in with Google…",
};
const GOOGLE_CALLBACK_HANDLED_KEY = "kineo.googleCallbackHandled";

/** Shows the app only once signed in; until then, sign-in (or creating an account). */
export function AuthGate({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const clerk = useClerk();
  // Signed out: sign in, create an account, or finish a new Google account.
  const [screen, setScreen] = useState<"sign-in" | "sign-up" | "google-terms">("sign-in");
  const [google, setGoogle] = useState<GoogleState>({ kind: "idle" });

  // "Continue with Google" comes back through a kineo://sso-callback link: while the
  // app is open, or as the link that opened it.
  useEffect(() => {
    // Only in the app window, and only while signed out: nothing to undo otherwise.
    if (!isTauri() || isSignedIn !== false) return () => {};
    let ended = false;
    let stopListening: (() => void) | null = null;

    async function finish(nonce: string) {
      setGoogle({ kind: "finishing" });
      try {
        const outcome = await finishGoogleSignIn(clerk, nonce);
        if (outcome === "needs-terms") {
          setGoogle({ kind: "idle" });
          setScreen("google-terms");
        } else if (outcome === "incomplete") {
          setGoogle({
            kind: "error",
            message: signUpError({ code: "sign_up_incomplete" }).message,
          });
        } else {
          setGoogle({ kind: "idle" });
        }
      } catch (thrown) {
        setGoogle({ kind: "error", message: signInError(clerkErrorDetails(thrown)).message });
      }
    }
    function receive(links: string[] | null) {
      for (const link of links ?? []) {
        const nonce = nonceFromCallback(link);
        if (nonce === null || ended) continue;
        if (localStorage.getItem(GOOGLE_CALLBACK_HANDLED_KEY) === "true") continue;
        localStorage.setItem(GOOGLE_CALLBACK_HANDLED_KEY, "true");
        if (!nonce) {
          setGoogle({
            kind: "error",
            message: "Google didn't return the sign-in details. Try again.",
          });
          continue;
        }
        void finish(nonce);
      }
    }

    void onOpenUrl(receive).then((unlisten) => {
      if (ended) unlisten();
      else stopListening = unlisten;
    });
    void getCurrent().then(receive);
    return () => {
      ended = true;
      stopListening?.();
    };
  }, [clerk, isSignedIn]);

  if (clerk.status === "error") return <SignInUnavailable />;
  if (!isLoaded) return <CheckingSignIn />;
  if (!isSignedIn) {
    if (screen === "google-terms") return <GoogleTerms onBack={() => setScreen("sign-in")} />;
    const googleArea = (
      <div className="flex flex-col gap-2">
        <ContinueWithGoogle
          onStarted={() => {
            localStorage.removeItem(GOOGLE_CALLBACK_HANDLED_KEY);
            setGoogle({ kind: "waiting" });
          }}
          onError={(message) => setGoogle({ kind: "error", message })}
        />
        {google.kind === "error" ? (
          <p role="alert" className="text-sm text-danger">
            {google.message}
          </p>
        ) : google.kind === "idle" ? null : (
          <p role="status" className="text-sm text-muted">
            {GOOGLE_NOTE[google.kind]}
          </p>
        )}
      </div>
    );
    return screen === "sign-up" ? (
      <SignUp onSignIn={() => setScreen("sign-in")} google={googleArea} />
    ) : (
      <SignIn onCreateAccount={() => setScreen("sign-up")} google={googleArea} />
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
