import { Button, Checkbox } from "heroui-native";
import { Linking, Pressable, View } from "react-native";
import { Text } from "@/components/text";

/** Kineō's terms and privacy pages on the website, as on desktop. */
const LEGAL_LINKS = [
  { label: "Terms", href: "https://getkineo.work/terms/" },
  { label: "Privacy policy", href: "https://getkineo.work/privacy/" },
] as const;

/**
 * "I agree to the Terms and Privacy policy" with links to read both, and the error
 * under it when it's needed but not ticked. The whole row ticks the box.
 */
export function TermsAgreement({
  agreed,
  onChange,
  error,
}: {
  agreed: boolean;
  onChange: (agreed: boolean) => void;
  error: string | null;
}) {
  return (
    <View className="gap-1">
      {/* The whole row is the target; the box inside only shows the state. */}
      <Pressable
        accessibilityRole="checkbox"
        accessibilityLabel="I agree to the Terms and Privacy policy"
        accessibilityState={{ checked: agreed }}
        onPress={() => onChange(!agreed)}
        className="min-h-11 flex-row items-center gap-3"
      >
        <Checkbox
          isSelected={agreed}
          isInvalid={error !== null}
          onSelectedChange={onChange}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
        <Text className="shrink text-foreground">I agree to the Terms and Privacy policy</Text>
      </Pressable>
      <View className="flex-row flex-wrap items-center pl-9">
        <Text className="text-sm text-muted">Read the</Text>
        {LEGAL_LINKS.map((link, index) => (
          <View key={link.href} className="flex-row items-center">
            {index > 0 ? <Text className="text-sm text-muted">and</Text> : null}
            <Button
              variant="ghost"
              className="min-h-11 px-1"
              accessibilityRole="link"
              onPress={() => void Linking.openURL(link.href)}
            >
              {link.label}
            </Button>
          </View>
        ))}
      </View>
      {error ? (
        <Text accessibilityRole="alert" className="pl-9 text-sm text-danger">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
