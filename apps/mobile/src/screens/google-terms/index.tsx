import { clerkErrorDetails, SIGN_UP_CONSENT_MISSING, signUpError } from "@kineo/shared";
import { Button } from "heroui-native";
import { useState } from "react";
import { View } from "react-native";
import { useGoogleSignIn } from "@/auth/google-sign-in";
import { PendingButton } from "@/components/pending-button";
import { ScreenLayout } from "@/components/screen";
import { TermsAgreement } from "@/components/terms-agreement";
import { Text } from "@/components/text";

/**
 * After "Continue with Google" made a new account: the Terms and Privacy agreement,
 * the one thing it still needs, then Create account signs in.
 */
export function GoogleTerms({ onBack }: { onBack: () => void }) {
  const { acceptTerms } = useGoogleSignIn();
  const [agreed, setAgreed] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function createAccount() {
    if (!agreed) {
      setConsentError(SIGN_UP_CONSENT_MISSING);
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      const { error } = await acceptTerms();
      if (error) setFormError(signUpError(clerkErrorDetails(error)).message);
    } catch (thrown) {
      setFormError(signUpError(clerkErrorDetails(thrown)).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScreenLayout eyebrow="Kineō" title="One more step">
      <Text className="text-muted">
        Agree to the Terms and Privacy policy to finish creating your account.
      </Text>
      <View className="gap-5">
        <TermsAgreement
          agreed={agreed}
          onChange={(value) => {
            setAgreed(value);
            setConsentError(null);
          }}
          error={consentError}
        />
        <PendingButton
          pending={busy}
          pendingLabel="Creating…"
          label="Create account"
          className="min-h-11"
          onPress={() => void createAccount()}
        />
        <Button variant="ghost" className="min-h-11" onPress={onBack}>
          Back to sign in
        </Button>
      </View>
      {formError ? (
        <Text accessibilityRole="alert" className="text-sm text-danger">
          {formError}
        </Text>
      ) : null}
    </ScreenLayout>
  );
}
