import { formatDayMonthYear } from "../dates/display";

/**
 * Reading and showing the dates typed into funding fields. People type "1 Apr 2026";
 * the stored value is always YYYY-MM-DD.
 */

export type DayInputResult = { ok: true; value: string | null } | { ok: false; message: string };

const MESSAGE = "Enter a date like 1 Apr 2026.";

const MONTH_NAMES = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

function monthFromName(name: string): number | null {
  const lower = name.toLowerCase();
  // "Mon" is the first three letters; "Month" is the whole name ("Sept" isn't accepted).
  const index = MONTH_NAMES.findIndex(
    (month) => month === lower || (lower.length === 3 && month.startsWith(lower)),
  );
  return index === -1 ? null : index + 1;
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, "0");
}

function validDay(year: number, month: number, day: number): string | null {
  if (year < 1000 || month < 1 || month > 12 || day < 1) return null;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day > daysInMonth) return null;
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

/** Reads "1 Apr 2026", "1 April 2026" or "2026-04-01". Empty text is no date. */
export function parseDayInput(text: string): DayInputResult {
  const trimmed = text.trim();
  if (trimmed === "") return { ok: true, value: null };

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (iso) {
    const value = validDay(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    return value ? { ok: true, value } : { ok: false, message: MESSAGE };
  }

  const words = /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/.exec(trimmed);
  if (words) {
    const month = monthFromName(words[2] ?? "");
    const value = month === null ? null : validDay(Number(words[3]), month, Number(words[1]));
    if (value) return { ok: true, value };
  }
  return { ok: false, message: MESSAGE };
}

/** What a date input shows: "" for no date, otherwise "1 Apr 2026". */
export function dayInputValue(date: string | null): string {
  return date === null ? "" : formatDayMonthYear(date);
}
