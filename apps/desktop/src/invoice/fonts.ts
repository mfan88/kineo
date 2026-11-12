import interLatinExtUrl from "@fontsource-variable/inter/files/inter-latin-ext-wght-normal.woff2?url";
import interLatinUrl from "@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url";
import nunitoLatinExtUrl from "@fontsource-variable/nunito/files/nunito-latin-ext-wght-normal.woff2?url";
import nunitoLatinUrl from "@fontsource-variable/nunito/files/nunito-latin-wght-normal.woff2?url";

const LATIN =
  "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD";
const LATIN_EXT =
  "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+1E00-1E9F, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF";

function face(family: string, url: string, range: string): string {
  return `@font-face { font-family: "${family}"; font-weight: 100 900; font-display: block; src: url("${url}") format("woff2"); unicode-range: ${range}; }`;
}

/**
 * The bundled invoice fonts (Inter for "Clean", Nunito for "Nunito"), passed into
 * the invoice frame so they render in previews and PDFs. "Serif" uses system fonts.
 */
export const INVOICE_FONT_FACE_CSS = [
  face("Inter Variable", interLatinUrl, LATIN),
  face("Inter Variable", interLatinExtUrl, LATIN_EXT),
  face("Nunito Variable", nunitoLatinUrl, LATIN),
  face("Nunito Variable", nunitoLatinExtUrl, LATIN_EXT),
].join("\n");
