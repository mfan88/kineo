import { describe, expect, it } from "vitest";
import type { ProfileFields } from "../profile/rules";
import { invoiceStyleSummary, priceListSummary, profileProblem, profileSummary } from "./summaries";

const field = (value: string, showOnInvoice = true) => ({ value, showOnInvoice });

function profile(overrides: Partial<ProfileFields> = {}): ProfileFields {
  return {
    fullName: field("Dana Reid"),
    title: field("", false),
    clinicName: field("Harbour Physio"),
    address: field("1 Test St", false),
    phone: field("604-555-0100"),
    ...overrides,
  };
}

describe("profileSummary", () => {
  it("is just the name when nothing is missing", () => {
    expect(profileSummary(profile())).toEqual({ text: "Dana Reid", problem: false });
  });

  it("counts fields shown on invoices but empty", () => {
    expect(profileSummary(profile({ phone: field("  ") }))).toEqual({
      text: "Dana Reid · 1 field missing",
      problem: true,
    });
    expect(profileSummary(profile({ phone: field(""), clinicName: field("") })).text).toBe(
      "Dana Reid · 2 fields missing",
    );
  });

  it("ignores empty fields that are hidden", () => {
    expect(profileSummary(profile({ phone: field("", false) })).problem).toBe(false);
  });

  it("leaves the name out when it's empty and hidden", () => {
    expect(profileSummary(profile({ fullName: field("", false), phone: field("") }))).toEqual({
      text: "1 field missing",
      problem: true,
    });
  });

  it("says so when nothing is filled in", () => {
    const empty = profile({
      fullName: field("", false),
      clinicName: field("", false),
      phone: field("", false),
    });
    expect(profileSummary(empty)).toEqual({ text: "Not filled in yet", problem: false });
  });
});

describe("profileProblem", () => {
  it("is null when complete", () => {
    expect(profileProblem(profile())).toBeNull();
  });

  it("names one field", () => {
    expect(profileProblem(profile({ phone: field("") }))).toBe(
      "Phone is shown on invoices but empty",
    );
  });

  it("names two and three fields", () => {
    expect(profileProblem(profile({ clinicName: field(""), phone: field("") }))).toBe(
      "Clinic name and phone are shown on invoices but empty",
    );
    expect(
      profileProblem(profile({ fullName: field(""), clinicName: field(""), phone: field("") })),
    ).toBe("Full name, clinic name and phone are shown on invoices but empty");
  });
});

describe("priceListSummary", () => {
  it("counts items and shows the default tax", () => {
    expect(priceListSummary(3, 500)).toBe("3 items · Tax 5%");
    expect(priceListSummary(1, 1250)).toBe("1 item · Tax 12.5%");
  });

  it("copes with no items and no tax", () => {
    expect(priceListSummary(0, 0)).toBe("No items · Tax 0%");
  });
});

describe("invoiceStyleSummary", () => {
  it("reads accent, font and layout", () => {
    expect(
      invoiceStyleSummary({ accentColor: "sky", font: "clean", headerLayout: "logo-left" }),
    ).toBe("Sky accent · Clean font · logo left");
    expect(
      invoiceStyleSummary({ accentColor: "plum", font: "serif", headerLayout: "centred" }),
    ).toBe("Plum accent · Serif font · centred");
  });
});
