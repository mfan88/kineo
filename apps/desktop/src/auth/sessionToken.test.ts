import { describe, expect, it, vi } from "vitest";
import { memoryTokenStore, sessionToken, type TokenStore } from "./sessionToken";

function fakeStore(saved: string | null = null) {
  const store = memoryTokenStore();
  if (saved) void store.save(saved);
  return {
    load: vi.fn<TokenStore["load"]>(() => store.load()),
    save: vi.fn<TokenStore["save"]>((token) => store.save(token)),
    clear: vi.fn<TokenStore["clear"]>(() => store.clear()),
  };
}

describe("sessionToken", () => {
  it("sends the saved token, reading the store only once", async () => {
    const store = fakeStore("saved.jwt.token");
    const token = sessionToken(store);
    expect(await Promise.all([token.get(), token.get()])).toEqual([
      "saved.jwt.token",
      "saved.jwt.token",
    ]);
    expect(await token.get()).toBe("saved.jwt.token");
    expect(store.load).toHaveBeenCalledTimes(1);
  });

  it("sends an empty token when nothing is saved", async () => {
    expect(await sessionToken(fakeStore()).get()).toBe("");
  });

  it("saves a new token from Clerk and sends it from then on", async () => {
    const store = fakeStore();
    const token = sessionToken(store);
    await token.get();
    await token.received("new.jwt.token");
    expect(store.save).toHaveBeenCalledWith("new.jwt.token");
    expect(await token.get()).toBe("new.jwt.token");
    expect(await store.load()).toBe("new.jwt.token");
  });

  it("doesn't save again when the token hasn't changed, or when there's none", async () => {
    const store = fakeStore("same.jwt.token");
    const token = sessionToken(store);
    await token.get();
    await token.received("same.jwt.token");
    await token.received(null);
    await token.received("");
    expect(store.save).not.toHaveBeenCalled();
  });

  it("carries on signed out if the keychain can't be read", async () => {
    const store = fakeStore();
    store.load.mockRejectedValue(new Error("denied"));
    expect(await sessionToken(store).get()).toBe("");
  });

  it("keeps the new token in memory if the keychain can't be written", async () => {
    const store = fakeStore();
    store.save.mockRejectedValue(new Error("denied"));
    const token = sessionToken(store);
    await expect(token.received("new.jwt.token")).resolves.toBeUndefined();
    expect(await token.get()).toBe("new.jwt.token");
  });
});
