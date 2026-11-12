import { useAuth, useClerk, useUser } from "@clerk/react";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { AccountContext, type Account } from "../auth/account";
import { keychainTokenStore } from "../auth/sessionToken";
import { notifyError } from "../components/Toasts";
import { createDatabase } from "./database";
import { LiveStore } from "./liveStore";
import { browserOwnerStore, LocalSession } from "./localSession";
import { clearLogos } from "./logos";
import { PracticeStoreProvider } from "./PracticeStoreProvider";
import { startSync, type GetToken } from "./sync";

/**
 * Opens the local database and sync once signed in (inside AuthGate), and closes
 * them when the session ends. Provides the screens' store (the local database) and
 * the account (email, Sign out).
 */
export function LocalSessionProvider({ children }: { children: ReactNode }) {
  const { userId, getToken } = useAuth();
  const { user } = useUser();
  const clerk = useClerk();
  // getToken changes between renders; sync always asks the current one.
  const tokens = useRef<GetToken>(getToken);
  tokens.current = getToken;

  // One local database for the app run, shared by the session and the store.
  const db = useMemo(() => createDatabase(), []);
  // AuthGate only shows this once signed in, so there's always a user ID here.
  const ownerId = userId ?? "";
  const store = useMemo(() => new LiveStore(db, ownerId), [db, ownerId]);

  const session = useMemo(
    () =>
      new LocalSession({
        db,
        owner: browserOwnerStore(localStorage),
        startSync: (database) => startSync(database, (options) => tokens.current(options)),
        clearLocalFiles: clearLogos,
        clearSavedSession: () => keychainTokenStore.clear(),
        // Local data and the saved session are already gone by now. If Clerk can't be
        // reached, reload: with no saved session, the app starts signed out.
        signOutOfClerk: () => clerk.signOut().catch(() => window.location.reload()),
      }),
    [clerk, db],
  );

  useEffect(() => {
    if (!userId) return undefined;
    session.open(userId).then(
      () => store.start(),
      () => notifyError("Couldn't open your data on this computer. Quit Kineō and open it again."),
    );
    // Unmounted when the session ends: by Sign out (already cleared) or by expiry.
    return () => {
      store.stop();
      void session.close();
    };
  }, [session, store, userId]);

  const account = useMemo<Account>(
    () => ({
      email: user?.primaryEmailAddress?.emailAddress ?? null,
      signOut: (options) => session.signOut(options),
    }),
    [session, user],
  );

  return (
    <AccountContext.Provider value={account}>
      <PracticeStoreProvider store={store}>{children}</PracticeStoreProvider>
    </AccountContext.Provider>
  );
}
