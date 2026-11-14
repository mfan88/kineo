import { ClerkProvider, type ClerkProp } from "@clerk/react";
import { useMemo, type ReactNode } from "react";
import { appRouter } from "../router";
import { createClerk } from "./clerk";

interface AuthProviderProps {
  publishableKey: string;
  children: ReactNode;
}

/** Clerk in token mode (see "Desktop sign-in" in docs/tech-stack.md), telemetry off. */
export function AuthProvider({ publishableKey, children }: AuthProviderProps) {
  const clerk = useMemo(
    // Clerk's class doesn't match its own ClerkProp type under exactOptionalPropertyTypes.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    () => createClerk(publishableKey) as unknown as ClerkProp,
    [publishableKey],
  );
  return (
    <ClerkProvider
      publishableKey={publishableKey}
      Clerk={clerk}
      standardBrowser={false}
      telemetry={false}
      allowedRedirectProtocols={["http:", "https:", "tauri:"]}
      routerPush={(to) => appRouter.navigate(to)}
      routerReplace={(to) => appRouter.navigate(to, { replace: true })}
    >
      {children}
    </ClerkProvider>
  );
}
