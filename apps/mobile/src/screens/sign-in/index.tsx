import { useClerk, useSignIn } from "@clerk/expo";
import { clerkErrorDetails, signInError, type SignInError } from "@kineo/shared";
import { Button, FieldError, Input, Label, TextField } from "heroui-native";
import { useState } from "react";
import { View } from "react-native";
import { ScreenLayout } from "@/components/screen";
import { Text } from "@/components/text";

type Step = "email" | "code" | "password";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Sign in with an emailed code (the default) or a password, as on desktop; or go to
 * Create an account.
 */
export function SignIn({ onCreateAccount }: { onCreateAccount: () => void }) {
  const { signIn } = useSignIn();
  const clerk = useClerk();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<SignInError | null>(null);
  const [busy, setBusy] = useState(false);

  const errorFor = (field: SignInError["field"]) => (error?.field === field ? error.message : null);

  function go(next: Step) {
    setError(null);
    setStep(next);
  }

  /** Makes the session the sign-in created (or one that already exists) active. */
  async function activate(): Promise<boolean> {
    const client = clerk.client;
    const sessionId = client?.signIn.createdSessionId ?? client?.sessions[0]?.id;
    if (!sessionId) return false;
    await clerk.setActive({ session: sessionId });
    return true;
  }

  async function run(action: () => Promise<{ error: unknown }>, onSuccess?: () => void) {
    setBusy(true);
    setError(null);
    try {
      const { error: failure } = await action();
      if (await activate()) return;
      if (failure) setError(signInError(clerkErrorDetails(failure)));
      else onSuccess?.();
    } catch (thrown) {
      setError(signInError(clerkErrorDetails(thrown)));
    } finally {
      setBusy(false);
    }
  }

  function checkEmail(): boolean {
    if (EMAIL_PATTERN.test(email.trim())) return true;
    setError(signInError({ code: "form_param_format_invalid__email_address" }));
    return false;
  }

  function sendCode() {
    if (!checkEmail()) return;
    void run(
      () => signIn.emailCode.sendCode({ emailAddress: email.trim() }),
      () => {
        setCode("");
        go("code");
      },
    );
  }

  function verifyCode() {
    if (code.trim() === "") {
      setError({ field: "code", message: "Enter the code from the email." });
      return;
    }
    void run(() => signIn.emailCode.verifyCode({ code: code.trim() }));
  }

  function signInWithPassword() {
    if (!checkEmail()) return;
    if (password === "") {
      setError({ field: "password", message: "Enter your password." });
      return;
    }
    void run(() => signIn.password({ identifier: email.trim(), password }));
  }

  const emailField = (
    <TextField isRequired isInvalid={errorFor("email") !== null}>
      <Label>Email</Label>
      <Input
        value={email}
        onChangeText={(value) => {
          setEmail(value);
          if (error?.field === "email") setError(null);
        }}
        autoFocus
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType={step === "email" ? "send" : "next"}
        onSubmitEditing={step === "email" ? sendCode : undefined}
        accessibilityLabel="Email"
      />
      <FieldError>{errorFor("email")}</FieldError>
    </TextField>
  );

  const formError = errorFor("form");

  return (
    <ScreenLayout eyebrow="Kineō" title={step === "code" ? "Check your email" : "Sign in"}>
      {step === "code" ? (
        <Text className="text-muted">We sent a code to {email.trim()}.</Text>
      ) : null}

      {step === "email" ? (
        <View className="gap-5">
          {emailField}
          <Button className="min-h-11" isDisabled={busy} onPress={sendCode}>
            Email me a code
          </Button>
          <Button variant="ghost" className="min-h-11" onPress={() => go("password")}>
            Use a password instead
          </Button>
          <View className="flex-row flex-wrap items-center justify-center">
            <Text className="text-sm text-muted">New to Kineō?</Text>
            <Button variant="ghost" className="min-h-11 px-2" onPress={onCreateAccount}>
              Create an account
            </Button>
          </View>
        </View>
      ) : null}

      {step === "code" ? (
        <View className="gap-5">
          <TextField isRequired isInvalid={errorFor("code") !== null}>
            <Label>Code</Label>
            <Input
              value={code}
              onChangeText={(value) => {
                setCode(value);
                if (error?.field === "code") setError(null);
              }}
              autoFocus
              keyboardType="number-pad"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              returnKeyType="done"
              onSubmitEditing={verifyCode}
              accessibilityLabel="Code"
            />
            <FieldError>{errorFor("code")}</FieldError>
          </TextField>
          <Button className="min-h-11" isDisabled={busy} onPress={verifyCode}>
            Sign in
          </Button>
          <View className="flex-row flex-wrap justify-between gap-2">
            <Button variant="ghost" className="min-h-11" onPress={() => go("email")}>
              Use a different email
            </Button>
            <Button variant="ghost" className="min-h-11" isDisabled={busy} onPress={sendCode}>
              Send a new code
            </Button>
          </View>
        </View>
      ) : null}

      {step === "password" ? (
        <View className="gap-5">
          {emailField}
          <TextField isRequired isInvalid={errorFor("password") !== null}>
            <Label>Password</Label>
            <Input
              value={password}
              onChangeText={(value) => {
                setPassword(value);
                if (error?.field === "password") setError(null);
              }}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="current-password"
              textContentType="password"
              returnKeyType="go"
              onSubmitEditing={signInWithPassword}
              accessibilityLabel="Password"
            />
            <FieldError>{errorFor("password")}</FieldError>
          </TextField>
          <Button className="min-h-11" isDisabled={busy} onPress={signInWithPassword}>
            Sign in
          </Button>
          <Button variant="ghost" className="min-h-11" onPress={() => go("email")}>
            Email me a code instead
          </Button>
        </View>
      ) : null}

      {formError ? (
        <Text accessibilityRole="alert" className="text-sm text-danger">
          {formError}
        </Text>
      ) : null}
    </ScreenLayout>
  );
}
