import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { renderHook } from "@testing-library/react-native";
import { useGoogleSignIn } from "./google-sign-in";
import { takeSignUpName } from "./sign-up-name";

type SignUpLike = {
  id?: string;
  status: string;
  missingFields: string[];
  firstName: string | null;
  lastName: string | null;
  createdSessionId: string | null;
};

const mockStart = jest.fn<(params: { strategy: string }) => Promise<unknown>>();
const mockSignUp = {
  status: "missing_requirements",
  firstName: "Dana" as string | null,
  lastName: "Example" as string | null,
  update: jest.fn<(params: { legalAccepted: boolean }) => Promise<{ error: unknown }>>(),
  finalize: jest.fn<() => Promise<{ error: unknown }>>(),
};

jest.mock("@clerk/expo/experimental", () => ({ useSSO: () => ({ startSSOFlow: mockStart }) }));
jest.mock("@clerk/expo", () => ({ useSignUp: () => ({ signUp: mockSignUp }) }));
jest.mock("expo-web-browser", () => ({ maybeCompleteAuthSession: jest.fn() }));

const newAccount = (changes: Partial<SignUpLike>): SignUpLike => ({
  id: "sua_1",
  status: "complete",
  missingFields: [],
  firstName: "Dana",
  lastName: "Example",
  createdSessionId: "sess_1",
  ...changes,
});

async function start() {
  const { result } = await renderHook(() => useGoogleSignIn());
  return result.current;
}

beforeEach(() => {
  jest.clearAllMocks();
  takeSignUpName();
  mockSignUp.status = "missing_requirements";
  mockSignUp.update.mockImplementation(async () => {
    mockSignUp.status = "complete";
    return { error: null };
  });
  mockSignUp.finalize.mockResolvedValue({ error: null });
});

describe("useGoogleSignIn", () => {
  it("signs an existing account in through Google, with nothing for Your profile", async () => {
    mockStart.mockResolvedValue({
      createdSessionId: "sess_1",
      authSessionResult: { type: "success" },
      signIn: {},
      signUp: { status: null, missingFields: [] },
    });
    const google = await start();
    expect(await google.start()).toBe("signed-in");
    expect(mockStart).toHaveBeenCalledWith({ strategy: "oauth_google" });
    expect(takeSignUpName()).toBeNull();
  });

  it("keeps a new account's name from Google for Your profile", async () => {
    mockStart.mockResolvedValue({
      createdSessionId: "sess_1",
      authSessionResult: { type: "success" },
      signIn: {},
      signUp: newAccount({}),
    });
    const google = await start();
    expect(await google.start()).toBe("signed-in");
    expect(takeSignUpName()).toBe("Dana Example");
  });

  it("reports a new account waiting on the Terms, and a closed browser", async () => {
    mockStart.mockResolvedValue({
      createdSessionId: null,
      authSessionResult: { type: "success" },
      signIn: {},
      signUp: newAccount({
        status: "missing_requirements",
        missingFields: ["legal_accepted"],
        createdSessionId: null,
      }),
    });
    const google = await start();
    expect(await google.start()).toBe("needs-terms");

    mockStart.mockResolvedValue({
      createdSessionId: null,
      authSessionResult: { type: "cancel" },
      signIn: {},
      signUp: null,
    });
    expect(await google.start()).toBe("cancelled");
  });

  it("finishes a new account once the Terms are agreed, keeping Google's name", async () => {
    const google = await start();
    expect(await google.acceptTerms()).toEqual({ error: null });
    expect(mockSignUp.update).toHaveBeenCalledWith({ legalAccepted: true });
    expect(mockSignUp.finalize).toHaveBeenCalledTimes(1);
    expect(takeSignUpName()).toBe("Dana Example");
  });

  it("doesn't finish when Clerk still wants more", async () => {
    mockSignUp.update.mockResolvedValue({ error: null });
    const google = await start();
    expect(await google.acceptTerms()).toEqual({ error: { code: "sign_up_incomplete" } });
    expect(mockSignUp.finalize).not.toHaveBeenCalled();
  });
});
