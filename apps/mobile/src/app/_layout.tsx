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
import { nativeFontFaces } from "@kineo/tokens";
import { SyncStreamConnectionMethod } from "@powersync/react-native";
import { NativeTabs } from "expo-router/native-tabs";
import { StatusBar } from "expo-status-bar";
import { HeroUINativeProvider } from "heroui-native";
import { useAuth, useClerk, useUser } from "@clerk/expo";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { MAX_TEXT_SCALE } from "@/components/text";
import { useToastBottom } from "@/components/toast-offset";
import { Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AccountContext, type Account } from "@/auth/account";
import { AuthGate } from "@/auth/auth-gate";
import { useThemeColors } from "@/theme/theme-colors";
import { AuthProvider, savedSession } from "@/auth/auth-provider";
import { SignUpProfileName } from "@/auth/sign-up-profile-name";
import { signOut } from "@/auth/sign-out";
import { createLocalPractice } from "@/data/local-practice";
import { PracticeDataProvider } from "@/data/practice-data";
import { LogoProvider } from "@/invoice/logo-context";
import { clearLogoFiles } from "@/invoice/logo-files";
import { FirstSyncGateFor } from "@/sync/first-sync-gate";
import { RejectionToasts } from "@/sync/rejection-toasts";

// Light or dark from the Appearance setting (Match system by default), applied at start.
// oxlint-disable-next-line import/no-unassigned-import
import "@/theme/appearance";

/**
 * On iOS each tab leaves the space around its scroll view to components/screen.tsx:
 * the automatic space came and went (gone once the keyboard had opened), so screens
 * jumped. Android's automatic space is what keeps content above its tab bar.
 */
const OWN_SPACING = Platform.OS === "ios";

/**
 * Toasts sit at the bottom, just above the screen's pinned primary button (storyboard),
 * so they never cover the back arrow, even when one with Undo stays until dismissed.
 * The screen in front measures that place (components/toast-offset.ts); until one has,
 * this rough fallback holds: the tab bar plus one pinned button, above the safe area.
 * HeroUI Native's inset replaces the safe area rather than adding to it.
 */
const FALLBACK_TOAST_SPACE = (Platform.OS === "ios" ? 49 : 80) + 88;

/** Inter's weights, bundled with the app, under the names the theme uses. */
const INTER = {
  [nativeFontFaces.normal]: Inter_400Regular,
  [nativeFontFaces.medium]: Inter_500Medium,
  [nativeFontFaces.semibold]: Inter_600SemiBold,
  [nativeFontFaces.bold]: Inter_700Bold,
};

/**
 * The app's root: HeroUI Native, Inter, and the bottom tab bar (design brief: Home,
 * Patients, Invoices, Settings), shown once signed in. The active tab is the brand sky blue.
 */
export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(INTER);
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const toastBottom = useToastBottom() ?? insets.bottom + FALLBACK_TOAST_SPACE;
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
          toast: {
            defaultProps: { placement: "bottom" },
            insets: { bottom: toastBottom },
          },
        }}
      >
        <AuthProvider>
          <AuthGate>
            {(userId) => (
              <SignedInPractice userId={userId}>
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
              </SignedInPractice>
            )}
          </AuthGate>
        </AuthProvider>
        <StatusBar style="auto" />
      </HeroUINativeProvider>
    </GestureHandlerRootView>
  );
}

/**
 * Opens the signed-in practitioner's own local database, keeps reading it, and
 * syncs it with the server while they're signed in. Nothing is opened before sign-in.
 */
/** How Android connects to PowerSync (see SignedInPractice). */
const ANDROID_SYNC = { connectionMethod: SyncStreamConnectionMethod.WEB_SOCKET };

function SignedInPractice({ userId, children }: { userId: string; children: ReactNode }) {
  const { getToken } = useAuth();
  // Clerk may hand over a new getToken on each render; sync always asks the latest.
  const latestGetToken = useRef(getToken);
  latestGetToken.current = getToken;
  const practice = useMemo(
    () =>
      createLocalPractice(userId, (kind) =>
        latestGetToken.current(kind === "powersync" ? { template: "powersync" } : undefined),
      ),
    [userId],
  );
  useEffect(() => {
    const { db, store, connector } = practice;
    store.start();
    // Android syncs over WebSockets: with HTTP (expo/fetch streaming) the connection
    // never opened there, with no error (found in M19; see docs/tech-stack.md).
    const options = Platform.OS === "android" ? ANDROID_SYNC : {};
    // Works offline too: PowerSync keeps trying, and local reads and writes carry on.
    void db.connect(connector, options).catch(() => {});
    return () => {
      store.stop();
      void db.disconnect().catch(() => {});
    };
  }, [practice]);
  const clerk = useClerk();
  const { user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? null;
  const account = useMemo<Account>(
    () => ({
      email,
      signOut: (options) =>
        signOut(
          {
            hasUnsyncedChanges: async () => (await practice.db.getNextCrudTransaction()) !== null,
            signOutOfClerk: () => clerk.signOut(),
            clearDatabase: () => practice.db.disconnectAndClear(),
            clearLogos: clearLogoFiles,
            clearSavedSession: savedSession.clearAll,
          },
          options,
        ),
    }),
    [clerk, email, practice],
  );
  return (
    <AccountContext.Provider value={account}>
      <PracticeDataProvider store={practice.store}>
        <RejectionToasts connector={practice.connector} />
        <SignUpProfileName />
        <LogoProvider logos={practice.logos}>
          <FirstSyncGateFor db={practice.db}>{children}</FirstSyncGateFor>
        </LogoProvider>
      </PracticeDataProvider>
    </AccountContext.Provider>
  );
}
