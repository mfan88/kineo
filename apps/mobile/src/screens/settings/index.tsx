import { colors } from "@kineo/tokens";
import { router, type Href } from "expo-router";
import { Card } from "heroui-native";
import { Pressable, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { Screen } from "@/components/screen";
import { Text } from "@/components/text";

interface Section {
  title: string;
  description: string;
  /** Where the row goes. */
  href: Href;
}

const SECTIONS: Section[] = [
  {
    title: "Your profile",
    description: "Your name, clinic and contact details, and which appear on invoices.",
    href: "/profile",
  },
  {
    title: "Price list and tax",
    description: "What you charge, your default tax rate and invoice numbers.",
    href: "/price-list",
  },
];

/** Settings: your profile, and your price list and tax. Invoice style is set on desktop. */
export function Settings() {
  return (
    <Screen title="Settings">
      <Card accessibilityLabel="Settings" className="px-4 py-1">
        {SECTIONS.map(({ title, description, href }, index) => (
          <Pressable
            key={title}
            accessibilityRole="button"
            accessibilityLabel={title}
            accessibilityHint={description}
            onPress={() => router.navigate(href)}
            className={`min-h-16 flex-row items-center gap-3 py-3 active:opacity-70 ${index > 0 ? "border-t border-separator" : ""}`}
          >
            <View className="flex-1">
              <Text className="font-medium text-foreground">{title}</Text>
              <Text className="text-sm text-muted">{description}</Text>
            </View>
            <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" accessibilityElementsHidden>
              <Path
                d="M9 6l6 6-6 6"
                stroke={colors.mutedText}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          </Pressable>
        ))}
      </Card>
      <Text className="text-sm text-muted">
        Invoice style (logo, colour, font and layout) is set in Kineō on your computer. Invoices
        made on this phone use it.
      </Text>
    </Screen>
  );
}
