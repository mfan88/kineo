import { describe, expect, it } from "vitest";
import {
  FUNDING_PRESETS,
  activeFundingsFor,
  dayInputValue,
  endedFundingsFor,
  formatFundingPeriod,
  fundingEndedOn,
  fundingNotice,
  fundingTypeErrors,
  fundingTypeProblem,
  fundingTypeRow,
  fundingTypeUsage,
  fundingTypesSummary,
  isFundingActive,
  parseDayInput,
  patientFundingErrors,
  presetDraft,
  sentenceLabel,
} from "../src/index";
import type { FundingDetail, FundingType, PatientFunding } from "../src/index";

// Made-up test data only.
const now = "2026-11-11T09:30:00Z";
const detail = (id: string, label: string, over: Partial<FundingDetail> = {}): FundingDetail => ({
  id,
  label,
  kind: "text",
  showOnInvoice: true,
  ...over,
});
const d1 = "5e6f7a8b-9c0d-4e1f-8a3b-4c5d6e7f8091";
const d2 = "6f7a8b9c-0d1e-4f2a-9b4c-5d6e7f809102";

const type = (over: Partial<FundingType> = {}): FundingType => ({
  id: "7a8b9c0d-1e2f-4a3b-8c5d-6e7f80910213",
  ownerId: "user_test_owner",
  name: "Example funder",
  recipientName: "Example Ministry",
  recipientAddress: "1 Example Way",
  details: [detail(d1, "Billing number")],
  createdAt: now,
  updatedAt: now,
  ...over,
});

const funding = (over: Partial<PatientFunding> = {}): PatientFunding => ({
  id: "8b9c0d1e-2f3a-4b4c-9d6e-7f8091021324",
  ownerId: "user_test_owner",
  patientId: "p1",
  fundingTypeId: "t1",
  detailValues: {},
  periodStart: null,
  periodEnd: null,
  endedOn: null,
  createdAt: now,
  updatedAt: now,
  ...over,
});

describe("parseDayInput", () => {
  it("reads day, month name and year, and ISO dates", () => {
    expect(parseDayInput("1 Apr 2026")).toEqual({ ok: true, value: "2026-04-01" });
    expect(parseDayInput("01 april 2026")).toEqual({ ok: true, value: "2026-04-01" });
    expect(parseDayInput("  31 DECEMBER 2026 ")).toEqual({ ok: true, value: "2026-12-31" });
    expect(parseDayInput("2026-04-01")).toEqual({ ok: true, value: "2026-04-01" });
  });

  it("treats empty text as no date", () => {
    expect(parseDayInput("")).toEqual({ ok: true, value: null });
    expect(parseDayInput("   ")).toEqual({ ok: true, value: null });
  });

  it("refuses anything else, including impossible dates", () => {
    const refused = { ok: false, message: "Enter a date like 1 Apr 2026." };
    expect(parseDayInput("31 Feb 2026")).toEqual(refused);
    expect(parseDayInput("April 1")).toEqual(refused);
    expect(parseDayInput("1/4/2026")).toEqual(refused);
    expect(parseDayInput("1 Foo 2026")).toEqual(refused);
    expect(parseDayInput("2026-02-30")).toEqual(refused);
  });

  it("accepts 29 Feb only in a leap year", () => {
    expect(parseDayInput("29 Feb 2028").ok).toBe(true);
    expect(parseDayInput("29 Feb 2027").ok).toBe(false);
  });
});

describe("dayInputValue", () => {
  it("shows nothing or the typed form", () => {
    expect(dayInputValue(null)).toBe("");
    expect(dayInputValue("2026-04-01")).toBe("1 Apr 2026");
  });
});

describe("presets", () => {
  it("lists the four starting points in order", () => {
    expect(FUNDING_PRESETS.map((p) => p.key)).toEqual(["autism-funding", "cydb", "icbc", "blank"]);
    expect(FUNDING_PRESETS.map((p) => p.chipLabel)).toEqual([
      "Autism Funding",
      "Children and Youth Disability Benefit",
      "ICBC",
      "Blank type",
    ]);
  });

  it("gives each copied detail a fresh id", () => {
    let n = 0;
    const first = presetDraft("icbc", () => `id-${++n}`);
    const second = presetDraft("icbc", () => `id-${++n}`);
    expect(first.name).toBe("ICBC");
    expect(first.details).toEqual([
      { id: "id-1", label: "Claim number", kind: "text", showOnInvoice: true },
    ]);
    expect(second.details[0]?.id).toBe("id-2");
    expect(presetDraft("blank", () => "x").details).toEqual([]);
  });

  it("leaves the unverified recipient empty", () => {
    expect(presetDraft("cydb", () => "x").recipientName).toBe("");
    expect(presetDraft("autism-funding", () => "x").recipientAddress).toBe(
      "PO Box 9776 STN PROV GOVT\nVictoria BC V8W 9S5",
    );
  });
});

