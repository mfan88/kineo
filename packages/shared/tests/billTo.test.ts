import { describe, expect, it } from "vitest";
import {
  billToFor,
  billToOptions,
  billToProblems,
  billToSummary,
  defaultBillTo,
  lineDateLabel,
  linesLosingDate,
  linesToAutoDate,
  refreshDraftBillTo,
  resolvedBillTo,
  serviceDatesForNewLine,
} from "../src/index";
import type { FundingType, InvoiceBillTo, PatientFunding } from "../src/index";

// Made-up test data only.
const now = "2026-11-11T09:30:00Z";
const today = "2026-11-13";
const d1 = "5e6f7a8b-9c0d-4e1f-8a3b-4c5d6e7f8091";
const d2 = "6f7a8b9c-0d1e-4f2a-9b4c-5d6e7f809102";
const d3 = "9c0d1e2f-3a4b-4c5d-8e7f-809102132435";

const patient = { id: "p1", fullName: "Maya Okafor", billingAddress: "2 Example Rd" };

const autism: FundingType = {
  id: "t1",
  ownerId: "o",
  name: "Autism Funding",
  recipientName: "Autism Funding Branch",
  recipientAddress: "PO Box 1",
  details: [
    { id: d1, label: "Billing number", kind: "text", showOnInvoice: true },
    { id: d2, label: "Internal note", kind: "text", showOnInvoice: false },
  ],
  createdAt: now,
  updatedAt: now,
};
const icbc: FundingType = {
  ...autism,
  id: "t2",
  name: "ICBC",
  recipientName: "ICBC",
  recipientAddress: "PO Box 2",
  details: [{ id: d3, label: "Claim number", kind: "text", showOnInvoice: true }],
};

const funding = (over: Partial<PatientFunding> = {}): PatientFunding => ({
  id: "f1",
  ownerId: "o",
  patientId: "p1",
  fundingTypeId: "t1",
  detailValues: { [d1]: "4821", [d2]: "secret" },
  periodStart: null,
  periodEnd: "2027-03-31",
  endedOn: null,
  createdAt: "2026-06-01T00:00:00Z",
  updatedAt: now,
  ...over,
});

const funded = (
  over: Partial<Extract<InvoiceBillTo, { kind: "funding" }>> = {},
): InvoiceBillTo => ({
  kind: "funding",
  patientFundingId: "f1",
  fundingName: "ICBC",
  name: "ICBC",
  address: "PO Box 2",
  details: [],
  ...over,
});

const line = (id: string, positionOrDate: number | string | null, serviceDate?: string | null) =>
  typeof positionOrDate === "number"
    ? { id, position: positionOrDate, serviceDate: serviceDate ?? null }
    : { id, position: 0, serviceDate: positionOrDate };

describe("billToFor", () => {
  it("is self-pay without a funding or type, using the billing address", () => {
    const self = { kind: "patient", name: "Maya Okafor", address: "2 Example Rd" };
    expect(billToFor({ patient, funding: null, type: autism })).toEqual(self);
    expect(billToFor({ patient, funding: funding(), type: null })).toEqual(self);
    expect(billToFor({ patient: { fullName: "A" }, funding: null, type: null })).toEqual({
      kind: "patient",
      name: "A",
      address: "",
    });
  });

  it("copies the recipient and only the shown details", () => {
    expect(billToFor({ patient, funding: funding(), type: autism })).toEqual({
      kind: "funding",
      patientFundingId: "f1",
      fundingName: "Autism Funding",
      name: "Autism Funding Branch",
      address: "PO Box 1",
      details: [{ id: d1, label: "Billing number", value: "4821" }],
    });
  });

  it("uses an empty value for a detail the funding doesn't have", () => {
    const result = billToFor({ patient, funding: funding({ detailValues: {} }), type: autism });
    expect(result).toMatchObject({ details: [{ id: d1, value: "" }] });
  });
});

describe("defaultBillTo", () => {
  const types = [autism, icbc];

  it("bills the newest active funding", () => {
    const older = funding();
    const newer = funding({
      id: "f2",
      fundingTypeId: "t2",
      detailValues: { [d3]: "K1" },
      createdAt: "2026-09-01T00:00:00Z",
    });
    expect(defaultBillTo({ patient, fundings: [older, newer], types, today })).toMatchObject({
      kind: "funding",
      patientFundingId: "f2",
    });
  });

  it("is self-pay when nothing is active, or the type is missing", () => {
    expect(defaultBillTo({ patient, fundings: [], types, today }).kind).toBe("patient");
    expect(
      defaultBillTo({ patient, fundings: [funding({ endedOn: "2026-10-01" })], types, today }).kind,
    ).toBe("patient");
    expect(defaultBillTo({ patient, fundings: [funding()], types: [], today }).kind).toBe(
      "patient",
    );
  });
});

