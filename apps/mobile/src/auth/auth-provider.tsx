import { ClerkProvider } from "@clerk/expo";
import * as SecureStore from "expo-secure-store";
import type { ReactNode } from "react";
import { clerkStorage } from "./secure-storage";

// Kept on this phone only: never moved to another one through an encrypted backup
// (Clerk's own token cache uses AFTER_FIRST_UNLOCK). See "Phone sign-in" in docs/tech-stack.md.
const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

/** The saved session (exported so Sign out can remove it). */
export const savedSession = clerkStorage({
  get: (key) => SecureStore.getItemAsync(key, OPTIONS),
  set: (key, value) => SecureStore.setItemAsync(key, value, OPTIONS),
  delete: (key) => SecureStore.deleteItemAsync(key, OPTIONS),
});

// From apps/mobile/.env.local (git-ignored) or EAS. A publishable key, so it may be in app code.
const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

/**
 * Clerk with the session in secure storage, its last-known state cached there too
 * so the app starts signed in without a connection, and telemetry off.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  if (!publishableKey) {
    throw new Error(
      "EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY isn't set. Add it to apps/mobile/.env.local.",
    );
  }
  return (
    <ClerkProvider
      publishableKey={publishableKey}
      tokenCache={savedSession.tokenCache}
      __experimental_resourceCache={savedSession.resourceCache}
      telemetry={false}
    >
      {children}
    </ClerkProvider>
  );
}
