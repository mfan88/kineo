import { File, Paths } from "expo-file-system";
import { printToFileAsync } from "expo-print";
import { isAvailableAsync, shareAsync } from "expo-sharing";

/** Sharing isn't possible on this device. The message is safe to show. */
export class ShareUnavailableError extends Error {
  override name = "ShareUnavailableError";
}

/**
 * The template's own page margin (0.6 in, in points). iOS ignores the margin in the
 * HTML's `@page` rule and takes it from here; Android reads `@page` and ignores this.
 */
const MARGIN = 43;
const PAGE_MARGINS = { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN };

/**
 * Makes a PDF from the invoice's HTML (a letter page) and opens the system share
 * sheet for it: save to Files, Mail, Messages, print. The file stays in the app's
 * cache, which the phone clears on its own; a newer PDF of the same invoice replaces it.
 */
export async function sharePdf(html: string, fileName: string): Promise<void> {
  if (!(await isAvailableAsync())) {
    throw new ShareUnavailableError("Sharing isn't available on this device.");
  }
  const printed = await printToFileAsync({ html, margins: PAGE_MARGINS });
  const pdf = new File(Paths.cache, fileName);
  if (pdf.exists) pdf.delete();
  await new File(printed.uri).move(pdf);
  await shareAsync(pdf.uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf" });
}
