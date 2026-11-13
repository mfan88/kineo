import { describe, expect, it } from "vitest";
import {
  initialInvoiceGroup,
  invoiceDetailLine,
  invoiceGroupPill,
  invoiceGroups,
  invoiceTaxLabel,
  invoiceVisitDates,
  parseInvoiceGroup,
} from "./detail";

// Made-up test data only.
const invoice = (
  id: string,
  number: number,
  status: "draft" | "sent" | "paid" | "cancelled",
  createdAt = "2026-11-01T18:00:00Z",
) => ({ id, number, status, createdAt });

/** Noon on that day in this machine's time zone, as an ISO instant. */
const localNoon = (year: number, month: number, day: number) =>
  new Date(year, month - 1, day, 12).toISOString();

const TODAY = "2026-11-12";

describe("invoiceGroups", () => {
  it("gives all four groups, empty, with no invoices", () => {
    expect(invoiceGroups([])).toEqual([
      { key: "notSent", label: "Not sent yet", invoices: [] },
      { key: "waiting", label: "Waiting on payment", invoices: [] },
      { key: "paid", label: "Paid", invoices: [] },
      { key: "cancelled", label: "Cancelled", invoices: [] },
    ]);
  });

  it("puts drafts, sent and paid invoices in their groups, newest first", () => {
    const invoices = [
      invoice("a", 1, "paid", "2026-10-01T18:00:00Z"),
      invoice("b", 2, "sent", "2026-10-20T18:00:00Z"),
      invoice("c", 3, "draft", "2026-11-10T18:00:00Z"),
      invoice("d", 4, "sent", "2026-11-02T18:00:00Z"),
      invoice("e", 5, "paid", "2026-10-15T18:00:00Z"),
    ];
    const groups = invoiceGroups(invoices);
    expect(groups.map((group) => group.invoices.map((one) => one.id))).toEqual([
      ["c"],
      ["d", "b"],
      ["e", "a"],
      [],
    ]);
    expect(invoices.map((one) => one.id)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("orders invoices made at the same moment by number, highest first", () => {
    const groups = invoiceGroups([invoice("a", 7, "sent"), invoice("b", 9, "sent")]);
    expect(groups[1]?.invoices.map((one) => one.id)).toEqual(["b", "a"]);
  });

  it("compares creation times as instants across UTC offsets", () => {
    const groups = invoiceGroups([
      invoice("early", 1, "draft", "2026-11-10T10:00:00-08:00"),
      invoice("late", 2, "draft", "2026-11-10T19:00:00Z"),
    ]);
    // 10:00 at -08:00 is 18:00 UTC, before 19:00 UTC.
    expect(groups[0]?.invoices.map((one) => one.id)).toEqual(["late", "early"]);
  });
});

describe("initialInvoiceGroup", () => {
  it("opens on the group asked for, even when it's empty", () => {
    expect(initialInvoiceGroup(invoiceGroups([invoice("a", 1, "draft")]), "waiting")).toBe(
      "waiting",
    );
  });

  it("otherwise opens on the first group with invoices", () => {
    expect(initialInvoiceGroup(invoiceGroups([invoice("a", 1, "paid")]))).toBe("paid");
    expect(
      initialInvoiceGroup(invoiceGroups([invoice("a", 1, "paid"), invoice("b", 2, "sent")])),
    ).toBe("waiting");
  });

  it("opens on Not sent yet when there are no invoices", () => {
    expect(initialInvoiceGroup(invoiceGroups([]))).toBe("notSent");
  });
});

describe("parseInvoiceGroup", () => {
  it("accepts the four group keys only", () => {
    expect(parseInvoiceGroup("waiting")).toBe("waiting");
    expect(parseInvoiceGroup("paid")).toBe("paid");
    expect(parseInvoiceGroup("cancelled")).toBe("cancelled");
    expect(parseInvoiceGroup("sent")).toBeUndefined();
    expect(parseInvoiceGroup(undefined)).toBeUndefined();
    expect(parseInvoiceGroup(["waiting"])).toBeUndefined();
  });
});

describe("invoiceGroupPill", () => {
  it("names the group shortly with its count, and in full for screen readers", () => {
    const [notSent, waiting, paid] = invoiceGroups([
      invoice("a", 1, "sent"),
      invoice("b", 2, "sent"),
      invoice("c", 3, "paid"),
    ]);
    expect(notSent && invoiceGroupPill(notSent)).toEqual({
      text: "Not sent yet · 0",
      accessibilityLabel: "Not sent yet, 0 invoices",
    });
    expect(waiting && invoiceGroupPill(waiting)).toEqual({
      text: "Waiting · 2",
      accessibilityLabel: "Waiting on payment, 2 invoices",
    });
    expect(paid && invoiceGroupPill(paid)).toEqual({
      text: "Paid · 1",
      accessibilityLabel: "Paid, 1 invoice",
    });
  });
});

describe("the Cancelled group", () => {
  it("holds cancelled invoices, newest first, and has its own pill", () => {
    const groups = invoiceGroups([
      invoice("a", 1, "cancelled", "2026-10-01T18:00:00Z"),
      invoice("b", 2, "sent"),
      invoice("c", 3, "cancelled", "2026-11-03T18:00:00Z"),
    ]);
    const cancelled = groups.find((group) => group.key === "cancelled");
    expect(cancelled?.invoices.map((i) => i.id)).toEqual(["c", "a"]);
    expect(groups.find((group) => group.key === "waiting")?.invoices.map((i) => i.id)).toEqual([
      "b",
    ]);
    expect(cancelled && invoiceGroupPill(cancelled)).toEqual({
      text: "Cancelled · 2",
      accessibilityLabel: "Cancelled, 2 invoices",
    });
  });
});

describe("invoiceDetailLine", () => {
  it("gives the number, patient and the day it was sent", () => {
    expect(
      invoiceDetailLine(
        "INV-0012",
        "Riley Example",
        { status: "sent", sentAt: localNoon(2026, 11, 12), paidAt: null, cancelledAt: null },
        TODAY,
      ),
    ).toBe("INV-0012 · Riley Example · sent 12 Nov");
  });

  it("gives the day it was paid once paid", () => {
    expect(
      invoiceDetailLine(
        "INV-0012",
        "Riley Example",
        {
          status: "paid",
          sentAt: localNoon(2026, 11, 2),
          paidAt: localNoon(2026, 11, 9),
          cancelledAt: null,
        },
        TODAY,
      ),
    ).toBe("INV-0012 · Riley Example · paid 9 Nov");
  });

  it("gives the day it was cancelled once cancelled", () => {
    expect(
      invoiceDetailLine(
        "INV-0012",
        "Riley Example",
        {
          status: "cancelled",
          sentAt: localNoon(2026, 11, 2),
          paidAt: null,
          cancelledAt: localNoon(2026, 11, 14),
        },
        "2026-11-14",
      ),
    ).toBe("INV-0012 · Riley Example · cancelled 14 Nov");
  });

  it("adds the year when it wasn't this year", () => {
    expect(
      invoiceDetailLine(
        "0003",
        "Riley Example",
        { status: "sent", sentAt: localNoon(2025, 12, 30), paidAt: null, cancelledAt: null },
        TODAY,
      ),
    ).toBe("0003 · Riley Example · sent 30 Dec 2025");
  });

  it("has no date for a draft, or when the date is missing", () => {
    expect(
      invoiceDetailLine(
        "0003",
        "Riley Example",
        { status: "draft", sentAt: null, paidAt: null, cancelledAt: null },
        TODAY,
      ),
    ).toBe("0003 · Riley Example");
    expect(
      invoiceDetailLine(
        "0003",
        "Riley Example",
        { status: "paid", sentAt: localNoon(2026, 11, 2), paidAt: null, cancelledAt: null },
        TODAY,
      ),
    ).toBe("0003 · Riley Example · sent 2 Nov");
  });
});

const live = (id: string) => ({ id, status: "sent" as const, cancelledVisitDates: null });

describe("invoiceVisitDates", () => {
  const visits = [
    { visitDate: "2026-11-12", invoiceId: "i1" },
    { visitDate: "2026-11-04", invoiceId: "i1" },
    { visitDate: "2026-11-08", invoiceId: null },
    { visitDate: "2025-12-29", invoiceId: "i2" },
  ];

  it("lists the invoice's visit dates, oldest first", () => {
    expect(invoiceVisitDates(visits, live("i1"), TODAY)).toBe("4 Nov, 12 Nov");
  });

  it("adds the year for a visit in another year", () => {
    expect(invoiceVisitDates(visits, live("i2"), TODAY)).toBe("29 Dec 2025");
  });

  it("says None with no visits on it", () => {
    expect(invoiceVisitDates(visits, live("i3"), TODAY)).toBe("None");
  });

  it("gives a cancelled invoice the copy of the dates it kept, not the visits now on it", () => {
    const cancelled = {
      id: "i1",
      status: "cancelled" as const,
      cancelledVisitDates: ["2026-11-12", "2026-11-04"],
    };
    expect(invoiceVisitDates([], cancelled, TODAY)).toBe("4 Nov, 12 Nov");
    expect(invoiceVisitDates(visits, { ...cancelled, cancelledVisitDates: [] }, TODAY)).toBe(
      "None",
    );
  });
});

describe("invoiceTaxLabel", () => {
  it("says None when tax is off", () => {
    expect(invoiceTaxLabel({ taxEnabled: false, taxRateBasisPoints: 500 }, 0)).toBe("None");
  });

  it("gives the rate and the amount", () => {
    expect(invoiceTaxLabel({ taxEnabled: true, taxRateBasisPoints: 500 }, 1100)).toBe(
      "5% · $11.00",
    );
    expect(invoiceTaxLabel({ taxEnabled: true, taxRateBasisPoints: 1250 }, 0)).toBe(
      "12.5% · $0.00",
    );
  });
});
