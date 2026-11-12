const pad = (n: number) => n.toString().padStart(2, "0");

/** The date as YYYY-MM-DD in the phone's own time zone (a visit's date is the local day). */
export function localDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
