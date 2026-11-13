import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  acceptGoogleTerms,
  finishGoogleSignIn,
  GoogleSignInError,
  nonceFromCallback,
  openGoogleSignIn,
  SSO_REDIRECT,
  type GoogleClerk,
} from "./googleSignIn";
import { takeSignUpName } from "./signUpName";

const invoke = vi.hoisted(() => vi.fn<(command: string, args: unknown) => Promise<void>>());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

type Client = NonNullable<GoogleClerk["client"]>;
type SignUp = Awaited<ReturnType<Client["signUp"]["create"]>>;

const newAccount = (changes: Partial<SignUp>): SignUp => ({
  status: "complete",
  missingFields: [],
  createdSessionId: "sess_new",
  firstName: "Dana",
  lastName: "Example",
  ...changes,
});

function fakeClerk(
  options: {
    page?: URL | null;
    reloaded?: { createdSessionId: string | null; status: string | null };
    created?: SignUp;
    updated?: SignUp;
  } = {},
) {
  const setActive = vi.fn<(params: { session: string }) => Promise<void>>(async () => {});
  const create = vi.fn<Client["signIn"]["create"]>(async () => ({
    firstFactorVerification: {
      externalVerificationRedirectURL:
        options.page === undefined
          ? new URL("https://accounts.google.com/o/oauth2/v2/auth?client_id=x")
          : options.page,
    },
  }));
  const reload = vi.fn<Client["signIn"]["reload"]>(async () => ({
    createdSessionId: options.reloaded?.createdSessionId ?? "sess_existing",
    firstFactorVerification: { status: options.reloaded?.status ?? "verified" },
  }));
  const signUpCreate = vi.fn<Client["signUp"]["create"]>(
    async () => options.created ?? newAccount({}),
  );
  const signUpUpdate = vi.fn<Client["signUp"]["update"]>(
    async () => options.updated ?? newAccount({}),
  );
  const clerk: GoogleClerk = {
    client: {
      signIn: { create, reload },
      signUp: { create: signUpCreate, update: signUpUpdate },
    },
    setActive,
  };
  return { clerk, setActive, create, reload, signUpCreate, signUpUpdate };
}

beforeEach(() => {
  invoke.mockReset();
  invoke.mockResolvedValue();
});
afterEach(() => {
  takeSignUpName();
});

describe("openGoogleSignIn", () => {
  it("asks Clerk for Google's page, coming back to the app, and opens it", async () => {
    const { clerk, create } = fakeClerk();
    await openGoogleSignIn(clerk);
    expect(create).toHaveBeenCalledWith({ strategy: "oauth_google", redirectUrl: SSO_REDIRECT });
    expect(invoke).toHaveBeenCalledWith("open_sign_in_page", {
      url: "https://accounts.google.com/o/oauth2/v2/auth?client_id=x",
    });
  });

  it("says so when Clerk isn't ready or gives no page", async () => {
    await expect(
      openGoogleSignIn({ client: undefined, setActive: vi.fn<GoogleClerk["setActive"]>() }),
    ).rejects.toThrow(GoogleSignInError);
    await expect(openGoogleSignIn(fakeClerk({ page: null }).clerk)).rejects.toThrow(
      new GoogleSignInError("Google sign-in couldn't start. Try again."),
    );
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe("nonceFromCallback", () => {
  it("reads the nonce from the app's own callback link only", () => {
    expect(nonceFromCallback(`${SSO_REDIRECT}?rotating_token_nonce=abc`)).toBe("abc");
    expect(nonceFromCallback(SSO_REDIRECT)).toBe("");
    expect(nonceFromCallback("kineo://somewhere-else?rotating_token_nonce=abc")).toBeNull();
    expect(nonceFromCallback("https://evil.com/?rotating_token_nonce=abc")).toBeNull();
  });
});

describe("finishGoogleSignIn", () => {
  it("signs an existing account in, with nothing for Your profile", async () => {
    const { clerk, reload, setActive, signUpCreate } = fakeClerk();
    expect(await finishGoogleSignIn(clerk, "nonce")).toBe("signed-in");
    expect(reload).toHaveBeenCalledWith({ rotatingTokenNonce: "nonce" });
    expect(signUpCreate).not.toHaveBeenCalled();
    expect(setActive).toHaveBeenCalledWith({ session: "sess_existing" });
    expect(takeSignUpName()).toBeNull();
  });

  it("creates a new account, keeping Google's name for Your profile", async () => {
    const { clerk, setActive, signUpCreate } = fakeClerk({
      reloaded: { createdSessionId: null, status: "transferable" },
    });
    expect(await finishGoogleSignIn(clerk, "nonce")).toBe("signed-in");
    expect(signUpCreate).toHaveBeenCalledWith({ transfer: true });
    expect(setActive).toHaveBeenCalledWith({ session: "sess_new" });
    expect(takeSignUpName()).toBe("Dana Example");
  });

  it("stops a new account that still needs the Terms, without signing in", async () => {
    const { clerk, setActive } = fakeClerk({
      reloaded: { createdSessionId: null, status: "transferable" },
      created: newAccount({
        status: "missing_requirements",
        missingFields: ["legal_accepted"],
        createdSessionId: null,
      }),
    });
    expect(await finishGoogleSignIn(clerk, "nonce")).toBe("needs-terms");
    expect(setActive).not.toHaveBeenCalled();
  });
});

describe("acceptGoogleTerms", () => {
  it("finishes the new account and signs in", async () => {
    const { clerk, setActive, signUpUpdate } = fakeClerk();
    expect(await acceptGoogleTerms(clerk)).toBe("signed-in");
    expect(signUpUpdate).toHaveBeenCalledWith({ legalAccepted: true });
    expect(setActive).toHaveBeenCalledWith({ session: "sess_new" });
    expect(takeSignUpName()).toBe("Dana Example");
  });

  it("doesn't sign in when Clerk still wants more", async () => {
    const { clerk, setActive } = fakeClerk({
      updated: newAccount({
        status: "missing_requirements",
        missingFields: ["password"],
        createdSessionId: null,
      }),
    });
    expect(await acceptGoogleTerms(clerk)).toBe("incomplete");
    expect(setActive).not.toHaveBeenCalled();
  });
});
