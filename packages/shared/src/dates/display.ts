/**
 * Short date and time wording for the note and Home screens ("12 Nov", "Today, 12 Nov",
 * "Last visit 4 Nov", "Edited 10:42"). Dates are calendar dates (YYYY-MM-DD) with no
 * time zone; only `formatEdited` takes an instant, shown in the device's own time zone.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function parseDate(date: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const year = Number(match?.[1]);
  const month = Number(match?.[2]);
  const day = Number(match?.[3]);
  if (!match || month < 1 || month > 12 || day < 1 || day > 31) {
    throw new RangeError("Date must be YYYY-MM-DD.");
  }
  return { year, month, day };
}

/** "12 Nov", with the year ("12 Nov 2025") when it isn't the same year as `today`. */
export function formatDayMonth(date: string, today?: string): string {
  const { year, month, day } = parseDate(date);
  const label = `${day} ${MONTHS[month - 1] ?? ""}`;
  return today !== undefined && parseDate(today).year !== year ? `${label} ${year}` : label;
}

/**
 * The title of the note box and of today's visit: "Today, 12 Nov", or with
 * `long` the whole month, "Today, 12 November" (desktop's note box).
 */
export function formatTodayTitle(today: string, long = false): string {
  if (!long) return `Today, ${formatDayMonth(today)}`;
  const { month, day } = parseDate(today);
  return `Today, ${day} ${MONTHS_LONG[month - 1] ?? ""}`;
}

/** "Last visit 4 Nov", or "Last visit today". */
export function formatLastVisit(visitDate: string, today: string): string {
  return visitDate === today
    ? "Last visit today"
    : `Last visit ${formatDayMonth(visitDate, today)}`;
}

/** "Edited 10:42": the time a note was last changed, 24-hour, in the device's time zone. */
export function formatEdited(isoTimestamp: string): string {
  const at = new Date(isoTimestamp);
  if (Number.isNaN(at.getTime())) throw new RangeError("Timestamp must be a valid date and time.");
  const hours = String(at.getHours()).padStart(2, "0");
  const minutes = String(at.getMinutes()).padStart(2, "0");
  return `Edited ${hours}:${minutes}`;
}

/**
 * One short line of a note for a list: whitespace collapsed, cut at a word at most
 * `max` characters long and ended with "…". An empty note gives an empty string.
 */
export function noteExcerpt(note: string, max = 80): string {
  const text = note.replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  const atWord = lastSpace > max / 2 ? cut.slice(0, lastSpace) : cut;
  return `${atWord.replace(/[\s.,;:!?-]+$/, "")}…`;
}

/** The calendar date (YYYY-MM-DD) of an instant in the device's own time zone. */
export function localDateString(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}
