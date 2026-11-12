import { beforeEach, describe, expect, it, vi } from "vitest";
import { browserOwnerStore, LocalSession, type SessionDatabase } from "./localSession";

function setup(previousOwner: string | null = null, pending: unknown = null) {
  const calls: string[] = [];
  const db = {
    init: vi.fn<SessionDatabase["init"]>(async () => void calls.push("init")),
    disconnect: vi.fn<SessionDatabase["disconnect"]>(async () => void calls.push("disconnect")),
    disconnectAndClear: vi.fn<SessionDatabase["disconnectAndClear"]>(
      async () => void calls.push("clear database"),
    ),
    getNextCrudTransaction: vi.fn<SessionDatabase["getNextCrudTransaction"]>(async () => pending),
  };
  let owner = previousOwner;
  const ownerStore = {
    get: () => owner,
    set: (id: string) => {
      owner = id;
      calls.push(`owner ${id}`);
    },
    clear: () => {
      owner = null;
      calls.push("forget owner");
    },
  };
  const stopListening = vi.fn<() => void>(() => void calls.push("stop listening"));
  const startSync = vi.fn<(db: SessionDatabase) => Promise<() => void>>(async () => {
    calls.push("start sync");
    return stopListening;
  });
  const session = new LocalSession({
    db,
    owner: ownerStore,
    startSync,
    clearLocalFiles: async () => void calls.push("clear files"),
    clearSavedSession: async () => void calls.push("clear keychain"),
    signOutOfClerk: async () => void calls.push("clerk sign out"),
  });
  return { session, db, calls, startSync, stopListening, owner: () => owner };
}

describe("LocalSession", () => {
  it("opens and syncs for the person who signed in", async () => {
    const { session, calls, owner } = setup();
    await session.open("user_a");
    expect(calls).toEqual(["init", "owner user_a", "start sync"]);
    expect(owner()).toBe("user_a");
  });

  it("keeps the same person's data, including unsynced changes", async () => {
    const { session, db } = setup("user_a", { pending: true });
    await session.open("user_a");
    expect(db.disconnectAndClear).not.toHaveBeenCalled();
  });

  it("clears someone else's data before opening", async () => {
    const { session, calls } = setup("user_a");
    await session.open("user_b");
    expect(calls).toEqual(["init", "clear database", "owner user_b", "start sync"]);
  });

  it("ends up open after open, close, open in quick succession (React StrictMode)", async () => {
    const { session, calls } = setup();
    const steps = [session.open("user_a"), session.close(), session.open("user_a")];
    await Promise.all(steps);
    expect(calls).toEqual([
      "init",
      "owner user_a",
      "start sync",
      "stop listening",
      "disconnect",
      "init",
      "owner user_a",
      "start sync",
    ]);
  });

  it("closing when not open does nothing", async () => {
    const { session, db } = setup();
    await session.close();
    expect(db.disconnect).not.toHaveBeenCalled();
  });

  it("opens once even if asked twice at the same time", async () => {
    const { session, startSync } = setup();
    await Promise.all([session.open("user_a"), session.open("user_a")]);
    expect(startSync).toHaveBeenCalledTimes(1);
  });

  it("on expiry, disconnects but keeps the data and owner", async () => {
    const { session, calls, owner } = setup();
    await session.open("user_a");
    calls.length = 0;
    await session.close();
    expect(calls).toEqual(["stop listening", "disconnect"]);
    expect(owner()).toBe("user_a");
  });

  it("signs out, clearing everything, when nothing is waiting to sync", async () => {
    const { session, calls, owner } = setup();
    await session.open("user_a");
    calls.length = 0;
    expect(await session.signOut()).toBe("signed-out");
    expect(calls).toEqual([
      "stop listening",
      "clear database",
      "clear files",
      "forget owner",
      "clear keychain",
      "clerk sign out",
    ]);
    expect(owner()).toBeNull();
  });

  it("won't sign out over unsynced changes unless told to", async () => {
    const { session, db, calls } = setup(null, { pending: true });
    await session.open("user_a");
    calls.length = 0;
    expect(await session.signOut()).toBe("unsynced-changes");
    expect(calls).toEqual([]);
    expect(db.disconnectAndClear).not.toHaveBeenCalled();

    expect(await session.signOut({ discardUnsynced: true })).toBe("signed-out");
    expect(calls).toContain("clear database");
    expect(calls.at(-1)).toBe("clerk sign out");
  });

  it("can sign out before opening has finished", async () => {
    const { session, calls } = setup();
    const opening = session.open("user_a");
    expect(await session.signOut()).toBe("signed-out");
    await opening;
    expect(calls.indexOf("start sync")).toBeLessThan(calls.indexOf("clear database"));
  });
});

describe("browserOwnerStore", () => {
  beforeEach(() => localStorage.clear());

  it("remembers and forgets the owner", () => {
    const store = browserOwnerStore(localStorage);
    expect(store.get()).toBeNull();
    store.set("user_a");
    expect(store.get()).toBe("user_a");
    store.clear();
    expect(store.get()).toBeNull();
  });
});
