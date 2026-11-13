import { ToggleButton, ToggleButtonGroup } from "@heroui/react";
import {
  APPEARANCE_LABELS,
  APPEARANCE_SETTINGS,
  parseAppearance,
  type AppearanceSetting,
} from "@kineo/shared";
import { useAppearance } from "../theme/appearance";

/**
 * Settings › Appearance: Match system, Light or Dark, for this computer only. It
 * applies at once and is kept across restarts and sign-outs.
 */
export function AppearanceSection() {
  const { setting, set } = useAppearance();
  return (
    <section
      aria-labelledby="appearance-title"
      className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-surface px-4 py-3 shadow-surface"
    >
      <span className="flex flex-col">
        <span id="appearance-title" className="font-medium">
          Appearance
        </span>
        <span className="text-sm text-muted">
          Match system follows your computer&apos;s setting.
        </span>
      </span>
      <ToggleButtonGroup
        aria-labelledby="appearance-title"
        selectionMode="single"
        disallowEmptySelection
        selectedKeys={new Set<AppearanceSetting>([setting])}
        onSelectionChange={(keys) => {
          const [key] = keys;
          if (key !== undefined) set(parseAppearance(String(key)));
        }}
      >
        {APPEARANCE_SETTINGS.map((option) => (
          <ToggleButton key={option} id={option} className="min-h-11">
            {APPEARANCE_LABELS[option]}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
    </section>
  );
}
