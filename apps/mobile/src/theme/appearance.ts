import type { AppearanceSetting } from "@kineo/shared";
import { File, Paths } from "expo-file-system";
import { useSyncExternalStore } from "react";
import { Uniwind } from "uniwind";
import { createAppearanceStore } from "./appearance-store";

/**
 * Where this phone keeps the Appearance choice: a small file in the app's documents
 * folder. Device only, never synced; Sign out leaves it (it holds no account data).
 */
const file = () => new File(Paths.document, "appearance.txt");

/** The phone's Appearance setting, applied to Uniwind's theme from the first frame. */
export const appearance = createAppearanceStore({
  read: () => {
    const saved = file();
    return saved.exists ? saved.textSync() : null;
  },
  write: (setting) => {
    file()
      .write(setting)
      .catch(() => undefined);
  },
  apply: (setting) => Uniwind.setTheme(setting),
});

/** The Appearance setting, kept current, and a way to change it. */
export function useAppearanceSetting(): [AppearanceSetting, (setting: AppearanceSetting) => void] {
  const setting = useSyncExternalStore(appearance.subscribe, appearance.get);
  return [setting, appearance.set];
}
