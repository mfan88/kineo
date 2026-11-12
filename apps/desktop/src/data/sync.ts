import { BOOLEAN_COLUMNS } from "@kineo/data";
import { uploadRejectionMessage, type UploadRejection } from "@kineo/shared";
import type { PowerSyncTauriDatabase } from "@powersync/tauri-plugin";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { notifyError } from "../components/Toasts";

interface TokenRequest {
  id: number;
  kind: "powersync" | "session";
}

/** Clerk's getToken: no template for the session token, "powersync" for PowerSync's. */
export type GetToken = (options?: { template?: string }) => Promise<string | null>;

/**
 * Connects the local database to the server. Sync runs in Rust (src-tauri/src/sync),
 * which asks this page for Clerk tokens and reports changes the server refused.
 * Returns a function that stops listening (D8 adds disconnecting).
 */
export async function startSync(
  db: PowerSyncTauriDatabase,
  getToken: GetToken,
): Promise<UnlistenFn> {
  const stopTokens = await listen<TokenRequest>("kineo://token-request", ({ payload }) => {
    const template = payload.kind === "powersync" ? { template: "powersync" } : undefined;
    getToken(template).then(
      (token) => invoke("sync_token_reply", { id: payload.id, token, error: null }),
      () =>
        invoke("sync_token_reply", {
          id: payload.id,
          token: null,
          error: "Couldn't get a sign-in token.",
        }),
    );
  });
  const stopRejections = await listen<UploadRejection>("kineo://upload-rejected", ({ payload }) => {
    notifyError(uploadRejectionMessage(payload));
  });

  try {
    await db.init();
    await invoke("sync_connect", { handle: db.rustHandle, booleanColumns: BOOLEAN_COLUMNS });
  } catch (error) {
    stopTokens();
    stopRejections();
    throw error;
  }
  return () => {
    stopTokens();
    stopRejections();
  };
}
