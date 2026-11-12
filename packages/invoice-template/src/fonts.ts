/** Where each bundled invoice font file is: a URL, or a data: URI. */
export interface InvoiceFontSources {
  interLatin: string;
  interLatinExt: string;
  nunitoLatin: string;
  nunitoLatinExt: string;
}

const LATIN =
  "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD";
const LATIN_EXT =
  "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+1E00-1E9F, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF";

function face(family: string, src: string, range: string): string {
  return `@font-face { font-family: "${family}"; font-weight: 100 900; font-display: block; src: url("${src}") format("woff2"); unicode-range: ${range}; }`;
}

/**
 * @font-face rules for the invoice fonts (Inter for "Clean", Nunito for "Nunito";
 * "Serif" uses system fonts), passed to the template as `fontFaceCss` so previews
 * and PDFs use them. The files are Fontsource's variable woff2 files on both apps.
 */
export function invoiceFontFaceCss(sources: InvoiceFontSources): string {
  return [
    face("Inter Variable", sources.interLatin, LATIN),
    face("Inter Variable", sources.interLatinExt, LATIN_EXT),
    face("Nunito Variable", sources.nunitoLatin, LATIN),
    face("Nunito Variable", sources.nunitoLatinExt, LATIN_EXT),
  ].join("\n");
}
