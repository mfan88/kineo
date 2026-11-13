import {
  statusTagFor,
  statusTagIcons,
  type StatusTagToken,
  type TaggedStatus,
} from "@kineo/tokens";
import { View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { useThemeStatusTags } from "@/theme/theme-colors";
import { Text } from "./text";

/**
 * A pill with an icon and a word for a visit's or invoice's state (or an error),
 * in the light or dark tag colours from @kineo/tokens. The icon and word mean status
 * never depends on colour alone.
 */
export function StatusTag({
  status,
  size = "sm",
}: {
  status: TaggedStatus | "error";
  size?: "sm" | "md";
}) {
  const tags = useThemeStatusTags();
  const key: StatusTagToken = status === "error" ? "error" : statusTagFor(status);
  const tag = tags[key];
  const icon = statusTagIcons[key];
  const iconSize = size === "sm" ? 12 : 14;
  return (
    <View
      testID={`status-tag-${key}`}
      accessible
      accessibilityLabel={tag.label}
      className={`flex-row items-center gap-1.5 self-start rounded-full ${
        size === "sm" ? "px-2.5 py-0.5" : "px-3 py-1"
      }`}
      style={{ backgroundColor: tag.background }}
    >
      <Svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 16 16"
        fill="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {icon.circle ? (
          <Circle
            cx={8}
            cy={8}
            r={6}
            stroke={tag.text}
            strokeWidth={1.7}
            {...(icon.circle === "dashed" ? { strokeDasharray: "2 2" } : {})}
          />
        ) : null}
        {icon.path ? (
          <Path
            d={icon.path}
            stroke={tag.text}
            strokeWidth={1.7}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}
      </Svg>
      <Text
        className={`font-medium ${size === "sm" ? "text-xs" : "text-sm"}`}
        style={{ color: tag.text }}
      >
        {tag.label}
      </Text>
    </View>
  );
}
