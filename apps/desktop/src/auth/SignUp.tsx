import { useSignUp } from "@clerk/react";
import { Button, Checkbox, FieldError, Input, Label, TextField } from "@heroui/react";
import {
  clerkErrorDetails as details,
  signUpError,
  signUpProblems,
  type SignUpError,
  type SignUpErrorField,
} from "@kineo/shared";
import { useState, type FormEvent } from "react";
import { LEGAL_LINKS, openInBrowser } from "../components/legal";
import { rememberSignUpName } from "./signUpName";

type Step = "details" | "code";

/**
 * Create an account: full name, email and the Terms and Privacy agreement, then the
 * emailed code. The new account is signed in straight away, and the name becomes
 * Your profile's full name once the practice is open.
 */
export function SignUp({ onSignIn }: { onSignIn: () => void }) {
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
          setErrors([signUpError(details(error))]);
          return;
        }
      }
      onSuccess();
    } catch (thrown) {
      setErrors([signUpError(details(thrown))]);
    } finally {
      setBusy(false);
    }
  }

  function sendCode(event: FormEvent) {
    event.preventDefault();
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

  function createAccount(event: FormEvent) {
    event.preventDefault();
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

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-8 py-12 text-foreground">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col gap-1">
          <p className="text-sm text-muted">Kineō</p>
          <h1 className="text-[28px] leading-tight font-semibold">
            {step === "code" ? "Check your email" : "Create your account"}
          </h1>
          {step === "code" ? <p className="text-muted">We sent a code to {email.trim()}.</p> : null}
        </div>

        {step === "details" ? (
          <form className="flex flex-col gap-5" onSubmit={sendCode} noValidate>
            <TextField
              isRequired
              isInvalid={errorFor("fullName") !== null}
              value={fullName}
              onChange={(value) => {
                setFullName(value);
                clear("fullName");
              }}
              autoFocus
            >
              <Label>Full name</Label>
              <Input className="h-11" autoComplete="name" />
              <FieldError>{errorFor("fullName")}</FieldError>
            </TextField>
            <TextField
              isRequired
              type="email"
              isInvalid={errorFor("email") !== null}
              value={email}
              onChange={(value) => {
                setEmail(value);
                clear("email");
              }}
            >
              <Label>Email</Label>
              <Input className="h-11" autoComplete="email" />
              <FieldError>{errorFor("email")}</FieldError>
            </TextField>
            <div className="flex flex-col gap-1">
              <Checkbox
                isSelected={agreed}
                isInvalid={errorFor("consent") !== null}
                onChange={(selected) => {
                  setAgreed(selected);
                  clear("consent");
                }}
              >
                {/* Content is the clickable label, so the box goes inside it. */}
                <Checkbox.Content className="flex min-h-11 flex-row items-center gap-3">
                  <Checkbox.Control className="border-muted in-data-[selected=true]:border-transparent">
                    <Checkbox.Indicator />
                  </Checkbox.Control>
                  <Label>I agree to the Terms and Privacy policy</Label>
                </Checkbox.Content>
              </Checkbox>
              <p className="flex items-center gap-1 pl-8 text-sm text-muted">
                Read the
                {LEGAL_LINKS.map((link, index) => (
                  <span key={link.href} className="flex items-center gap-1">
                    {index > 0 ? "and" : null}
                    <Button
                      variant="ghost"
                      className="h-11 px-1 text-accent"
                      onPress={() => openInBrowser(link.href)}
                    >
                      {link.label === "Privacy" ? "Privacy policy" : link.label}
                    </Button>
                  </span>
                ))}
              </p>
              {errorFor("consent") ? (
                <p role="alert" className="pl-8 text-sm text-danger">
                  {errorFor("consent")}
                </p>
              ) : null}
            </div>
            <Button type="submit" variant="primary" className="h-11 w-full" isPending={busy}>
              Email me a code
            </Button>
            <Button variant="ghost" className="h-11 w-full" onPress={onSignIn}>
              I already have an account
            </Button>
          </form>
        ) : (
          <form className="flex flex-col gap-5" onSubmit={createAccount} noValidate>
            <TextField
              isRequired
              isInvalid={errorFor("code") !== null}
              value={code}
              onChange={(value) => {
                setCode(value);
                clear("code");
              }}
              autoFocus
            >
              <Label>Code</Label>
              <Input className="h-11" inputMode="numeric" autoComplete="one-time-code" />
              <FieldError>{errorFor("code")}</FieldError>
            </TextField>
            <Button type="submit" variant="primary" className="h-11 w-full" isPending={busy}>
              Create account
            </Button>
            <div className="flex justify-between">
              <Button
                variant="ghost"
                className="h-11"
                onPress={() => {
                  setErrors([]);
                  setStep("details");
                }}
              >
                Use a different email
              </Button>
              <Button variant="ghost" className="h-11" isDisabled={busy} onPress={sendNewCode}>
                Send a new code
              </Button>
            </div>
          </form>
        )}

        {formError ? (
          <p role="alert" className="text-sm text-danger">
            {formError}
          </p>
        ) : null}
      </div>
    </main>
  );
}
