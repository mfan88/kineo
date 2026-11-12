import { createContext, useContext } from "react";
import type { SignOutResult } from "../data/localSession";

/** The signed-in practitioner, as Settings needs it. */
export interface Account {
  email: string | null;
  /** See LocalSession.signOut. */
  signOut: (options?: { discardUnsynced?: boolean }) => Promise<SignOutResult>;
}

/** Null outside a signed-in session (e.g. screens rendered on demo data in tests). */
export const AccountContext = createContext<Account | null>(null);

export function useAccount(): Account | null {
  return useContext(AccountContext);
}
