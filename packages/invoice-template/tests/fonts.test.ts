import { describe, expect, it } from "vitest";
import { invoiceFontFaceCss } from "../src/index";

const SOURCES = {
  interLatin: "data:font/woff2;base64,AAA",
  interLatinExt: "/fonts/inter-ext.woff2",
  nunitoLatin: "data:font/woff2;base64,BBB",
  nunitoLatinExt: "/fonts/nunito-ext.woff2",
};

describe("invoiceFontFaceCss", () => {
  it("declares Inter and Nunito, Latin and Latin Extended, from the given sources", () => {
    const css = invoiceFontFaceCss(SOURCES);
    const faces = css.split("\n");
    expect(faces).toHaveLength(4);
    expect(faces[0]).toContain('font-family: "Inter Variable"');
    expect(faces[0]).toContain('src: url("data:font/woff2;base64,AAA") format("woff2")');
    expect(faces[1]).toContain('url("/fonts/inter-ext.woff2")');
    expect(faces[2]).toContain('font-family: "Nunito Variable"');
    expect(faces[3]).toContain('url("/fonts/nunito-ext.woff2")');
  });

  it("covers every weight and waits for the font rather than showing a fallback", () => {
    for (const face of invoiceFontFaceCss(SOURCES).split("\n")) {
      expect(face).toContain("font-weight: 100 900");
      expect(face).toContain("font-display: block");
    }
  });

  it("gives the Latin and Latin Extended files different character ranges", () => {
    const [latin, latinExt] = invoiceFontFaceCss(SOURCES).split("\n");
    expect(latin).toContain("unicode-range: U+0000-00FF");
    // ō (U+014D, the macron in Kineō) comes from the Latin Extended file.
    expect(latinExt).toContain("unicode-range: U+0100-02BA");
  });
});
