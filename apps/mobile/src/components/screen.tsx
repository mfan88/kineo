import { colors } from "@kineo/tokens";
import { router } from "expo-router";
import { Button } from "heroui-native";
import type { ReactNode } from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";

/** At least this much space above the content, for the status bar and notch (design brief). */
export const TOP_SPACE = 64;
/** Height of the row that holds the back arrow on detail screens (design brief). */
export const BACK_ROW = 52;

interface ScreenProps {
  title: string;
  /** Small text above the heading, such as today's date on Home. */
  eyebrow?: string | null;
  /** Show the back arrow. Every detail screen has one; tab screens don't. */
  back?: boolean;
  children?: ReactNode;
}

/**
 * Layout for every phone screen: no top bar, just generous space for the notch, a
 * back arrow on detail screens, the heading, then the content, scrolling.
 */
export function Screen({ title, eyebrow, back = false, children }: ScreenProps) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ paddingTop: Math.max(insets.top, TOP_SPACE), paddingBottom: 32 }}
      keyboardShouldPersistTaps="handled"
    >
      <View className="gap-6 px-6">
        {back ? (
          <View style={{ height: BACK_ROW }} className="justify-center">
            <BackButton />
          </View>
        ) : null}
        <View className="gap-1">
          {eyebrow ? <Text className="text-sm text-muted">{eyebrow}</Text> : null}
          <Text accessibilityRole="header" className="font-semibold text-[28px] text-foreground">
            {title}
          </Text>
        </View>
        {children}
      </View>
    </ScrollView>
  );
}

function BackButton() {
  return (
    <Button
      isIconOnly
      variant="ghost"
      accessibilityLabel="Back"
      className="-ml-3 size-11"
      onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
    >
      <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" accessibilityElementsHidden>
        <Path
          d="M15 18l-6-6 6-6"
          stroke={colors.text}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </Button>
  );
}
