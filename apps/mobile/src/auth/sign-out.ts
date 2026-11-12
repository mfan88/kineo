export type SignOutResult = "signed-out" | "unsynced-changes";

export interface SignOutSteps {
  /** Whether some local changes haven't reached the server yet. */
  hasUnsyncedChanges: () => Promise<boolean>;
  /** Signs out of Clerk. Needs the network; nothing is removed if it fails. */
  signOutOfClerk: () => Promise<void>;
  /** Disconnects sync and empties the local database. */
  clearDatabase: () => Promise<void>;
  /** Removes the kept logo copies. */
  clearLogos: () => Promise<void>;
  /** Removes Clerk's saved session from secure storage. */
  clearSavedSession: () => Promise<void>;
}

/**
 * Signs out and removes the practitioner's data from this phone. With unsynced
 * changes it does nothing and says so, unless `discardUnsynced` is set (they'd be
 * lost). Clerk goes first: if that fails (offline, say), everything stays as it
 * was. Then every clean-up step runs even if one fails, and the first failure is
 * thrown afterwards.
 */
export async function signOut(
  steps: SignOutSteps,
  { discardUnsynced = false } = {},
): Promise<SignOutResult> {
  if (!discardUnsynced && (await steps.hasUnsyncedChanges())) return "unsynced-changes";
  await steps.signOutOfClerk();
  const results = await Promise.allSettled([
    steps.clearDatabase(),
    steps.clearLogos(),
    steps.clearSavedSession(),
  ]);
  const failed = results.find((result) => result.status === "rejected");
  if (failed) throw new Error("Some of this phone's data couldn't be removed.");
  return "signed-out";
}
