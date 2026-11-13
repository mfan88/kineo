import type { SyncStatusSummary } from "@kineo/shared";
import { useSyncExternalStore } from "react";

/** The latest sync status reported by the Rust side; null until the first report. */
export class SyncStatusStore {
  private status: SyncStatusSummary | null = null;
  private readonly listeners = new Set<() => void>();

  getStatus = (): SyncStatusSummary | null => this.status;

  set(status: SyncStatusSummary): void {
    const same =
      this.status?.hasSynced === status.hasSynced && this.status.connected === status.connected;
    if (same) return;
    this.status = status;
    for (const listener of this.listeners) listener();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
}

export function useSyncStatus(store: SyncStatusStore): SyncStatusSummary | null {
  return useSyncExternalStore(store.subscribe, store.getStatus);
}
