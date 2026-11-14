import {
  appearanceSummary,
  FEEDBACK_EMAIL,
  feedbackMailto,
  LEGAL_LINKS,
  priceListSummary,
  profileSummary,
  type SettingsSummary,
} from "@kineo/shared";
import Constants from "expo-constants";
import { router, type Href } from "expo-router";
import { Button, Card, useToast } from "heroui-native";
import { useState, type ReactNode } from "react";
import { Alert, Linking, Pressable, View } from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { useUniwind } from "uniwind";
import { useAccount } from "@/auth/account";
import { Screen } from "@/components/screen";
import { FormSkeleton } from "@/components/skeletons";
import { Text } from "@/components/text";
import { PracticeGate, usePracticeData } from "@/data/practice-data";
import { useAppearanceSetting } from "@/theme/appearance";
import { colorSchemeOf } from "@/theme/color-scheme";
import { useThemeColors } from "@/theme/theme-colors";

/** The small tinted tile at the start of a row. */
function RowIcon({ children }: { children: ReactNode }) {
  const colors = useThemeColors();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="size-9 items-center justify-center rounded-[10px] bg-accent-soft"
    >
      <Svg
        width={18}
        height={18}
        viewBox="0 0 24 24"
        fill="none"
        color={colors.textOnTint}
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {children}
      </Svg>
    </View>
  );
}

