import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { waitFor } from "@testing-library/react-native";
import { renderScreen, TEST_NOW, TEST_OWNER } from "@/test/render-screen";
import { rememberSignUpName, takeSignUpName } from "./sign-up-name";
import { SignUpProfileName } from "./sign-up-profile-name";

jest.mock("expo-router", () => ({ router: {}, useIsFocused: () => true }));

const OWN = "eeeeeeee-0000-4000-8000-000000000001";

function profileRow(fullName: string) {
  return {
    id: OWN,
    owner_id: TEST_OWNER,
    full_name: fullName,
    full_name_on_invoice: fullName === "" ? 0 : 1,
    title: "",
    title_on_invoice: 0,
    clinic_name: "",
    clinic_name_on_invoice: 0,
    address: "",
    address_on_invoice: 0,
    phone: "604-555-0100",
    phone_on_invoice: 1,
    updated_at: TEST_NOW,
  };
}

/** What a profile write reads first: the row with this practitioner's fixed ID. */
function lookup(sql: string): unknown {
  return sql.includes("FROM profiles") ? { id: OWN } : null;
}

beforeEach(() => {
  takeSignUpName();
});

describe("SignUpProfileName", () => {
  it("puts the name from sign-up into an empty profile, shown on invoices", async () => {
    rememberSignUpName(" Dana Example ");
    const { writes } = await renderScreen(
      <SignUpProfileName />,
      { profiles: [profileRow("")] },
      lookup,
    );
    await waitFor(() => expect(writes.length).toBe(1));
    expect(writes[0]?.sql).toMatch(/^UPDATE profiles SET /);
    expect(writes[0]?.parameters.slice(0, 2)).toEqual(["Dana Example", 1]);
    // The phone, kept as it was.
    expect(writes[0]?.parameters).toContain("604-555-0100");
    expect(takeSignUpName()).toBeNull();
  });

  it("never overwrites a name already in the profile", async () => {
    rememberSignUpName("Dana Example");
    const { writes } = await renderScreen(
      <SignUpProfileName />,
      { profiles: [profileRow("Alex Example")] },
      lookup,
    );
    await Promise.resolve();
    expect(writes).toEqual([]);
  });

  it("does nothing without a sign-up on this phone", async () => {
    const { writes } = await renderScreen(
      <SignUpProfileName />,
      { profiles: [profileRow("")] },
      lookup,
    );
    await Promise.resolve();
    expect(writes).toEqual([]);
  });
});
