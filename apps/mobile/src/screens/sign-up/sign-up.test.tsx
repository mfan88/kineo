import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { HeroUINativeProvider } from "heroui-native";
import { Linking, Text, TextInput } from "react-native";
import { initialWindowMetrics, SafeAreaProvider } from "react-native-safe-area-context";
import { AuthGate } from "@/auth/auth-gate";
import { takeSignUpName } from "@/auth/sign-up-name";

type Result = Promise<{ error: unknown }>;

const mockSignUp = {
  status: "missing_requirements" as string,
  create: jest.fn<(params: { emailAddress: string; legalAccepted: boolean }) => Result>(),
  verifications: {
    sendEmailCode: jest.fn<() => Result>(),
    verifyEmailCode: jest.fn<(params: { code: string }) => Result>(),
  },
  finalize: jest.fn<() => Result>(),
};
const mockClerk = {
  status: "ready" as string,
  client: { signIn: { createdSessionId: null as string | null }, sessions: [] as { id: string }[] },
  setActive: jest.fn<(params: { session: string }) => Promise<void>>(),
};

jest.mock("@clerk/expo", () => ({
  useSignIn: () => ({ signIn: { emailCode: {}, password: jest.fn() } }),
  useSignUp: () => ({ signUp: mockSignUp }),
  useClerk: () => mockClerk,
  useAuth: () => ({ isLoaded: true, isSignedIn: false, userId: null }),
}));
jest.mock("expo", () => ({ reloadAppAsync: jest.fn() }));
// Google sign-in opens a native browser sheet; its own tests are in src/auth.
const mockGoogle = {
  start: jest.fn<() => Promise<"signed-in" | "cancelled" | "needs-terms" | "incomplete">>(),
  acceptTerms: jest.fn<() => Promise<{ error: unknown }>>(),
};
jest.mock("@/auth/google-sign-in", () => ({ useGoogleSignIn: () => mockGoogle }));
jest.mock("expo-router", () => ({ router: {}, useIsFocused: () => true }));

const METRICS = initialWindowMetrics ?? {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

/** The gate, signed out, moved on to Create an account. */
async function openSignUp() {
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <HeroUINativeProvider config={{ devInfo: { stylingPrinciples: false } }}>
        <AuthGate>{() => <Text>The app</Text>}</AuthGate>
      </HeroUINativeProvider>
    </SafeAreaProvider>,
  );
  await fireEvent.press(screen.getByText("Create an account"));
  expect(screen.getByText("Create your account")).toBeTruthy();
}

async function fillDetails() {
  await fireEvent.changeText(screen.getByLabelText("Full name"), "Dana Example");
  await fireEvent.changeText(screen.getByLabelText("Email"), " dana@example.com ");
  await fireEvent.press(
    screen.getByRole("checkbox", { name: "I agree to the Terms and Privacy policy" }),
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  takeSignUpName();
  mockSignUp.status = "missing_requirements";
  mockSignUp.create.mockResolvedValue({ error: null });
  mockSignUp.verifications.sendEmailCode.mockResolvedValue({ error: null });
  mockSignUp.verifications.verifyEmailCode.mockImplementation(() => {
    mockSignUp.status = "complete";
    return Promise.resolve({ error: null });
  });
  mockSignUp.finalize.mockResolvedValue({ error: null });
  mockGoogle.start.mockResolvedValue("signed-in");
  mockGoogle.acceptTerms.mockResolvedValue({ error: null });
});

