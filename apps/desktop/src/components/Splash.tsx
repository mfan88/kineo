import { Spinner } from "@heroui/react";
import type { ReactNode } from "react";
import { Wordmark } from "./Wordmark";

/**
 * A full-window wait: the wordmark, a small spinner, and optionally a short status
 * message (announced once to screen readers). Used while signing in and the first sync.
 */
export function Splash({
  label,
  children,
}: {
  /** What the spinner is for, for screen readers. */
  label: string;
  /** The message, if there is one. */
  children?: ReactNode;
}) {
  return (
    <main
      aria-busy="true"
      className="flex min-h-screen flex-col items-center justify-center gap-5 bg-background px-8 text-center text-foreground"
    >
      <Wordmark size={32} />
      <Spinner aria-label={label} />
      {children ? (
        <div role="status" className="flex max-w-sm flex-col gap-1.5">
          {children}
        </div>
      ) : null}
    </main>
  );
}
