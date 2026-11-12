import { describe, expect, it } from "vitest";
import { CHUNK_LENGTH, chunkedStore, clerkStorage, type KeyValueStore } from "./secure-storage";

function memory(options: { failGet?: boolean; failSet?: boolean } = {}) {
  const items = new Map<string, string>();
  const store: KeyValueStore = {
    get: (key) =>
      options.failGet
        ? Promise.reject(new Error("locked"))
        : Promise.resolve(items.get(key) ?? null),
    set: (key, value) => {
      if (options.failSet) return Promise.reject(new Error("full"));
      items.set(key, value);
      return Promise.resolve();
    },
    delete: (key) => {
      items.delete(key);
      return Promise.resolve();
    },
  };
  return { store, items };
}

describe("chunkedStore", () => {
  it("returns nothing for a key never saved", async () => {
    expect(await chunkedStore(memory().store).get("__clerk_client_jwt")).toBeNull();
  });

  it("saves and reads a short value under a safe key", async () => {
    const { store, items } = memory();
    const chunks = chunkedStore(store);
    await chunks.set("__clerk_client_jwt", "token-1");
    expect(await chunks.get("__clerk_client_jwt")).toBe("token-1");
    expect([...items.keys()].every((key) => /^[A-Za-z0-9._-]+$/.test(key))).toBe(true);
  });

  it("replaces unsafe characters in keys", async () => {
    const { store, items } = memory();
    await chunkedStore(store).set("clerk:client/pk test", "x");
    expect([...items.keys()].sort()).toEqual([
      "clerk_client_pk_test.0",
      "clerk_client_pk_test.count",
    ]);
  });

  it("splits a long value into pieces and joins them back", async () => {
    const { store, items } = memory();
    const chunks = chunkedStore(store);
    const value = "a".repeat(CHUNK_LENGTH * 2 + 5);
    await chunks.set("client", value);
    expect(items.get("client.count")).toBe("3");
    expect(await chunks.get("client")).toBe(value);
  });

  it("never splits a character across pieces", async () => {
    const { store, items } = memory();
    const chunks = chunkedStore(store);
    const value = "a".repeat(CHUNK_LENGTH - 1) + "😀" + "b";
    await chunks.set("client", value);
    expect(items.get("client.0")?.endsWith("😀")).toBe(true);
    expect(await chunks.get("client")).toBe(value);
  });

  it("keeps an empty value", async () => {
    const chunks = chunkedStore(memory().store);
    await chunks.set("client", "");
    expect(await chunks.get("client")).toBe("");
  });

  it("removes leftover pieces when a value gets shorter", async () => {
    const { store, items } = memory();
    const chunks = chunkedStore(store);
    await chunks.set("client", "a".repeat(CHUNK_LENGTH * 3));
    await chunks.set("client", "short");
    expect(await chunks.get("client")).toBe("short");
    expect([...items.keys()].sort()).toEqual(["client.0", "client.count"]);
  });

  it("returns nothing when a piece is missing", async () => {
    const { store, items } = memory();
    const chunks = chunkedStore(store);
    await chunks.set("client", "a".repeat(CHUNK_LENGTH + 1));
    items.delete("client.1");
    expect(await chunks.get("client")).toBeNull();
  });

  it("returns nothing for a damaged count", async () => {
    const { store, items } = memory();
    items.set("client.count", "not a number");
    expect(await chunkedStore(store).get("client")).toBeNull();
    items.set("client.count", "0");
    expect(await chunkedStore(store).get("client")).toBeNull();
  });

  it("removes every piece", async () => {
    const { store, items } = memory();
    const chunks = chunkedStore(store);
    await chunks.set("client", "a".repeat(CHUNK_LENGTH * 2));
    await chunks.remove("client");
    expect(items.size).toBe(0);
    expect(await chunks.get("client")).toBeNull();
  });
});

describe("clerkStorage", () => {
  it("gives Clerk a token cache and a resource cache on the same store", async () => {
    const { tokenCache, resourceCache } = clerkStorage(memory().store);
    await tokenCache.saveToken("__clerk_client_jwt", "token-1");
    expect(await tokenCache.getToken("__clerk_client_jwt")).toBe("token-1");
    await tokenCache.clearToken("__clerk_client_jwt");
    expect(await tokenCache.getToken("__clerk_client_jwt")).toBeNull();

    const cache = resourceCache();
    await cache.set("__clerk_cache_client", "{}");
    expect(await cache.get("__clerk_cache_client")).toBe("{}");
  });

  it("treats an unreadable store as nothing saved", async () => {
    const { tokenCache, resourceCache } = clerkStorage(memory({ failGet: true }).store);
    expect(await tokenCache.getToken("__clerk_client_jwt")).toBeNull();
    expect(await resourceCache().get("__clerk_cache_client")).toBeNull();
  });

  it("drops a save that fails instead of throwing", async () => {
    const { tokenCache, resourceCache } = clerkStorage(memory({ failSet: true }).store);
    await expect(tokenCache.saveToken("__clerk_client_jwt", "token-1")).resolves.toBeUndefined();
    await expect(resourceCache().set("__clerk_cache_client", "{}")).resolves.toBeUndefined();
  });
});
