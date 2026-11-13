import { describe, expect, it } from "vitest";
import {
  formatDayMonth,
  formatDayMonthYear,
  formatEdited,
  formatLastVisit,
  formatTodayTitle,
  localDateString,
  noteExcerpt,
} from "./display";

describe("formatDayMonth", () => {
  it("writes the day then the month", () => {
    expect(formatDayMonth("2026-11-04")).toBe("4 Nov");
    expect(formatDayMonth("2026-01-31")).toBe("31 Jan");
  });

  it("adds the year only when it differs from today's", () => {
    expect(formatDayMonth("2026-11-04", "2026-11-12")).toBe("4 Nov");
    expect(formatDayMonth("2025-12-30", "2026-01-02")).toBe("30 Dec 2025");
  });

  it("refuses dates that aren't YYYY-MM-DD", () => {
    expect(() => formatDayMonth("Nov 4")).toThrow(RangeError);
    expect(() => formatDayMonth("2026-13-01")).toThrow(RangeError);
    expect(() => formatDayMonth("2026-00-10")).toThrow(RangeError);
  });
});

describe("formatTodayTitle", () => {
  it("titles the note with today's date", () => {
    expect(formatTodayTitle("2026-11-12")).toBe("Today, 12 Nov");
  });

  it("can write the whole month", () => {
    expect(formatTodayTitle("2026-11-12", true)).toBe("Today, 12 November");
    expect(formatTodayTitle("2026-05-02", true)).toBe("Today, 2 May");
  });
});

describe("formatLastVisit", () => {
  it("says today, or the date", () => {
    expect(formatLastVisit("2026-11-12", "2026-11-12")).toBe("Last visit today");
    expect(formatLastVisit("2026-11-04", "2026-11-12")).toBe("Last visit 4 Nov");
    expect(formatLastVisit("2025-10-29", "2026-11-12")).toBe("Last visit 29 Oct 2025");
  });
});

describe("formatEdited", () => {
  it("shows the local time with two digits", () => {
    expect(formatEdited(new Date(2026, 10, 12, 10, 42).toISOString())).toBe("Edited 10:42");
    expect(formatEdited(new Date(2026, 10, 12, 9, 5).toISOString())).toBe("Edited 09:05");
    expect(formatEdited(new Date(2026, 10, 12, 0, 0).toISOString())).toBe("Edited 00:00");
  });

  it("refuses something that isn't a time", () => {
    expect(() => formatEdited("yesterday")).toThrow(RangeError);
  });
});

describe("noteExcerpt", () => {
  it("returns a short note whole, on one line", () => {
    expect(noteExcerpt("Ankle  ROM\nimproved.")).toBe("Ankle ROM improved.");
  });

  it("returns nothing for an empty note", () => {
    expect(noteExcerpt("")).toBe("");
    expect(noteExcerpt("  \n ")).toBe("");
  });

  it("cuts a long note at a word and ends with an ellipsis", () => {
    const note =
      "Ankle ROM improved, dorsiflexion 15°. Single-leg balance 20 s. Progressed to calf raises 3×12.";
    const excerpt = noteExcerpt(note, 60);
    expect(excerpt).toBe("Ankle ROM improved, dorsiflexion 15°. Single-leg balance 20…");
    expect(excerpt.length).toBeLessThanOrEqual(61);
  });

  it("cuts a single long word where it must", () => {
    expect(noteExcerpt("x".repeat(100), 10)).toBe(`${"x".repeat(10)}…`);
  });

  it("keeps a note exactly at the limit", () => {
    expect(noteExcerpt("a".repeat(80), 80)).toBe("a".repeat(80));
  });
});

describe("localDateString", () => {
  it("is the local calendar date, padded", () => {
    expect(localDateString(new Date(2026, 10, 2, 23, 59))).toBe("2026-11-02");
    expect(localDateString(new Date(2026, 0, 31, 0, 0))).toBe("2026-01-31");
  });
});

describe("formatDayMonthYear", () => {
  it("writes the day, short month and year", () => {
    expect(formatDayMonthYear("2026-04-01")).toBe("1 Apr 2026");
    expect(formatDayMonthYear("2027-03-31")).toBe("31 Mar 2027");
    expect(formatDayMonthYear("2026-09-05")).toBe("5 Sep 2026");
  });

  it("refuses dates that aren't YYYY-MM-DD", () => {
    expect(() => formatDayMonthYear("1 Apr 2026")).toThrow(RangeError);
  });
});
