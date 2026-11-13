import { formatPercent } from "../money";
import { countLabel } from "../home/todo";
import { PROFILE_FIELD_LABELS, profileErrors, type ProfileFields } from "../profile/rules";
import type { AccentColor, HeaderLayout, InvoiceFont } from "../types/models";

/**
 * What each Settings row says under its title: the current value, or what's wrong.
 * `problem` is true when the row should be drawn in the error colour.
 */
export interface SettingsSummary {
  text: string;
  problem: boolean;
}

/** "Dana Reid · 1 field missing"; just the name when complete, "Not filled in yet" when empty. */
export function profileSummary(profile: ProfileFields): SettingsSummary {
  const name = profile.fullName.value.trim();
  const missing = profileErrors(profile).length;
  const parts = [name, missing > 0 ? `${countLabel(missing, "field")} missing` : ""].filter(
    (part) => part !== "",
  );
  if (parts.length === 0) return { text: "Not filled in yet", problem: false };
  return { text: parts.join(" · "), problem: missing > 0 };
}

/**
 * Which fields block invoices, e.g. "Phone is shown on invoices but empty" or
 * "Phone and address are shown on invoices but empty". Null when nothing is missing.
 */
export function profileProblem(profile: ProfileFields): string | null {
  const labels = profileErrors(profile).map(({ field }, index) => {
    const label = PROFILE_FIELD_LABELS[field];
    return index === 0 ? label : label.charAt(0).toLowerCase() + label.slice(1);
  });
  const [first, ...rest] = labels;
  if (first === undefined) return null;
  const last = rest.pop();
  const subject = last === undefined ? first : `${[first, ...rest].join(", ")} and ${last}`;
  return `${subject} ${labels.length === 1 ? "is" : "are"} shown on invoices but empty`;
}

/** "3 items · Tax 5%". The tax is the default rate, which an invoice copies when tax is turned on. */
export function priceListSummary(itemCount: number, defaultTaxRateBasisPoints: number): string {
  const items = itemCount === 0 ? "No items" : countLabel(itemCount, "item");
  return `${items} · Tax ${formatPercent(defaultTaxRateBasisPoints)}%`;
}

const ACCENT_NAMES: Record<AccentColor, string> = {
  sky: "Sky",
  forest: "Forest",
  ocean: "Ocean",
  plum: "Plum",
  charcoal: "Charcoal",
};
const FONT_NAMES: Record<InvoiceFont, string> = {
  clean: "Clean",
  serif: "Serif",
  nunito: "Nunito",
};
const LAYOUT_PHRASES: Record<HeaderLayout, string> = {
  "logo-left": "logo left",
  centred: "centred",
};

/** "Sky accent · Clean font · logo left". */
export function invoiceStyleSummary(style: {
  accentColor: AccentColor;
  font: InvoiceFont;
  headerLayout: HeaderLayout;
}): string {
  return [
    `${ACCENT_NAMES[style.accentColor]} accent`,
    `${FONT_NAMES[style.font]} font`,
    LAYOUT_PHRASES[style.headerLayout],
  ].join(" · ");
}
