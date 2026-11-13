import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthGate } from "./AuthGate";
import { takeSignUpName } from "./signUpName";

// A stand-in for Clerk: no network, and each test sets the state it needs.
type Result = { error: unknown };
const clerk = vi.hoisted(() => ({
  status: "ready" as "loading" | "ready" | "error",
  isLoaded: true,
  isSignedIn: false,
  createdSessionId: null as string | null,
  setActive: vi.fn<(params: { session: string }) => Promise<void>>(async () => {}),
  sendCode: vi.fn<(params: { emailAddress: string }) => Promise<Result>>(async () => ({
    error: null,
  })),
  verifyCode: vi.fn<(params: { code: string }) => Promise<Result>>(async () => ({ error: null })),
  password: vi.fn<(params: { identifier: string; password: string }) => Promise<Result>>(
    async () => ({ error: null }),
  ),
  // Creating an account.
  signUpStatus: "missing_requirements" as string,
  create: vi.fn<(params: { emailAddress: string; legalAccepted: boolean }) => Promise<Result>>(
    async () => ({ error: null }),
  ),
  sendEmailCode: vi.fn<() => Promise<Result>>(async () => ({ error: null })),
  verifyEmailCode: vi.fn<(params: { code: string }) => Promise<Result>>(async () => ({
    error: null,
  })),
  finalize: vi.fn<() => Promise<Result>>(async () => ({ error: null })),
}));

vi.mock("@clerk/react", () => ({
  useAuth: () => ({ isLoaded: clerk.isLoaded, isSignedIn: clerk.isSignedIn }),
  useClerk: () => ({
    status: clerk.status,
    setActive: clerk.setActive,
    // Live, like Clerk's own client: read when the sign-in finishes.
    client: {
      get signIn() {
        return { createdSessionId: clerk.createdSessionId };
      },
      sessions: [],
    },
  }),
  useSignUp: () => ({
    signUp: {
      get status() {
        return clerk.signUpStatus;
      },
      create: clerk.create,
      verifications: {
        sendEmailCode: clerk.sendEmailCode,
        verifyEmailCode: clerk.verifyEmailCode,
      },
      finalize: clerk.finalize,
    },
  }),
  useSignIn: () => ({
    signIn: {
      emailCode: { sendCode: clerk.sendCode, verifyCode: clerk.verifyCode },
      password: clerk.password,
    },
  }),
}));

function renderGate() {
  const user = userEvent.setup();
  render(
    <AuthGate>
      <p>The app</p>
    </AuthGate>,
  );
  return user;
}

const apiError = (code: string, message = "Clerk's message") => ({
  code: "api_response_error",
  errors: [{ code, message }],
});

beforeEach(() => {
  Object.assign(clerk, {
    status: "ready",
    isLoaded: true,
    isSignedIn: false,
    createdSessionId: null,
    signUpStatus: "missing_requirements",
  });
  for (const fn of [
    clerk.setActive,
    clerk.sendCode,
    clerk.verifyCode,
    clerk.password,
    clerk.create,
    clerk.sendEmailCode,
    clerk.verifyEmailCode,
    clerk.finalize,
  ])
    fn.mockClear();
  clerk.create.mockResolvedValue({ error: null });
  clerk.sendEmailCode.mockResolvedValue({ error: null });
  clerk.verifyEmailCode.mockImplementation(async () => {
    clerk.signUpStatus = "complete";
    return { error: null };
  });
  clerk.finalize.mockResolvedValue({ error: null });
  clerk.sendCode.mockResolvedValue({ error: null });
  clerk.verifyCode.mockResolvedValue({ error: null });
  clerk.password.mockResolvedValue({ error: null });
});

