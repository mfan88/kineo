import { useClerk, useSignIn } from "@clerk/react";
import { clerkErrorDetails as details, signInError, type SignInError } from "@kineo/shared";
import { Button, FieldError, Input, Label, TextField } from "@heroui/react";
import { useState, type FormEvent } from "react";

type Step = "email" | "code" | "password";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Sign in with an emailed code (the default) or a password; or go to Create an account. */
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
      if (failure) setError(signInError(details(failure)));
      else onSuccess?.();
    } catch (thrown) {
      setError(signInError(details(thrown)));
    } finally {
      setBusy(false);
    }
  }

  function checkEmail(): boolean {
    if (EMAIL_PATTERN.test(email.trim())) return true;
    setError(signInError({ code: "form_param_format_invalid__email_address" }));
    return false;
  }

  function sendCode(event?: FormEvent) {
    event?.preventDefault();
    if (!checkEmail()) return;
    void run(
      () => signIn.emailCode.sendCode({ emailAddress: email.trim() }),
      () => {
        setCode("");
        go("code");
      },
    );
  }

  function verifyCode(event: FormEvent) {
    event.preventDefault();
    if (code.trim() === "") {
      setError({ field: "code", message: "Enter the code from the email." });
      return;
    }
    void run(() => signIn.emailCode.verifyCode({ code: code.trim() }));
  }

  function signInWithPassword(event: FormEvent) {
    event.preventDefault();
    if (!checkEmail()) return;
    if (password === "") {
      setError({ field: "password", message: "Enter your password." });
      return;
    }
    void run(() => signIn.password({ identifier: email.trim(), password }));
  }

  const emailField = (
    <TextField
      isRequired
      type="email"
      isInvalid={errorFor("email") !== null}
      value={email}
      onChange={(value) => {
        setEmail(value);
        if (error?.field === "email") setError(null);
      }}
      autoFocus
    >
      <Label>Email</Label>
      <Input className="h-11" autoComplete="email" />
      <FieldError>{errorFor("email")}</FieldError>
    </TextField>
  );

  const formError = errorFor("form");

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-8 py-12 text-foreground">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col gap-1">
          <p className="text-sm text-muted">Kineō</p>
          <h1 className="text-[28px] leading-tight font-semibold">
            {step === "code" ? "Check your email" : "Sign in"}
          </h1>
          {step === "code" ? <p className="text-muted">We sent a code to {email.trim()}.</p> : null}
        </div>

        {step === "email" ? (
          <form className="flex flex-col gap-5" onSubmit={sendCode} noValidate>
            {emailField}
            <Button type="submit" variant="primary" className="h-11 w-full" isPending={busy}>
              Email me a code
            </Button>
            <Button variant="ghost" className="h-11 w-full" onPress={() => go("password")}>
              Use a password instead
            </Button>
            <p className="flex items-center justify-center gap-1 text-sm text-muted">
              New to Kineō?
              <Button variant="ghost" className="h-11 px-1 text-accent" onPress={onCreateAccount}>
                Create an account
              </Button>
            </p>
          </form>
        ) : null}

        {step === "code" ? (
          <form className="flex flex-col gap-5" onSubmit={verifyCode} noValidate>
            <TextField
              isRequired
              isInvalid={errorFor("code") !== null}
              value={code}
              onChange={(value) => {
                setCode(value);
                if (error?.field === "code") setError(null);
              }}
              autoFocus
            >
              <Label>Code</Label>
              <Input className="h-11" inputMode="numeric" autoComplete="one-time-code" />
              <FieldError>{errorFor("code")}</FieldError>
            </TextField>
            <Button type="submit" variant="primary" className="h-11 w-full" isPending={busy}>
              Sign in
            </Button>
            <div className="flex justify-between">
              <Button variant="ghost" className="h-11" onPress={() => go("email")}>
                Use a different email
              </Button>
              <Button variant="ghost" className="h-11" isDisabled={busy} onPress={() => sendCode()}>
                Send a new code
              </Button>
            </div>
          </form>
        ) : null}

        {step === "password" ? (
          <form className="flex flex-col gap-5" onSubmit={signInWithPassword} noValidate>
            {emailField}
            <TextField
              isRequired
              type="password"
              isInvalid={errorFor("password") !== null}
              value={password}
              onChange={(value) => {
                setPassword(value);
                if (error?.field === "password") setError(null);
              }}
            >
              <Label>Password</Label>
              <Input className="h-11" autoComplete="current-password" />
              <FieldError>{errorFor("password")}</FieldError>
            </TextField>
            <Button type="submit" variant="primary" className="h-11 w-full" isPending={busy}>
              Sign in
            </Button>
            <Button variant="ghost" className="h-11 w-full" onPress={() => go("email")}>
              Email me a code instead
            </Button>
          </form>
        ) : null}

        {formError ? (
          <p role="alert" className="text-sm text-danger">
            {formError}
          </p>
        ) : null}
      </div>
    </main>
  );
}
