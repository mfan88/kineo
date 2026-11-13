import { APPEARANCE_LABELS, APPEARANCE_SETTINGS } from "@kineo/shared";
import { Card } from "heroui-native";
import { Pressable, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { Screen } from "@/components/screen";
import { Text } from "@/components/text";
import { useAppearanceSetting } from "@/theme/appearance";
import { useThemeColors } from "@/theme/theme-colors";

/** Settings › Appearance: Match system, Light or Dark, for this phone. Applies at once. */
export function Appearance() {
  const colors = useThemeColors();
  const [setting, setSetting] = useAppearanceSetting();
  return (
    <Screen back title="Appearance">
      <Card accessibilityRole="radiogroup" accessibilityLabel="Appearance" className="px-4 py-1">
        {APPEARANCE_SETTINGS.map((option, index) => {
          const selected = option === setting;
          return (
            <Pressable
              key={option}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={APPEARANCE_LABELS[option]}
              onPress={() => setSetting(option)}
              className={`min-h-14 flex-row items-center gap-3 py-3 active:opacity-70 ${index > 0 ? "border-t border-separator" : ""}`}
            >
              <Text className="flex-1 text-foreground">{APPEARANCE_LABELS[option]}</Text>
              {selected ? (
                <Svg
                  width={20}
                  height={20}
                  viewBox="0 0 16 16"
                  fill="none"
                  accessibilityElementsHidden
                >
                  <Path
                    d="M3 8.5l3 3 7-7"
                    stroke={colors.primary}
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </Svg>
              ) : (
                <View style={{ width: 20 }} />
              )}
            </Pressable>
          );
        })}
      </Card>
      <Text className="text-sm text-muted">
        Match system follows your phone&apos;s setting. This choice is kept on this phone only.
      </Text>
    </Screen>
  );
}