describe("Auth gate", () => {
  it("shows the app when signed in", () => {
    clerk.isSignedIn = true;
    renderGate();
    expect(screen.getByText("The app")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Sign in" })).toBeNull();
  });

  it("shows only the sign-in screen when signed out", () => {
    renderGate();
    expect(screen.getByRole("heading", { level: 1, name: "Sign in" })).toBeTruthy();
    expect(screen.queryByText("The app")).toBeNull();
  });

  it("shows a loading spinner, and nothing else, while Clerk loads", () => {
    clerk.isLoaded = false;
    renderGate();
    expect(screen.getByLabelText("Loading")).toBeTruthy();
    expect(screen.queryByText("The app")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Sign in" })).toBeNull();
  });

  it('shows the wordmark with the spinner, and "Signing you in" only after 2 seconds', () => {
    vi.useFakeTimers();
    try {
      clerk.isLoaded = false;
      renderGate();
      expect(screen.getByRole("img", { name: "Kineō" })).toBeTruthy();
      expect(screen.queryByText("Signing you in")).toBeNull();
      act(() => {
        vi.advanceTimersByTime(1999);
      });
      expect(screen.queryByText("Signing you in")).toBeNull();
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(screen.getByText("Signing you in").closest("[role=status]")).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("says what to do when sign-in can't be reached", () => {
    clerk.status = "error";
    clerk.isLoaded = false;
    renderGate();
    expect(screen.getByRole("heading", { name: "Can't reach sign-in" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    expect(screen.queryByText("The app")).toBeNull();
  });
});

describe("Sign in with an email code", () => {
  it("emails a code, then signs in with it", async () => {
    const user = renderGate();
    await user.type(screen.getByRole("textbox", { name: /Email/ }), " sky@example.com ");
    await user.click(screen.getByRole("button", { name: "Email me a code" }));

    expect(clerk.sendCode).toHaveBeenCalledWith({ emailAddress: "sky@example.com" });
    expect(await screen.findByRole("heading", { name: "Check your email" })).toBeTruthy();
    expect(screen.getByText("We sent a code to sky@example.com.")).toBeTruthy();

    clerk.verifyCode.mockImplementation(async () => {
      clerk.createdSessionId = "sess_123";
      return { error: null };
    });
    await user.type(screen.getByRole("textbox", { name: /Code/ }), "424242");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(clerk.verifyCode).toHaveBeenCalledWith({ code: "424242" });
    expect(clerk.setActive).toHaveBeenCalledWith({ session: "sess_123" });
  });

  it("checks the email before asking Clerk", async () => {
    const user = renderGate();
    await user.type(screen.getByRole("textbox", { name: /Email/ }), "not-an-email");
    await user.click(screen.getByRole("button", { name: "Email me a code" }));

    expect(clerk.sendCode).not.toHaveBeenCalled();
    expect(screen.getByText("Enter your email address, like name@example.com.")).toBeTruthy();
  });

  it("explains an unknown email under the email field", async () => {
    clerk.sendCode.mockResolvedValue({ error: apiError("form_identifier_not_found") });
    const user = renderGate();
    await user.type(screen.getByRole("textbox", { name: /Email/ }), "nobody@example.com");
    await user.click(screen.getByRole("button", { name: "Email me a code" }));

    expect(
      await screen.findByText("There's no Kineō account with that email. Check it for typos."),
    ).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeTruthy();
  });

  it("explains a wrong code and stays on the code step", async () => {
    clerk.verifyCode.mockResolvedValue({ error: apiError("form_code_incorrect") });
    const user = renderGate();
    await user.type(screen.getByRole("textbox", { name: /Email/ }), "sky@example.com");
    await user.click(screen.getByRole("button", { name: "Email me a code" }));
    await user.type(await screen.findByRole("textbox", { name: /Code/ }), "000000");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(
      await screen.findByText("That code isn't right. Check the email and try again."),
    ).toBeTruthy();
    expect(clerk.setActive).not.toHaveBeenCalled();
  });

  it("asks for the code if it's empty", async () => {
    const user = renderGate();
    await user.type(screen.getByRole("textbox", { name: /Email/ }), "sky@example.com");
    await user.click(screen.getByRole("button", { name: "Email me a code" }));
    await user.click(await screen.findByRole("button", { name: "Sign in" }));

    expect(clerk.verifyCode).not.toHaveBeenCalled();
    expect(screen.getByText("Enter the code from the email.")).toBeTruthy();
  });

  it("can go back to change the email", async () => {
    const user = renderGate();
    await user.type(screen.getByRole("textbox", { name: /Email/ }), "sky@example.com");
    await user.click(screen.getByRole("button", { name: "Email me a code" }));
    await user.click(await screen.findByRole("button", { name: "Use a different email" }));

    expect(screen.getByRole("heading", { name: "Sign in" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: /Email/ })).toHaveProperty(
      "value",
      "sky@example.com",
    );
  });

  it("uses a session that already exists instead of showing an error", async () => {
    clerk.verifyCode.mockImplementation(async () => {
      clerk.createdSessionId = "sess_existing";
      return { error: apiError("session_exists", "You're already signed in.") };
    });
    const user = renderGate();
    await user.type(screen.getByRole("textbox", { name: /Email/ }), "sky@example.com");
    await user.click(screen.getByRole("button", { name: "Email me a code" }));
    await user.type(await screen.findByRole("textbox", { name: /Code/ }), "424242");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(clerk.setActive).toHaveBeenCalledWith({ session: "sess_existing" });
    expect(screen.queryByText("You're already signed in.")).toBeNull();
  });

  it("says to check the connection when offline", async () => {
    clerk.sendCode.mockRejectedValue({ code: "clerk_offline", message: "offline" });
    const user = renderGate();
    await user.type(screen.getByRole("textbox", { name: /Email/ }), "sky@example.com");
    await user.click(screen.getByRole("button", { name: "Email me a code" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Couldn't reach the sign-in service. Check your internet connection and try again.",
    );
  });
});

async function openPassword() {
  const user = renderGate();
  await user.click(screen.getByRole("button", { name: "Use a password instead" }));
  await user.type(screen.getByRole("textbox", { name: /Email/ }), "sky@example.com");
  return user;
}

describe("Sign in with a password", () => {
  it("signs in with email and password", async () => {
    clerk.password.mockImplementation(async () => {
      clerk.createdSessionId = "sess_pw";
      return { error: null };
    });
    const user = await openPassword();
    await user.type(screen.getByLabelText(/Password/), "a long unique passphrase");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(clerk.password).toHaveBeenCalledWith({
      identifier: "sky@example.com",
      password: "a long unique passphrase",
    });
    expect(clerk.setActive).toHaveBeenCalledWith({ session: "sess_pw" });
  });

  it("asks for the password if it's empty", async () => {
    const user = await openPassword();
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(clerk.password).not.toHaveBeenCalled();
    expect(screen.getByText("Enter your password.")).toBeTruthy();
  });

  it("points to an email code when the password has been in a breach", async () => {
    clerk.password.mockResolvedValue({ error: apiError("form_password_pwned") });
    const user = await openPassword();
    await user.type(screen.getByLabelText(/Password/), "password123");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText(/appeared in a data breach/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Email me a code instead" }));
    expect(screen.getByRole("button", { name: "Email me a code" })).toBeTruthy();
  });
});

async function openSignUp() {
  const user = renderGate();
  await user.click(screen.getByRole("button", { name: "Create an account" }));
  expect(screen.getByRole("heading", { name: "Create your account" })).toBeTruthy();
  return user;
}

async function fillDetails(user: ReturnType<typeof renderGate>) {
  await user.type(screen.getByRole("textbox", { name: "Full name" }), "Dana Example");
  await user.type(screen.getByRole("textbox", { name: "Email" }), " dana@example.com ");
  await user.click(
    screen.getByRole("checkbox", { name: "I agree to the Terms and Privacy policy" }),
  );
}

describe("Create an account", () => {
  it("asks for the name, email and agreement, emails a code, then creates and signs in", async () => {
    const user = await openSignUp();
    await fillDetails(user);
    await user.click(screen.getByRole("button", { name: "Email me a code" }));

    expect(clerk.create).toHaveBeenCalledWith({
      emailAddress: "dana@example.com",
      legalAccepted: true,
    });
    expect(clerk.sendEmailCode).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("heading", { name: "Check your email" })).toBeTruthy();
    expect(screen.getByText("We sent a code to dana@example.com.")).toBeTruthy();

    await user.type(screen.getByRole("textbox", { name: "Code" }), " 123456 ");
    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(clerk.verifyEmailCode).toHaveBeenCalledWith({ code: "123456" });
    expect(clerk.finalize).toHaveBeenCalledTimes(1);
    expect(takeSignUpName()).toBe("Dana Example");
  });

  it("says what's missing before asking Clerk, each under its own field", async () => {
    const user = await openSignUp();
    await user.type(screen.getByRole("textbox", { name: "Email" }), "dana@");
    await user.click(screen.getByRole("button", { name: "Email me a code" }));
    expect(screen.getByText("Add your full name. It goes on your invoices.")).toBeTruthy();
    expect(screen.getByText("Enter your email address, like name@example.com.")).toBeTruthy();
    expect(
      screen.getByText("Agree to the Terms and Privacy policy to create an account."),
    ).toBeTruthy();
    expect(clerk.create).not.toHaveBeenCalled();
  });

  it("points to sign-in when the email already has an account", async () => {
    clerk.create.mockResolvedValue({ error: apiError("form_identifier_exists") });
    const user = await openSignUp();
    await fillDetails(user);
    await user.click(screen.getByRole("button", { name: "Email me a code" }));
    expect(
      screen.getByText("That email already has a Kineō account. Sign in instead."),
    ).toBeTruthy();
    expect(clerk.sendEmailCode).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "I already have an account" }));
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeTruthy();
  });

  it("explains a wrong code and doesn't finish", async () => {
    clerk.verifyEmailCode.mockResolvedValue({ error: apiError("form_code_incorrect") });
    const user = await openSignUp();
    await fillDetails(user);
    await user.click(screen.getByRole("button", { name: "Email me a code" }));
    await user.type(screen.getByRole("textbox", { name: "Code" }), "000000");
    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(screen.getByText("That code isn't right. Check the email and try again.")).toBeTruthy();
    expect(clerk.finalize).not.toHaveBeenCalled();
  });

  it("says so when Clerk wants more than Kineō asks for", async () => {
    clerk.verifyEmailCode.mockResolvedValue({ error: null });
    const user = await openSignUp();
    await fillDetails(user);
    await user.click(screen.getByRole("button", { name: "Email me a code" }));
    await user.type(screen.getByRole("textbox", { name: "Code" }), "123456");
    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(
      screen.getByText("Your account couldn't be finished. Try again later, or contact support."),
    ).toBeTruthy();
    expect(clerk.finalize).not.toHaveBeenCalled();
  });

  it("sends a new code without starting again", async () => {
    const user = await openSignUp();
    await fillDetails(user);
    await user.click(screen.getByRole("button", { name: "Email me a code" }));
    await user.click(screen.getByRole("button", { name: "Send a new code" }));
    expect(clerk.create).toHaveBeenCalledTimes(1);
    expect(clerk.sendEmailCode).toHaveBeenCalledTimes(2);
  });
});
