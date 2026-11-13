import { act, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAccount } from "../auth/account";
import { LocalSessionProvider } from "./LocalSessionProvider";

const mocks = vi.hoisted(() => ({
  db: {
    init: vi.fn<() => Promise<void>>(async () => {}),
    disconnect: vi.fn<() => Promise<void>>(async () => {}),
    disconnectAndClear: vi.fn<() => Promise<void>>(async () => {}),
    getNextCrudTransaction: vi.fn<() => Promise<unknown>>(async () => null),
  },
  // Like a computer that has synced before: reports it at once.
  startSync: vi.fn<
    (
      db: unknown,
      getToken: unknown,
      onStatus: (status: { hasSynced: boolean; connected: boolean }) => void,
    ) => Promise<() => void>
  >(async (_db, _getToken, onStatus) => {
    onStatus({ hasSynced: true, connected: true });
    return () => {};
  }),
  clearKeychain: vi.fn<() => Promise<void>>(async () => {}),
  clearLogos: vi.fn<() => Promise<void>>(async () => {}),
  clerkSignOut: vi.fn<() => Promise<void>>(async () => {}),
  clerk: null as unknown,
  storeStart: vi.fn<() => void>(),
  storeStop: vi.fn<() => void>(),
}));
mocks.clerk = { signOut: mocks.clerkSignOut };

vi.mock("@clerk/react", () => ({
  useAuth: () => ({ userId: "user_a", getToken: async () => "jwt" }),
  useUser: () => ({ user: { primaryEmailAddress: { emailAddress: "alex@example.com" } } }),
  useClerk: () => mocks.clerk,
}));
vi.mock("./database", () => ({ createDatabase: () => mocks.db }));
vi.mock("./sync", () => ({ startSync: mocks.startSync }));
vi.mock("./logos", () => ({ clearLogos: mocks.clearLogos }));
// The store and its loading gate have their own tests; here only their wiring matters.
vi.mock("./liveStore", () => ({
  LiveStore: class {
    start = mocks.storeStart;
    stop = mocks.storeStop;
  },
}));
vi.mock("./PracticeStoreProvider", () => ({
  PracticeStoreProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("../auth/sessionToken", () => ({ keychainTokenStore: { clear: mocks.clearKeychain } }));

function ShowAccount() {
  const account = useAccount();
  return (
    <button type="button" onClick={() => void account?.signOut()}>
      {account?.email}
    </button>
  );
}

beforeEach(() => {
  localStorage.clear();
  for (const fn of [
    mocks.db.init,
    mocks.db.disconnect,
    mocks.db.disconnectAndClear,
    mocks.startSync,
  ]) {
    fn.mockClear();
  }
});

describe("LocalSessionProvider", () => {
  it("opens the database and starts sync for the signed-in practitioner", async () => {
    render(
      <LocalSessionProvider>
        <ShowAccount />
      </LocalSessionProvider>,
    );
    expect(await screen.findByRole("button", { name: "alex@example.com" })).toBeTruthy();
    expect(mocks.startSync).toHaveBeenCalledWith(
      mocks.db,
      expect.any(Function),
      expect.any(Function),
    );
    expect(localStorage.getItem("kineo.localDataOwner")).toBe("user_a");
  });

  it("keeps the app back until the first sync has finished", async () => {
    const sync: { report?: (status: { hasSynced: boolean; connected: boolean }) => void } = {};
    mocks.startSync.mockImplementationOnce(async (_db, _getToken, onStatus) => {
      sync.report = onStatus;
      return () => {};
    });
    render(
      <LocalSessionProvider>
        <ShowAccount />
      </LocalSessionProvider>,
    );
    await waitFor(() => expect(mocks.startSync).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "alex@example.com" })).toBeNull();

    act(() => sync.report?.({ hasSynced: false, connected: true }));
    expect(screen.getByText("Getting your patients and invoices")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "alex@example.com" })).toBeNull();

    act(() => sync.report?.({ hasSynced: true, connected: true }));
    expect(screen.getByRole("button", { name: "alex@example.com" })).toBeTruthy();
  });

  it("when the session ends by itself, disconnects but keeps the data", async () => {
    const { unmount } = render(
      <LocalSessionProvider>
        <ShowAccount />
      </LocalSessionProvider>,
    );
    await waitFor(() => expect(mocks.startSync).toHaveBeenCalled());
    unmount();
    expect(mocks.storeStop).toHaveBeenCalled();
    await waitFor(() => expect(mocks.db.disconnect).toHaveBeenCalled());
    expect(mocks.db.disconnectAndClear).not.toHaveBeenCalled();
    expect(localStorage.getItem("kineo.localDataOwner")).toBe("user_a");
  });

  it("Sign out clears the database, saved logos, keychain and owner, then signs out of Clerk", async () => {
    render(
      <LocalSessionProvider>
        <ShowAccount />
      </LocalSessionProvider>,
    );
    await waitFor(() => expect(mocks.startSync).toHaveBeenCalled());
    (await screen.findByRole("button", { name: "alex@example.com" })).click();
    await waitFor(() => expect(mocks.clerkSignOut).toHaveBeenCalled());
    expect(mocks.db.disconnectAndClear).toHaveBeenCalled();
    expect(mocks.clearKeychain).toHaveBeenCalled();
    expect(mocks.clearLogos).toHaveBeenCalled();
    expect(localStorage.getItem("kineo.localDataOwner")).toBeNull();
  });
});