const draft = (name: string, details: FundingDetail[]) => ({
  name,
  recipientName: "",
  recipientAddress: "",
  details,
});

const makeDetails = (count: number) =>
  Array.from({ length: count }, (_, i) => detail(`id-${i}`, `Detail ${i}`));

describe("fundingTypeErrors", () => {
  it("accepts a type without a recipient", () => {
    expect(fundingTypeErrors(draft("ICBC", [detail(d1, "Claim number")]))).toEqual([]);
  });

  it("asks for a name, and for blank or repeated detail labels, in order", () => {
    expect(
      fundingTypeErrors(
        draft(" ", [detail(d1, "Claim"), detail(d2, "  "), detail("d3", " claim ")]),
      ),
    ).toEqual([
      { field: "name", message: "Add a name for this funding type." },
      { field: "detail", detailId: d2, message: "Name this detail, or remove it." },
      { field: "detail", detailId: "d3", message: "Two details can't have the same name." },
    ]);
  });

  it("allows 20 details and flags the 21st and later", () => {
    expect(fundingTypeErrors(draft("A", makeDetails(20)))).toEqual([]);
    expect(fundingTypeErrors(draft("A", makeDetails(22)))).toEqual([
      { field: "detail", detailId: "id-20", message: "A funding type can have up to 20 details." },
      { field: "detail", detailId: "id-21", message: "A funding type can have up to 20 details." },
    ]);
  });
});

describe("fundingTypeProblem and fundingTypeRow", () => {
  it("names what's missing", () => {
    expect(fundingTypeProblem({ recipientName: " ", recipientAddress: "" })).toBe(
      "Recipient name and address are empty",
    );
    expect(fundingTypeProblem({ recipientName: "", recipientAddress: "x" })).toBe(
      "Recipient name is empty",
    );
    expect(fundingTypeProblem({ recipientName: "x", recipientAddress: " " })).toBe(
      "Recipient address is empty",
    );
    expect(fundingTypeProblem({ recipientName: "x", recipientAddress: "y" })).toBeNull();
  });

  it("builds a row with plurals", () => {
    expect(fundingTypeRow(type(), 0)).toEqual({
      billTo: "Bill to Example Ministry",
      problem: null,
      counts: "1 detail on invoices · no patients",
    });
    expect(
      fundingTypeRow(
        type({
          recipientName: "",
          details: [detail(d1, "A"), detail(d2, "B"), detail("d3", "C", { showOnInvoice: false })],
        }),
        1,
      ),
    ).toEqual({
      billTo: null,
      problem: "Recipient name is empty",
      counts: "2 details on invoices · 1 patient",
    });
    expect(fundingTypeRow(type({ details: [] }), 3).counts).toBe(
      "No details on invoices · 3 patients",
    );
  });
});

describe("fundingTypesSummary", () => {
  it("counts types and those missing a recipient", () => {
    const bad = type({ recipientName: "" });
    expect(fundingTypesSummary([])).toBe("No funding types");
    expect(fundingTypesSummary([type()])).toBe("1 type");
    expect(fundingTypesSummary([type(), type()])).toBe("2 types");
    expect(fundingTypesSummary([type(), bad])).toBe("2 types · 1 is missing a recipient");
    expect(fundingTypesSummary([bad, bad, type()])).toBe("3 types · 2 are missing a recipient");
  });
});

describe("sentenceLabel", () => {
  it("lower-cases the first letter unless the second is upper case", () => {
    expect(sentenceLabel("Billing number")).toBe("billing number");
    expect(sentenceLabel("ICBC claim number")).toBe("ICBC claim number");
    expect(sentenceLabel("A")).toBe("A");
    expect(sentenceLabel("")).toBe("");
  });
});

