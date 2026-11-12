// Must come first: the shared packages use standard JavaScript Hermes lacks.
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
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Uniwind } from "uniwind";
import { PracticeDataProvider } from "@/data/practice-data";

// The design brief has no dark mode: keep the light theme whatever the phone uses.
Uniwind.setTheme("light");

/** Inter's weights, bundled with the app, under the names the theme uses. */
const INTER = {
  [nativeFontFaces.normal]: Inter_400Regular,
  [nativeFontFaces.medium]: Inter_500Medium,
  [nativeFontFaces.semibold]: Inter_600SemiBold,
  [nativeFontFaces.bold]: Inter_700Bold,
};

/**
 * The app's root: HeroUI Native, Inter, and the bottom tab bar (design brief: Home,
 * Patients, Invoices, Settings; each tab appears once its screen exists). The
 * active tab is the brand sky blue.
 */
export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(INTER);
  // Hold the first frame until Inter is ready (it's bundled, so this is brief), so
  // text never flashes in another font. If loading fails, carry on with the system font.
  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <HeroUINativeProvider config={{ devInfo: { stylingPrinciples: false } }}>
        <PracticeDataProvider>
          <NativeTabs tintColor={colors.primary}>
            <NativeTabs.Trigger name="(home)">
              <NativeTabs.Trigger.Icon
                sf={{ default: "house", selected: "house.fill" }}
                md="home"
              />
              <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
            </NativeTabs.Trigger>
          </NativeTabs>
        </PracticeDataProvider>
        <StatusBar style="dark" />
      </HeroUINativeProvider>
    </GestureHandlerRootView>
  );
}
