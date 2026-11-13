import {
  parseAppearance,
  resolveAppearance,
  type AppearanceSetting,
  type ResolvedAppearance,
} from "@kineo/shared";
import { useSyncExternalStore } from "react";

const DARK_QUERY = "(prefers-color-scheme: dark)";
/** Where this computer keeps the choice. Device only, never synced; Sign out keeps it. */
export const APPEARANCE_STORAGE_KEY = "kineo.appearance";

/** The parts of `matchMedia`'s result this uses. */
export interface AppearanceMedia {
  readonly matches: boolean;
  addEventListener(type: "change", listener: () => void): void;
  removeEventListener(type: "change", listener: () => void): void;
}

/** The parts of `localStorage` this uses. */
export type AppearanceStorage = Pick<Storage, "getItem" | "setItem">;

export interface AppearanceState {
  setting: AppearanceSetting;
  systemIsDark: boolean;
}

/** Sets HeroUI's theme attribute (and class) on the root element. */
export function applyColorScheme(root: HTMLElement, scheme: ResolvedAppearance): void {
  root.dataset.theme = scheme;
  root.classList.toggle("dark", scheme === "dark");
  root.classList.toggle("light", scheme === "light");
}

/**
 * The app's appearance: the saved choice plus the system's, applied to the root
 * element now and whenever either changes.
 */
export function createAppearance(
  root: HTMLElement,
  media: AppearanceMedia,
  storage: AppearanceStorage,
) {
  const read = () => {
    try {
      return parseAppearance(storage.getItem(APPEARANCE_STORAGE_KEY));
    } catch {
      return parseAppearance(null);
    }
  };
  let state: AppearanceState = { setting: read(), systemIsDark: media.matches };
  const listeners = new Set<() => void>();

  const update = (next: AppearanceState) => {
    state = next;
    applyColorScheme(root, resolveAppearance(state.setting, state.systemIsDark));
    for (const listener of listeners) listener();
  };
  update(state);
  media.addEventListener("change", () => update({ ...state, systemIsDark: media.matches }));

  return {
    get: (): AppearanceState => state,
    set: (setting: AppearanceSetting) => {
      try {
        storage.setItem(APPEARANCE_STORAGE_KEY, setting);
      } catch {
        // Storage can be unavailable; the choice still applies until the app closes.
      }
      update({ ...state, setting });
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export type Appearance = ReturnType<typeof createAppearance>;

let current: Appearance | null = null;

/** The system's dark-mode query, or a light system that never changes where there's none. */
function systemMedia(): AppearanceMedia {
  if (typeof window.matchMedia === "function") return window.matchMedia(DARK_QUERY);
  return {
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  };
}

/** Starts the app's appearance (call once, before the first render). */
export function startAppearance(
  root: HTMLElement = document.documentElement,
  media: AppearanceMedia = systemMedia(),
  storage: AppearanceStorage = window.localStorage,
): Appearance {
  current = createAppearance(root, media, storage);
  return current;
}

function appearance(): Appearance {
  current ??= startAppearance();
  return current;
}

/** The Appearance setting and the system's appearance, kept current. */
export function useAppearance(): AppearanceState & { set: (setting: AppearanceSetting) => void } {
  const store = appearance();
  const state = useSyncExternalStore(store.subscribe, store.get);
  return { ...state, set: store.set };
}