function Chevron() {
  const colors = useThemeColors();
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" accessibilityElementsHidden>
      <Path
        d="M9 6l6 6-6 6"
        stroke={colors.mutedText}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** What a row says under its title; a problem is in the error colour, with a warning mark. */
function RowSummary({ summary }: { summary: SettingsSummary }) {
  const colors = useThemeColors();
  if (!summary.problem) return <Text className="text-sm text-muted">{summary.text}</Text>;
  return (
    <View className="flex-row items-center gap-1">
      <Svg width={12} height={12} viewBox="0 0 16 16" fill="none" accessibilityElementsHidden>
        <Circle cx={8} cy={8} r={6} stroke={colors.error} strokeWidth={1.8} />
        <Path d="M8 5v4M8 11v.5" stroke={colors.error} strokeWidth={1.8} strokeLinecap="round" />
      </Svg>
      <Text className="text-sm text-danger">{summary.text}</Text>
    </View>
  );
}

function LinkRow({
  title,
  summary,
  href,
  icon,
  first,
}: {
  title: string;
  summary: SettingsSummary;
  href: Href;
  icon: ReactNode;
  first: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={summary.text}
      onPress={() => router.navigate(href)}
      className={`min-h-16 flex-row items-center gap-3 py-3 active:opacity-70 ${first ? "" : "border-t border-separator"}`}
    >
      <RowIcon>{icon}</RowIcon>
      <View className="flex-1 gap-0.5">
        <Text className="font-medium text-foreground">{title}</Text>
        <RowSummary summary={summary} />
      </View>
      <Chevron />
    </Pressable>
  );
}

/**
 * Settings: your profile and price list with what they hold now (and what's missing),
 * invoice style (set on the desktop app), Appearance and Sign out.
 */
export function Settings() {
  return (
    <PracticeGate
      skeleton={(showBlocks) => <FormSkeleton title="Settings" showBlocks={showBlocks} />}
    >
      <SettingsScreen />
    </PracticeGate>
  );
}

function SettingsScreen() {
  const { profile, priceItems, settings } = usePracticeData();
  return (
    <Screen title="Settings">
      <Card accessibilityLabel="Settings" className="px-4 py-1">
        <LinkRow
          first
          title="Your profile"
          summary={profileSummary(profile)}
          href="/profile"
          icon={
            <>
              <Circle cx={12} cy={8} r={4} />
              <Path d="M4 21c1-4 4-6 8-6s7 2 8 6" />
            </>
          }
        />
        <LinkRow
          first={false}
          title="Price list and tax"
          summary={{
            text: priceListSummary(priceItems.length, settings.defaultTaxRateBasisPoints),
            problem: false,
          }}
          href="/price-list"
          icon={<Path d="M4 6h16M4 12h16M4 18h10" />}
        />
        {/* Invoice style is desktop only: a plain row, not a screen. */}
        <View className="min-h-16 flex-row items-center gap-3 border-t border-separator py-3">
          <RowIcon>
            <Rect x={5} y={3} width={14} height={18} rx={2} />
            <Path d="M9 8h6M9 12h6" />
          </RowIcon>
          <View className="flex-1 gap-0.5">
            <Text className="font-medium text-foreground">Invoice style</Text>
            <Text className="text-sm text-muted">Set it on the desktop app</Text>
          </View>
        </View>
      </Card>
      <AppearanceRow />
      <AccountSection />
      <FeedbackSection />
    </Screen>
  );
}

/** Appearance, with what it shows now ("Match system · light now"); opens its choices. */
function AppearanceRow() {
  const [setting] = useAppearanceSetting();
  const { theme } = useUniwind();
  const summary = appearanceSummary(setting, colorSchemeOf(theme) === "dark");
  return (
    <Card className="px-4 py-1">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Appearance"
        accessibilityHint={summary}
        onPress={() => router.navigate("/appearance")}
        className="min-h-16 flex-row items-center gap-3 py-3 active:opacity-70"
      >
        <RowIcon>
          <Circle cx={12} cy={12} r={8} />
          <Path d="M12 4a8 8 0 0 0 0 16z" fill="currentColor" />
        </RowIcon>
        <View className="flex-1 gap-0.5">
          <Text className="font-medium text-foreground">Appearance</Text>
          <Text className="text-sm text-muted">{summary}</Text>
        </View>
        <Chevron />
      </Pressable>
    </Card>
  );
}

/** Below the settings: who's signed in, and a quiet Sign out. Hidden outside a signed-in session. */
function AccountSection() {
  const account = useAccount();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  if (!account) return null;
  const { email, signOut } = account;

  async function run(discardUnsynced: boolean) {
    setBusy(true);
    try {
      const result = await signOut({ discardUnsynced });
      if (result === "unsynced-changes") confirm();
    } catch {
      toast.show({
        variant: "danger",
        label: "Couldn't sign out. Check your internet connection and try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  function confirm() {
    Alert.alert(
      "Some changes haven't been saved yet",
      "They're only on this phone. If you sign out now, they'll be lost. To keep them, stay signed in and connect to the internet until they've saved.",
      [
        { text: "Stay signed in", style: "cancel", isPreferred: true },
        { text: "Sign out anyway", style: "destructive", onPress: () => void run(true) },
      ],
    );
  }

  return (
    <View accessibilityLabel="Account" className="gap-2 pt-4">
      <Text className="text-sm text-muted">{email ? `Signed in as ${email}` : "Signed in"}</Text>
      <Button
        variant="ghost"
        className="min-h-11 self-start"
        isDisabled={busy}
        onPress={() => void run(false)}
      >
        Sign out
      </Button>
    </View>
  );
}

/** Quiet things at the very bottom: send feedback, the app's version, and the legal pages. */
function FeedbackSection() {
  const { toast } = useToast();
  const version = Constants.expoConfig?.version;

  async function sendFeedback() {
    try {
      await Linking.openURL(feedbackMailto("Kineō", version ?? ""));
      return;
    } catch {
      // Fall through to the message below.
    }
    toast.show({ label: `Email ${FEEDBACK_EMAIL} with your feedback.` });
  }

  return (
    <View className="gap-2 pt-4">
      <Card className="px-4 py-1">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send feedback"
          onPress={() => void sendFeedback()}
          className="min-h-16 flex-row items-center gap-3 py-3 active:opacity-70"
        >
          <RowIcon>
            <Rect x={3} y={5} width={18} height={14} rx={2} />
            <Path d="M3 7l9 6 9-6" />
          </RowIcon>
          <Text className="flex-1 font-medium text-foreground">Send feedback</Text>
        </Pressable>
      </Card>
      {version ? (
        <Text className="text-center text-sm text-muted">{`Kineō ${version}`}</Text>
      ) : null}
      <View className="flex-row items-center justify-center">
        {LEGAL_LINKS.map((link, index) => (
          <View key={link.href} className="flex-row items-center">
            {index > 0 ? (
              <Text accessibilityElementsHidden className="text-sm text-muted">
                ·
              </Text>
            ) : null}
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={link.label}
              onPress={() => void Linking.openURL(link.href)}
              className="min-h-11 min-w-11 items-center justify-center px-2 active:opacity-70"
            >
              <Text className="text-sm text-accent">{link.label}</Text>
            </Pressable>
          </View>
        ))}
      </View>
    </View>
  );
}
