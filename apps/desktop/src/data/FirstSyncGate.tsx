import {
  FIRST_SYNC_OFFLINE_AFTER_MS,
  firstSyncCopy,
  firstSyncPhase,
  type SyncStatusSummary,
} from "@kineo/shared";
import type { ReactNode } from "react";
import { Splash } from "../components/Splash";
import { useElapsed } from "../components/useElapsed";

/**
 * Shows the app once this computer has finished its first sync. Before that (the
 * first sign-in on a computer) it says what's happening, once, and if there's no
 * connection for a few seconds, to connect to the internet. While the status is not
 * known yet it shows nothing special, so a computer that has synced before never flashes it.
 */
export function FirstSyncGate({
  status,
  children,
}: {
  status: SyncStatusSummary | null;
  children: ReactNode;
}) {
  const waiting = status !== null && !status.hasSynced;
  const offlineWaitElapsed = useElapsed(FIRST_SYNC_OFFLINE_AFTER_MS, waiting);
  const phase = firstSyncPhase(status, offlineWaitElapsed);

  if (phase === "done") return children;
  if (phase === "checking") {
    return (
      <main aria-busy="true" aria-label="Opening Kineō" className="min-h-screen bg-background" />
    );
  }
  const copy = firstSyncCopy(phase, "computer");
  return (
    <Splash label="Getting your data">
      <p className="text-lg font-semibold">{copy.heading}</p>
      <p className="text-muted">{copy.body}</p>
    </Splash>
  );
}
