/**
 * The Appearance setting (design brief, Settings): match the system, or always
 * light or dark. It's kept on each device and never synced.
 */
export const APPEARANCE_SETTINGS = ["system", "light", "dark"] as const;
export type AppearanceSetting = (typeof APPEARANCE_SETTINGS)[number];
export type ResolvedAppearance = "light" | "dark";

/** Default for a device that has no saved choice. */
export const DEFAULT_APPEARANCE: AppearanceSetting = "system";

/** Labels in the order shown. */
export const APPEARANCE_LABELS: Record<AppearanceSetting, string> = {
  system: "Match system",
  light: "Light",
  dark: "Dark",
};

/** A saved value read back from storage; anything unknown (or missing) is the default. */
export function parseAppearance(raw: unknown): AppearanceSetting {
  const value = typeof raw === "string" ? raw.trim() : "";
  return (APPEARANCE_SETTINGS as readonly string[]).includes(value)
    ? (value as AppearanceSetting)
    : DEFAULT_APPEARANCE;
}

/** Light or dark on screen, given the setting and whether the system is dark. */
export function resolveAppearance(
  setting: AppearanceSetting,
  systemIsDark: boolean,
): ResolvedAppearance {
  if (setting === "system") return systemIsDark ? "dark" : "light";
  return setting;
}

/** The Settings row's summary, e.g. "Match system · light now" or "Dark". */
export function appearanceSummary(setting: AppearanceSetting, systemIsDark: boolean): string {
  if (setting !== "system") return APPEARANCE_LABELS[setting];
  return `${APPEARANCE_LABELS.system} · ${resolveAppearance(setting, systemIsDark)} now`;
}