describe("resolvedBillTo", () => {
  it("returns the invoice's own Bill to", () => {
    const billTo = funded();
    expect(resolvedBillTo({ billTo }, patient)).toBe(billTo);
    const self: InvoiceBillTo = { kind: "patient", name: "Kept Name", address: "" };
    expect(resolvedBillTo({ billTo: self }, patient)).toBe(self);
  });

  it("falls back to the patient when there is none or the name is blank", () => {
    const expected = { kind: "patient", name: "Maya Okafor", address: "2 Example Rd" };
    expect(resolvedBillTo({}, patient)).toEqual(expected);
    expect(
      resolvedBillTo({ billTo: { kind: "patient", name: " ", address: "" } }, patient),
    ).toEqual(expected);
  });

  it("says Unknown patient when the patient is gone", () => {
    expect(resolvedBillTo({}, null)).toEqual({
      kind: "patient",
      name: "Unknown patient",
      address: "",
    });
  });
});

describe("refreshDraftBillTo", () => {
  const current = funded({
    fundingName: "Old name",
    details: [{ id: d1, label: "Billing number", value: "typed on invoice" }],
  });

  it("takes the type's recipient and name", () => {
    expect(refreshDraftBillTo(current, autism, funding())).toMatchObject({
      fundingName: "Autism Funding",
      name: "Autism Funding Branch",
      address: "PO Box 1",
    });
  });

  it("takes the funding's value when filled, and keeps the invoice's when blank", () => {
    expect(refreshDraftBillTo(current, autism, funding())).toMatchObject({
      details: [{ id: d1, value: "4821" }],
    });
    expect(
      refreshDraftBillTo(current, autism, funding({ detailValues: { [d1]: "  " } })),
    ).toMatchObject({ details: [{ id: d1, value: "typed on invoice" }] });
  });

  it("starts from empty when the invoice was self-pay or the detail is new", () => {
    const self: InvoiceBillTo = { kind: "patient", name: "x", address: "" };
    expect(refreshDraftBillTo(self, autism, funding({ detailValues: {} }))).toMatchObject({
      details: [{ id: d1, value: "" }],
    });
  });
});

describe("billToOptions", () => {
  const fundings = [
    funding(),
    funding({
      id: "f2",
      fundingTypeId: "t2",
      detailValues: { [d3]: "K1234567" },
      periodEnd: null,
      createdAt: "2026-09-01T00:00:00Z",
    }),
    funding({ id: "f3", endedOn: "2026-01-01" }),
  ];
  const input = { patient, fundings, types: [autism, icbc], today };

  it("lists active fundings newest first, then self-pay", () => {
    const options = billToOptions({ ...input, current: funded({ patientFundingId: "f2" }) });
    expect(options).toEqual([
      { key: "f2", title: "ICBC", detail: "Claim number K1234567", selected: true },
      {
        key: "f1",
        title: "Autism Funding",
        detail: "Billing number 4821 · to 31 Mar 2027",
        selected: false,
      },
      { key: "patient", title: "Self-pay", detail: "Maya Okafor", selected: false },
    ]);
  });

  it("selects self-pay for a patient Bill to", () => {
    const options = billToOptions({
      ...input,
      current: { kind: "patient", name: "Maya Okafor", address: "" },
    });
    expect(options.map((o) => o.selected)).toEqual([false, false, true]);
  });

  it("has an empty detail with no value and no period", () => {
    const options = billToOptions({
      ...input,
      fundings: [funding({ detailValues: {}, periodEnd: null })],
      current: funded(),
    });
    expect(options[0]?.detail).toBe("");
  });
});

describe("billToSummary", () => {
  it("lists the client and each detail with a value", () => {
    expect(
      billToSummary(
        funded({
          details: [
            { id: d1, label: "Billing number", value: "4821" },
            { id: d2, label: "Other", value: " " },
            { id: d3, label: "Claim", value: "K1" },
          ],
        }),
        "Maya Okafor",
      ),
    ).toBe("Bill for Maya Okafor · Billing number 4821 · Claim K1");
    expect(billToSummary(funded(), "Maya Okafor")).toBe("Bill for Maya Okafor");
  });

  it("is empty for self-pay", () => {
    expect(billToSummary({ kind: "patient", name: "x", address: "" }, "x")).toBe("");
  });
});

