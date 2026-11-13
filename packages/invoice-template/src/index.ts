import {
  formatCad,
  formatInvoiceNumber,
  formatPercent,
  invoiceProfileLines,
  invoiceTotals,
  lineTotalCents,
  type Invoice,
  type InvoiceStyle,
  type LineItem,
  type Patient,
  type PracticeSettings,
  type Profile,
  type Visit,
} from "@kineo/shared";
import { invoiceAccents, invoiceFonts } from "@kineo/tokens";

/**
 * The Kineō invoice as one self-contained HTML document. Both apps show it as the
 * preview and turn the same HTML into the PDF, so what the practitioner previews is
 * exactly what the patient receives.
 *
 * Pure function: no DOM, no network. The only outside resources are the optional
 * logo and font URLs the app passes in.
 */
export interface InvoiceTemplateInput {
  invoice: Invoice;
  lines: readonly LineItem[];
  patient: Pick<Patient, "fullName"> | null;
  /** Visits on this invoice (any order). A cancelled invoice has none: it shows `cancelledVisitDates`. */
  visits: readonly Pick<Visit, "visitDate">[];
  profile: Profile;
  settings: Pick<PracticeSettings, "invoiceNumberPrefix">;
  style: InvoiceStyle;
  /** URL or data: URI for the logo; omitted when the style has no logo. */
  logoSrc?: string | null;
  /** Extra CSS, e.g. @font-face rules so the chosen font renders in the PDF. */
  fontFaceCss?: string;
}

const TEXT = "#11181C";
const MUTED = "#52525B"; // 7.7:1 on white
const RULE = "#E4E4E7";
const BRAND_DEEP = "#075985";
const BRAND_SKY = "#0284C7";

