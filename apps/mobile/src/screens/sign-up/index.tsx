import { useSignUp } from "@clerk/expo";
import {
  clerkErrorDetails,
  signUpError,
  signUpProblems,
  type SignUpError,
  type SignUpErrorField,
} from "@kineo/shared";
import { Button, FieldError, Input, Label, TextField } from "heroui-native";
import { useState } from "react";
import { View } from "react-native";
import { ContinueWithGoogle } from "@/auth/continue-with-google";
import { rememberSignUpName } from "@/auth/sign-up-name";
import { ScreenLayout } from "@/components/screen";
import { TermsAgreement } from "@/components/terms-agreement";
import { Text } from "@/components/text";

type Step = "details" | "code";

/**
 * Create an account, as on desktop: full name, email and the Terms and Privacy
 * agreement, then the emailed code. The new account is signed in straight away, and
 * the name becomes Your profile's full name once the practice is open.
 */
export function SignUp({
  onSignIn,
  onNeedsTerms,
}: {
  onSignIn: () => void;
  /** "Continue with Google" made a new account that still needs the Terms agreement. */
  onNeedsTerms: () => void;
}) {
  const { signUp } = useSignUp();
  const [step, setStep] = useState<Step>("details");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [code, setCode] = useState("");
  const [errors, setErrors] = useState<SignUpError[]>([]);
  const [busy, setBusy] = useState(false);

  const errorFor = (field: SignUpErrorField) =>
    errors.find((error) => error.field === field)?.message ?? null;
  const clear = (field: SignUpErrorField) =>
    setErrors((current) => current.filter((error) => error.field !== field));

  /** Runs Clerk steps in turn, stopping at the first one that reports an error. */
  async function run(steps: (() => Promise<{ error: unknown }>)[], onSuccess: () => void) {
    setBusy(true);
    setErrors([]);
    try {
      for (const next of steps) {
        const { error } = await next();
        if (error) {
          setErrors([signUpError(clerkErrorDetails(error))]);
          return;
        }
      }
      onSuccess();
    } catch (thrown) {
      setErrors([signUpError(clerkErrorDetails(thrown))]);
    } finally {
      setBusy(false);
    }
  }

  function sendCode() {
    const problems = signUpProblems({ fullName, email, agreed });
    if (problems.length > 0) {
      setErrors(problems);
      return;
    }
    void run(
      [
        () => signUp.create({ emailAddress: email.trim(), legalAccepted: true }),
        () => signUp.verifications.sendEmailCode(),
      ],
      () => {
        setCode("");
        setStep("code");
      },
    );
  }

  function sendNewCode() {
    void run([() => signUp.verifications.sendEmailCode()], () => setCode(""));
  }

  function createAccount() {
    if (code.trim() === "") {
      setErrors([{ field: "code", message: "Enter the code from the email." }]);
      return;
    }
    void run(
      [
        () => signUp.verifications.verifyEmailCode({ code: code.trim() }),
        async () => {
          if (signUp.status !== "complete") {
            // Clerk asks for more than Kineō's sign-up collects (its settings need fixing).
            return { error: { code: "sign_up_incomplete" } };
          }
          // Held until the practice is open; finishing signs in and leaves this screen.
          rememberSignUpName(fullName);
          return signUp.finalize();
        },
      ],
      () => {},
    );
  }

  const formError = errorFor("form");
  const consentError = errorFor("consent");

  return (
    <ScreenLayout
      eyebrow="Kineō"
      title={step === "code" ? "Check your email" : "Create your account"}
    >
      {step === "code" ? (
        <Text className="text-muted">We sent a code to {email.trim()}.</Text>
      ) : null}

      {step === "details" ? (
        <View className="gap-5">
          <TextField isRequired isInvalid={errorFor("fullName") !== null}>
            <Label>Full name</Label>
            <Input
              value={fullName}
              onChangeText={(value) => {
                setFullName(value);
                clear("fullName");
              }}
              autoFocus
              autoCapitalize="words"
              autoComplete="name"
              textContentType="name"
              returnKeyType="next"
              accessibilityLabel="Full name"
            />
            <FieldError>{errorFor("fullName")}</FieldError>
          </TextField>
          <TextField isRequired isInvalid={errorFor("email") !== null}>
            <Label>Email</Label>
            <Input
              value={email}
              onChangeText={(value) => {
                setEmail(value);
                clear("email");
              }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              accessibilityLabel="Email"
            />
            <FieldError>{errorFor("email")}</FieldError>
          </TextField>
          <TermsAgreement
            agreed={agreed}
            onChange={(value) => {
              setAgreed(value);
              clear("consent");
            }}
            error={consentError}
          />
          <Button className="min-h-11" isDisabled={busy} onPress={sendCode}>
            Email me a code
          </Button>
          <ContinueWithGoogle
            agreed={agreed}
            onNeedsTerms={onNeedsTerms}
            onError={(message) => setErrors(message === null ? [] : [{ field: "form", message }])}
          />
          <Button variant="ghost" className="min-h-11" onPress={onSignIn}>
            I already have an account
          </Button>
        </View>
      ) : (
        <View className="gap-5">
          <TextField isRequired isInvalid={errorFor("code") !== null}>
            <Label>Code</Label>
            <Input
              value={code}
              onChangeText={(value) => {
                setCode(value);
                clear("code");
              }}
              autoFocus
              keyboardType="number-pad"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              returnKeyType="done"
              onSubmitEditing={createAccount}
              accessibilityLabel="Code"
            />
            <FieldError>{errorFor("code")}</FieldError>
          </TextField>
          <Button className="min-h-11" isDisabled={busy} onPress={createAccount}>
            Create account
          </Button>
          <View className="flex-row flex-wrap justify-between gap-2">
            <Button
              variant="ghost"
              className="min-h-11"
              onPress={() => {
                setErrors([]);
                setStep("details");
              }}
            >
              Use a different email
            </Button>
            <Button variant="ghost" className="min-h-11" isDisabled={busy} onPress={sendNewCode}>
              Send a new code
            </Button>
          </View>
        </View>
      )}

      {formError ? (
        <Text accessibilityRole="alert" className="text-sm text-danger">
          {formError}
        </Text>
      ) : null}
    </ScreenLayout>
  );
}