describe("billToProblems", () => {
  const visitDates = ["2026-11-04", "2026-11-06"];
  const dated = [line("l1", 0, "2026-11-04")];
  const problems = (billTo: InvoiceBillTo, lines = dated) =>
    billToProblems({ billTo, lines, visitDates });

  it("has none for a complete funded invoice", () => {
    expect(
      problems(funded({ details: [{ id: d1, label: "Billing number", value: "4821" }] })),
    ).toEqual([]);
  });

  it("names a missing recipient name and address", () => {
    expect(problems(funded({ name: " ", address: "" }))).toEqual([
      {
        message: "ICBC has no recipient name or address. Add them in Settings, then send.",
        target: { kind: "recipient" },
      },
    ]);
  });

  it("names a missing recipient name", () => {
    expect(problems(funded({ name: "" }))[0]?.message).toBe(
      "ICBC has no recipient name. Add it in Settings, then send.",
    );
  });

  it("names a missing recipient address", () => {
    expect(problems(funded({ address: "" }))[0]?.message).toBe(
      "ICBC has no recipient address. Add it in Settings, then send.",
    );
  });

  it("asks for each blank detail in order, in sentence case", () => {
    expect(
      problems(
        funded({
          details: [
            { id: d1, label: "Billing number", value: "" },
            { id: d3, label: "ICBC claim number", value: " " },
          ],
        }),
      ),
    ).toEqual([
      {
        message: "Add the billing number before sending.",
        target: { kind: "detail", detailId: d1 },
      },
      {
        message: "Add the ICBC claim number before sending.",
        target: { kind: "detail", detailId: d3 },
      },
    ]);
  });

  it("flags one line date problem, on the first bad line by position", () => {
    const lines = [
      line("late", 2, null),
      line("elsewhere", 1, "2026-12-25"),
      line("ok", 0, "2026-11-06"),
    ];
    expect(problems(funded(), lines)).toEqual([
      {
        message: "Pick a visit date for each line item before sending.",
        target: { kind: "lineDate", lineId: "elsewhere" },
      },
    ]);
  });

  it("lists recipient, details and line dates in that order", () => {
    const result = problems(
      funded({ name: "", details: [{ id: d1, label: "Billing number", value: "" }] }),
      [line("l1", 0, null)],
    );
    expect(result.map((p) => p.target.kind)).toEqual(["recipient", "detail", "lineDate"]);
  });

  it("only asks self-pay for the patient's name", () => {
    expect(problems({ kind: "patient", name: " ", address: "" }, [line("l1", 0, null)])).toEqual([
      { message: "Add the patient's name before sending.", target: { kind: "patientName" } },
    ]);
    expect(problems({ kind: "patient", name: "A", address: "" }, [line("l1", 0, null)])).toEqual(
      [],
    );
  });
});

describe("line dates", () => {
  const self: InvoiceBillTo = { kind: "patient", name: "A", address: "" };

  it("gives a new line one date per visit on a funded invoice", () => {
    expect(serviceDatesForNewLine(self, ["2026-11-04"])).toEqual([null]);
    expect(serviceDatesForNewLine(funded(), [])).toEqual([null]);
    expect(serviceDatesForNewLine(funded(), ["2026-11-06", "2026-11-04", "2026-11-06"])).toEqual([
      "2026-11-04",
      "2026-11-06",
    ]);
  });

  it("dates undated lines only when there is exactly one visit date", () => {
    const lines = [line("a", null), line("b", "2026-11-04")];
    expect(linesToAutoDate(lines, ["2026-11-04", "2026-11-04"])).toEqual(["a"]);
    expect(linesToAutoDate(lines, [])).toEqual([]);
    expect(linesToAutoDate(lines, ["2026-11-04", "2026-11-06"])).toEqual([]);
  });

  it("clears the date on lines that used a removed visit's date", () => {
    const lines = [line("a", "2026-11-04"), line("b", "2026-11-06"), line("c", null)];
    expect(linesLosingDate(lines, "2026-11-04", ["2026-11-06"])).toEqual(["a"]);
    expect(linesLosingDate(lines, "2026-11-04", ["2026-11-04"])).toEqual([]);
  });

  it("labels a line's date", () => {
    expect(lineDateLabel("2026-11-04")).toBe("4 Nov");
    expect(lineDateLabel(null)).toBe("Pick a date");
    expect(lineDateLabel(undefined)).toBe("Pick a date");
  });
});
