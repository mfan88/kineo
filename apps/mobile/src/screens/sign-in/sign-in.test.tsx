import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { HeroUINativeProvider } from "heroui-native";
import { Text } from "react-native";
import { initialWindowMetrics, SafeAreaProvider } from "react-native-safe-area-context";
import { AuthGate } from "@/auth/auth-gate";
import { SignIn } from "./index";

type Result = Promise<{ error: unknown }>;

const mockSignIn = {
  emailCode: {
    sendCode: jest.fn<(params: { emailAddress: string }) => Result>(),
    verifyCode: jest.fn<(params: { code: string }) => Result>(),
  },
  password: jest.fn<(params: { identifier: string; password: string }) => Result>(),
};
const mockClerk = {
  status: "ready" as string,
  client: { signIn: { createdSessionId: null as string | null }, sessions: [] as { id: string }[] },
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
  mockClerk.client.sessions = [];
  mockAuth.isLoaded = true;
  mockAuth.isSignedIn = false;
  mockAuth.userId = null;
  mockSignIn.emailCode.sendCode.mockResolvedValue({ error: null });
  mockSignIn.emailCode.verifyCode.mockResolvedValue({ error: null });
  mockSignIn.password.mockResolvedValue({ error: null });
  mockClerk.setActive.mockResolvedValue();
});

describe("Sign in", () => {
  it("emails a code, then signs in with it", async () => {
    await show(<SignIn onCreateAccount={() => {}} />);
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
    await show(<SignIn onCreateAccount={() => {}} />);
    await fireEvent.changeText(screen.getByLabelText("Email"), "not-an-email");
    await fireEvent.press(screen.getByText("Email me a code"));
    expect(
      await screen.findByText("Enter your email address, like name@example.com."),
    ).toBeTruthy();
    expect(mockSignIn.emailCode.sendCode).not.toHaveBeenCalled();
  });

  it("asks for the code before checking it, and shows Clerk's refusal under it", async () => {
    await show(<SignIn onCreateAccount={() => {}} />);
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

  it("goes back to a different email from the code step", async () => {
    await show(<SignIn onCreateAccount={() => {}} />);
    await fireEvent.changeText(screen.getByLabelText("Email"), "sam@example.com");
    await fireEvent.press(screen.getByText("Email me a code"));
    await screen.findByText("Check your email");
    await fireEvent.press(screen.getByText("Use a different email"));
    expect(await screen.findByText("Email me a code")).toBeTruthy();
  });

  it("signs in with a password instead", async () => {
    await show(<SignIn onCreateAccount={() => {}} />);
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
    await show(<SignIn onCreateAccount={() => {}} />);
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

  it("explains a lost connection when Clerk throws", async () => {
    mockSignIn.emailCode.sendCode.mockRejectedValue(
      Object.assign(new Error("Network request failed"), { code: "network_error" }),
    );
    await show(<SignIn onCreateAccount={() => {}} />);
    await fireEvent.changeText(screen.getByLabelText("Email"), "sam@example.com");
    await fireEvent.press(screen.getByText("Email me a code"));
    await waitFor(() => expect(screen.queryByText("Check your email")).toBeNull());
    expect(screen.getByText("Sign in")).toBeTruthy();
    expect(screen.getByRole("alert")).toBeTruthy();
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
