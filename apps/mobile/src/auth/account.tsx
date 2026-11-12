import { createContext, useContext } from "react";
import type { SignOutResult } from "./sign-out";

/** The signed-in practitioner, as Settings needs it. */
export interface Account {
  email: string | null;
  /** See signOut in ./sign-out. */
  signOut: (options?: { discardUnsynced?: boolean }) => Promise<SignOutResult>;
}

/** Null outside a signed-in session (screens on made-up data in tests). */
export const AccountContext = createContext<Account | null>(null);

export function useAccount(): Account | null {
  return useContext(AccountContext);
}
