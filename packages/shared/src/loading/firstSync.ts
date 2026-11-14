import { FEEDBACK_EMAIL } from "../links";

/** Without a connection this long, the first-sync screen says the device is offline. */
export const FIRST_SYNC_OFFLINE_AFTER_MS = 5000;
/** The sign-in check shows "Signing you in" only if it takes longer than this. */
export const SIGN_IN_TEXT_AFTER_MS = 2000;

/** What the apps know about syncing. `hasSynced` stays true across restarts. */
export interface SyncStatusSummary {
  hasSynced: boolean;
  connected: boolean;
  /** True when the server has repeatedly refused upload batches. */
  uploadRefused?: boolean;
}

/**
 * What the first-sync screen should show:
 * - `checking`: the status isn't known yet, so show nothing special.
 * - `done`: this device has synced before; show the app.
 * - `getting`: "Getting your patients and invoices".
 * - `offline`: no connection for a while, so say to connect to the internet.
 * - `refused`: the server is rejecting upload batches; say so with support email.
 */
export type FirstSyncPhase = "checking" | "done" | "getting" | "offline" | "refused";

export function firstSyncPhase(
  status: SyncStatusSummary | null,
  offlineWaitElapsed: boolean,
): FirstSyncPhase {
  if (status === null) return "checking";
  if (status.hasSynced) return "done";
  if (status.uploadRefused) return "refused";
  if (!status.connected && offlineWaitElapsed) return "offline";
  return "getting";
}

/** The first-sync screen's words. `device` is "phone" or "computer". */
export function firstSyncCopy(
  phase: "getting" | "offline" | "refused",
  device: "phone" | "computer",
): { heading: string; body: string } {
  if (phase === "refused") {
    return {
      heading: "Kineō can't save to the server",
      body: `It will keep trying. If this doesn't clear up in a few minutes, email ${FEEDBACK_EMAIL}.`,
    };
  }
  if (phase === "offline") {
    return {
      heading: "You're offline",
      body: `Connect to the internet to get your patients and invoices. Kineō will carry on once this ${device} is connected.`,
    };
  }
  return {
    heading: "Getting your patients and invoices",
    body: `This only happens once on this ${device}. Keep Kineō open until it finishes.`,
  };
}
