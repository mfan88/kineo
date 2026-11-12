import interLatinExtUrl from "@fontsource-variable/inter/files/inter-latin-ext-wght-normal.woff2?url";
import interLatinUrl from "@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url";
import nunitoLatinExtUrl from "@fontsource-variable/nunito/files/nunito-latin-ext-wght-normal.woff2?url";
import nunitoLatinUrl from "@fontsource-variable/nunito/files/nunito-latin-wght-normal.woff2?url";
import { invoiceFontFaceCss } from "@kineo/invoice-template";

/** The bundled invoice fonts, passed into the invoice frame (see invoiceFontFaceCss). */
export const INVOICE_FONT_FACE_CSS = invoiceFontFaceCss({
  interLatin: interLatinUrl,
  interLatinExt: interLatinExtUrl,
  nunitoLatin: nunitoLatinUrl,
  nunitoLatinExt: nunitoLatinExtUrl,
});
