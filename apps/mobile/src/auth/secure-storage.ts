/** The few calls the session needs from `expo-secure-store`. */
export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

/**
 * Values are split into pieces this long: secure-store warns above 2048 bytes, and
 * Clerk's saved client (for starting offline) is longer than that.
 */
export const CHUNK_LENGTH = 1000;

/** Secure-store keys allow only letters, digits, ".", "-" and "_". */
function safeKey(key: string): string {
  return key.replace(/[^A-Za-z0-9._-]/g, "_");
}

/**
 * Text of any length kept in secure storage, in pieces. `key.count` is written last,
 * so a save that stops part-way leaves the previous count, and a read that finds a
 * piece missing returns nothing rather than a broken value.
 */
export function chunkedStore(store: KeyValueStore) {
  async function get(key: string): Promise<string | null> {
    const base = safeKey(key);
    const count = Number(await store.get(`${base}.count`));
    if (!Number.isInteger(count) || count < 1) return null;
    const pieces: string[] = [];
    for (let i = 0; i < count; i += 1) {
      const piece = await store.get(`${base}.${i}`);
      if (piece === null) return null;
      pieces.push(piece);
    }
    return pieces.join("");
  }

  async function remove(key: string): Promise<void> {
    const base = safeKey(key);
    const count = Number(await store.get(`${base}.count`));
    await store.delete(`${base}.count`);
    const pieces = Number.isInteger(count) && count > 0 ? count : 0;
    for (let i = 0; i < pieces; i += 1) await store.delete(`${base}.${i}`);
  }

  async function set(key: string, value: string): Promise<void> {
    const base = safeKey(key);
    const old = Number(await store.get(`${base}.count`));
    // Split by characters, never inside one (an emoji is two UTF-16 units).
    const characters = Array.from(value);
    const pieces: string[] = [];
    for (let i = 0; i < characters.length; i += CHUNK_LENGTH) {
      pieces.push(characters.slice(i, i + CHUNK_LENGTH).join(""));
    }
    if (pieces.length === 0) pieces.push("");
    // Hide the old value while its pieces are replaced.
    await store.delete(`${base}.count`);
    for (const [i, piece] of pieces.entries()) await store.set(`${base}.${i}`, piece);
    await store.set(`${base}.count`, String(pieces.length));
    if (Number.isInteger(old)) {
      for (let i = pieces.length; i < old; i += 1) await store.delete(`${base}.${i}`);
    }
  }

  return { get, set, remove };
}

/** Lists every key Clerk has saved, so Sign out can remove them all. */
const INDEX_KEY = "kineo_clerk_keys";

/**
 * What ClerkProvider asks for: `tokenCache` (the session's client token) and
 * `__experimental_resourceCache` (Clerk's last-known client and settings, so the
 * app starts signed in without a connection). Reads that fail count as nothing
 * saved; failed saves are dropped (signed out at the next start, never stuck).
 * `clearAll` removes everything Clerk saved, for Sign out.
 */
export function clerkStorage(store: KeyValueStore) {
  const chunks = chunkedStore(store);
  /** Saves run one after another, so the index never loses a key. */
  let queue: Promise<unknown> = Promise.resolve();
  const inOrder = (step: () => Promise<void>): Promise<void> => {
    const result = queue.then(step);
    queue = result.catch(() => {});
    return result.catch(() => {});
  };

  async function savedKeys(): Promise<string[]> {
    const raw = await chunks.get(INDEX_KEY).catch(() => null);
    if (raw === null) return [];
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((key) => typeof key === "string") : [];
    } catch {
      return [];
    }
  }

  const read = (key: string) => chunks.get(key).catch(() => null);
  const write = (key: string, value: string) =>
    inOrder(async () => {
      const keys = await savedKeys();
      if (!keys.includes(key)) await chunks.set(INDEX_KEY, JSON.stringify([...keys, key]));
      await chunks.set(key, value);
    });
  const remove = (key: string) => inOrder(() => chunks.remove(key));

  return {
    tokenCache: { getToken: read, saveToken: write, clearToken: remove },
    resourceCache: () => ({ get: read, set: write }),
    clearAll: () =>
      inOrder(async () => {
        for (const key of await savedKeys()) await chunks.remove(key);
        await chunks.remove(INDEX_KEY);
      }),
  };
}
