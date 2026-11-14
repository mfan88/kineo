import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthGate } from "./AuthGate";

// Clerk, signed out; the Google steps themselves are tested in googleSignIn.test.ts.
vi.mock("@clerk/react", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: false }),
  useClerk: () => ({
    status: "ready",
    client: { signIn: {}, sessions: [] },
    setActive: vi.fn<() => Promise<void>>(),
  }),
  useSignIn: () => ({ signIn: { emailCode: {}, password: vi.fn<() => Promise<void>>() } }),
  useSignUp: () => ({ signUp: {} }),
}));

const google = vi.hoisted(() => ({
  open: vi.fn<() => Promise<void>>(),
  finish: vi.fn<(clerk: unknown, nonce: string) => Promise<string>>(),
  accept: vi.fn<() => Promise<string>>(),
}));
vi.mock("./googleSignIn", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./googleSignIn")>()),
  openGoogleSignIn: google.open,
  finishGoogleSignIn: google.finish,
  acceptGoogleTerms: google.accept,
}));

// The Tauri window, with kineo:// links arriving through the deep-link plugin.
const links = vi.hoisted(() => ({
  listener: null as ((urls: string[]) => void) | null,
  opened: null as string[] | null,
}));
vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => true,
  invoke: vi.fn<() => Promise<void>>(),
}));
vi.mock("@tauri-apps/plugin-deep-link", () => ({
  onOpenUrl: async (listener: (urls: string[]) => void) => {
    links.listener = listener;
    return () => {
      links.listener = null;
    };
  },
  getCurrent: async () => links.opened,
}));

const CALLBACK = "kineo://sso-callback?rotating_token_nonce=nonce-1";

function renderGate() {
  const user = userEvent.setup();
  render(
    <AuthGate>
      <p>The app</p>
    </AuthGate>,
  );
  return user;
}

/** The browser comes back to the app with Google's answer. */
async function arrive(url = CALLBACK) {
  await vi.waitFor(() => expect(links.listener).not.toBeNull());
  await act(async () => links.listener?.([url]));
}

beforeEach(() => {
  localStorage.removeItem("kineo.googleCallbackHandled");
  links.listener = null;
  links.opened = null;
  google.open.mockReset();
  google.open.mockResolvedValue();
  google.finish.mockReset();
  google.finish.mockResolvedValue("signed-in");
  google.accept.mockReset();
  google.accept.mockResolvedValue("signed-in");
});

describe("Continue with Google on desktop", () => {
  it("opens Google in the browser and says to finish there", async () => {
    const user = renderGate();
    await user.click(screen.getByRole("button", { name: "Continue with Google" }));
    expect(google.open).toHaveBeenCalledTimes(1);
    expect(
      screen.getByText(
        "Finish signing in with Google in your browser. Kineō opens again when you're done.",
      ),
    ).toBeTruthy();
  });

  it("is on Create an account too", async () => {
    const user = renderGate();
    await user.click(screen.getByRole("button", { name: "Create an account" }));
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeTruthy();
  });

  it("finishes the sign-in when the browser comes back, ignoring other links", async () => {
    renderGate();
    await arrive("kineo://somewhere-else");
    expect(google.finish).not.toHaveBeenCalled();
    await arrive();
    expect(google.finish).toHaveBeenCalledWith(expect.anything(), "nonce-1");
  });

  it("finishes too when the link is what opened the app", async () => {
    links.opened = [CALLBACK];
    renderGate();
    await vi.waitFor(() =>
      expect(google.finish).toHaveBeenCalledWith(expect.anything(), "nonce-1"),
    );
  });

  it("ignores a callback after it has already been handled", async () => {
    renderGate();
    await arrive();
    await arrive();
    expect(google.finish).toHaveBeenCalledTimes(1);
  });

  it("does not send a callback without a nonce to Clerk", async () => {
    renderGate();
    await arrive("kineo://sso-callback");
    expect(google.finish).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toBe(
      "Google didn't return the sign-in details. Try again.",
    );
  });

  it("asks a new account to agree to the Terms, then creates it", async () => {
    google.finish.mockResolvedValue("needs-terms");
    const user = renderGate();
    await arrive();
    expect(await screen.findByRole("heading", { name: "One more step" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(
      screen.getByText("Agree to the Terms and Privacy policy to create an account."),
    ).toBeTruthy();
    expect(google.accept).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("checkbox", { name: "I agree to the Terms and Privacy policy" }),
    );
    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(google.accept).toHaveBeenCalledTimes(1);
  });

  it("goes back to sign-in from the extra step", async () => {
    google.finish.mockResolvedValue("needs-terms");
    const user = renderGate();
    await arrive();
    await user.click(await screen.findByRole("button", { name: "Back to sign in" }));
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeTruthy();
  });

  it("explains an account it can't finish", async () => {
    google.finish.mockResolvedValue("incomplete");
    renderGate();
    await arrive();
    expect(
      await screen.findByText(
        "Your account couldn't be finished. Try again later, or contact support.",
      ),
    ).toBeTruthy();
  });
});