describe("Create an account", () => {
  it("asks for the name, email and agreement, emails a code, then creates and signs in", async () => {
    await openSignUp();
    await fillDetails();
    await fireEvent.press(screen.getByText("Email me a code"));
    await screen.findByText("Check your email");
    expect(mockSignUp.create).toHaveBeenCalledWith({
      emailAddress: "dana@example.com",
      legalAccepted: true,
    });
    expect(screen.getByText("We sent a code to dana@example.com.")).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText("Code"), " 123456 ");
    await fireEvent.press(screen.getByText("Create account"));
    await waitFor(() => expect(mockSignUp.finalize).toHaveBeenCalledTimes(1));
    expect(mockSignUp.verifications.verifyEmailCode).toHaveBeenCalledWith({ code: "123456" });
    expect(takeSignUpName()).toBe("Dana Example");
  });

  it("moves from the name to the email on return, and sends the code from the email", async () => {
    await openSignUp();
    await fillDetails();
    const focus = jest.spyOn(TextInput.prototype, "focus");
    await fireEvent(screen.getByLabelText("Full name"), "submitEditing");
    expect(focus).toHaveBeenCalledTimes(1);
    expect(mockSignUp.create).not.toHaveBeenCalled();

    await fireEvent(screen.getByLabelText("Email"), "submitEditing");
    await screen.findByText("Check your email");
    expect(mockSignUp.create).toHaveBeenCalledWith({
      emailAddress: "dana@example.com",
      legalAccepted: true,
    });
  });

  it("checks the details when the email's return key is pressed", async () => {
    await openSignUp();
    await fireEvent.changeText(screen.getByLabelText("Email"), "dana@");
    await fireEvent(screen.getByLabelText("Email"), "submitEditing");
    expect(await screen.findByText("Add your full name. It goes on your invoices.")).toBeTruthy();
    expect(mockSignUp.create).not.toHaveBeenCalled();
  });

  it("ignores the email's return key while a code is being sent", async () => {
    mockSignUp.create.mockReturnValue(new Promise(() => {}));
    await openSignUp();
    await fillDetails();
    await fireEvent(screen.getByLabelText("Email"), "submitEditing");
    await fireEvent(screen.getByLabelText("Email"), "submitEditing");
    expect(mockSignUp.create).toHaveBeenCalledTimes(1);
  });

  it("says what's missing before asking Clerk, each under its own field", async () => {
    await openSignUp();
    await fireEvent.changeText(screen.getByLabelText("Email"), "dana@");
    await fireEvent.press(screen.getByText("Email me a code"));
    expect(await screen.findByText("Add your full name. It goes on your invoices.")).toBeTruthy();
    expect(screen.getByText("Enter your email address, like name@example.com.")).toBeTruthy();
    expect(
      screen.getByText("Agree to the Terms and Privacy policy to create an account."),
    ).toBeTruthy();
    expect(mockSignUp.create).not.toHaveBeenCalled();
  });

  it("opens the Terms and Privacy policy in the browser", async () => {
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    await openSignUp();
    await fireEvent.press(screen.getByRole("link", { name: "Terms" }));
    await fireEvent.press(screen.getByRole("link", { name: "Privacy policy" }));
    expect(open.mock.calls.map(([url]) => url)).toEqual([
      "https://getkineo.work/terms/",
      "https://getkineo.work/privacy/",
    ]);
    open.mockRestore();
  });

  it("points to sign-in when the email already has an account", async () => {
    mockSignUp.create.mockResolvedValue({
      error: { errors: [{ code: "form_identifier_exists", message: "Taken" }] },
    });
    await openSignUp();
    await fillDetails();
    await fireEvent.press(screen.getByText("Email me a code"));
    expect(
      await screen.findByText("That email already has a Kineō account. Sign in instead."),
    ).toBeTruthy();
    expect(mockSignUp.verifications.sendEmailCode).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText("I already have an account"));
    expect(screen.getByText("Sign in")).toBeTruthy();
  });

  it("explains a wrong code and doesn't finish", async () => {
    mockSignUp.verifications.verifyEmailCode.mockResolvedValue({
      error: { errors: [{ code: "form_code_incorrect", message: "Incorrect code" }] },
    });
    await openSignUp();
    await fillDetails();
    await fireEvent.press(screen.getByText("Email me a code"));
    await screen.findByText("Check your email");
    await fireEvent.changeText(screen.getByLabelText("Code"), "000000");
    await fireEvent.press(screen.getByText("Create account"));
    expect(
      await screen.findByText("That code isn't right. Check the email and try again."),
    ).toBeTruthy();
    expect(mockSignUp.finalize).not.toHaveBeenCalled();
  });

  it("says so when Clerk wants more than Kineō asks for", async () => {
    mockSignUp.verifications.verifyEmailCode.mockResolvedValue({ error: null });
    await openSignUp();
    await fillDetails();
    await fireEvent.press(screen.getByText("Email me a code"));
    await screen.findByText("Check your email");
    await fireEvent.changeText(screen.getByLabelText("Code"), "123456");
    await fireEvent.press(screen.getByText("Create account"));
    expect(
      await screen.findByText(
        "Your account couldn't be finished. Try again later, or contact support.",
      ),
    ).toBeTruthy();
    expect(mockSignUp.finalize).not.toHaveBeenCalled();
  });
});

describe("Continue with Google", () => {
  it("asks a new Google account to agree to the Terms, then finishes it", async () => {
    mockGoogle.start.mockResolvedValue("needs-terms");
    await openSignUp();
    await fireEvent.press(screen.getByText("Continue with Google"));
    expect(await screen.findByText("One more step")).toBeTruthy();

    await fireEvent.press(screen.getByText("Create account"));
    expect(
      screen.getByText("Agree to the Terms and Privacy policy to create an account."),
    ).toBeTruthy();
    expect(mockGoogle.acceptTerms).not.toHaveBeenCalled();

    await fireEvent.press(
      screen.getByRole("checkbox", { name: "I agree to the Terms and Privacy policy" }),
    );
    await fireEvent.press(screen.getByText("Create account"));
    await waitFor(() => expect(mockGoogle.acceptTerms).toHaveBeenCalledTimes(1));
  });

  it("finishes straight away when the box on Create an account is already ticked", async () => {
    mockGoogle.start.mockResolvedValue("needs-terms");
    await openSignUp();
    await fireEvent.press(
      screen.getByRole("checkbox", { name: "I agree to the Terms and Privacy policy" }),
    );
    await fireEvent.press(screen.getByText("Continue with Google"));
    await waitFor(() => expect(mockGoogle.acceptTerms).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("One more step")).toBeNull();
  });

  it("stays put when the browser is closed, and explains an account it can't finish", async () => {
    mockGoogle.start.mockResolvedValue("cancelled");
    await openSignUp();
    await fireEvent.press(screen.getByText("Continue with Google"));
    await waitFor(() => expect(mockGoogle.start).toHaveBeenCalledTimes(1));
    expect(screen.getByText("Create your account")).toBeTruthy();

    mockGoogle.start.mockResolvedValue("incomplete");
    await fireEvent.press(screen.getByText("Continue with Google"));
    expect(
      await screen.findByText(
        "Your account couldn't be finished. Try again later, or contact support.",
      ),
    ).toBeTruthy();
  });

  it("is offered on sign-in too, and Back to sign in leaves the extra step", async () => {
    mockGoogle.start.mockResolvedValue("needs-terms");
    await openSignUp();
    await fireEvent.press(screen.getByText("I already have an account"));
    await fireEvent.press(screen.getByText("Continue with Google"));
    expect(await screen.findByText("One more step")).toBeTruthy();
    await fireEvent.press(screen.getByText("Back to sign in"));
    expect(screen.getByText("Sign in")).toBeTruthy();
  });
});
