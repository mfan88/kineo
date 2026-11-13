import { invoke, isTauri } from "@tauri-apps/api/core";
import { useEffect } from "react";
import { notify, notifyError } from "../components/Toasts";

/** The print copy of the invoice, outside the React root. */
const CONTAINER_ID = "kineo-print";
/** The page-wide rules the invoice needs: its page size and fonts. */
const STYLE_ID = "kineo-print-style";
/** Stands in for the invoice document's `html` and `body` inside the copy. */
const BODY_CLASS = "kineo-invoice";

/**
 * When printing, only the invoice shows, at the top of a white page. On screen the
 * copy is laid out off to the side, invisible, so its fonts and logo load before it
 * prints (with `display: none` they never would).
 */
const PRINT_CSS = `@media print {
  html, body { background: #FFFFFF !important; margin: 0 !important; padding: 0 !important; }
  body > :not(#${CONTAINER_ID}) { display: none !important; }
  #${CONTAINER_ID} { position: static !important; visibility: visible !important; width: auto !important; }
}`;
const SCREEN_STYLE =
  "position: fixed; top: 0; left: -10000px; width: 8.5in; visibility: hidden; pointer-events: none;";

/** Rules that only work page-wide, never inside a shadow root: `@page` and `@font-face`. */
const PAGE_WIDE_RULE = /@(?:page|font-face)\s*\{[^}]*\}/g;

/**
 * The template's CSS for use inside a shadow root: its `html, body` and `body` rules
 * apply to the wrapper instead, and nothing is inherited from the app (dark mode,
 * its fonts) except what the template sets itself.
 */
export function shadowCss(invoiceCss: string): string {
  const scoped = invoiceCss
    .replace(PAGE_WIDE_RULE, "")
    .replace(/(^|[\s}])html,\s*body\s*\{/g, `$1.${BODY_CLASS} {`)
    .replace(/(^|[\s}])body\s*\{/g, `$1.${BODY_CLASS} {`);
  return `:host { all: initial; display: block; }\n${scoped}`;
}

/** Waits for the invoice's fonts and logo, so they're on the page when it prints. */
async function ready(doc: Document, root: ShadowRoot): Promise<void> {
  const images = [...root.querySelectorAll("img")].map((image) =>
    // A logo that can't be shown still leaves the rest of the invoice to print.
    image.decode().catch(() => undefined),
  );
  await Promise.all(images);
  // Not every environment has the Font Loading API (the test DOM doesn't).
  if ("fonts" in doc) await doc.fonts.ready;
}

/** How a Download PDF ended: written to a file, Save panel closed, or print dialog shown. */
export type PdfOutcome = "saved" | "cancelled" | "printed";

/** What the app's `save_pdf` command answers (src-tauri/src/pdf.rs). */
type SaveOutcome = "saved" | "cancelled" | "unsupported";

/**
 * Makes a PDF of the invoice `html` (from @kineo/invoice-template), named from `title`
 * ("Invoice INV-0004"). In the Mac app the Save panel opens and the PDF is written
 * where it says; elsewhere the print dialog opens, where "Save as PDF" does the same.
 *
 * Either way the main page is what's turned into the PDF, not the preview frame (the
 * Mac app's web view can't print a frame). A copy of the invoice goes in a shadow root
 * (so the app's styles can't reach it, nor its styles the app) that is the only thing
 * shown when printing. It paginates like any page and keeps the template's letter size.
 */
export async function printInvoice(
  html: string,
  title: string,
  doc = document,
): Promise<PdfOutcome> {
  const invoice = new DOMParser().parseFromString(html, "text/html");
  const invoiceCss = [...invoice.head.querySelectorAll("style")]
    .map((element) => element.textContent)
    .join("\n");

  let style = doc.getElementById(STYLE_ID);
  if (!style) {
    style = doc.createElement("style");
    style.id = STYLE_ID;
    doc.head.append(style);
  }
  style.textContent = `${(invoiceCss.match(PAGE_WIDE_RULE) ?? []).join("\n")}\n${PRINT_CSS}`;

  let container = doc.getElementById(CONTAINER_ID);
  if (!container) {
    container = doc.createElement("div");
    container.id = CONTAINER_ID;
    container.setAttribute("style", SCREEN_STYLE);
    container.setAttribute("aria-hidden", "true");
    container.inert = true;
    container.attachShadow({ mode: "open" });
    doc.body.append(container);
  }
  const root = container.shadowRoot;
  if (!root) throw new Error("The print copy has no shadow root.");

  const shadowStyle = doc.createElement("style");
  shadowStyle.textContent = shadowCss(invoiceCss);
  const body = doc.createElement("div");
  body.className = BODY_CLASS;
  body.append(...[...invoice.body.childNodes].map((node) => doc.importNode(node, true)));
  root.replaceChildren(shadowStyle, body);

  await ready(doc, root);

  if (isTauri()) {
    const outcome = await invoke<SaveOutcome>("save_pdf", { title });
    if (outcome !== "unsupported") return outcome;
  }

  // The print dialog suggests the page title as the PDF's name.
  const appTitle = doc.title;
  doc.title = title;
  try {
    doc.defaultView?.print();
  } finally {
    doc.title = appTitle;
  }
  return "printed";
}

/** Removes the print copy, e.g. when leaving the invoice. */
export function clearPrintedInvoice(doc = document): void {
  doc.getElementById(CONTAINER_ID)?.remove();
  doc.getElementById(STYLE_ID)?.remove();
}

/** Removes the print copy when a screen showing an invoice goes away. */
export function useClearPrintedInvoice(): void {
  useEffect(() => () => clearPrintedInvoice(), []);
}

/** Download PDF: saves the invoice as a PDF, and says how that went. */
export function downloadInvoicePdf(html: string, number: string): void {
  printInvoice(html, `Invoice ${number}`).then(
    (outcome) => {
      if (outcome === "saved") notify("PDF saved");
    },
    () => notifyError("The PDF couldn't be saved. Try again."),
  );
}
