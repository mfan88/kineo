import { parseAppearance, type AppearanceSetting } from "@kineo/shared";

/** What the store needs from the phone: saved-choice storage and the theme switch. */
export interface AppearanceDevice {
  /** The saved choice as written, or null if there's none. */
  read(): string | null;
  write(setting: AppearanceSetting): void;
  /** Shows the theme: Uniwind's "system", "light" or "dark". */
  apply(setting: AppearanceSetting): void;
}

/**
 * The Appearance setting on this phone: read once at start, applied straight away,
 * and saved when changed. A failed read or write never stops the app; it falls back
 * to matching the system, or keeps the new choice until the app closes.
 */
export function createAppearanceStore(device: AppearanceDevice) {
  let setting: AppearanceSetting;
  try {
    setting = parseAppearance(device.read());
  } catch {
    setting = parseAppearance(null);
  }
  device.apply(setting);
  const listeners = new Set<() => void>();

  return {
    get: (): AppearanceSetting => setting,
    set: (next: AppearanceSetting) => {
      setting = next;
      try {
        device.write(next);
      } catch {
        // Not saved; it still applies until the app closes.
      }
      device.apply(next);
      for (const listener of listeners) listener();
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export type AppearanceStore = ReturnType<typeof createAppearanceStore>;