describe("active and ended fundings", () => {
  const today = "2026-11-13";

  it("counts the last day of the period as active", () => {
    expect(isFundingActive(funding({ periodEnd: today }), today)).toBe(true);
    expect(isFundingActive(funding({ periodEnd: "2026-11-12" }), today)).toBe(false);
    expect(isFundingActive(funding(), today)).toBe(true);
  });

  it("is not active once ended or when its type is gone", () => {
    expect(isFundingActive(funding({ endedOn: "2026-11-01" }), today)).toBe(false);
    expect(isFundingActive(funding({ fundingTypeId: null }), today)).toBe(false);
  });

  it("says when a funding stopped", () => {
    expect(fundingEndedOn(funding({ endedOn: "2026-11-01", periodEnd: "2026-12-31" }), today)).toBe(
      "2026-11-01",
    );
    expect(fundingEndedOn(funding({ periodEnd: "2026-10-31" }), today)).toBe("2026-10-31");
    expect(fundingEndedOn(funding({ periodEnd: today }), today)).toBeNull();
    expect(fundingEndedOn(funding(), today)).toBeNull();
  });

  it("lists a patient's active and ended fundings, newest first, hiding deleted types", () => {
    const old = funding({ id: "a", createdAt: "2026-01-01T00:00:00Z" });
    const recent = funding({ id: "b", createdAt: "2026-06-01T00:00:00Z" });
    const ended = funding({ id: "c", endedOn: "2026-10-01" });
    const lapsed = funding({ id: "d", periodEnd: "2026-01-31", createdAt: "2026-02-01T00:00:00Z" });
    const hidden = funding({ id: "e", fundingTypeId: null, endedOn: "2026-10-01" });
    const other = funding({ id: "f", patientId: "p2" });
    const all = [old, recent, ended, lapsed, hidden, other];
    expect(activeFundingsFor("p1", all, today).map((f) => f.id)).toEqual(["b", "a"]);
    expect(endedFundingsFor("p1", all, today).map((f) => f.id)).toEqual(["c", "d"]);
  });

  it("counts distinct patients with an active funding of a type", () => {
    const all = [
      funding({ id: "a" }),
      funding({ id: "b" }),
      funding({ id: "c", patientId: "p2" }),
      funding({ id: "d", patientId: "p3", endedOn: "2026-01-01" }),
      funding({ id: "e", patientId: "p4", fundingTypeId: "t2" }),
    ];
    expect(fundingTypeUsage("t1", all, today)).toBe(2);
    expect(fundingTypeUsage("none", all, today)).toBe(0);
  });
});

describe("formatFundingPeriod", () => {
  it("covers both, start only, end only and neither", () => {
    expect(formatFundingPeriod("2026-04-01", "2027-03-31")).toBe("1 Apr 2026 – 31 Mar 2027");
    expect(formatFundingPeriod("2026-04-01", null)).toBe("From 1 Apr 2026");
    expect(formatFundingPeriod(null, "2027-03-31")).toBe("To 31 Mar 2027");
    expect(formatFundingPeriod(null, null)).toBeNull();
  });
});

describe("patientFundingErrors", () => {
  const withDate = type({
    details: [
      detail(d1, "Billing number"),
      detail(d2, "Start date", { kind: "date", showOnInvoice: false }),
    ],
  });
  const check = (over: Partial<Parameters<typeof patientFundingErrors>[0]> = {}) =>
    patientFundingErrors({
      type: withDate,
      detailValues: { [d1]: "B-1" },
      periodStart: "",
      periodEnd: "",
      ...over,
    });

  it("accepts complete values, with or without a period", () => {
    expect(check()).toEqual([]);
    expect(check({ periodStart: "1 Apr 2026", periodEnd: "31 Mar 2027" })).toEqual([]);
  });

  it("asks for each shown detail that is blank", () => {
    expect(check({ detailValues: { [d1]: "  " } })).toEqual([
      { field: d1, message: "Add the billing number." },
    ]);
  });

  it("checks date details even when hidden, but allows them to be empty", () => {
    expect(check({ detailValues: { [d1]: "B-1", [d2]: "soon" } })).toEqual([
      { field: d2, message: "Enter a date like 1 Apr 2026." },
    ]);
    expect(check({ detailValues: { [d1]: "B-1", [d2]: "1 Apr 2026" } })).toEqual([]);
  });

  it("checks the period dates and their order", () => {
    expect(check({ periodStart: "April", periodEnd: "nope" })).toEqual([
      { field: "periodStart", message: "Enter a date like 1 Apr 2026." },
      { field: "periodEnd", message: "Enter a date like 1 Apr 2026." },
    ]);
    expect(check({ periodStart: "2 Apr 2026", periodEnd: "1 Apr 2026" })).toEqual([
      { field: "periodEnd", message: "The period can't end before it starts." },
    ]);
    expect(check({ periodStart: "1 Apr 2026", periodEnd: "1 Apr 2026" })).toEqual([]);
  });
});

describe("fundingNotice", () => {
  const autism = type({ name: " autism funding " });

  it("shows the Autism Funding notice until 31 March 2027", () => {
    expect(fundingNotice([autism], "2026-11-13")).toMatch(/^Autism Funding ends on 31 March 2027/);
    expect(fundingNotice([autism], "2027-03-31")).not.toBeNull();
    expect(fundingNotice([autism], "2027-04-01")).toBeNull();
  });

  it("shows nothing without that type", () => {
    expect(fundingNotice([], "2026-11-13")).toBeNull();
    expect(fundingNotice([type({ name: "ICBC" })], "2026-11-13")).toBeNull();
  });
});
