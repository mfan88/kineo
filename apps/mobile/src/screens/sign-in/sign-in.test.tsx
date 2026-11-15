import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { HeroUINativeProvider } from "heroui-native";
import { Text } from "react-native";
import { initialWindowMetrics, SafeAreaProvider } from "react-native-safe-area-context";
import { AuthGate } from "@/auth/auth-gate";
import { SignIn } from "./index";

type Result = Promise<{ error: unknown }>;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const mockSignIn = {
  emailCode: {
    sendCode: jest.fn<(params: { emailAddress: string }) => Result>(),
    verifyCode: jest.fn<(params: { code: string }) => Result>(),
  },
  password: jest.fn<(params: { identifier: string; password: string }) => Result>(),
  mfa: {
    sendEmailCode: jest.fn<() => Result>(),
    verifyEmailCode: jest.fn<(params: { code: string }) => Result>(),
  },
};
const mockClerk = {
  status: "ready" as string,
  client: {
    signIn: {
      createdSessionId: null as string | null,
      status: null as string | null,
      supportedSecondFactors: [{ strategy: "email_code" }] as { strategy: string }[],
    },
    sessions: [] as { id: string }[],
  },
  setActive: jest.fn<(params: { session: string }) => Promise<void>>(),
};
const mockAuth = { isLoaded: true, isSignedIn: false, userId: null as string | null };
const mockReload = jest.fn<() => Promise<void>>();

jest.mock("@clerk/expo", () => ({
  useSignIn: () => ({ signIn: mockSignIn }),
  useClerk: () => mockClerk,
  useAuth: () => mockAuth,
}));
jest.mock("expo", () => ({ reloadAppAsync: () => mockReload() }));
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

async function show(element: React.ReactElement) {
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <HeroUINativeProvider config={{ devInfo: { stylingPrinciples: false } }}>
        {element}
      </HeroUINativeProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockClerk.status = "ready";
  mockClerk.client.signIn.createdSessionId = null;
  mockClerk.client.signIn.status = null;
  mockClerk.client.signIn.supportedSecondFactors = [{ strategy: "email_code" }];
  mockClerk.client.sessions = [];
  mockAuth.isLoaded = true;
  mockAuth.isSignedIn = false;
  mockAuth.userId = null;
  mockSignIn.emailCode.sendCode.mockResolvedValue({ error: null });
  mockSignIn.emailCode.verifyCode.mockResolvedValue({ error: null });
  mockSignIn.password.mockResolvedValue({ error: null });
  mockSignIn.mfa.sendEmailCode.mockResolvedValue({ error: null });
  mockSignIn.mfa.verifyEmailCode.mockResolvedValue({ error: null });
  mockClerk.setActive.mockResolvedValue();
});

