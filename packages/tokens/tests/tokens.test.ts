import { describe, expect, it } from "vitest";
import nativeCss from "../src/heroui-native.css?raw";
import css from "../src/heroui.css?raw";
import {
  colors,
  darkColors,
  darkStatusTags,
  font,
  invoiceAccents,
  invoiceFonts,
  nativeFontFaces,
  radius,
  shadows,
  statusTags,
} from "../src/index";

/** The value of a CSS custom property in a theme file, lower-cased and trimmed. */
function cssVarIn(source: string, file: string, name: string): string {
  const match = new RegExp(`--${name}:\\s*([^;]+);`).exec(source);
  if (!match?.[1]) throw new Error(`--${name} is missing from ${file}`);
  return match[1].replace(/\s+/g, " ").trim().toLowerCase();
}

const cssVar = (name: string) => cssVarIn(css, "heroui.css", name);
const nativeVar = (name: string) => cssVarIn(nativeCss, "heroui-native.css", name);

/** WCAG relative luminance of a #RRGGBB colour. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r = 0, g = 0, b = 0] = channels.map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].toSorted((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

describe("design brief palette", () => {
  it("matches docs/design-brief.md, with darker shades for text contrast", () => {
    expect(colors).toMatchObject({
      primary: "#0284C7",
      primaryStrong: "#0369A1",
      primaryStrongHover: "#075985",
      placeholder: "#67676F",
      textOnTint: "#075985",
      tint: "#E0F2FE",
      pageBackground: "#F7FBFF",
      text: "#11181C",
      mutedText: "#71717A",
      border: "#E4E4E7",
      inputFill: "#F4F4F5",
      error: "#B42318",
    });
  });

  it("uses 12–16px corners and Inter", () => {
    expect(radius.md).toBeGreaterThanOrEqual(12);
    expect(radius.lg).toBeLessThanOrEqual(16);
    expect(font.family).toBe("Inter");
  });
});

describe("HeroUI theme matches the tokens", () => {
  it.each([
    ["accent", colors.primaryStrong],
    ["accent-hover", colors.primaryStrongHover],
    ["link", colors.primaryStrong],
    ["field-placeholder", colors.placeholder],
    ["accent-foreground", colors.onPrimary],
    ["accent-soft", colors.tint],
    ["accent-soft-foreground", colors.textOnTint],
    ["focus", colors.primary],
    ["background", colors.pageBackground],
    ["foreground", colors.text],
    ["surface", colors.surface],
    ["overlay", colors.surface],
    ["muted", colors.mutedText],
    ["border", colors.border],
    ["separator", colors.border],
    ["field-background", colors.inputFill],
    ["field-focus", colors.surface],
    ["field-border-focus", colors.primary],
    ["danger", colors.error],
    ["danger-foreground", colors.onError],
  ])("--%s is %s", (name, value) => {
    expect(cssVar(name)).toBe(value.toLowerCase());
  });

  it("uses the token radius", () => {
    expect(cssVar("radius")).toBe(`${radius.md / 16}rem`);
    expect(cssVar("field-radius")).toBe(`${radius.md / 16}rem`);
  });

  it("uses the token font stack and shadows", () => {
    expect(cssVar("font-sans")).toBe(font.stack.toLowerCase());
    expect(cssVar("surface-shadow")).toBe(shadows.card.toLowerCase());
    expect(cssVar("overlay-shadow")).toBe(shadows.overlay.replace("0.10)", "0.1)").toLowerCase());
  });
});

describe("HeroUI Native theme matches the tokens", () => {
  it.each([
    ["accent", colors.primaryStrong],
    ["accent-foreground", colors.onPrimary],
    ["focus", colors.primary],
    ["link", colors.primaryStrong],
    ["background", colors.pageBackground],
    ["foreground", colors.text],
    ["surface", colors.surface],
    ["surface-foreground", colors.text],
    ["overlay", colors.surface],
    ["overlay-foreground", colors.text],
    ["muted", colors.mutedText],
    ["border", colors.border],
    ["separator", colors.border],
    ["field-background", colors.inputFill],
    ["field-foreground", colors.text],
    ["field-placeholder", colors.placeholder],
    ["danger", colors.error],
    ["danger-foreground", colors.onError],
  ])("--%s is %s", (name, value) => {
    expect(nativeVar(name)).toBe(value.toLowerCase());
  });

  it("uses the token radius and shadows", () => {
    // Inputs 12px; cards and buttons (HeroUI Native's 3xl and 4xl sizes) 16px.
    expect(nativeVar("field-radius")).toBe(`${radius.md / 16}rem`);
    expect(nativeVar("radius-3xl")).toBe(`${radius.lg / 16}rem`);
    expect(nativeVar("radius-4xl")).toBe(`${radius.lg / 16}rem`);
    expect(nativeVar("surface-shadow")).toBe(shadows.card.toLowerCase());
    expect(nativeVar("overlay-shadow")).toBe(
      shadows.overlay.replace("0.10)", "0.1)").toLowerCase(),
    );
  });

  it("uses Inter under the names the app loads it as", () => {
    expect(nativeVar("font-normal")).toBe(`"${nativeFontFaces.normal}"`.toLowerCase());
    expect(nativeVar("font-medium")).toBe(`"${nativeFontFaces.medium}"`.toLowerCase());
    expect(nativeVar("font-semibold")).toBe(`"${nativeFontFaces.semibold}"`.toLowerCase());
    expect(nativeVar("font-bold")).toBe(`"${nativeFontFaces.bold}"`.toLowerCase());
  });

  it("has every colour as a plain hex value, never a copy of another theme", () => {
    const colourVars = [...nativeCss.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{3,8})\s*;/gi)].map((m) =>
      m[2]?.toUpperCase(),
    );
    const tokenValues = new Set(Object.values(colors).map((v) => v.toUpperCase()));
    expect(colourVars.length).toBeGreaterThan(10);
    for (const value of colourVars) expect(tokenValues.has(value ?? "")).toBe(true);
  });
});

describe("text contrast is at least 4.5:1", () => {
  it.each([
    ["text on page", colors.text, colors.pageBackground],
    ["muted text on page", colors.mutedText, colors.pageBackground],
    ["placeholder on input fill", colors.placeholder, colors.inputFill],
    ["text on tint", colors.textOnTint, colors.tint],
    ["button text on primary", colors.onPrimary, colors.primaryStrong],
    ["button text on primary hover", colors.onPrimary, colors.primaryStrongHover],
    ["error on page", colors.error, colors.pageBackground],
    ["link on page", colors.primaryStrong, colors.pageBackground],
    ["link on card", colors.primaryStrong, colors.surface],
    ["error on error tint", colors.error, colors.errorTint],
  ])("%s", (_label, fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("status tags", () => {
  it("covers visit and invoice states plus errors", () => {
    expect(Object.keys(statusTags)).toEqual(["notInvoiced", "draft", "sent", "paid", "error"]);
  });

  it.each(Object.values(statusTags))("$label text reaches 4.5:1 on its tag", (tag) => {
    expect(contrast(tag.text, tag.background)).toBeGreaterThanOrEqual(4.5);
  });

  it("gives each tag its own background", () => {
    const backgrounds = Object.values(statusTags).map((tag) => tag.background);
    expect(new Set(backgrounds).size).toBe(backgrounds.length);
  });
});

describe("dark palette", () => {
  it("has every role the light palette has", () => {
    expect(Object.keys(darkColors).toSorted()).toEqual(Object.keys(colors).toSorted());
    expect(Object.keys(darkStatusTags)).toEqual(Object.keys(statusTags));
  });

  it.each([
    ["text on page", darkColors.text, darkColors.pageBackground],
    ["text on card", darkColors.text, darkColors.surface],
    ["muted text on page", darkColors.mutedText, darkColors.pageBackground],
    ["muted text on card", darkColors.mutedText, darkColors.surface],
    ["placeholder on input fill", darkColors.placeholder, darkColors.inputFill],
    ["text on tint", darkColors.textOnTint, darkColors.tint],
    ["button text on primary", darkColors.onPrimary, darkColors.primaryStrong],
    ["button text on primary hover", darkColors.onPrimary, darkColors.primaryStrongHover],
    ["error on card", darkColors.error, darkColors.surface],
    ["error on error tint", darkColors.error, darkColors.errorTint],
    ["text on error", darkColors.onError, darkColors.error],
    ["link on page", darkColors.primaryStrong, darkColors.pageBackground],
    ["link on card", darkColors.primaryStrong, darkColors.surface],
  ])("%s reaches 4.5:1", (_label, fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it.each([
    ["focus ring on card", darkColors.primary, darkColors.surface],
    ["focus ring on input fill", darkColors.primary, darkColors.inputFill],
    ["primary button on page", darkColors.primaryStrong, darkColors.pageBackground],
  ])("%s reaches 3:1", (_label, fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(3);
  });

  it.each(Object.values(darkStatusTags))("$label text reaches 4.5:1 on its tag", (tag) => {
    expect(contrast(tag.text, tag.background)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("invoice style", () => {
  it("has the five accents from the design brief", () => {
    expect(Object.values(invoiceAccents).map((accent) => accent.label)).toEqual([
      "Sky",
      "Forest",
      "Ocean",
      "Plum",
      "Charcoal",
    ]);
  });

  it.each(Object.values(invoiceAccents))("$label text reaches 4.5:1 on a white page", ({ hex }) => {
    expect(contrast(hex, "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
  });

  it("has the three fonts from the design brief, Clean being the app's Inter", () => {
    expect(Object.values(invoiceFonts).map((f) => f.label)).toEqual(["Clean", "Serif", "Nunito"]);
    expect(invoiceFonts.clean.stack).toBe(font.stack);
    expect(invoiceFonts.nunito.stack.startsWith('"Nunito Variable"')).toBe(true);
  });
});
