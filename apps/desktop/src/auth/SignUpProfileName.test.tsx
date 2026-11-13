import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DemoPracticeStore } from "../data/demoPracticeStore";
import { PracticeStoreProvider } from "../data/PracticeStoreProvider";
import { createDemoState, DemoStore } from "../data/store";
import { rememberSignUpName, takeSignUpName } from "./signUpName";
import { SignUpProfileName } from "./SignUpProfileName";

/** A made-up practice whose profile has no full name yet, as a new account's hasn't. */
function newPractice() {
  const state = createDemoState();
  const empty = { value: "", showOnInvoice: false };
  return new DemoStore({
    ...state,
    profile: { ...state.profile, fullName: empty, title: empty, clinicName: empty },
  });
}

function renderWith(demo: DemoStore) {
  render(
    <PracticeStoreProvider store={new DemoPracticeStore(demo)}>
      <SignUpProfileName />
    </PracticeStoreProvider>,
  );
}

afterEach(() => {
  takeSignUpName();
});

describe("SignUpProfileName", () => {
  it("puts the name from sign-up into an empty profile, shown on invoices, once", async () => {
    const demo = newPractice();
    rememberSignUpName("  Dana Example ");
    renderWith(demo);
    await vi.waitFor(() =>
      expect(demo.getState().profile.fullName).toEqual({
        value: "Dana Example",
        showOnInvoice: true,
      }),
    );
    expect(takeSignUpName()).toBeNull();
  });

  it("never overwrites a name already in the profile", async () => {
    const demo = new DemoStore(createDemoState());
    const before = demo.getState().profile.fullName;
    rememberSignUpName("Dana Example");
    renderWith(demo);
    await Promise.resolve();
    expect(demo.getState().profile.fullName).toEqual(before);
  });

  it("does nothing without a sign-up on this computer", async () => {
    const demo = newPractice();
    renderWith(demo);
    await Promise.resolve();
    expect(demo.getState().profile.fullName.value).toBe("");
  });
});
