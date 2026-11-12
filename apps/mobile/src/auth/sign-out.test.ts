import { describe, expect, it, vi } from "vitest";
import { signOut, type SignOutSteps } from "./sign-out";

function steps(overrides: Partial<SignOutSteps> = {}) {
  const order: string[] = [];
  const step = (name: string) =>
    vi.fn<() => Promise<void>>(() => {
      order.push(name);
      return Promise.resolve();
    });
  const all: SignOutSteps = {
    hasUnsyncedChanges: vi.fn<() => Promise<boolean>>(() => Promise.resolve(false)),
    signOutOfClerk: step("clerk"),
    clearDatabase: step("database"),
    clearLogos: step("logos"),
    clearSavedSession: step("session"),
    ...overrides,
  };
  return { all, order };
}

describe("signOut", () => {
  it("signs out of Clerk, then removes the database, logos and saved session", async () => {
    const { all, order } = steps();
    expect(await signOut(all)).toBe("signed-out");
    expect(order).toEqual(["clerk", "database", "logos", "session"]);
  });

  it("asks first when some changes haven't reached the server", async () => {
    const { all, order } = steps({ hasUnsyncedChanges: () => Promise.resolve(true) });
    expect(await signOut(all)).toBe("unsynced-changes");
    expect(order).toEqual([]);
  });

  it("signs out anyway when told to discard them", async () => {
    const hasUnsyncedChanges = vi.fn<() => Promise<boolean>>(() => Promise.resolve(true));
    const { all, order } = steps({ hasUnsyncedChanges });
    expect(await signOut(all, { discardUnsynced: true })).toBe("signed-out");
    expect(hasUnsyncedChanges).not.toHaveBeenCalled();
    expect(order).toHaveLength(4);
  });

  it("removes nothing when Clerk can't be reached", async () => {
    const { all, order } = steps({
      signOutOfClerk: () => Promise.reject(new Error("offline")),
    });
    await expect(signOut(all)).rejects.toThrow("offline");
    expect(order).toEqual([]);
  });

  it("still runs every clean-up step when one fails, then says so", async () => {
    const { all, order } = steps({ clearLogos: () => Promise.reject(new Error("disk")) });
    await expect(signOut(all)).rejects.toThrow("couldn't be removed");
    expect(order).toEqual(["clerk", "database", "session"]);
  });
});
