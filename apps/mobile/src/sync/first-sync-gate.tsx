import {
  FIRST_SYNC_OFFLINE_AFTER_MS,
  firstSyncCopy,
  firstSyncPhase,
  type SyncStatusSummary,
} from "@kineo/shared";
import type { PowerSyncDatabase } from "@powersync/react-native";
import { useEffect, useState, type ReactNode } from "react";
import { View } from "react-native";
import { Splash } from "@/components/splash";
import { Text } from "@/components/text";

/** What the gate needs from the database: PowerSync's status and its changes. */
export type SyncStatusSource = Pick<PowerSyncDatabase, "currentStatus" | "registerListener">;

/** Null until PowerSync knows whether this phone has synced before. */
function summarise(source: SyncStatusSource): SyncStatusSummary | null {
  const { hasSynced, connected } = source.currentStatus;
  return hasSynced === undefined ? null : { hasSynced, connected };
}

/** The sync status, kept up to date. */
export function useSyncStatus(source: SyncStatusSource): SyncStatusSummary | null {
  const [status, setStatus] = useState(() => summarise(source));
  useEffect(() => {
    setStatus(summarise(source));
    return source.registerListener({
      statusChanged: (changed) =>
        setStatus(
          changed.hasSynced === undefined
            ? null
            : { hasSynced: changed.hasSynced, connected: changed.connected },
        ),
    });
  }, [source]);
  return status;
}

/** True once `ms` has passed while `active`. */
function useElapsed(ms: number, active: boolean): boolean {
  const [elapsed, setElapsed] = useState(false);
  useEffect(() => {
    setElapsed(false);
    if (!active) return undefined;
    const timer = setTimeout(() => setElapsed(true), ms);
    return () => clearTimeout(timer);
  }, [ms, active]);
  return elapsed;
}

/**
 * Shows the app once this phone has finished its first sync. Before that (the first
 * sign-in on a phone) it says what's happening, once, and if there's no connection
 * for a few seconds, to connect to the internet. While the status isn't known yet it
 * shows a blank page, so a phone that has synced before never flashes it.
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
      <View
        accessibilityLabel="Opening Kineō"
        accessibilityState={{ busy: true }}
        className="flex-1 bg-background"
      />
    );
  }
  const copy = firstSyncCopy(phase, "phone");
  return (
    <Splash label="Getting your data">
      <Text
        accessibilityRole="header"
        className="text-center text-[17px] font-semibold text-foreground"
      >
        {copy.heading}
      </Text>
      <Text className="text-center text-[15px] text-muted">{copy.body}</Text>
    </Splash>
  );
}

/** The first-sync gate for a database. */
export function FirstSyncGateFor({ db, children }: { db: SyncStatusSource; children: ReactNode }) {
  return <FirstSyncGate status={useSyncStatus(db)}>{children}</FirstSyncGate>;
}
