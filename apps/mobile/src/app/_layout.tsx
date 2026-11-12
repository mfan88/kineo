// Must come first: the shared packages use standard JavaScript Hermes lacks.
// oxlint-disable-next-line import/no-unassigned-import
import "@/utils/polyfills";
import "../../global.css";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { colors, nativeFontFaces } from "@kineo/tokens";
import { NativeTabs } from "expo-router/native-tabs";
import { StatusBar } from "expo-status-bar";
import { HeroUINativeProvider } from "heroui-native";
import { useEffect } from "react";
import { MAX_TEXT_SCALE } from "@/components/text";
import { Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Uniwind } from "uniwind";
import { practiceStore } from "@/data/local-practice";
import { PracticeDataProvider } from "@/data/practice-data";

// The design brief has no dark mode: keep the light theme whatever the phone uses.
Uniwind.setTheme("light");

/**
 * On iOS each tab leaves the space around its scroll view to components/screen.tsx:
 * the automatic space came and went (gone once the keyboard had opened), so screens
 * jumped. Android's automatic space is what keeps content above its tab bar.
 */
const OWN_SPACING = Platform.OS === "ios";

/** Inter's weights, bundled with the app, under the names the theme uses. */
const INTER = {
  [nativeFontFaces.normal]: Inter_400Regular,
  [nativeFontFaces.medium]: Inter_500Medium,
  [nativeFontFaces.semibold]: Inter_600SemiBold,
  [nativeFontFaces.bold]: Inter_700Bold,
};

/**
 * The app's root: HeroUI Native, Inter, and the bottom tab bar (design brief: Home,
 * Patients, Invoices, Settings). The active tab is the brand sky blue.
 */
export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(INTER);
  // Open the local database at start-up and keep reading it while the app runs.
  useEffect(() => {
    practiceStore.start();
    return () => practiceStore.stop();
  }, []);
  // Hold the first frame until Inter is ready (it's bundled, so this is brief), so
  // text never flashes in another font. If loading fails, carry on with the system font.
  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <HeroUINativeProvider
        config={{
          devInfo: { stylingPrinciples: false },
          // HeroUI's own text (chips, search field) grows as far as ours; see components/text.tsx.
          textProps: { maxFontSizeMultiplier: MAX_TEXT_SCALE },
          textInputProps: { maxFontSizeMultiplier: MAX_TEXT_SCALE },
        }}
      >
        <PracticeDataProvider store={practiceStore}>
          {/* Active tab: sky icon (brand), label in the darker link blue, since sky
              text is only about 4:1 on the tab bar and text needs 4.5:1. */}
          <NativeTabs
            tintColor={colors.primary}
            iconColor={{ selected: colors.primary }}
            labelStyle={{ selected: { color: colors.primaryStrong } }}
            // Android draws its bar and the active-tab pill in Material's lavender
            // unless told otherwise.
            backgroundColor={colors.surface}
            indicatorColor={colors.tint}
            // With four tabs, Android would label only the selected one.
            labelVisibilityMode="labeled"
          >
            <NativeTabs.Trigger name="(home)" disableAutomaticContentInsets={OWN_SPACING}>
              <NativeTabs.Trigger.Icon
                sf={{ default: "house", selected: "house.fill" }}
                md="home"
              />
              <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
            </NativeTabs.Trigger>
            <NativeTabs.Trigger name="(patients)" disableAutomaticContentInsets={OWN_SPACING}>
              <NativeTabs.Trigger.Icon
                sf={{ default: "person.2", selected: "person.2.fill" }}
                md="group"
              />
              <NativeTabs.Trigger.Label>Patients</NativeTabs.Trigger.Label>
            </NativeTabs.Trigger>
            <NativeTabs.Trigger name="(invoices)" disableAutomaticContentInsets={OWN_SPACING}>
              <NativeTabs.Trigger.Icon
                sf={{ default: "doc.text", selected: "doc.text.fill" }}
                md="receipt_long"
              />
              <NativeTabs.Trigger.Label>Invoices</NativeTabs.Trigger.Label>
            </NativeTabs.Trigger>
            <NativeTabs.Trigger name="(settings)" disableAutomaticContentInsets={OWN_SPACING}>
              <NativeTabs.Trigger.Icon
                sf={{ default: "gearshape", selected: "gearshape.fill" }}
                md="settings"
              />
              <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
            </NativeTabs.Trigger>
          </NativeTabs>
        </PracticeDataProvider>
        <StatusBar style="dark" />
      </HeroUINativeProvider>
    </GestureHandlerRootView>
  );
}
