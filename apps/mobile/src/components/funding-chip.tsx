import { fundingChipIcons } from "@kineo/tokens";
import { View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { useThemeColors } from "@/theme/theme-colors";
import { Text } from "./text";

/** A funder (a building), self-pay (a person) or a funding that has ended (a dashed ring). */
export type FundingChipVariant = keyof typeof fundingChipIcons;

const ICON_SIZE = 14;

/**
 * A small outlined pill saying who a patient is billed through: the funder's name, "Self-pay",
 * or "Ended 31 Mar 2027" (dashed outline). The icon and word mean it never depends on
 * colour alone; the label stays on one line.
 */
export function FundingChip({ variant, label }: { variant: FundingChipVariant; label: string }) {
  const colors = useThemeColors();
  const icon = fundingChipIcons[variant];
  const strokeWidth = icon.viewBox === "0 0 24 24" ? 2 : 1.6;
  return (
    <View
      testID={`funding-chip-${variant}`}
      accessible
      accessibilityLabel={label}
      className="flex-row items-center self-start rounded-full"
      style={{
        gap: 6,
        paddingTop: 3,
        paddingBottom: 3,
        paddingLeft: 8,
        paddingRight: 10,
        borderWidth: 1,
        borderStyle: variant === "ended" ? "dashed" : "solid",
        borderColor: colors.inputEdge,
      }}
    >
      <Svg
        width={ICON_SIZE}
        height={ICON_SIZE}
        viewBox={icon.viewBox}
        fill="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {icon.paths.map((d) => (
          <Path
            key={d}
            d={d}
            stroke={colors.chipText}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        {icon.circles.map((circle) => (
          <Circle
            key={`${circle.cx}-${circle.cy}`}
            cx={circle.cx}
            cy={circle.cy}
            r={circle.r}
            stroke={colors.chipText}
            strokeWidth={strokeWidth}
            {...(circle.dashed ? { strokeDasharray: "2 2" } : {})}
          />
        ))}
      </Svg>
      <Text
        numberOfLines={1}
        className="text-[13px] font-medium"
        style={{ color: colors.chipText }}
      >
        {label}
      </Text>
    </View>
  );
}
