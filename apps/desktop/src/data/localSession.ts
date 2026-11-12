/**
 * The local database's life alongside sign-in:
 * - signed in: open it, clear it first if someone else used it last, then sync;
 * - session expired (Clerk signed out by itself): disconnect, keep everything, so
 *   unsynced changes upload when the same person signs back in;
 * - Sign out: clear the database, saved logos, the owner and the keychain entry, then
 *   sign out of Clerk, so the next person on the computer sees nothing.
 */

/** The parts of the PowerSync database this needs. */
export interface SessionDatabase {
  init(): Promise<void>;
  disconnect(): Promise<void>;
  disconnectAndClear(): Promise<void>;
  /** Null when every local change has been uploaded. */
  getNextCrudTransaction(): Promise<unknown>;
}

/** Who the local data belongs to (a Clerk user ID, not secret). */
export interface OwnerStore {
  get(): string | null;
  set(userId: string): void;
  clear(): void;
}

export interface LocalSessionDeps<Db extends SessionDatabase> {
  db: Db;
  owner: OwnerStore;
  /** Connects sync; resolves to a function that stops listening for sync events. */
  startSync: (db: Db) => Promise<() => void>;
  /** Removes other local files, such as saved logo copies. */
  clearLocalFiles: () => Promise<void>;
  /** Removes the saved session from the keychain. */
  clearSavedSession: () => Promise<void>;
  /** Signs out of Clerk. */
  signOutOfClerk: () => Promise<void>;
}

export type SignOutResult = "signed-out" | "unsynced-changes";

export class LocalSession<Db extends SessionDatabase> {
  private stopSync: (() => void) | null = null;
  /** Who the database is open and syncing for, or null. */
  private openFor: string | null = null;
  /** Open, close and sign-out run one after another, in the order asked. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly deps: LocalSessionDeps<Db>) {}

  private run<T>(step: () => Promise<T>): Promise<T> {
    const result = this.queue.then(step);
    this.queue = result.catch(() => {});
    return result;
  }

  /** Opens the database for `userId` and starts syncing. Does nothing if already open for them. */
  open(userId: string): Promise<void> {
    return this.run(async () => {
      if (this.openFor === userId) return;
      const { db, owner } = this.deps;
      await db.init();
      const previous = owner.get();
      if (previous !== null && previous !== userId) {
        // Someone else's data (including any unsynced changes) must never be shown
        // to, or uploaded as, this user.
        await db.disconnectAndClear();
      }
      owner.set(userId);
      this.stopListening();
      this.stopSync = await this.deps.startSync(db);
      this.openFor = userId;
    });
  }

  /** The session ended without Sign out (e.g. it expired): disconnect, keep the data. */
  close(): Promise<void> {
    return this.run(async () => {
      if (this.openFor === null) return;
      this.stopListening();
      this.openFor = null;
      await this.deps.db.disconnect();
    });
  }

  /** Whether some local changes haven't reached the server yet. */
  async hasUnsyncedChanges(): Promise<boolean> {
    return (await this.deps.db.getNextCrudTransaction()) !== null;
  }

  /**
   * Signs out and removes everything from this computer. With unsynced changes,
   * does nothing and says so, unless `discardUnsynced` is set.
   */
  signOut({ discardUnsynced = false } = {}): Promise<SignOutResult> {
    return this.run(async () => {
      if (!discardUnsynced && (await this.hasUnsyncedChanges())) return "unsynced-changes";
      this.stopListening();
      this.openFor = null;
      await this.deps.db.disconnectAndClear();
      await this.deps.clearLocalFiles();
      this.deps.owner.clear();
      await this.deps.clearSavedSession();
      await this.deps.signOutOfClerk();
      return "signed-out";
    });
  }

  private stopListening(): void {
    this.stopSync?.();
    this.stopSync = null;
  }
}

/** The owner of the local data, kept in the webview's storage (a user ID, not secret). */
export function browserOwnerStore(storage: Storage, key = "kineo.localDataOwner"): OwnerStore {
  return {
    get: () => storage.getItem(key),
    set: (userId) => storage.setItem(key, userId),
    clear: () => storage.removeItem(key),
  };
}
