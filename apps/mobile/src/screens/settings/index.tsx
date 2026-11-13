import { router, type Href } from "expo-router";
import { Button, Card, useToast } from "heroui-native";
import { useState } from "react";
import { Alert, Pressable, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useAccount } from "@/auth/account";
import { Screen } from "@/components/screen";
import { Text } from "@/components/text";
import { useThemeColors } from "@/theme/theme-colors";

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
  const colors = useThemeColors();
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
      <AccountSection />
    </Screen>
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
