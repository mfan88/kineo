import { describe, expect, it } from "vitest";
import { profileErrors } from "../profile/rules";
import type { InvoiceBillTo, Profile } from "../types/models";
import { sendProblems } from "./sendProblems";

// Made-up test data only.
const field = (value: string) => ({ value, showOnInvoice: true });
const complete: Profile = {
  ownerId: "user_test",
  fullName: field("Sam Example"),
  title: field("Physiotherapist"),
  clinicName: field("Example Physio"),
  address: field("1 Example Street, Vancouver"),
  phone: field("(000) 000-0000"),
  updatedAt: "2026-11-12T17:00:00.000Z",
};
const missingPhone: Profile = {
  ...complete,
  phone: { value: "", showOnInvoice: true },
  address: { value: " ", showOnInvoice: true },
};
const hiddenEmpty: Profile = { ...complete, phone: { value: "", showOnInvoice: false } };

const NOT_SYNCED_MESSAGE =
  "This invoice hasn't reached the server yet, so its number isn't final. Connect to the internet; you can send it once it's synced.";

describe("sendProblems", () => {
  it("has none for a draft with a line, a complete profile, already on the server", () => {
    expect(profileErrors(complete)).toEqual([]);
    expect(
      sendProblems({
        invoice: { status: "draft" },
        lineCount: 1,
        profile: complete,
        pending: false,
      }),
    ).toEqual([]);
  });

  it("asks for a line item when there are none", () => {
    expect(
      sendProblems({
        invoice: { status: "draft" },
        lineCount: 0,
        profile: complete,
        pending: false,
      }),
    ).toEqual([{ message: "Add at least one line item before sending.", inProfile: false }]);
  });

  it("names every profile field shown on invoices that's empty", () => {
    expect(
      sendProblems({
        invoice: { status: "draft" },
        lineCount: 2,
        profile: missingPhone,
        pending: false,
      }),
    ).toEqual([
      {
        message: "Add your address and phone before sending. They're shown on invoices.",
        inProfile: true,
      },
    ]);
  });

  it("names a single missing field on its own", () => {
    expect(
      sendProblems({
        invoice: { status: "draft" },
        lineCount: 1,
        profile: { ...complete, phone: { value: "", showOnInvoice: true } },
        pending: false,
      }),
    ).toEqual([
      { message: "Add your phone before sending. It's shown on invoices.", inProfile: true },
    ]);
  });

  it('joins three or more missing fields with commas and "and"', () => {
    const [problem] = sendProblems({
      invoice: { status: "draft" },
      lineCount: 1,
      profile: {
        ...missingPhone,
        clinicName: { value: "", showOnInvoice: true },
      },
      pending: false,
    });
    expect(problem?.message).toBe(
      "Add your clinic name, address and phone before sending. They're shown on invoices.",
    );
  });

  it("doesn't mind an empty field that isn't shown on invoices", () => {
    expect(
      sendProblems({
        invoice: { status: "draft" },
        lineCount: 1,
        profile: hiddenEmpty,
        pending: false,
      }),
    ).toEqual([]);
  });

  it("waits for an invoice that hasn't reached the server", () => {
    expect(
      sendProblems({
        invoice: { status: "draft" },
        lineCount: 1,
        profile: complete,
        pending: true,
      }),
    ).toEqual([{ message: NOT_SYNCED_MESSAGE, inProfile: false }]);
  });

  it("lists every reason at once, in a fixed order", () => {
    const problems = sendProblems({
      invoice: { status: "draft" },
      lineCount: 0,
      profile: missingPhone,
      pending: true,
    });
    expect(problems.length).toBe(3);
    expect(problems.map((problem) => problem.message)).toEqual([
      "Add at least one line item before sending.",
      "Add your address and phone before sending. They're shown on invoices.",
      NOT_SYNCED_MESSAGE,
    ]);
    expect(problems.map((problem) => problem.inProfile)).toEqual([false, true, false]);
  });

  it("has none once sent or paid, whatever else is true", () => {
    for (const status of ["sent", "paid"] as const) {
      expect(
        sendProblems({ invoice: { status }, lineCount: 0, profile: missingPhone, pending: true }),
      ).toEqual([]);
    }
  });

  describe("with Bill to", () => {
    const base = { invoice: { status: "draft" as const }, profile: complete, pending: false };
    const funded: InvoiceBillTo = {
      kind: "funding",
      patientFundingId: null,
      fundingName: "ICBC",
      name: "",
      address: "",
      details: [{ id: "d1", label: "Claim number", value: "" }],
    };

    it("is unchanged without billing", () => {
      expect(sendProblems({ ...base, lineCount: 0 })).toEqual([
        { message: "Add at least one line item before sending.", inProfile: false },
      ]);
    });

    it("has none for self-pay with a name", () => {
      expect(
        sendProblems({
          ...base,
          lineCount: 1,
          billing: {
            billTo: { kind: "patient", name: "Test Patient", address: "" },
            lines: [{ id: "l1", position: 0, serviceDate: null }],
            visitDates: [],
          },
        }),
      ).toEqual([]);
    });

    it("lists Bill to problems after the line item one and before the profile one, with targets", () => {
      const problems = sendProblems({
        ...base,
        profile: missingPhone,
        lineCount: 0,
        billing: {
          billTo: funded,
          lines: [{ id: "l1", position: 0, serviceDate: null }],
          visitDates: ["2026-11-04"],
        },
      });
      expect(problems.map((p) => p.message.slice(0, 22))).toEqual([
        "Add at least one line ",
        "ICBC has no recipient ",
        "Add the claim number b",
        "Pick a visit date for ",
        "Add your address and p",
      ]);
      expect(problems[1]?.target).toEqual({ kind: "recipient" });
      expect(problems[2]?.target).toEqual({ kind: "detail", detailId: "d1" });
      expect(problems[3]?.target).toEqual({ kind: "lineDate", lineId: "l1" });
      expect(problems[1]?.inProfile).toBe(false);
      expect(problems[4]?.target).toBeUndefined();
    });

    it("has none once sent", () => {
      expect(
        sendProblems({
          ...base,
          invoice: { status: "sent" },
          lineCount: 0,
          billing: { billTo: funded, lines: [], visitDates: [] },
        }),
      ).toEqual([]);
    });
  });
});
