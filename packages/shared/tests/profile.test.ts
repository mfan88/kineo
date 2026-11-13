import { describe, expect, it } from "vitest";
import {
  PROFILE_FIELD_KEYS,
  invoiceProfileLines,
  isProfileComplete,
  profileErrors,
  profileFieldHint,
  profileWithSignUpName,
  type ProfileFields,
} from "../src/index";

// Made-up test data only.
const field = (value: string, showOnInvoice: boolean) => ({ value, showOnInvoice });
const complete: ProfileFields = {
  fullName: field("Alex Example", true),
  title: field("Registered Physiotherapist", true),
  clinicName: field("Example Physio", true),
  address: field("123 Example St, Vancouver BC", true),
  phone: field("604-555-0100", true),
};
const allHiddenEmpty: ProfileFields = {
  fullName: field("", false),
  title: field("", false),
  clinicName: field("", false),
  address: field("", false),
  phone: field("", false),
};

describe("profileErrors", () => {
  it("has no errors when every shown field has a value", () => {
    expect(profileErrors(complete)).toEqual([]);
    expect(isProfileComplete(complete)).toBe(true);
  });

  it("allows hidden fields to be empty", () => {
    expect(profileErrors(allHiddenEmpty)).toEqual([]);
    expect(profileErrors({ ...complete, phone: field("", false) })).toEqual([]);
  });

  it("requires a shown field, with an inline message", () => {
    expect(profileErrors({ ...complete, phone: field("", true) })).toEqual([
      { field: "phone", message: 'Add your phone or turn off "Show on invoice".' },
    ]);
    expect(isProfileComplete({ ...complete, phone: field("", true) })).toBe(false);
  });

  it("treats only spaces as empty", () => {
    expect(profileErrors({ ...complete, clinicName: field("   ", true) })).toEqual([
      { field: "clinicName", message: 'Add your clinic name or turn off "Show on invoice".' },
    ]);
  });

  it("lists every missing field in screen order", () => {
    const allShownEmpty: ProfileFields = {
      fullName: field("", true),
      title: field("", true),
      clinicName: field("", true),
      address: field("", true),
      phone: field("", true),
    };
    expect(profileErrors(allShownEmpty).map((error) => error.field)).toEqual([
      ...PROFILE_FIELD_KEYS,
    ]);
    expect(profileErrors(allShownEmpty)[1]?.message).toBe(
      'Add your title or certification or turn off "Show on invoice".',
    );
  });
});

describe("invoiceProfileLines", () => {
  it("lists shown fields in order with trimmed values", () => {
    expect(invoiceProfileLines({ ...complete, fullName: field("  Alex Example ", true) })).toEqual([
      { field: "fullName", value: "Alex Example" },
      { field: "title", value: "Registered Physiotherapist" },
      { field: "clinicName", value: "Example Physio" },
      { field: "address", value: "123 Example St, Vancouver BC" },
      { field: "phone", value: "604-555-0100" },
    ]);
  });

  it("leaves out hidden fields, even with a value", () => {
    const lines = invoiceProfileLines({
      ...complete,
      phone: field("604-555-0100", false),
      title: field("", false),
    });
    expect(lines.map((line) => line.field)).toEqual(["fullName", "clinicName", "address"]);
  });

  it("is empty when nothing is shown", () => {
    expect(invoiceProfileLines(allHiddenEmpty)).toEqual([]);
  });
});

describe("profileFieldHint", () => {
  it("says the field is shown on invoices and what to add", () => {
    expect(profileFieldHint("phone")).toBe("Shown on invoices. Add a phone number.");
    expect(profileFieldHint("address")).toBe("Shown on invoices. Add an address.");
    expect(profileFieldHint("fullName")).toBe("Shown on invoices. Add a full name.");
    expect(profileFieldHint("title")).toBe("Shown on invoices. Add a title or certification.");
    expect(profileFieldHint("clinicName")).toBe("Shown on invoices. Add a clinic name.");
  });
});

describe("profileWithSignUpName", () => {
  it("fills an empty full name, shown on invoices, keeping the other fields", () => {
    const withPhone = { ...allHiddenEmpty, phone: field("604-555-0100", true) };
    expect(profileWithSignUpName(withPhone, "  Dana Example ")).toEqual({
      ...withPhone,
      fullName: field("Dana Example", true),
    });
  });

  it("never overwrites a full name, and adds nothing for an empty one", () => {
    expect(profileWithSignUpName(complete, "Dana Example")).toBeNull();
    expect(profileWithSignUpName(allHiddenEmpty, "   ")).toBeNull();
  });
});
