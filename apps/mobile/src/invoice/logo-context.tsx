import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { LogoStore } from "./logo";

const LogoContext = createContext<LogoStore | null>(null);

/** Gives screens the signed-in practitioner's logos (see LogoStore). */
export function LogoProvider({ logos, children }: { logos: LogoStore; children: ReactNode }) {
  return <LogoContext.Provider value={logos}>{children}</LogoContext.Provider>;
}

/** Where the logo for an invoice stands. */
export type LogoState =
  | { status: "none" }
  | { status: "loading" }
  | { status: "ready"; src: string }
  | { status: "failed"; message: string };

/**
 * The logo for `logoPath` as a data URI. "none" when the style has no logo, or
 * outside a signed-in session (screens on made-up data in tests).
 */
export function useLogo(logoPath: string | null): LogoState {
  const logos = useContext(LogoContext);
  const [loaded, setLoaded] = useState<{ path: string; state: LogoState } | null>(null);

  useEffect(() => {
    if (logoPath === null || logos === null) return undefined;
    let current = true;
    logos.dataUri(logoPath).then(
      (src) => {
        if (current) setLoaded({ path: logoPath, state: { status: "ready", src } });
      },
      (error: unknown) => {
        const message =
          error instanceof Error && error.name === "LogoError"
            ? error.message
            : "Couldn't load the logo. Try again.";
        if (current) setLoaded({ path: logoPath, state: { status: "failed", message } });
      },
    );
    return () => {
      current = false;
    };
  }, [logos, logoPath]);

  if (logoPath === null || logos === null) return { status: "none" };
  return loaded?.path === logoPath ? loaded.state : { status: "loading" };
}
