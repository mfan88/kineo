import "../../global.css";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { nativeFontFaces } from "@kineo/tokens";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { HeroUINativeProvider } from "heroui-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Uniwind } from "uniwind";

// The design brief has no dark mode: keep the light theme whatever the phone uses.
Uniwind.setTheme("light");

/** Inter's weights, bundled with the app, under the names the theme uses. */
const INTER = {
  [nativeFontFaces.normal]: Inter_400Regular,
  [nativeFontFaces.medium]: Inter_500Medium,
  [nativeFontFaces.semibold]: Inter_600SemiBold,
  [nativeFontFaces.bold]: Inter_700Bold,
};

/** The app's root: HeroUI Native, Inter, and a stack with no top bars. */
export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(INTER);
  // Hold the first frame until Inter is ready (it's bundled, so this is brief), so
  // text never flashes in another font. If loading fails, carry on with the system font.
  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <HeroUINativeProvider config={{ devInfo: { stylingPrinciples: false } }}>
        <Stack screenOptions={{ headerShown: false }} />
        <StatusBar style="dark" />
      </HeroUINativeProvider>
    </GestureHandlerRootView>
  );
}
