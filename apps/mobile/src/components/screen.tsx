import { router, useIsFocused } from "expo-router";
import { Button } from "heroui-native";
import { useCallback, useEffect, useRef, type ComponentRef, type ReactNode } from "react";
import { ScrollView, useWindowDimensions, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { useThemeColors } from "@/theme/theme-colors";
import { Text } from "./text";
import { setToastAnchor } from "./toast-offset";

/** At least this much space above the content, for the status bar and notch (design brief). */
export const TOP_SPACE = 64;
/** Height of the row that holds the back arrow on detail screens (design brief). */
export const BACK_ROW = 52;

interface ScreenProps {
  /** The heading. Anything that isn't text is a loading placeholder for it. */
  title: ReactNode;
  /** Above the heading: small text such as today's date on Home, or an invoice's status tag. */
  eyebrow?: ReactNode;
  /** A larger heading, for an amount (an invoice's total on its detail screen). */
  large?: boolean;
  /** Beside the heading, at its end, such as an invoice's status tag. */
  aside?: ReactNode;
  /** A quiet line under the heading, such as "Last visit 4 Nov · Right ankle". */
  subtitle?: string | null;
  /** Show the back arrow. Every detail screen has one; tab screens don't. */
  back?: boolean;
  /** The screen's one primary button, pinned above the tab bar while the rest scrolls. */
  footer?: ReactNode;
  children?: ReactNode;
}

/**
 * Layout for every phone screen: no top bar, just generous space for the notch, a
 * back arrow on detail screens, the heading, then the content, scrolling.
 */
export function Screen(props: ScreenProps) {
  // Screens in other tabs stay mounted; only the one in front moves for the keyboard.
  const inFront = useIsFocused();
  return <ScreenLayout {...props} inFront={inFront} />;
}

/**
 * The layout itself, for the few screens shown outside the tabs (when the local
 * database can't be opened), where there's no "in front" to ask about.
 */
export function ScreenLayout({
  title,
  eyebrow,
  large = false,
  aside,
  subtitle,
  back = false,
  footer,
  inFront = true,
  children,
}: ScreenProps & { inFront?: boolean }) {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { height: windowHeight } = useWindowDimensions();
  // Toasts sit just above the pinned button (or the tab bar), wherever the text size
  // puts it: the screen in front tells them where that is.
  const pinned = useRef<ComponentRef<typeof View>>(null);
  const measurePinned = useCallback(() => {
    if (!inFront) return;
    pinned.current?.measureInWindow((_x, y) => setToastAnchor(y, windowHeight));
  }, [inFront, windowHeight]);
  useEffect(() => {
    measurePinned();
  }, [measurePinned]);
  return (
    // The safe area view keeps the content above the tab bar: it measures where it
    // actually sits, tab bar included. The tabs leave all spacing to this layout
    // (OWN_SPACING in app/_layout.tsx).
    <SafeAreaView edges={["bottom"]} style={{ flex: 1, backgroundColor: colors.pageBackground }}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingTop: Math.max(insets.top, TOP_SPACE), paddingBottom: 32 }}
        // All the space around the content is set here, none by iOS.
        contentInsetAdjustmentBehavior="never"
        keyboardShouldPersistTaps="handled"
        // Keep the field being typed in above the keyboard (iOS; Android resizes the window).
        automaticallyAdjustKeyboardInsets={inFront}
        keyboardDismissMode="interactive"
      >
        <View className="gap-6 px-4">
          {back ? (
            <View style={{ height: BACK_ROW }} className="justify-center">
              <BackButton />
            </View>
          ) : null}
          <View className={large ? "gap-2" : "gap-1"}>
            {typeof eyebrow === "string" ? (
              <Text className="text-sm text-muted">{eyebrow}</Text>
            ) : (
              (eyebrow ?? null)
            )}
            {typeof title === "string" ? (
              <View className="flex-row items-center justify-between gap-3">
                <Text
                  accessibilityRole="header"
                  className={`shrink text-foreground ${
                    large
                      ? "font-bold text-[34px] tracking-tight tabular-nums"
                      : "font-semibold text-[28px]"
                  }`}
                >
                  {title}
                </Text>
                {aside}
              </View>
            ) : (
              <View
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                className="h-9 justify-center"
              >
                {title}
              </View>
            )}
            {subtitle ? (
              <Text className={large ? "text-[15px] text-muted" : "text-sm text-muted"}>
                {subtitle}
              </Text>
            ) : null}
          </View>
          {children}
        </View>
      </ScrollView>
      {/* Content scrolls up under the status bar; keep the clock and battery legible over it. */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: insets.top,
          backgroundColor: colors.pageBackground,
        }}
      />
      <View ref={pinned} collapsable={false} onLayout={measurePinned}>
        {footer ? <View className="bg-background px-4 pt-2 pb-4">{footer}</View> : null}
      </View>
    </SafeAreaView>
  );
}

function BackButton() {
  const colors = useThemeColors();
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
