import { invoke } from "@tauri-apps/api/core";

/** Where Clerk's client token (the signed-in session) is kept between runs. */
export interface TokenStore {
  load(): Promise<string | null>;
  save(token: string): Promise<void>;
  clear(): Promise<void>;
}

/** The OS keychain, through src-tauri/src/session_store.rs. */
export const keychainTokenStore: TokenStore = {
  load: () => invoke<string | null>("session_token_load"),
  save: (token) => invoke("session_token_save", { token }),
  clear: () => invoke("session_token_clear"),
};

/** Outside the Tauri window (a plain browser): kept in memory, so it lasts one run. */
export function memoryTokenStore(): TokenStore {
  let saved: string | null = null;
  return {
    load: () => Promise.resolve(saved),
    save: (token) => {
      saved = token;
      return Promise.resolve();
    },
    clear: () => {
      saved = null;
      return Promise.resolve();
    },
  };
}

/**
 * Keeps the client token for Clerk's requests: read from the store once (before the
 * first request), sent on every request, and saved whenever Clerk returns a new one.
 * If the keychain can't be read or written, the app carries on with the token in
 * memory: signed out at the next start, never stuck.
 */
export function sessionToken(store: TokenStore) {
  let current = "";
  let loaded: Promise<void> | null = null;

  return {
    /** The token to send, once the saved one has been read. */
    async get(): Promise<string> {
      // A token Clerk has already handed over is newer than the saved one.
      loaded ??= store.load().then(
        (saved) => {
          if (current === "") current = saved ?? "";
        },
        () => {},
      );
      await loaded;
      return current;
    },
    /** Clerk's response header: saves it if it's new. */
    async received(header: string | null): Promise<void> {
      if (!header || header === current) return;
      current = header;
      await store.save(header).catch(() => {});
    },
  };
}
