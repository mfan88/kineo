/** A letter page is 8.5 in wide; at 96 CSS pixels to the inch that's 816. */
const PAGE_WIDTH = 816;

const PHONE_VIEWPORT = '<meta name="viewport" content="width=device-width, initial-scale=1" />';
const PAGE_VIEWPORT = `<meta name="viewport" content="width=${PAGE_WIDTH}" />`;
/** Phone browsers enlarge some text on wide pages; the invoice keeps its own sizes. */
const KEEP_TEXT_SIZES =
  "<style>html { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }</style>";

/**
 * The invoice HTML for the phone's preview: laid out at the width of a letter page
 * and scaled down to fit, so it looks like the PDF rather than a narrow web page.
 * The PDF itself is made from the HTML as it is.
 */
export function previewHtml(html: string): string {
  return html.replace(PHONE_VIEWPORT, `${PAGE_VIEWPORT}\n${KEEP_TEXT_SIZES}`);
}

/**
 * The PDF's file name: "Invoice INV-0004.pdf". Characters a file name can't hold
 * (a prefix may be anything) become hyphens.
 */
export function pdfFileName(invoiceNumber: string): string {
  const safe = invoiceNumber.replaceAll(/[^A-Za-z0-9._-]+/g, "-").replaceAll(/^-+|-+$/g, "");
  return `Invoice ${safe === "" ? "draft" : safe}.pdf`;
}