const longDate = new Intl.DateTimeFormat("en-CA", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

/** Escapes text for HTML text and double-quoted attributes. */
export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** A YYYY-MM-DD visit date as "October 15, 2026". */
function formatVisitDate(date: string): string {
  return longDate.format(new Date(`${date}T00:00:00Z`));
}

/** The date shown on the invoice: when it was sent, or when it was created for a draft. */
function issuedDate(invoice: Invoice): string {
  const iso = invoice.sentAt ?? invoice.createdAt;
  const local = new Date(iso);
  // Show the calendar day in the practitioner's own time zone, as a UTC date for formatting.
  return longDate.format(
    new Date(Date.UTC(local.getFullYear(), local.getMonth(), local.getDate())),
  );
}

export function renderInvoiceHtml(input: InvoiceTemplateInput): string {
  const { invoice, profile, style } = input;
  const lines = input.lines.toSorted((a, b) => a.position - b.position);
  const totals = invoiceTotals(lines, invoice);
  const number = formatInvoiceNumber(input.settings.invoiceNumberPrefix, invoice.number);
  const accent = invoiceAccents[style.accentColor].hex;
  const fontStack = invoiceFonts[style.font].stack;
  const centred = style.headerLayout === "centred";
  const fromLines = invoiceProfileLines(profile);
  const cancelled = invoice.status === "cancelled";
  // A cancelled invoice has let go of its visits, so it shows the dates it kept.
  const visitDates = cancelled
    ? (invoice.cancelledVisitDates ?? []).toSorted()
    : input.visits.map((visit) => visit.visitDate).toSorted();
  const logo =
    style.logoPath && input.logoSrc
      ? `<img class="logo" src="${escapeHtml(input.logoSrc)}" alt="" />`
      : "";

  const from = fromLines
    .map((line, index) =>
      index === 0
        ? `<p class="from-name">${escapeHtml(line.value)}</p>`
        : `<p class="from-line">${escapeHtml(line.value)}</p>`,
    )
    .join("");

  const rows =
    lines.length === 0
      ? `<tr><td colspan="4" class="empty">No line items</td></tr>`
      : lines
          .map(
            (line) => `<tr>
          <td>${escapeHtml(line.name)}</td>
          <td class="num">${line.quantity}</td>
          <td class="num">${formatCad(line.unitPriceCents)}</td>
          <td class="num">${formatCad(lineTotalCents(line))}</td>
        </tr>`,
          )
          .join("");

  const visitsLine =
    visitDates.length === 0
      ? ""
      : `<p class="muted">${visitDates.length === 1 ? "Visit on " : "Visits on "}${visitDates
          .map(formatVisitDate)
          .join(", ")}</p>`;

  const taxRow = invoice.taxEnabled
    ? `<dt>Tax (${formatPercent(invoice.taxRateBasisPoints)}%)</dt><dd>${formatCad(totals.taxCents)}</dd>`
    : "";

  const footerNote =
    style.footerNote.trim() === ""
      ? ""
      : `<p class="footer-note">${escapeHtml(style.footerNote.trim())}</p>`;

  return `<!doctype html>
<html lang="en-CA">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Invoice ${escapeHtml(number)}</title>
<style>
${input.fontFaceCss ?? ""}
@page { size: letter; margin: 0.6in; }
* { box-sizing: border-box; }
html, body { margin: 0; background: #FFFFFF; color: ${TEXT}; }
body { font-family: ${fontStack}; font-size: 14px; line-height: 1.5; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.page { max-width: 7.5in; margin: 0 auto; padding: 40px; display: flex; flex-direction: column; gap: 24px; }
@media print { .page { padding: 0; } }
p { margin: 0; }
.header { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; }
.header.centred { flex-direction: column; align-items: center; text-align: center; gap: 12px; }
.from { display: flex; flex-direction: column; gap: 2px; }
.header.centred .from { align-items: center; }
.logo { max-height: 56px; max-width: 200px; object-fit: contain; margin-bottom: 8px; }
.from-name { font-size: 18px; font-weight: 600; }
.from-line, .muted { color: ${MUTED}; font-size: 13px; }
.meta { display: flex; flex-direction: column; align-items: flex-end; }
.header.centred .meta { align-items: center; }
.title { font-size: 28px; font-weight: 600; color: ${accent}; line-height: 1.2; }
.rule { height: 2px; border-radius: 1px; background: ${accent}; }
.bill-to .label { color: ${MUTED}; font-size: 13px; }
.bill-to .name { font-weight: 600; }
table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
th { text-align: left; color: ${accent}; font-size: 13px; font-weight: 600; padding: 0 0 8px; }
td { border-top: 1px solid ${RULE}; padding: 8px 0; vertical-align: top; }
.num { text-align: right; padding-left: 16px; }
th.num { text-align: right; }
.empty { color: ${MUTED}; }
.cancelled-mark { display: inline-block; margin-top: 6px; border: 1.5px solid ${MUTED}; border-radius: 999px; padding: 1px 12px; color: ${MUTED}; font-size: 13px; font-weight: 600; }
.totals { margin: 0 0 0 auto; width: 260px; display: grid; grid-template-columns: 1fr auto; gap: 4px 16px; font-variant-numeric: tabular-nums; }
.totals dt { color: ${MUTED}; }
.totals dd { margin: 0; text-align: right; }
.totals .total { color: ${accent}; font-weight: 600; }
.totals .total + dd { font-weight: 600; }
.footer-note { border-top: 1px solid ${RULE}; padding-top: 16px; text-align: center; color: ${MUTED}; font-size: 13px; }
.made-with { text-align: center; color: ${MUTED}; font-size: 11px; }
.wordmark { color: ${BRAND_DEEP}; font-weight: 600; letter-spacing: -0.02em; }
.wordmark .o { position: relative; display: inline-block; }
.wordmark .o::before { content: ""; position: absolute; left: 10%; right: 10%; top: 0.12em; height: 0.085em; border-radius: 999px; background: ${BRAND_SKY}; }
</style>
</head>
<body>
<main class="page">
  <header class="header${centred ? " centred" : ""}">
    <div class="from">${logo}${from}</div>
    <div class="meta">
      <p class="title">Invoice</p>
      <p>${escapeHtml(number)}</p>
      <p class="muted">${issuedDate(invoice)}</p>
      ${cancelled ? '<p class="cancelled-mark">Cancelled</p>' : ""}
    </div>
  </header>
  <div class="rule"></div>
  <section class="bill-to">
    <p class="label">Bill to</p>
    <p class="name">${escapeHtml(input.patient?.fullName ?? "Unknown patient")}</p>
    ${visitsLine}
  </section>
  <table>
    <thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Price</th><th class="num">Amount</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <dl class="totals">
    <dt>Subtotal</dt><dd>${formatCad(totals.subtotalCents)}</dd>
    ${taxRow}
    <dt class="total">Total</dt><dd>${formatCad(totals.totalCents)}</dd>
  </dl>
  ${footerNote}
  <p class="made-with">Made with <span class="wordmark" aria-label="Kineō">kine<span class="o">o</span></span></p>
</main>
</body>
</html>
`;
}
export { invoiceFontFaceCss } from "./fonts";
export type { InvoiceFontSources } from "./fonts";