describe("Sign in", () => {
  it("emails a code, then signs in with it", async () => {
    await show(<SignIn onCreateAccount={() => {}} onNeedsTerms={() => {}} />);
    expect(screen.getByText("Kineō")).toBeTruthy();
    expect(screen.getByText("Sign in")).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText("Email"), " sam@example.com ");
    await fireEvent.press(screen.getByText("Email me a code"));
    await screen.findByText("Check your email");
    expect(mockSignIn.emailCode.sendCode).toHaveBeenCalledWith({ emailAddress: "sam@example.com" });
    expect(screen.getByText("We sent a code to sam@example.com.")).toBeTruthy();

    mockSignIn.emailCode.verifyCode.mockImplementation(() => {
      mockClerk.client.signIn.createdSessionId = "sess_1";
      return Promise.resolve({ error: null });
    });
    await fireEvent.changeText(screen.getByLabelText("Code"), "123456");
    await fireEvent.press(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(mockClerk.setActive).toHaveBeenCalledWith({ session: "sess_1" }));
    expect(mockSignIn.emailCode.verifyCode).toHaveBeenCalledWith({ code: "123456" });
  });

  it("says what's wrong with the email under its field, without calling Clerk", async () => {
    await show(<SignIn onCreateAccount={() => {}} onNeedsTerms={() => {}} />);
    await fireEvent.changeText(screen.getByLabelText("Email"), "not-an-email");
    await fireEvent.press(screen.getByText("Email me a code"));
    expect(
      await screen.findByText("Enter your email address, like name@example.com."),
    ).toBeTruthy();
    expect(mockSignIn.emailCode.sendCode).not.toHaveBeenCalled();
  });

  it("asks for the code before checking it, and shows Clerk's refusal under it", async () => {
    await show(<SignIn onCreateAccount={() => {}} onNeedsTerms={() => {}} />);
    await fireEvent.changeText(screen.getByLabelText("Email"), "sam@example.com");
    await fireEvent.press(screen.getByText("Email me a code"));
    await screen.findByText("Check your email");

    await fireEvent.press(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Enter the code from the email.")).toBeTruthy();
    expect(mockSignIn.emailCode.verifyCode).not.toHaveBeenCalled();

    mockSignIn.emailCode.verifyCode.mockResolvedValue({
      error: { errors: [{ code: "form_code_incorrect", message: "Incorrect code" }] },
    });
    await fireEvent.changeText(screen.getByLabelText("Code"), "000000");
    await fireEvent.press(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(screen.queryByText("Enter the code from the email.")).toBeNull());
    expect(mockClerk.setActive).not.toHaveBeenCalled();
  });

  it("shows Signing in… and ignores a second press while verifying a code", async () => {
    const pending = deferred<{ error: unknown }>();
    mockSignIn.emailCode.verifyCode.mockReturnValue(pending.promise);

    await show(<SignIn onCreateAccount={() => {}} onNeedsTerms={() => {}} />);
    await fireEvent.changeText(screen.getByLabelText("Email"), "sam@example.com");
    await fireEvent.press(screen.getByText("Email me a code"));
    await screen.findByText("Check your email");

    await fireEvent.changeText(screen.getByLabelText("Code"), "123456");
    await fireEvent.press(screen.getByRole("button", { name: "Sign in" }));

    expect(screen.getByText("Signing in…")).toBeTruthy();
    expect(mockSignIn.emailCode.verifyCode).toHaveBeenCalledTimes(1);

    const button = screen.getByRole("button", { busy: true });
    expect(button.props.onPress).toBeUndefined();
    button.props.onPress?.();
    expect(mockSignIn.emailCode.verifyCode).toHaveBeenCalledTimes(1);

    pending.resolve({ error: null });
    await waitFor(() => expect(screen.queryByText("Signing in…")).toBeNull());
  });

  it("goes back to a different email from the code step", async () => {
    await show(<SignIn onCreateAccount={() => {}} onNeedsTerms={() => {}} />);
    await fireEvent.changeText(screen.getByLabelText("Email"), "sam@example.com");
    await fireEvent.press(screen.getByText("Email me a code"));
    await screen.findByText("Check your email");
    await fireEvent.press(screen.getByText("Use a different email"));
    expect(await screen.findByText("Email me a code")).toBeTruthy();
  });

  it("signs in with a password instead", async () => {
    await show(<SignIn onCreateAccount={() => {}} onNeedsTerms={() => {}} />);
    await fireEvent.press(screen.getByText("Use a password instead"));
    await fireEvent.changeText(screen.getByLabelText("Email"), "sam@example.com");
    await fireEvent.press(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Enter your password.")).toBeTruthy();

    mockSignIn.password.mockImplementation(() => {
      mockClerk.client.signIn.createdSessionId = "sess_2";
      return Promise.resolve({ error: null });
    });
    await fireEvent.changeText(screen.getByLabelText("Password"), "made-up-password");
    await fireEvent.press(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(mockClerk.setActive).toHaveBeenCalledWith({ session: "sess_2" }));
    expect(mockSignIn.password).toHaveBeenCalledWith({
      identifier: "sam@example.com",
      password: "made-up-password",
    });
  });

  it("shows a wrong password under the password field", async () => {
    mockSignIn.password.mockResolvedValue({
      error: { errors: [{ code: "form_password_incorrect" }] },
    });
    await show(<SignIn onCreateAccount={() => {}} onNeedsTerms={() => {}} />);
    await fireEvent.press(screen.getByText("Use a password instead"));
    await fireEvent.changeText(screen.getByLabelText("Email"), "sam@example.com");
    await fireEvent.changeText(screen.getByLabelText("Password"), "wrong");
    await fireEvent.press(screen.getByRole("button", { name: "Sign in" }));
    expect(
      await screen.findByText(
        "That password isn't right. Try again, or sign in with an email code instead.",
      ),
    ).toBeTruthy();
  });

  it("shows Signing in… and ignores a second press while checking a password", async () => {
    const pending = deferred<{ error: unknown }>();
    mockSignIn.password.mockReturnValue(pending.promise);

    await show(<SignIn onCreateAccount={() => {}} onNeedsTerms={() => {}} />);
    await fireEvent.press(screen.getByText("Use a password instead"));
    await fireEvent.changeText(screen.getByLabelText("Email"), "sam@example.com");
    await fireEvent.changeText(screen.getByLabelText("Password"), "secret-password");
    await fireEvent.press(screen.getByRole("button", { name: "Sign in" }));

    expect(screen.getByText("Signing in…")).toBeTruthy();
    expect(mockSignIn.password).toHaveBeenCalledTimes(1);

    const button = screen.getByRole("button", { busy: true });
    expect(button.props.onPress).toBeUndefined();
    button.props.onPress?.();
    expect(mockSignIn.password).toHaveBeenCalledTimes(1);

    pending.resolve({ error: null });
    await waitFor(() => expect(screen.queryByText("Signing in…")).toBeNull());
  });

  it("explains a lost connection when Clerk throws", async () => {
    mockSignIn.emailCode.sendCode.mockRejectedValue(
      Object.assign(new Error("Network request failed"), { code: "network_error" }),
    );
    await show(<SignIn onCreateAccount={() => {}} onNeedsTerms={() => {}} />);
    await fireEvent.changeText(screen.getByLabelText("Email"), "sam@example.com");
    await fireEvent.press(screen.getByText("Email me a code"));
    await waitFor(() => expect(screen.queryByText("Check your email")).toBeNull());
    expect(screen.getByText("Sign in")).toBeTruthy();
    expect(screen.getByRole("alert")).toBeTruthy();
  });
});

describe("Password accepted, but Clerk needs another step", () => {
  async function submitPassword(status: string) {
    mockSignIn.password.mockImplementation(() => {
      mockClerk.client.signIn.status = status;
      return Promise.resolve({ error: null });
    });
    await show(<SignIn onCreateAccount={() => {}} onNeedsTerms={() => {}} />);
    await fireEvent.press(screen.getByText("Use a password instead"));
    await fireEvent.changeText(screen.getByLabelText("Email"), "sam@example.com");
    await fireEvent.changeText(screen.getByLabelText("Password"), "made-up-password");
    await fireEvent.press(screen.getByRole("button", { name: "Sign in" }));
  }

  for (const status of ["needs_client_trust", "needs_second_factor"]) {
    it(`emails a code and signs in with it (${status})`, async () => {
      mockSignIn.mfa.verifyEmailCode.mockImplementation(() => {
        mockClerk.client.signIn.createdSessionId = "sess_trusted";
        return Promise.resolve({ error: null });
      });
      await submitPassword(status);
      await screen.findByText("Check your email");
      expect(screen.getByText("We sent a code to sam@example.com.")).toBeTruthy();
      expect(mockSignIn.mfa.sendEmailCode).toHaveBeenCalledTimes(1);

      await fireEvent.changeText(screen.getByLabelText("Code"), "424242");
      await fireEvent.press(screen.getByRole("button", { name: "Sign in" }));
      await waitFor(() =>
        expect(mockClerk.setActive).toHaveBeenCalledWith({ session: "sess_trusted" }),
      );
      expect(mockSignIn.mfa.verifyEmailCode).toHaveBeenCalledWith({ code: "424242" });
      expect(mockSignIn.emailCode.verifyCode).not.toHaveBeenCalled();
    });
  }

  it("sends a new code the same way", async () => {
    await submitPassword("needs_client_trust");
    await screen.findByText("Check your email");
    await fireEvent.press(screen.getByText("Send a new code"));
    await waitFor(() => expect(mockSignIn.mfa.sendEmailCode).toHaveBeenCalledTimes(2));
    expect(mockSignIn.emailCode.sendCode).not.toHaveBeenCalled();
  });

  it("asks to turn off a second factor Kineō can't do", async () => {
    mockClerk.client.signIn.supportedSecondFactors = [{ strategy: "totp" }];
    await submitPassword("needs_second_factor");
    expect(
      await screen.findByText(
        "This account needs a second sign-in step that Kineō doesn't support yet, like an authenticator app. Turn that step off for this account, then try again.",
      ),
    ).toBeTruthy();
    expect(mockSignIn.mfa.sendEmailCode).not.toHaveBeenCalled();
  });

  it("says a Protect check isn't supported", async () => {
    await submitPassword("needs_protect_check");
    expect(await screen.findByText(/doesn't support yet/)).toBeTruthy();
  });

  it("says sign-in didn't finish when the password opens no session and Clerk asks for nothing", async () => {
    await submitPassword("needs_first_factor");
    expect(
      await screen.findByText(
        "Couldn't finish signing in. Try again, or sign in with an email code instead.",
      ),
    ).toBeTruthy();
  });

  it("says sign-in didn't finish when the emailed code opens no session", async () => {
    await submitPassword("needs_client_trust");
    await screen.findByText("Check your email");
    await fireEvent.changeText(screen.getByLabelText("Code"), "424242");
    await fireEvent.press(screen.getByRole("button", { name: "Sign in" }));
    expect(
      await screen.findByText(
        "Couldn't finish signing in. Try again, or sign in with an email code instead.",
      ),
    ).toBeTruthy();
    expect(mockSignIn.mfa.sendEmailCode).toHaveBeenCalledTimes(1);
  });

  it("points to an email code when the account needs a new password", async () => {
    await submitPassword("needs_new_password");
    expect(
      await screen.findByText(
        "This account needs a new password. Sign in with an email code instead.",
      ),
    ).toBeTruthy();
  });
});

const app = (userId: string) => <Text>App for {userId}</Text>;

describe("AuthGate", () => {
  it("shows sign-in until signed in", async () => {
    await show(<AuthGate>{app}</AuthGate>);
    expect(screen.getByText("Sign in")).toBeTruthy();
    expect(screen.queryByText(/App for/)).toBeNull();
  });

  it("shows the app with the user's ID once signed in", async () => {
    mockAuth.isSignedIn = true;
    mockAuth.userId = "user_test";
    await show(<AuthGate>{app}</AuthGate>);
    expect(screen.getByText("App for user_test")).toBeTruthy();
  });

  it("shows only a spinner while Clerk loads", async () => {
    mockAuth.isLoaded = false;
    await show(<AuthGate>{app}</AuthGate>);
    expect(screen.getByLabelText("Loading")).toBeTruthy();
    expect(screen.queryByText("Sign in")).toBeNull();
  });

  it("says when sign-in can't be reached, and tries again", async () => {
    mockClerk.status = "error";
    await show(<AuthGate>{app}</AuthGate>);
    expect(screen.getByText("Can't reach sign-in")).toBeTruthy();
    await fireEvent.press(screen.getByText("Try again"));
    expect(mockReload).toHaveBeenCalled();
  });
});
